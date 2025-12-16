/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Role } from '@/types/opnsense';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      // Check if user has admin privileges
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json(
          { success: false, message: 'Insufficient permissions' },
          { status: 403 }
        );
      }

    // Get current timestamp
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);

    // Define endpoints to exclude from real-time monitoring (meta-operations)
    const excludedEndpoints = [
      '/api/admin/analytics/realtime',           // Real-time monitoring itself
      '/api/admin/analytics/combined',           // Combined analytics dashboard
      '/api/admin/api-keys/analytics/performance', // Performance analytics
      '/api/admin/api-keys/analytics/system',    // System analytics
      '/api/admin/audit-logs',                   // Audit log viewing
      '/api/admin/audit-logs/stats',             // Audit log statistics
      '/api/admin/mac-tracking/analytics',       // MAC tracking analytics
      '/api/internal/track-session-usage',       // Session tracking endpoint
      '/api/ui/config',                          // UI configuration endpoint
    ];

    // Define pages to exclude from tracking (analytics/monitoring pages)
    const excludedPages = [
      '/admin/monitoring-analytics',
    ];

    // Helper function to check if endpoint should be excluded
    const shouldExcludeEndpoint = (endpoint: string): boolean => {
      return excludedEndpoints.some(excluded => endpoint === excluded) ||
             excludedPages.some(excluded => endpoint.startsWith(excluded)) ||
             endpoint.includes('/analytics/') ||  // Any analytics endpoint
             endpoint.includes('/audit-logs/analytics/'); // Any audit analytics
    };

    // Get active users from audit logs (users who made requests in the last 5 minutes)
    // Exclude analytics and audit viewing endpoints to avoid meta-operation pollution
    const auditLogsForActiveUsers = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: fiveMinutesAgo,
        },
        userId: {
          not: null,
        },
      },
      select: {
        userId: true,
        details: true,
      },
    });

    // Filter out excluded endpoints
    const activeUsersFromAudit = auditLogsForActiveUsers
      .filter(log => {
        const details = log.details as any;
        const endpoint = details?.endpoint;
        return endpoint && !shouldExcludeEndpoint(endpoint);
      })
      .map(log => ({ userId: log.userId }));

    // Get active users from session events (users who had UI activity in the last 5 minutes)
    // Exclude analytics and audit viewing endpoints to avoid meta-operation pollution
    const sessionEventsForActiveUsers = await prisma.sessionUsageEvent.findMany({
      where: {
        timestamp: {
          gte: fiveMinutesAgo,
        },
        userId: {
          not: null,
        },
      },
      select: {
        userId: true,
        endpoint: true,
      },
    });

    // Filter out excluded endpoints
    const activeUsersFromSessions = sessionEventsForActiveUsers
      .filter(event => !shouldExcludeEndpoint(event.endpoint))
      .map(event => ({ userId: event.userId }));

    // Combine and deduplicate active users
    const allActiveUserIds = new Set([
      ...activeUsersFromAudit.map(u => u.userId),
      ...activeUsersFromSessions.map(u => u.userId),
    ]);
    const activeUsers = allActiveUserIds.size;
    logger.debug(`Found ${activeUsers} active users in last 5 minutes`);

    // Get API usage events in the last minute for throughput and response time calculation
    // Exclude analytics and audit viewing endpoints to avoid meta-operation pollution
    const allRecentApiEvents = await prisma.apiKeyUsageEvent.findMany({
      where: {
        timestamp: {
          gte: oneMinuteAgo,
        },
      },
      select: {
        timestamp: true,
        responseTime: true,
        statusCode: true,
        endpoint: true,
        method: true,
      },
    });

    // Filter out excluded endpoints
    const recentApiEvents = allRecentApiEvents.filter(event =>
      !shouldExcludeEndpoint(event.endpoint)
    );

    // Get session usage events in the last minute for comprehensive activity tracking
    // Exclude analytics and audit viewing endpoints to avoid meta-operation pollution
    const allRecentSessionEvents = await prisma.sessionUsageEvent.findMany({
      where: {
        timestamp: {
          gte: oneMinuteAgo,
        },
      },
      select: {
        timestamp: true,
        responseTime: true,
        statusCode: true,
        endpoint: true,
        method: true,
        actionType: true,
      },
    });

    // Filter out excluded endpoints
    const recentSessionEvents = allRecentSessionEvents.filter(event =>
      !shouldExcludeEndpoint(event.endpoint)
    );

    // Also get audit log requests for additional context
    // Exclude analytics and audit viewing endpoints to avoid meta-operation pollution
    const allRecentAuditRequests = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: oneMinuteAgo,
        },
        action: {
          contains: 'API_',
        },
      },
      select: {
        timestamp: true,
        details: true,
      },
    });

    // Filter out excluded endpoints
    const recentAuditRequests = allRecentAuditRequests.filter(request => {
      const details = request.details as any;
      const endpoint = details?.endpoint;
      return !endpoint || !shouldExcludeEndpoint(endpoint);
    });

    // Combine all sources for total request count
    const totalRecentRequests = recentApiEvents.length + recentSessionEvents.length + recentAuditRequests.length;
    const requestsPerSecond = totalRecentRequests / 60;
    logger.debug(`Found ${recentApiEvents.length} API usage events, ${recentSessionEvents.length} session events, and ${recentAuditRequests.length} audit requests in last minute, throughput: ${requestsPerSecond.toFixed(2)} req/s`);

    // Calculate response times and error rates from both API and session events
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let errorCount = 0;

    // Process API key events
    recentApiEvents.forEach(event => {
      if (event.responseTime && typeof event.responseTime === 'number') {
        totalResponseTime += event.responseTime;
        responseTimeCount++;
      }
      if (event.statusCode && event.statusCode >= 400) {
        errorCount++;
      }
    });

    // Process session events
    recentSessionEvents.forEach(event => {
      if (event.responseTime && typeof event.responseTime === 'number') {
        totalResponseTime += event.responseTime;
        responseTimeCount++;
      }
      if (event.statusCode && event.statusCode >= 400) {
        errorCount++;
      }
    });

    // Also check audit log details for additional response time data
    recentAuditRequests.forEach(request => {
      const details = request.details as any;
      if (details?.responseTime && typeof details.responseTime === 'number') {
        totalResponseTime += details.responseTime;
        responseTimeCount++;
      }
      if (details?.statusCode && details.statusCode >= 400) {
        errorCount++;
      }
    });

    const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;
    const errorRate = totalRecentRequests > 0 ? errorCount / totalRecentRequests : 0;

    logger.debug(`Response time stats: ${responseTimeCount} requests with response times, avg: ${averageResponseTime.toFixed(2)}ms`);
    logger.debug(`Error stats: ${errorCount} errors out of ${totalRecentRequests} requests, rate: ${(errorRate * 100).toFixed(2)}%`);

    // Get recent activity from audit logs
    // Exclude analytics and audit viewing endpoints to avoid meta-operation pollution
    const allRecentAuditActivity = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: fiveMinutesAgo,
        },
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 50, // Get more to filter from
    });

    // Filter out excluded endpoints and successful API key validations
    const recentAuditActivity = allRecentAuditActivity
      .filter(log => {
        // Filter out successful API key validations (noise reduction)
        if (log.action === 'API_KEY_VALIDATION_SUCCESS') {
          return false;
        }

        const details = log.details as any;
        const endpoint = details?.endpoint;
        return !endpoint || !shouldExcludeEndpoint(endpoint);
      })
      .slice(0, 15); // Take top 15 after filtering

    // Get recent session activity
    // Exclude analytics and audit viewing endpoints to avoid meta-operation pollution
    const allRecentSessionActivity = await prisma.sessionUsageEvent.findMany({
      where: {
        timestamp: {
          gte: fiveMinutesAgo,
        },
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 50, // Get more to filter from
    });

    // Filter out excluded endpoints and current user's UI clicks on monitoring-analytics pages
    const recentSessionActivity = allRecentSessionActivity
      .filter(event => {
        // First apply the general endpoint exclusion
        if (shouldExcludeEndpoint(event.endpoint)) {
          return false;
        }

        // Filter out UI clicks from the current user on monitoring-analytics pages to reduce noise
        if (event.actionType === 'click' &&
            event.userId === auth.user?.id &&
            event.endpoint.includes('/admin/monitoring-analytics')) {
          return false;
        }

        return true;
      })
      .slice(0, 15); // Take top 15 after filtering

    // Get recent API key usage events for detailed activity display
    const allRecentApiKeyActivity = await prisma.apiKeyUsageEvent.findMany({
      where: {
        timestamp: {
          gte: fiveMinutesAgo,
        },
      },
      include: {
        apiKey: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 50, // Get more to filter from
    });

    // Filter out excluded endpoints from API key activity
    const recentApiKeyActivity = allRecentApiKeyActivity
      .filter(event => !shouldExcludeEndpoint(event.endpoint))
      .slice(0, 15); // Take top 15 after filtering

    logger.debug(`Found ${recentAuditActivity.length} audit activity entries, ${recentSessionActivity.length} session activity entries, and ${recentApiKeyActivity.length} API key activity entries`);

    // Format audit activity
    const formattedAuditActivity = recentAuditActivity.map(log => {
      const details = log.details as any;
      let type = 'request';
      let description = log.action;

      // Determine activity type and description
      if (log.action.includes('LOGIN')) {
        type = 'user_login';
        description = 'User logged in';
      } else if (log.action.includes('LOGOUT')) {
        type = 'user_logout';
        description = 'User logged out';
      } else if (details?.statusCode && details.statusCode >= 400) {
        type = 'error';
        description = `API Error: ${log.action}`;
      } else if (log.action.includes('API_')) {
        type = 'request';
        description = `API Request: ${log.action.replace('API_', '')}`;
      }

      return {
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        type,
        description,
        user: log.user?.name || log.user?.email || undefined,
        endpoint: details?.endpoint || undefined,
        statusCode: details?.statusCode || undefined,
      };
    });

    // Format session activity
    const formattedSessionActivity = recentSessionActivity.map(event => {
      let type = 'request';
      let description = '';

      // Determine activity type and description based on actionType
      switch (event.actionType) {
        case 'page_view':
          type = 'navigation';
          description = `Page View: ${event.endpoint}`;
          break;
        case 'api_call':
          type = event.statusCode && event.statusCode >= 400 ? 'error' : 'request';
          description = `API Call: ${event.method} ${event.endpoint}`;
          break;
        case 'form_submit':
          type = 'request';
          description = `Form Submit: ${event.endpoint}`;
          break;
        case 'click':
          type = 'interaction';
          description = `UI Click: ${event.endpoint}`;
          break;
        default:
          type = 'request';
          description = `${event.actionType}: ${event.endpoint}`;
      }

      return {
        id: event.id,
        timestamp: event.timestamp.toISOString(),
        type,
        description,
        user: event.user?.name || event.user?.email || undefined,
        endpoint: event.endpoint,
        statusCode: event.statusCode || undefined,
      };
    });

    // Format API key activity
    const formattedApiKeyActivity = recentApiKeyActivity.map(event => {
      const type = event.statusCode && event.statusCode >= 400 ? 'error' : 'request';
      const description = `API Call: ${event.method} ${event.endpoint}`;

      return {
        id: event.id,
        timestamp: event.timestamp.toISOString(),
        type,
        description,
        user: event.apiKey.user?.name || event.apiKey.user?.email || undefined,
        endpoint: event.endpoint,
        statusCode: event.statusCode || undefined,
        authMethod: 'api_key', // Add auth method indicator
      };
    });

    // Combine and sort all activities by timestamp
    const allActivities = [...formattedAuditActivity, ...formattedSessionActivity, ...formattedApiKeyActivity];
    const formattedActivity = allActivities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20); // Take top 20 most recent

    // If no recent activity, get some basic system stats
    let totalSystemUsers = 0;
    let totalApiKeys = 0;

    if (activeUsers === 0 && totalRecentRequests === 0) {
      // Get total system users and API keys for context
      const [userCount, apiKeyCount] = await Promise.all([
        prisma.user.count({ where: { role: { not: 'SUSPENDED' } } }),
        prisma.apiKey.count({ where: { enabled: true } }),
      ]);
      totalSystemUsers = userCount;
      totalApiKeys = apiKeyCount;

      logger.debug(`No recent activity found. System has ${totalSystemUsers} users and ${totalApiKeys} active API keys`);
    }

    // Create current metrics
    const metrics = {
      timestamp: now.toISOString(),
      activeUsers,
      requestsPerSecond,
      averageResponseTime,
      errorRate,
      totalRequests: totalRecentRequests,
      successfulRequests: totalRecentRequests - errorCount,
      failedRequests: errorCount,
      // Add system context when no recent activity
      ...(activeUsers === 0 && totalRecentRequests === 0 && {
        systemContext: {
          totalUsers: totalSystemUsers,
          totalApiKeys: totalApiKeys,
        }
      }),
    };

    const response = {
      success: true,
      data: {
        metrics,
        recentActivity: formattedActivity,
      },
    };

    logger.info('Real-time analytics data fetched successfully', {
      activeUsers,
      requestsPerSecond,
      averageResponseTime,
      errorRate,
      activityCount: formattedActivity.length,
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Error fetching real-time analytics:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch real-time analytics data',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
  });
}
