import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

// GET /api/admin/api-keys/analytics/system - Get advanced system-wide analytics
export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {

    // Check if the user is authenticated and has admin privileges
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    try {
      // Get URL parameters
      const url = new URL(request.url);
      const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);

      logger.debug(`Admin ${auth.user.id} fetching advanced system analytics for ${days} days`);

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Get system-wide aggregated statistics
      const systemStats = await prisma.apiKeyUsageStats.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          apiKey: {
            select: {
              id: true,
              name: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          date: 'asc',
        },
      });

      // Get recent events for real-time insights
      const recentEvents = await prisma.apiKeyUsageEvent.findMany({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        include: {
          apiKey: {
            select: {
              id: true,
              name: true,
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 1000,
      });

      // Calculate advanced analytics
      const analytics = calculateAdvancedAnalytics(systemStats, recentEvents, days);

      const response = {
        success: true,
        data: {
          period: {
            days,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
          ...analytics,
        },
      };

      return NextResponse.json(response);
    } catch (error) {
      logger.error('Error fetching advanced system analytics:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to retrieve advanced analytics'
      }, { status: 500 });
    }
  });
}

interface SystemStat {
  date: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitHits: number;
  peakHourlyUsage: number;
  avgResponseTime: number | null;
  apiKey: {
    id: string;
    name: string;
    user: {
      id: string;
      name: string | null;
    };
  };
}

interface RecentEvent {
  endpoint: string;
  statusCode: number;
  apiKey: {
    id: string;
    user: {
      id: string;
    };
  };
}

function calculateAdvancedAnalytics(
  systemStats: SystemStat[],
  recentEvents: RecentEvent[],
  days: number
) {
  // Daily aggregations
  const dailyTotals = new Map<string, {
    date: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rateLimitHits: number;
    uniqueApiKeys: number;
    uniqueUsers: number;
    avgResponseTime: number | null;
    peakHourlyUsage: number;
  }>();

  systemStats.forEach(stat => {
    const dateKey = stat.date.toISOString().split('T')[0];
    const existing = dailyTotals.get(dateKey) || {
      date: dateKey,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitHits: 0,
      uniqueApiKeys: 0,
      uniqueUsers: 0,
      avgResponseTime: null,
      peakHourlyUsage: 0,
    };

    existing.totalRequests += stat.totalRequests;
    existing.successfulRequests += stat.successfulRequests;
    existing.failedRequests += stat.failedRequests;
    existing.rateLimitHits += stat.rateLimitHits;
    existing.peakHourlyUsage = Math.max(existing.peakHourlyUsage, stat.peakHourlyUsage);

    // Calculate weighted average response time
    if (stat.avgResponseTime && stat.totalRequests > 0) {
      const currentWeight = existing.totalRequests - stat.totalRequests;
      const newWeight = stat.totalRequests;
      const totalWeight = currentWeight + newWeight;

      if (totalWeight > 0) {
        existing.avgResponseTime = existing.avgResponseTime
          ? ((existing.avgResponseTime * currentWeight) + (stat.avgResponseTime * newWeight)) / totalWeight
          : stat.avgResponseTime;
      }
    }

    dailyTotals.set(dateKey, existing);
  });

  // Calculate unique counts per day
  const dailyApiKeys = new Map<string, Set<string>>();
  const dailyUsers = new Map<string, Set<string>>();

  systemStats.forEach(stat => {
    const dateKey = stat.date.toISOString().split('T')[0];

    if (!dailyApiKeys.has(dateKey)) {
      dailyApiKeys.set(dateKey, new Set());
      dailyUsers.set(dateKey, new Set());
    }

    dailyApiKeys.get(dateKey)!.add(stat.apiKey.id);
    dailyUsers.get(dateKey)!.add(stat.apiKey.user.id);
  });

  // Update daily totals with unique counts
  dailyTotals.forEach((total, dateKey) => {
    total.uniqueApiKeys = dailyApiKeys.get(dateKey)?.size || 0;
    total.uniqueUsers = dailyUsers.get(dateKey)?.size || 0;
  });

  // Convert to array and fill missing dates
  const dailyAnalytics = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().split('T')[0];
    const data = dailyTotals.get(dateKey) || {
      date: dateKey,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitHits: 0,
      uniqueApiKeys: 0,
      uniqueUsers: 0,
      avgResponseTime: null,
      peakHourlyUsage: 0,
    };
    dailyAnalytics.push(data);
  }

  // Calculate top performers
  const apiKeyPerformance = new Map<string, {
    apiKeyId: string;
    apiKeyName: string;
    userId: string;
    userName: string | null;
    totalRequests: number;
    avgResponseTime: number | null;
    errorRate: number;
  }>();

  systemStats.forEach(stat => {
    const key = stat.apiKey.id;
    const existing = apiKeyPerformance.get(key) || {
      apiKeyId: stat.apiKey.id,
      apiKeyName: stat.apiKey.name,
      userId: stat.apiKey.user.id,
      userName: stat.apiKey.user.name,
      totalRequests: 0,
      avgResponseTime: null,
      errorRate: 0,
    };

    existing.totalRequests += stat.totalRequests;

    // Calculate weighted average response time
    if (stat.avgResponseTime && stat.totalRequests > 0) {
      const currentWeight = existing.totalRequests - stat.totalRequests;
      const newWeight = stat.totalRequests;
      const totalWeight = currentWeight + newWeight;

      if (totalWeight > 0) {
        existing.avgResponseTime = existing.avgResponseTime
          ? ((existing.avgResponseTime * currentWeight) + (stat.avgResponseTime * newWeight)) / totalWeight
          : stat.avgResponseTime;
      }
    }

    // Calculate error rate
    if (existing.totalRequests > 0) {
      const totalErrors = stat.failedRequests + stat.rateLimitHits;
      existing.errorRate = (totalErrors / existing.totalRequests) * 100;
    }

    apiKeyPerformance.set(key, existing);
  });

  const topApiKeys = Array.from(apiKeyPerformance.values())
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, 10);

  // Real-time insights from recent events
  const recentInsights = {
    totalRecentEvents: recentEvents.length,
    recentErrorRate: recentEvents.length > 0
      ? (recentEvents.filter(e => e.statusCode >= 400).length / recentEvents.length) * 100
      : 0,
    topRecentEndpoints: getTopEndpoints(recentEvents),
    activeApiKeys: new Set(recentEvents.map(e => e.apiKey.id)).size,
    activeUsers: new Set(recentEvents.map(e => e.apiKey.user.id)).size,
  };

  // Overall summary
  const totalRequests = dailyAnalytics.reduce((sum, day) => sum + day.totalRequests, 0);
  const totalSuccessful = dailyAnalytics.reduce((sum, day) => sum + day.successfulRequests, 0);
  const totalFailed = dailyAnalytics.reduce((sum, day) => sum + day.failedRequests, 0);
  const totalRateLimitHits = dailyAnalytics.reduce((sum, day) => sum + day.rateLimitHits, 0);

  return {
    summary: {
      totalRequests,
      totalSuccessful,
      totalFailed,
      totalRateLimitHits,
      overallSuccessRate: totalRequests > 0 ? (totalSuccessful / totalRequests) * 100 : 0,
      overallErrorRate: totalRequests > 0 ? ((totalFailed + totalRateLimitHits) / totalRequests) * 100 : 0,
      avgDailyRequests: totalRequests / days,
      peakDailyUsage: Math.max(...dailyAnalytics.map(d => d.totalRequests), 0),
    },
    dailyAnalytics,
    topApiKeys,
    recentInsights,
  };
}

function getTopEndpoints(events: RecentEvent[]) {
  const endpointCounts = new Map<string, number>();

  events.forEach(event => {
    const count = endpointCounts.get(event.endpoint) || 0;
    endpointCounts.set(event.endpoint, count + 1);
  });

  return Array.from(endpointCounts.entries())
    .map(([endpoint, count]) => ({
      endpoint,
      count,
      percentage: events.length > 0 ? (count / events.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
