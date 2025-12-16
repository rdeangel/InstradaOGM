import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Role } from '@/types/opnsense';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Check if the user is authenticated and has the ADMIN or SUPER_ADMIN role
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Admin access required'
      }, { status: 403 });
    }

  try {
    // Get URL parameters
    const url = new URL(request.url);
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');
    const daysParam = url.searchParams.get('days');

    let startDate: Date;
    let endDate: Date;
    let days: number;

    if (startDateParam && endDateParam) {
      // Use date range parameters
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
      
      // If end date is at start of day (00:00:00), set it to end of day (23:59:59)
      if (endDate.getHours() === 0 && endDate.getMinutes() === 0 &&
          endDate.getSeconds() === 0 && endDate.getMilliseconds() === 0) {
        endDate.setHours(23, 59, 59, 999);
      }
      
      days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

      logger.debug(`Admin ${auth.user.id} fetching combined analytics from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    } else {
      // Use legacy days parameter
      days = Math.min(parseInt(daysParam || '30'), 90);
      endDate = new Date();
      startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      logger.debug(`Admin ${auth.user.id} fetching combined analytics for ${days} days`);
    }

    // Get API key statistics
    const apiKeyStats = await prisma.apiKeyUsageStats.findMany({
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

    // Get session statistics
    const sessionStats = await prisma.sessionUsageStats.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Get recent events from both sources
    const recentApiEvents = await prisma.apiKeyUsageEvent.findMany({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      include: {
        apiKey: {
          select: {
            name: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 500,
    });

    const recentSessionEvents = await prisma.sessionUsageEvent.findMany({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 500,
    });

    // Calculate combined analytics
    const analytics = calculateCombinedAnalytics(apiKeyStats, sessionStats, recentApiEvents, recentSessionEvents);

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
      logger.error(`Failed to get combined analytics:`, error);
      return NextResponse.json({
        success: false,
        message: 'Failed to retrieve combined analytics'
      }, { status: 500 });
    }
  });
}

interface ApiKeyStatWithRelations {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitHits: number;
  apiKeyId: string;
  date: Date;
  apiKey: {
    id: string;
    name: string;
    user: {
      id: string;
      name: string | null;
      email: string | null;
    };
  };
}

interface SessionStatWithRelations {
  totalRequests: number;
  apiCalls: number;
  pageViews: number;
  uiActions: number;
  successfulRequests: number;
  failedRequests: number;
  sessionToken: string;
  userId: string | null; // Allow null for deleted users
  date: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null; // Allow null for deleted users
}

interface ApiKeyEventWithRelations {
  timestamp: Date;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number | null;
  apiKey: {
    name: string;
    user: {
      name: string | null;
    };
  };
}

interface SessionEventWithRelations {
  timestamp: Date;
  endpoint: string;
  method: string;
  actionType: string;
  statusCode: number | null;
  responseTime: number | null;
  user: {
    name: string | null;
  } | null; // Allow null for deleted users
}

function calculateCombinedAnalytics(
  apiKeyStats: ApiKeyStatWithRelations[],
  sessionStats: SessionStatWithRelations[],
  recentApiEvents: ApiKeyEventWithRelations[],
  recentSessionEvents: SessionEventWithRelations[]
) {
  // Calculate API key totals
  const apiKeyTotals = {
    totalRequests: apiKeyStats.reduce((sum, stat) => sum + stat.totalRequests, 0),
    successfulRequests: apiKeyStats.reduce((sum, stat) => sum + stat.successfulRequests, 0),
    failedRequests: apiKeyStats.reduce((sum, stat) => sum + stat.failedRequests, 0),
    rateLimitHits: apiKeyStats.reduce((sum, stat) => sum + stat.rateLimitHits, 0),
    uniqueApiKeys: new Set(apiKeyStats.map(stat => stat.apiKeyId)).size,
    uniqueUsers: new Set(apiKeyStats.map(stat => stat.apiKey.user.id)).size,
  };

  // Calculate session totals
  const sessionTotals = {
    totalRequests: sessionStats.reduce((sum, stat) => sum + stat.totalRequests, 0),
    apiCalls: sessionStats.reduce((sum, stat) => sum + stat.apiCalls, 0),
    pageViews: sessionStats.reduce((sum, stat) => sum + stat.pageViews, 0),
    uiActions: sessionStats.reduce((sum, stat) => sum + stat.uiActions, 0),
    successfulRequests: sessionStats.reduce((sum, stat) => sum + stat.successfulRequests, 0),
    failedRequests: sessionStats.reduce((sum, stat) => sum + stat.failedRequests, 0),
    uniqueSessions: new Set(sessionStats.map(stat => stat.sessionToken)).size,
    uniqueUsers: new Set(sessionStats.filter(stat => stat.userId).map(stat => stat.userId)).size,
  };

  // Combine daily stats
  const dailyAggregates = new Map<string, {
    date: string;
    apiKeyRequests: number;
    sessionRequests: number;
    sessionApiCalls: number;
    sessionPageViews: number;
    sessionUiActions: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rateLimitHits: number;
  }>();

  // Process API key stats
  apiKeyStats.forEach(stat => {
    const dateKey = stat.date.toISOString().split('T')[0];
    const existing = dailyAggregates.get(dateKey);
    
    if (existing) {
      existing.apiKeyRequests += stat.totalRequests;
      existing.totalRequests += stat.totalRequests;
      existing.successfulRequests += stat.successfulRequests;
      existing.failedRequests += stat.failedRequests;
      existing.rateLimitHits += stat.rateLimitHits;
    } else {
      dailyAggregates.set(dateKey, {
        date: dateKey,
        apiKeyRequests: stat.totalRequests,
        sessionRequests: 0,
        sessionApiCalls: 0,
        sessionPageViews: 0,
        sessionUiActions: 0,
        totalRequests: stat.totalRequests,
        successfulRequests: stat.successfulRequests,
        failedRequests: stat.failedRequests,
        rateLimitHits: stat.rateLimitHits,
      });
    }
  });

  // Process session stats
  sessionStats.forEach(stat => {
    const dateKey = stat.date.toISOString().split('T')[0];
    const existing = dailyAggregates.get(dateKey);
    
    if (existing) {
      existing.sessionRequests += stat.totalRequests;
      existing.sessionApiCalls += stat.apiCalls;
      existing.sessionPageViews += stat.pageViews;
      existing.sessionUiActions += stat.uiActions;
      existing.totalRequests += stat.totalRequests;
      existing.successfulRequests += stat.successfulRequests;
      existing.failedRequests += stat.failedRequests;
    } else {
      dailyAggregates.set(dateKey, {
        date: dateKey,
        apiKeyRequests: 0,
        sessionRequests: stat.totalRequests,
        sessionApiCalls: stat.apiCalls,
        sessionPageViews: stat.pageViews,
        sessionUiActions: stat.uiActions,
        totalRequests: stat.totalRequests,
        successfulRequests: stat.successfulRequests,
        failedRequests: stat.failedRequests,
        rateLimitHits: 0,
      });
    }
  });

  const dailyStats = Array.from(dailyAggregates.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Combine recent events
  const combinedRecentEvents = [
    ...recentApiEvents.map(event => ({
      timestamp: event.timestamp,
      type: 'api_key' as const,
      source: `API Key: ${event.apiKey.name}`,
      user: event.apiKey.user.name,
      endpoint: event.endpoint,
      method: event.method,
      statusCode: event.statusCode,
      responseTime: event.responseTime,
    })),
    ...recentSessionEvents.map(event => ({
      timestamp: event.timestamp,
      type: 'session' as const,
      source: 'Web Session',
      user: event.user?.name || 'Deleted User',
      endpoint: event.endpoint,
      method: event.method,
      actionType: event.actionType,
      statusCode: event.statusCode,
      responseTime: event.responseTime,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 100);

  return {
    summary: {
      totalRequests: apiKeyTotals.totalRequests + sessionTotals.totalRequests,
      apiKeyRequests: apiKeyTotals.totalRequests,
      sessionRequests: sessionTotals.totalRequests,
      sessionBreakdown: {
        apiCalls: sessionTotals.apiCalls,
        pageViews: sessionTotals.pageViews,
        uiActions: sessionTotals.uiActions,
      },
      successfulRequests: apiKeyTotals.successfulRequests + sessionTotals.successfulRequests,
      failedRequests: apiKeyTotals.failedRequests + sessionTotals.failedRequests,
      rateLimitHits: apiKeyTotals.rateLimitHits,
      uniqueApiKeys: apiKeyTotals.uniqueApiKeys,
      uniqueSessions: sessionTotals.uniqueSessions,
      totalUniqueUsers: new Set([
        ...apiKeyStats.map(stat => stat.apiKey.user.id),
        ...sessionStats.filter(stat => stat.userId).map(stat => stat.userId),
      ]).size,
    },
    dailyStats,
    recentActivity: {
      totalEvents: combinedRecentEvents.length,
      events: combinedRecentEvents,
    },
    breakdown: {
      apiKeys: apiKeyTotals,
      sessions: sessionTotals,
    },
  };
}
