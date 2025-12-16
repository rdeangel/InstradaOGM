/* eslint-disable security/detect-object-injection */
// This file uses bracket notation extensively with typed keys from database results,
// Object.entries/Object.keys iterations, and validated enum values. All uses are safe.
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Get detailed session usage analytics
 */
export async function getDetailedSessionAnalytics(sessionToken: string, days: number = 30) {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Get daily aggregated statistics
    const dailyStats = await prisma.sessionUsageStats.findMany({
      where: {
        sessionToken,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Get recent detailed events for real-time analysis
    const recentEvents = await prisma.sessionUsageEvent.findMany({
      where: {
        sessionToken,
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 1000, // Limit to recent events
    });

    return {
      dailyStats: dailyStats.map((stat) => ({
        date: stat.date,
        totalRequests: stat.totalRequests,
        apiCalls: stat.apiCalls,
        pageViews: stat.pageViews,
        uiActions: stat.uiActions,
        successfulRequests: stat.successfulRequests,
        failedRequests: stat.failedRequests,
        uniqueEndpoints: stat.uniqueEndpoints,
        uniquePages: stat.uniquePages,
        uniqueIpAddresses: stat.uniqueIpAddresses,
        avgResponseTime: stat.avgResponseTime,
        peakHourlyUsage: stat.peakHourlyUsage,
        peakHourlyUsageHour: stat.peakHourlyUsageHour,
        topEndpoints: typeof stat.topEndpoints === 'string'
          ? JSON.parse(stat.topEndpoints)
          : stat.topEndpoints,
        topPages: typeof stat.topPages === 'string'
          ? JSON.parse(stat.topPages)
          : stat.topPages,
        topIpAddresses: typeof stat.topIpAddresses === 'string'
          ? JSON.parse(stat.topIpAddresses)
          : stat.topIpAddresses,
        actionsByType: typeof stat.actionsByType === 'string'
          ? JSON.parse(stat.actionsByType)
          : stat.actionsByType,
        errorsByType: typeof stat.errorsByType === 'string'
          ? JSON.parse(stat.errorsByType)
          : stat.errorsByType,
        usageByHour: typeof stat.usageByHour === 'string'
          ? JSON.parse(stat.usageByHour)
          : stat.usageByHour,
      })),
      recentEvents: recentEvents.map((event) => ({
        timestamp: event.timestamp,
        endpoint: event.endpoint,
        method: event.method,
        actionType: event.actionType,
        statusCode: event.statusCode,
        responseTime: event.responseTime,
        pageUrl: event.pageUrl,
        errorType: event.errorType,
      })),
      summary: {
        totalDays: dailyStats.length,
        totalRequests: dailyStats.reduce((sum, stat) => sum + stat.totalRequests, 0),
        totalApiCalls: dailyStats.reduce((sum, stat) => sum + stat.apiCalls, 0),
        totalPageViews: dailyStats.reduce((sum, stat) => sum + stat.pageViews, 0),
        totalUiActions: dailyStats.reduce((sum, stat) => sum + stat.uiActions, 0),
        avgResponseTime: dailyStats.length > 0
          ? dailyStats.reduce((sum, stat) => sum + (stat.avgResponseTime || 0), 0) / dailyStats.length
          : 0,
        recentEventsCount: recentEvents.length,
      },
    };
  } catch (error) {
    logger.error(`Failed to get detailed session analytics for session ${sessionToken}:`, error);
    throw error;
  }
}

/**
 * Get user-level session analytics (aggregated across all user sessions)
 */
export async function getUserSessionAnalytics(userId: string, days: number = 30) {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Get daily aggregated statistics for all user sessions
    const dailyStats = await prisma.sessionUsageStats.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Get recent detailed events for all user sessions
    const recentEvents = await prisma.sessionUsageEvent.findMany({
      where: {
        userId,
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 1000, // Limit to recent events
    });

    // Aggregate stats by date
    const aggregatedByDate = new Map<string, {
      date: Date;
      totalRequests: number;
      apiCalls: number;
      pageViews: number;
      uiActions: number;
      successfulRequests: number;
      failedRequests: number;
      uniqueEndpoints: Set<string>;
      uniquePages: Set<string>;
      uniqueIpAddresses: Set<string>;
      responseTimes: number[];
      peakHourlyUsage: number;
      topEndpoints: Record<string, number>;
      topPages: Record<string, number>;
      actionsByType: Record<string, number>;
      errorsByType: Record<string, number>;
    }>();

    dailyStats.forEach(stat => {
      const dateKey = stat.date.toISOString().split('T')[0];
      const existing = aggregatedByDate.get(dateKey);
      
      if (existing) {
        existing.totalRequests += stat.totalRequests;
        existing.apiCalls += stat.apiCalls;
        existing.pageViews += stat.pageViews;
        existing.uiActions += stat.uiActions;
        existing.successfulRequests += stat.successfulRequests;
        existing.failedRequests += stat.failedRequests;
        existing.peakHourlyUsage = Math.max(existing.peakHourlyUsage, stat.peakHourlyUsage);
        
        if (stat.avgResponseTime) {
          existing.responseTimes.push(stat.avgResponseTime);
        }

        // Merge top endpoints
        const endpoints = typeof stat.topEndpoints === 'string' 
          ? JSON.parse(stat.topEndpoints) 
          : stat.topEndpoints || {};
        Object.entries(endpoints).forEach(([endpoint, count]) => {
          existing.topEndpoints[endpoint] = (existing.topEndpoints[endpoint] || 0) + (count as number);
        });

        // Merge top pages
        const pages = typeof stat.topPages === 'string' 
          ? JSON.parse(stat.topPages) 
          : stat.topPages || {};
        Object.entries(pages).forEach(([page, count]) => {
          existing.topPages[page] = (existing.topPages[page] || 0) + (count as number);
        });

        // Merge actions by type
        const actions = typeof stat.actionsByType === 'string' 
          ? JSON.parse(stat.actionsByType) 
          : stat.actionsByType || {};
        Object.entries(actions).forEach(([action, count]) => {
          existing.actionsByType[action] = (existing.actionsByType[action] || 0) + (count as number);
        });

        // Merge errors by type
        const errors = typeof stat.errorsByType === 'string' 
          ? JSON.parse(stat.errorsByType) 
          : stat.errorsByType || {};
        Object.entries(errors).forEach(([error, count]) => {
          existing.errorsByType[error] = (existing.errorsByType[error] || 0) + (count as number);
        });
      } else {
        aggregatedByDate.set(dateKey, {
          date: stat.date,
          totalRequests: stat.totalRequests,
          apiCalls: stat.apiCalls,
          pageViews: stat.pageViews,
          uiActions: stat.uiActions,
          successfulRequests: stat.successfulRequests,
          failedRequests: stat.failedRequests,
          uniqueEndpoints: new Set<string>(),
          uniquePages: new Set<string>(),
          uniqueIpAddresses: new Set<string>(),
          responseTimes: stat.avgResponseTime ? [stat.avgResponseTime] : [],
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

    // Convert aggregated data to final format
    const aggregatedStats = Array.from(aggregatedByDate.values()).map(stat => ({
      date: stat.date,
      totalRequests: Number.isFinite(stat.totalRequests) ? Math.max(0, stat.totalRequests) : 0,
      apiCalls: Number.isFinite(stat.apiCalls) ? Math.max(0, stat.apiCalls) : 0,
      pageViews: Number.isFinite(stat.pageViews) ? Math.max(0, stat.pageViews) : 0,
      uiActions: Number.isFinite(stat.uiActions) ? Math.max(0, stat.uiActions) : 0,
      successfulRequests: Number.isFinite(stat.successfulRequests) ? Math.max(0, stat.successfulRequests) : 0,
      failedRequests: Number.isFinite(stat.failedRequests) ? Math.max(0, stat.failedRequests) : 0,
      uniqueEndpoints: stat.uniqueEndpoints.size,
      uniquePages: stat.uniquePages.size,
      uniqueIpAddresses: stat.uniqueIpAddresses.size,
      avgResponseTime: stat.responseTimes.length > 0
        ? (() => {
            const validTimes = stat.responseTimes.filter(time => Number.isFinite(time) && time > 0);
            return validTimes.length > 0
              ? validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length
              : null;
          })()
        : null,
      peakHourlyUsage: stat.peakHourlyUsage,
      topEndpoints: stat.topEndpoints,
      topPages: stat.topPages,
      actionsByType: stat.actionsByType,
      errorsByType: stat.errorsByType,
    }));

    return {
      dailyStats: aggregatedStats,
      recentEvents: recentEvents.map((event) => ({
        timestamp: event.timestamp,
        endpoint: event.endpoint,
        method: event.method,
        actionType: event.actionType,
        statusCode: event.statusCode,
        responseTime: event.responseTime,
        pageUrl: event.pageUrl,
        errorType: event.errorType,
      })),
      summary: {
        totalDays: aggregatedStats.length,
        totalRequests: Math.max(0, aggregatedStats.reduce((sum, stat) => sum + (Number.isFinite(stat.totalRequests) ? stat.totalRequests : 0), 0)),
        totalApiCalls: Math.max(0, aggregatedStats.reduce((sum, stat) => sum + (Number.isFinite(stat.apiCalls) ? stat.apiCalls : 0), 0)),
        totalPageViews: Math.max(0, aggregatedStats.reduce((sum, stat) => sum + (Number.isFinite(stat.pageViews) ? stat.pageViews : 0), 0)),
        totalUiActions: Math.max(0, aggregatedStats.reduce((sum, stat) => sum + (Number.isFinite(stat.uiActions) ? stat.uiActions : 0), 0)),
        avgResponseTime: aggregatedStats.length > 0
          ? (() => {
              const validResponseTimes = aggregatedStats.filter(stat => Number.isFinite(stat.avgResponseTime) && stat.avgResponseTime !== null);
              return validResponseTimes.length > 0
                ? validResponseTimes.reduce((sum, stat) => sum + stat.avgResponseTime!, 0) / validResponseTimes.length
                : 0;
            })()
          : 0,
        recentEventsCount: recentEvents.length,
        uniqueSessions: new Set(dailyStats.map(stat => stat.sessionToken)).size,
      },
    };
  } catch (error) {
    logger.error(`Failed to get user session analytics for user ${userId}:`, error);
    throw error;
  }
}
