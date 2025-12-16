/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

// GET /api/admin/api-keys/analytics/performance - Get performance analytics
export async function GET(request: NextRequest) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      // Check if user has admin privileges
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json(
          { success: false, message: 'Insufficient permissions' },
          { status: 403 }
        );
      }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeDetails = searchParams.get('includeDetails') === 'true';

    // Support legacy 'days' parameter for backward compatibility
    let start: Date, end: Date;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      const days = Math.min(parseInt(searchParams.get('days') || '7'), 30);
      end = new Date();
      start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    }

    logger.debug(`Admin ${auth.user.id} fetching performance analytics from ${start.toISOString()} to ${end.toISOString()}`);

    // Get API usage events within the date range
    const usageEvents = await prisma.apiKeyUsageEvent.findMany({
      where: {
        timestamp: {
          gte: start,
          lte: end,
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
        timestamp: 'asc',
      },
    });

    // Get session usage events within the date range
    const sessionEvents = await prisma.sessionUsageEvent.findMany({
      where: {
        timestamp: {
          gte: start,
          lte: end,
        },
        // Include all session events for comprehensive performance metrics
        // actionType: 'api_call', // Removed filter to include all session activity
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
        timestamp: 'asc',
      },
    });

    // Combine API key and session events for comprehensive performance metrics
    const allEvents = [
      ...usageEvents.map(event => ({
        ...event,
        source: 'api_key' as const,
        user: event.apiKey.user,
      })),
      ...sessionEvents.map((event: any) => ({
        ...event,
        source: 'session' as const,
        apiKey: null,
      })),
    ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Calculate performance metrics from combined data
    const totalRequests = allEvents.length;
    const successfulRequests = allEvents.filter(event => (event.statusCode || 200) < 400).length;
    const failedRequests = totalRequests - successfulRequests;
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

    // Calculate response time metrics from combined data
    const responseTimes = allEvents
      .filter(event => event.responseTime !== null && event.responseTime !== undefined)
      .map(event => event.responseTime!)
      .sort((a, b) => a - b);

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);
    // Indices are calculated from array length, safe to use
    // eslint-disable-next-line security/detect-object-injection
    const p95ResponseTime = responseTimes.length > 0 ? responseTimes[p95Index] || 0 : 0;
    // eslint-disable-next-line security/detect-object-injection
    const p99ResponseTime = responseTimes.length > 0 ? responseTimes[p99Index] || 0 : 0;

    // Calculate throughput (requests per second)
    const durationInSeconds = (end.getTime() - start.getTime()) / 1000;
    const throughput = durationInSeconds > 0 ? totalRequests / durationInSeconds : 0;

    const metrics = {
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      errorRate,
      throughput,
      totalRequests,
      successfulRequests,
      failedRequests,
    };
    // Calculate endpoint performance
    interface EndpointStat {
      endpoint: string;
      method: string;
      requestCount: number;
      totalResponseTime: number;
      errorCount: number;
      responseTimes: number[];
    }
    const endpointStats = new Map<string, EndpointStat>();

    allEvents.forEach(event => {
      const key = `${event.method || 'GET'} ${event.endpoint}`;
      const existing: EndpointStat = endpointStats.get(key) || {
        endpoint: event.endpoint,
        method: event.method || 'GET',
        requestCount: 0,
        totalResponseTime: 0,
        errorCount: 0,
        responseTimes: [] as number[],
      };

      existing.requestCount++;
      if (event.responseTime && typeof event.responseTime === 'number') {
        const responseTime = event.responseTime as number;
        existing.totalResponseTime += responseTime;
        existing.responseTimes.push(responseTime);
      }
      if ((event.statusCode || 200) >= 400) {
        existing.errorCount++;
      }

      endpointStats.set(key, existing);
    });

    const endpointPerformance = Array.from(endpointStats.values()).map(stats => {
      const averageResponseTime = stats.requestCount > 0 ? stats.totalResponseTime / stats.requestCount : 0;
      const errorRate = stats.requestCount > 0 ? stats.errorCount / stats.requestCount : 0;
      const sortedTimes = stats.responseTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(sortedTimes.length * 0.95);
      // Index is calculated from array length, safe to use
      // eslint-disable-next-line security/detect-object-injection
      const p95ResponseTime = sortedTimes.length > 0 ? sortedTimes[p95Index] || 0 : 0;

      return {
        endpoint: stats.endpoint,
        method: stats.method,
        averageResponseTime,
        requestCount: stats.requestCount,
        errorRate,
        p95ResponseTime,
      };
    }).sort((a, b) => b.requestCount - a.requestCount);

    // Generate time series data (hourly buckets)
    const timeSeries: any[] = [];
    const hourlyBuckets = new Map<string, {
      timestamp: string;
      requests: number;
      totalResponseTime: number;
      errorCount: number;
      responseTimeCount: number;
    }>();

    allEvents.forEach(event => {
      const hour = new Date(event.timestamp);
      hour.setMinutes(0, 0, 0);
      const hourKey = hour.toISOString();

      const existing = hourlyBuckets.get(hourKey) || {
        timestamp: hourKey,
        requests: 0,
        totalResponseTime: 0,
        errorCount: 0,
        responseTimeCount: 0,
      };

      existing.requests++;
      if (event.responseTime) {
        existing.totalResponseTime += event.responseTime;
        existing.responseTimeCount++;
      }
      if ((event.statusCode || 200) >= 400) {
        existing.errorCount++;
      }

      hourlyBuckets.set(hourKey, existing);
    });

    Array.from(hourlyBuckets.values()).forEach(bucket => {
      timeSeries.push({
        timestamp: bucket.timestamp,
        responseTime: bucket.responseTimeCount > 0 ? bucket.totalResponseTime / bucket.responseTimeCount : 0,
        throughput: bucket.requests / 3600, // requests per second in this hour
        errorRate: bucket.requests > 0 ? bucket.errorCount / bucket.requests : 0,
        requests: bucket.requests,
      });
    });

    timeSeries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const response = {
      success: true,
      data: {
        metrics,
        endpointPerformance: includeDetails ? endpointPerformance : endpointPerformance.slice(0, 20),
        timeSeries,
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          days: Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
        },
      },
    };

    logger.info('Performance analytics data fetched successfully', {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalRequests,
      endpointCount: endpointPerformance.length,
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Error fetching performance analytics:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch performance analytics data',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
  });
}



