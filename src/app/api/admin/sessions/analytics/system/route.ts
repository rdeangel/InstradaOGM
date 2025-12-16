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

      logger.debug(`Admin ${auth.user.id} fetching system session analytics from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    } else {
      // Use legacy days parameter
      days = Math.min(parseInt(daysParam || '30'), 90);
      endDate = new Date();
      startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      logger.debug(`Admin ${auth.user.id} fetching system session analytics for ${days} days`);
    }

    // Get system-wide session statistics
    const systemStats = await prisma.sessionUsageStats.findMany({
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

    // Get count of recent events for accurate statistics
    const recentEventsCount = await prisma.sessionUsageEvent.count({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    // Get recent events for real-time insights (limited for performance)
    const recentEvents = await prisma.sessionUsageEvent.findMany({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 1000, // Limit for performance, but use count for accurate statistics
    });

    // Calculate system-wide analytics
    const analytics = calculateSystemSessionAnalytics(systemStats, recentEvents, recentEventsCount);

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
      logger.error(`Failed to get system session analytics:`, error);
      return NextResponse.json({
        success: false,
        message: 'Failed to retrieve system session analytics'
      }, { status: 500 });
    }
  });
}

interface SessionStatWithUser {
  totalRequests: number;
  apiCalls: number;
  pageViews: number;
  uiActions: number;
  successfulRequests: number;
  failedRequests: number;
  peakHourlyUsage: number;
  avgResponseTime: number | null;
  sessionToken: string;
  userId: string | null; // Allow null for deleted users
  date: Date;
  topEndpoints: unknown;
  topPages: unknown;
  actionsByType: unknown;
  errorsByType: unknown;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null; // Allow null for deleted users
}

interface SessionEventWithUser {
  timestamp: Date;
  userId: string | null; // Allow null for deleted users
  endpoint: string;
  actionType: string;
  statusCode: number | null;
  responseTime: number | null;
  user: {
    id: string;
    name: string | null;
  } | null; // Allow null for deleted users
}

function calculateSystemSessionAnalytics(systemStats: SessionStatWithUser[], recentEvents: SessionEventWithUser[], recentEventsCount: number) {
  // Aggregate stats by date
  const dailyAggregates = new Map<string, {
    date: string;
    totalRequests: number;
    apiCalls: number;
    pageViews: number;
    uiActions: number;
    successfulRequests: number;
    failedRequests: number;
    uniqueUsers: Set<string>;
    uniqueSessions: Set<string>;
    avgResponseTime: number[];
    peakHourlyUsage: number;
    topEndpoints: Record<string, number>;
    topPages: Record<string, number>;
    actionsByType: Record<string, number>;
    errorsByType: Record<string, number>;
  }>();

  systemStats.forEach(stat => {
    const dateKey = stat.date.toISOString().split('T')[0];
    const existing = dailyAggregates.get(dateKey);
    
    if (existing) {
      existing.totalRequests += stat.totalRequests;
      existing.apiCalls += stat.apiCalls;
      existing.pageViews += stat.pageViews;
      existing.uiActions += stat.uiActions;
      existing.successfulRequests += stat.successfulRequests;
      existing.failedRequests += stat.failedRequests;
      if (stat.userId) {
        existing.uniqueUsers.add(stat.userId);
      }
      existing.uniqueSessions.add(stat.sessionToken);
      existing.peakHourlyUsage = Math.max(existing.peakHourlyUsage, stat.peakHourlyUsage);
      
      if (stat.avgResponseTime) {
        existing.avgResponseTime.push(stat.avgResponseTime);
      }

      // Merge top endpoints
      const endpoints = typeof stat.topEndpoints === 'string'
        ? JSON.parse(stat.topEndpoints)
        : stat.topEndpoints || {};
      Object.entries(endpoints).forEach(([endpoint, count]) => {
        // Keys are from Object.entries of database results
        // eslint-disable-next-line security/detect-object-injection
        existing.topEndpoints[endpoint] = (existing.topEndpoints[endpoint] || 0) + (count as number);
      });

      // Merge top pages
      const pages = typeof stat.topPages === 'string'
        ? JSON.parse(stat.topPages)
        : stat.topPages || {};
      Object.entries(pages).forEach(([page, count]) => {
        // eslint-disable-next-line security/detect-object-injection
        existing.topPages[page] = (existing.topPages[page] || 0) + (count as number);
      });

      // Merge actions by type
      const actions = typeof stat.actionsByType === 'string'
        ? JSON.parse(stat.actionsByType)
        : stat.actionsByType || {};
      Object.entries(actions).forEach(([action, count]) => {
        // eslint-disable-next-line security/detect-object-injection
        existing.actionsByType[action] = (existing.actionsByType[action] || 0) + (count as number);
      });

      // Merge errors by type
      const errors = typeof stat.errorsByType === 'string'
        ? JSON.parse(stat.errorsByType)
        : stat.errorsByType || {};
      Object.entries(errors).forEach(([error, count]) => {
        // eslint-disable-next-line security/detect-object-injection
        existing.errorsByType[error] = (existing.errorsByType[error] || 0) + (count as number);
      });
    } else {
      dailyAggregates.set(dateKey, {
        date: dateKey,
        totalRequests: stat.totalRequests,
        apiCalls: stat.apiCalls,
        pageViews: stat.pageViews,
        uiActions: stat.uiActions,
        successfulRequests: stat.successfulRequests,
        failedRequests: stat.failedRequests,
        uniqueUsers: new Set(stat.userId ? [stat.userId] : []),
        uniqueSessions: new Set([stat.sessionToken]),
        avgResponseTime: stat.avgResponseTime ? [stat.avgResponseTime] : [],
        peakHourlyUsage: stat.peakHourlyUsage,
        topEndpoints: typeof stat.topEndpoints === 'string' 
          ? JSON.parse(stat.topEndpoints) 
          : stat.topEndpoints || {},
        topPages: typeof stat.topPages === 'string' 
          ? JSON.parse(stat.topPages) 
          : stat.topPages || {},
        actionsByType: typeof stat.actionsByType === 'string' 
          ? JSON.parse(stat.actionsByType) 
          : stat.actionsByType || {},
        errorsByType: typeof stat.errorsByType === 'string' 
          ? JSON.parse(stat.errorsByType) 
          : stat.errorsByType || {},
      });
    }
  });

  // Convert to final format
  const dailyStats = Array.from(dailyAggregates.values()).map(stat => ({
    date: stat.date,
    totalRequests: stat.totalRequests,
    apiCalls: stat.apiCalls,
    pageViews: stat.pageViews,
    uiActions: stat.uiActions,
    successfulRequests: stat.successfulRequests,
    failedRequests: stat.failedRequests,
    uniqueUsers: stat.uniqueUsers.size,
    uniqueSessions: stat.uniqueSessions.size,
    avgResponseTime: stat.avgResponseTime.length > 0 
      ? stat.avgResponseTime.reduce((sum, time) => sum + time, 0) / stat.avgResponseTime.length 
      : null,
    peakHourlyUsage: stat.peakHourlyUsage,
    topEndpoints: stat.topEndpoints,
    topPages: stat.topPages,
    actionsByType: stat.actionsByType,
    errorsByType: stat.errorsByType,
  }));

  // Calculate overall summary
  const totalRequests = dailyStats.reduce((sum, stat) => sum + stat.totalRequests, 0);
  const totalApiCalls = dailyStats.reduce((sum, stat) => sum + stat.apiCalls, 0);
  const totalPageViews = dailyStats.reduce((sum, stat) => sum + stat.pageViews, 0);
  const totalUiActions = dailyStats.reduce((sum, stat) => sum + stat.uiActions, 0);
  const totalUsers = new Set(systemStats.filter(stat => stat.userId).map(stat => stat.userId)).size;
  const totalSessions = new Set(systemStats.map(stat => stat.sessionToken)).size;

  // Get top users by activity
  const userActivity = new Map<string, { requests: number; user: { id: string; name: string | null; email: string | null } }>();
  systemStats.forEach(stat => {
    if (stat.userId && stat.user) {
      const existing = userActivity.get(stat.userId);
      if (existing) {
        existing.requests += stat.totalRequests;
      } else {
        userActivity.set(stat.userId, {
          requests: stat.totalRequests,
          user: stat.user,
        });
      }
    }
  });

  const topUsers = Array.from(userActivity.entries())
    .sort(([, a], [, b]) => b.requests - a.requests)
    .slice(0, 10)
    .map(([userId, data]) => ({
      userId,
      name: data.user.name,
      email: data.user.email,
      requests: data.requests,
    }));

  return {
    summary: {
      totalRequests,
      totalApiCalls,
      totalPageViews,
      totalUiActions,
      totalUsers,
      totalSessions,
      avgRequestsPerUser: totalUsers > 0 ? Math.round(totalRequests / totalUsers) : 0,
      avgRequestsPerSession: totalSessions > 0 ? Math.round(totalRequests / totalSessions) : 0,
    },
    dailyStats,
    topUsers,
    recentActivity: {
      last24Hours: recentEventsCount, // Use accurate count instead of limited array length
      recentEvents: recentEvents.slice(0, 50).map(event => ({
        timestamp: event.timestamp,
        userId: event.userId,
        userName: event.user?.name || 'Deleted User',
        endpoint: event.endpoint,
        actionType: event.actionType,
        statusCode: event.statusCode,
        responseTime: event.responseTime,
      })),
    },
  };
}
