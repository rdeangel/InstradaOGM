/* eslint-disable security/detect-object-injection */
// This file uses bracket notation extensively with typed keys from database results,
// Object.entries/Object.keys iterations, and validated enum values. All uses are safe.
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildJsonFilter } from '@/lib/db-helpers';

export interface ApiKeyUsageStats {
  apiKeyId: string;
  apiKeyName: string;
  totalRequests: number;
  successfulRequests: number;
  rateLimitHits: number;
  topEndpoints: Array<{
    endpoint: string;
    count: number;
    percentage: number;
  }>;
  usageByPeriod: {
    hourly: number;
    daily: number;
    monthly: number;
    burst: number;
  };
  currentLimits: {
    hourly: number | null;
    daily: number | null;
    monthly: number | null;
    burst: number | null;
  };
  lastUsed: Date | null;
  createdAt: Date;
}

export interface ApiKeyUsageSummary {
  totalApiKeys: number;
  activeApiKeys: number;
  totalRequests: number;
  rateLimitViolations: number;
  topApiKeys: Array<{
    id: string;
    name: string;
    requests: number;
    lastUsed: Date | null;
  }>;
  usageByPeriod: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
}

export interface SystemWideUsageStats {
  totalApiKeys: number;
  activeApiKeys: number;
  totalUsers: number;
  usersWithApiKeys: number;
  totalRequests: number;
  rateLimitViolations: number;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    apiKeyCount: number;
    totalRequests: number;
  }>;
  topApiKeys: Array<{
    id: string;
    name: string;
    userId: string;
    userName: string | null;
    requests: number;
    lastUsed: Date | null;
  }>;
  usageByPeriod: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  requestsByEndpoint: Array<{
    endpoint: string;
    count: number;
    percentage: number;
  }>;
}



/**
 * Get current usage statistics for a specific API key (Enhanced Phase 2)
 */
export async function getApiKeyUsageStats(apiKeyId: string): Promise<ApiKeyUsageStats | null> {
  try {
    logger.debug(`Fetching enhanced usage stats for API key: ${apiKeyId}`);

    // Get API key details
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: {
        id: true,
        name: true,
        lastUsed: true,
        createdAt: true,
        hourlyLimit: true,
        dailyLimit: true,
        monthlyLimit: true,
        burstLimit: true,
      },
    });

    if (!apiKey) {
      logger.warn(`API key not found: ${apiKeyId}`);
      return null;
    }

    // Try to get enhanced statistics from the dedicated table first
    const enhancedStats = await getEnhancedApiKeyStats(apiKeyId);
    if (enhancedStats) {
      return enhancedStats;
    }

    // Fallback to Phase 1 implementation for backward compatibility
    logger.debug(`Using fallback Phase 1 implementation for API key: ${apiKeyId}`);

    // Get current usage from rate limit records
    const now = new Date();
    const currentHour = new Date(now.getTime() - (now.getTime() % (60 * 60 * 1000)));
    const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMinute = new Date(now.getTime() - (now.getTime() % (60 * 1000)));

    const [hourlyUsage, dailyUsage, monthlyUsage, burstUsage] = await Promise.all([
      prisma.apiKeyRateLimit.findUnique({
        where: {
          apiKeyId_windowType_windowStart: {
            apiKeyId,
            windowType: 'hourly',
            windowStart: currentHour,
          },
        },
      }),
      prisma.apiKeyRateLimit.findUnique({
        where: {
          apiKeyId_windowType_windowStart: {
            apiKeyId,
            windowType: 'daily',
            windowStart: currentDay,
          },
        },
      }),
      prisma.apiKeyRateLimit.findUnique({
        where: {
          apiKeyId_windowType_windowStart: {
            apiKeyId,
            windowType: 'monthly',
            windowStart: currentMonth,
          },
        },
      }),
      prisma.apiKeyRateLimit.findUnique({
        where: {
          apiKeyId_windowType_windowStart: {
            apiKeyId,
            windowType: 'burst',
            windowStart: currentMinute,
          },
        },
      }),
    ]);

    // Get audit log statistics for this API key
    const auditStats = await getAuditLogStats(apiKeyId);

    // Calculate total requests from rate limit records
    const totalRequests = await prisma.apiKeyRateLimit.aggregate({
      where: { apiKeyId },
      _sum: { requestCount: true },
    });

    return {
      apiKeyId: apiKey.id,
      apiKeyName: apiKey.name,
      totalRequests: totalRequests._sum.requestCount || 0,
      successfulRequests: auditStats.successfulRequests,
      rateLimitHits: auditStats.rateLimitHits,
      topEndpoints: auditStats.topEndpoints,
      usageByPeriod: {
        hourly: hourlyUsage?.requestCount || 0,
        daily: dailyUsage?.requestCount || 0,
        monthly: monthlyUsage?.requestCount || 0,
        burst: burstUsage?.requestCount || 0,
      },
      currentLimits: {
        hourly: apiKey.hourlyLimit,
        daily: apiKey.dailyLimit,
        monthly: apiKey.monthlyLimit,
        burst: apiKey.burstLimit,
      },
      lastUsed: apiKey.lastUsed,
      createdAt: apiKey.createdAt,
    };
  } catch (error) {
    logger.error(`Error fetching API key usage stats for ${apiKeyId}:`, error);
    throw error;
  }
}

/**
 * Get usage summary for all API keys belonging to a user
 */
export async function getUserApiKeyUsageSummary(userId: string): Promise<ApiKeyUsageSummary> {
  try {
    logger.debug(`Fetching API key usage summary for user: ${userId}`);

    // Get user's API keys
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        lastUsed: true,
        enabled: true,
      },
    });

    const apiKeyIds = apiKeys.map(key => key.id);

    if (apiKeyIds.length === 0) {
      return {
        totalApiKeys: 0,
        activeApiKeys: 0,
        totalRequests: 0,
        rateLimitViolations: 0,
        topApiKeys: [],
        usageByPeriod: {
          last24Hours: 0,
          last7Days: 0,
          last30Days: 0,
        },
      };
    }

    // Get total requests from rate limit records
    const totalRequests = await prisma.apiKeyRateLimit.aggregate({
      where: { apiKeyId: { in: apiKeyIds } },
      _sum: { requestCount: true },
    });

    // Get rate limit violations from audit logs
    const rateLimitViolations = await prisma.auditLog.count({
      where: {
        userId,
        action: 'API_RATE_LIMIT_EXCEEDED',
      },
    });

    // Get usage by time periods
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [usage24h, usage7d, usage30d] = await Promise.all([
      prisma.apiKeyRateLimit.aggregate({
        where: {
          apiKeyId: { in: apiKeyIds },
          windowStart: { gte: last24Hours },
        },
        _sum: { requestCount: true },
      }),
      prisma.apiKeyRateLimit.aggregate({
        where: {
          apiKeyId: { in: apiKeyIds },
          windowStart: { gte: last7Days },
        },
        _sum: { requestCount: true },
      }),
      prisma.apiKeyRateLimit.aggregate({
        where: {
          apiKeyId: { in: apiKeyIds },
          windowStart: { gte: last30Days },
        },
        _sum: { requestCount: true },
      }),
    ]);

    // Get top API keys by usage
    const topApiKeysData = await Promise.all(
      apiKeys.map(async (apiKey) => {
        const usage = await prisma.apiKeyRateLimit.aggregate({
          where: { apiKeyId: apiKey.id },
          _sum: { requestCount: true },
        });
        return {
          id: apiKey.id,
          name: apiKey.name,
          requests: usage._sum.requestCount || 0,
          lastUsed: apiKey.lastUsed,
        };
      })
    );

    const topApiKeys = topApiKeysData
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);

    return {
      totalApiKeys: apiKeys.length,
      activeApiKeys: apiKeys.filter(key => key.enabled).length,
      totalRequests: totalRequests._sum.requestCount || 0,
      rateLimitViolations,
      topApiKeys,
      usageByPeriod: {
        last24Hours: usage24h._sum.requestCount || 0,
        last7Days: usage7d._sum.requestCount || 0,
        last30Days: usage30d._sum.requestCount || 0,
      },
    };
  } catch (error) {
    logger.error(`Error fetching user API key usage summary for ${userId}:`, error);
    throw error;
  }
}

/**
 * Get audit log statistics for a specific API key
 */
async function getAuditLogStats(apiKeyId: string) {
  try {
    // Get successful API key validations
    const successfulRequests = await prisma.auditLog.count({
      where: {
        action: 'API_KEY_VALIDATION_SUCCESS',
        details: buildJsonFilter(['apiKeyId'], apiKeyId),
      },
    });

    // Get rate limit hits
    const rateLimitHits = await prisma.auditLog.count({
      where: {
        action: 'API_RATE_LIMIT_EXCEEDED',
        details: buildJsonFilter(['apiKeyId'], apiKeyId),
      },
    });

    // Get top endpoints for this API key
    const endpointLogs = await prisma.auditLog.findMany({
      where: {
        action: 'API_KEY_VALIDATION_SUCCESS',
        details: buildJsonFilter(['apiKeyId'], apiKeyId),
      },
      select: {
        details: true,
      },
    });

    // Extract endpoints and count them
    const endpointCounts: Record<string, number> = {};
    let totalEndpointRequests = 0;

    endpointLogs.forEach(log => {
      const details = log.details as Record<string, unknown>;
      const endpoint = details?.apiEndpoint as string;
      if (endpoint) {
        endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
        totalEndpointRequests++;
      }
    });

    // Convert to sorted array with percentages
    const topEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({
        endpoint,
        count,
        percentage: totalEndpointRequests > 0 ? (count / totalEndpointRequests) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      successfulRequests,
      rateLimitHits,
      topEndpoints,
    };
  } catch (error) {
    logger.error(`Error fetching audit log stats for API key ${apiKeyId}:`, error);
    return {
      successfulRequests: 0,
      rateLimitHits: 0,
      topEndpoints: [],
    };
  }
}



/**
 * Get usage statistics for multiple API keys (batch operation)
 */
export async function getBatchApiKeyUsageStats(apiKeyIds: string[]): Promise<ApiKeyUsageStats[]> {
  try {
    logger.debug(`Fetching batch usage stats for ${apiKeyIds.length} API keys`);

    const results = await Promise.all(
      apiKeyIds.map(async (apiKeyId) => {
        try {
          return await getApiKeyUsageStats(apiKeyId);
        } catch (error) {
          logger.error(`Error fetching stats for API key ${apiKeyId}:`, error);
          return null;
        }
      })
    );

    return results.filter((result): result is ApiKeyUsageStats => result !== null);
  } catch (error) {
    logger.error('Error in batch API key usage stats:', error);
    throw error;
  }
}

/**
 * Get usage trends for an API key over time
 */
export async function getApiKeyUsageTrends(
  apiKeyId: string,
  days: number = 30
): Promise<Array<{ date: string; requests: number }>> {
  try {
    logger.debug(`Fetching usage trends for API key ${apiKeyId} over ${days} days`);

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Get daily usage from rate limit records
    const dailyUsage = await prisma.apiKeyRateLimit.findMany({
      where: {
        apiKeyId,
        windowType: 'daily',
        windowStart: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        windowStart: true,
        requestCount: true,
      },
      orderBy: {
        windowStart: 'asc',
      },
    });

    // Create a map of dates to request counts
    const usageMap = new Map<string, number>();
    dailyUsage.forEach(usage => {
      const dateKey = usage.windowStart.toISOString().split('T')[0];
      usageMap.set(dateKey, usage.requestCount);
    });

    // Generate array for all days in the range
    const trends: Array<{ date: string; requests: number }> = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      trends.push({
        date: dateKey,
        requests: usageMap.get(dateKey) || 0,
      });
    }

    return trends;
  } catch (error) {
    logger.error(`Error fetching usage trends for API key ${apiKeyId}:`, error);
    throw error;
  }
}

/**
 * Get system-wide API key usage statistics (admin only)
 */
export async function getSystemWideUsageStats(): Promise<SystemWideUsageStats> {
  try {
    logger.debug('Fetching system-wide API key usage statistics');

    // Get basic counts
    const [totalApiKeys, activeApiKeys, totalUsers, usersWithApiKeys] = await Promise.all([
      prisma.apiKey.count(),
      prisma.apiKey.count({ where: { enabled: true } }),
      prisma.user.count(),
      // Count only users who have at least one API key
      prisma.user.count({
        where: {
          apiKeys: {
            some: {}
          }
        }
      }),
    ]);

    // Get total requests from actual usage events
    const totalRequests = await prisma.apiKeyUsageEvent.count();

    // Get rate limit violations
    const rateLimitViolations = await prisma.auditLog.count({
      where: { action: 'API_RATE_LIMIT_EXCEEDED' },
    });

    // Get usage by time periods
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [usage24h, usage7d, usage30d] = await Promise.all([
      prisma.apiKeyUsageEvent.count({
        where: { timestamp: { gte: last24Hours } },
      }),
      prisma.apiKeyUsageEvent.count({
        where: { timestamp: { gte: last7Days } },
      }),
      prisma.apiKeyUsageEvent.count({
        where: { timestamp: { gte: last30Days } },
      }),
    ]);

    // Get top users by API key usage from actual usage events
    // Only include users who have made API requests
    const usersWithRequests = await prisma.apiKeyUsageEvent.groupBy({
      by: ['apiKeyId'],
      _count: {
        id: true,
      },
    });

    // Get unique user IDs from API keys that have usage
    const apiKeyIds = usersWithRequests.map(usage => usage.apiKeyId);
    const apiKeysWithUsers = await prisma.apiKey.findMany({
      where: {
        id: { in: apiKeyIds },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Calculate request counts per user (only users with requests)
    const userRequestCounts = new Map<string, {
      userId: string;
      userName: string | null;
      userEmail: string | null;
      apiKeyCount: number;
      totalRequests: number;
    }>();

    for (const apiKey of apiKeysWithUsers) {
      const requestCount = usersWithRequests.find(u => u.apiKeyId === apiKey.id)?._count.id || 0;

      if (requestCount > 0) { // Only include users with actual requests
        const existing = userRequestCounts.get(apiKey.userId);
        if (existing) {
          existing.totalRequests += requestCount;
          existing.apiKeyCount += 1;
        } else {
          userRequestCounts.set(apiKey.userId, {
            userId: apiKey.userId,
            userName: apiKey.user.name,
            userEmail: apiKey.user.email,
            apiKeyCount: 1,
            totalRequests: requestCount,
          });
        }
      }
    }

    // Convert to array and sort by total requests
    const topUsers = Array.from(userRequestCounts.values())
      .sort((a, b) => b.totalRequests - a.totalRequests);

    const topUsersSlice = topUsers.slice(0, 10); // Show top 10 users with requests

    // Get top API keys from actual usage events (only keys with requests)
    const apiKeysWithRequests = usersWithRequests.map(usage => ({
      apiKeyId: usage.apiKeyId,
      requestCount: usage._count.id,
    }));

    // Get API key details for keys that have usage
    const topApiKeysData = await prisma.apiKey.findMany({
      where: {
        id: { in: apiKeysWithRequests.map(k => k.apiKeyId) },
      },
      select: {
        id: true,
        name: true,
        userId: true,
        lastUsed: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    // Combine API key data with request counts (only keys with requests)
    const topApiKeys = topApiKeysData
      .map(apiKey => {
        const requestCount = apiKeysWithRequests.find(k => k.apiKeyId === apiKey.id)?.requestCount || 0;
        return {
          id: apiKey.id,
          name: apiKey.name,
          userId: apiKey.userId,
          userName: apiKey.user.name,
          requests: requestCount,
          lastUsed: apiKey.lastUsed,
        };
      })
      .filter(apiKey => apiKey.requests > 0) // Only include keys with requests
      .sort((a, b) => b.requests - a.requests);

    const topApiKeysSlice = topApiKeys.slice(0, 10);

    // Get requests by endpoint from usage events
    const endpointEvents = await prisma.apiKeyUsageEvent.findMany({
      select: {
        endpoint: true,
      },
    });

    // Count endpoints
    const endpointCounts: Record<string, number> = {};
    endpointEvents.forEach(event => {
      endpointCounts[event.endpoint] = (endpointCounts[event.endpoint] || 0) + 1;
    });

    const totalEndpointRequests = endpointEvents.length;
    const endpointStats = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({
        endpoint,
        count,
        percentage: totalEndpointRequests > 0 ? (count / totalEndpointRequests) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return {
      totalApiKeys,
      activeApiKeys,
      totalUsers,
      usersWithApiKeys,
      totalRequests,
      rateLimitViolations,
      topUsers: topUsersSlice,
      topApiKeys: topApiKeysSlice,
      usageByPeriod: {
        last24Hours: usage24h,
        last7Days: usage7d,
        last30Days: usage30d,
      },
      requestsByEndpoint: endpointStats,
    };
  } catch (error) {
    logger.error('Error fetching system-wide usage statistics:', error);
    throw error;
  }
}

/**
 * Get enhanced API key statistics from dedicated tables (Phase 2)
 */
async function getEnhancedApiKeyStats(apiKeyId: string): Promise<ApiKeyUsageStats | null> {
  try {
    // Get API key details
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: {
        id: true,
        name: true,
        lastUsed: true,
        createdAt: true,
        hourlyLimit: true,
        dailyLimit: true,
        monthlyLimit: true,
        burstLimit: true,
      },
    });

    if (!apiKey) {
      return null;
    }

    // Get current usage from rate limit records (still needed for real-time limits)
    const now = new Date();
    const currentHour = new Date(now.getTime() - (now.getTime() % (60 * 60 * 1000)));
    const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMinute = new Date(now.getTime() - (now.getTime() % (60 * 1000)));

    const [hourlyUsage, dailyUsage, monthlyUsage, burstUsage] = await Promise.all([
      prisma.apiKeyRateLimit.findUnique({
        where: {
          apiKeyId_windowType_windowStart: {
            apiKeyId,
            windowType: 'hourly',
            windowStart: currentHour,
          },
        },
      }),
      prisma.apiKeyRateLimit.findUnique({
        where: {
          apiKeyId_windowType_windowStart: {
            apiKeyId,
            windowType: 'daily',
            windowStart: currentDay,
          },
        },
      }),
      prisma.apiKeyRateLimit.findUnique({
        where: {
          apiKeyId_windowType_windowStart: {
            apiKeyId,
            windowType: 'monthly',
            windowStart: currentMonth,
          },
        },
      }),
      prisma.apiKeyRateLimit.findUnique({
        where: {
          apiKeyId_windowType_windowStart: {
            apiKeyId,
            windowType: 'burst',
            windowStart: currentMinute,
          },
        },
      }),
    ]);

    // Get aggregated statistics from the dedicated table
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const aggregatedStats = await prisma.apiKeyUsageStats.findMany({
      where: {
        apiKeyId,
        date: {
          gte: last30Days,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Calculate totals from aggregated data
    const totalRequests = aggregatedStats.reduce((sum: number, stat) => sum + stat.totalRequests, 0);
    const successfulRequests = aggregatedStats.reduce((sum: number, stat) => sum + stat.successfulRequests, 0);
    const rateLimitHits = aggregatedStats.reduce((sum: number, stat) => sum + stat.rateLimitHits, 0);

    // Combine top endpoints from recent stats
    const allEndpoints: Record<string, number> = {};
    aggregatedStats.forEach((stat) => {
      if (stat.topEndpoints) {
        const endpoints = typeof stat.topEndpoints === 'string'
          ? JSON.parse(stat.topEndpoints)
          : stat.topEndpoints;
        Object.entries(endpoints as Record<string, number>).forEach(([endpoint, count]) => {
          allEndpoints[endpoint] = (allEndpoints[endpoint] || 0) + count;
        });
      }
    });

    // Convert to top endpoints array
    const topEndpoints = Object.entries(allEndpoints)
      .map(([endpoint, count]) => ({
        endpoint,
        count,
        percentage: totalRequests > 0 ? (count / totalRequests) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      apiKeyId: apiKey.id,
      apiKeyName: apiKey.name,
      totalRequests,
      successfulRequests,
      rateLimitHits,
      topEndpoints,
      usageByPeriod: {
        hourly: hourlyUsage?.requestCount || 0,
        daily: dailyUsage?.requestCount || 0,
        monthly: monthlyUsage?.requestCount || 0,
        burst: burstUsage?.requestCount || 0,
      },
      currentLimits: {
        hourly: apiKey.hourlyLimit,
        daily: apiKey.dailyLimit,
        monthly: apiKey.monthlyLimit,
        burst: apiKey.burstLimit,
      },
      lastUsed: apiKey.lastUsed,
      createdAt: apiKey.createdAt,
    };
  } catch (error) {
    logger.error(`Error fetching enhanced API key stats for ${apiKeyId}:`, error);
    return null; // Fallback to Phase 1 implementation
  }
}

/**
 * Get detailed usage analytics from the enhanced tracking system
 */
export async function getDetailedApiKeyAnalytics(apiKeyId: string, days: number = 30) {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Get daily aggregated statistics
    const dailyStats = await prisma.apiKeyUsageStats.findMany({
      where: {
        apiKeyId,
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
    const recentEvents = await prisma.apiKeyUsageEvent.findMany({
      where: {
        apiKeyId,
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
        successfulRequests: stat.successfulRequests,
        failedRequests: stat.failedRequests,
        rateLimitHits: stat.rateLimitHits,
        uniqueEndpoints: stat.uniqueEndpoints,
        uniqueIpAddresses: stat.uniqueIpAddresses,
        avgResponseTime: stat.avgResponseTime,
        peakHourlyUsage: stat.peakHourlyUsage,
        peakHourlyUsageHour: stat.peakHourlyUsageHour,
        topEndpoints: typeof stat.topEndpoints === 'string'
          ? JSON.parse(stat.topEndpoints)
          : stat.topEndpoints,
        usageByHour: typeof stat.usageByHour === 'string'
          ? JSON.parse(stat.usageByHour)
          : stat.usageByHour,
      })),
      recentEvents: recentEvents.map((event) => ({
        timestamp: event.timestamp,
        endpoint: event.endpoint,
        method: event.method,
        statusCode: event.statusCode,
        responseTime: event.responseTime,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        errorType: event.errorType,
        rateLimitHit: event.rateLimitHit,
      })),
    };
  } catch (error) {
    logger.error(`Error fetching detailed analytics for API key ${apiKeyId}:`, error);
    throw error;
  }
}
