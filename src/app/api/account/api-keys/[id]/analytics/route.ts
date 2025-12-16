import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getDetailedApiKeyAnalytics } from '@/lib/api-key-usage-stats';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface DailyStat {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitHits: number;
  avgResponseTime: number | null;
  topEndpoints: Record<string, number> | null;
}

interface RecentEvent {
  timestamp: Date;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number | null;
  errorType: string | null;
  rateLimitHit: boolean;
}

// GET /api/account/api-keys/[id]/analytics - Get detailed analytics for a specific API key
export async function GET(request: Request, context: RouteContext) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

  const { id } = await context.params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ 
      success: false, 
      message: 'Valid API key ID parameter is missing' 
    }, { status: 400 });
  }

  try {
    // Verify that the API key belongs to the authenticated user
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        userId: auth.user.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!apiKey) {
      return NextResponse.json({ 
        success: false, 
        message: 'API key not found or access denied' 
      }, { status: 404 });
    }

    // Get URL parameters for additional options
    const url = new URL(request.url);
    const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);
    const includeEvents = url.searchParams.get('includeEvents') === 'true';

    logger.debug(`Fetching detailed analytics for API key ${id} (${apiKey.name}) for user ${auth.user.id}`);

    // Get detailed analytics
    const analytics = await getDetailedApiKeyAnalytics(id, days);

    // Filter out sensitive information from events if included
    const response = {
      success: true,
      data: {
        apiKeyId: id,
        apiKeyName: apiKey.name,
        period: {
          days,
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        },
        dailyStats: analytics.dailyStats,
        recentEvents: includeEvents ? analytics.recentEvents.map((event: RecentEvent) => ({
          timestamp: event.timestamp,
          endpoint: event.endpoint,
          method: event.method,
          statusCode: event.statusCode,
          responseTime: event.responseTime,
          errorType: event.errorType,
          rateLimitHit: event.rateLimitHit,
          // Exclude sensitive information like IP addresses and user agents
        })) : undefined,
        summary: {
          totalDays: analytics.dailyStats.length,
          totalRequests: analytics.dailyStats.reduce((sum: number, stat: DailyStat) => sum + stat.totalRequests, 0),
          totalSuccessful: analytics.dailyStats.reduce((sum: number, stat: DailyStat) => sum + stat.successfulRequests, 0),
          totalFailed: analytics.dailyStats.reduce((sum: number, stat: DailyStat) => sum + stat.failedRequests, 0),
          totalRateLimitHits: analytics.dailyStats.reduce((sum: number, stat: DailyStat) => sum + stat.rateLimitHits, 0),
          avgResponseTime: analytics.dailyStats.length > 0 
            ? analytics.dailyStats
                .filter((stat: DailyStat) => stat.avgResponseTime !== null)
                .reduce((sum: number, stat: DailyStat, _: number, arr: DailyStat[]) => sum + (stat.avgResponseTime || 0) / arr.length, 0)
            : null,
          peakDailyUsage: Math.max(...analytics.dailyStats.map((stat: DailyStat) => stat.totalRequests), 0),
          uniqueEndpoints: new Set(
            analytics.dailyStats.flatMap((stat: DailyStat) =>
              Object.keys(stat.topEndpoints || {})
            )
          ).size,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error(`Error fetching detailed analytics for API key ${id}:`, error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to retrieve detailed analytics' 
    }, { status: 500 });
  }
  });
}
