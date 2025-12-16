import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

// GET /api/admin/api-keys/usage/trends - Get system-wide API key usage trends (admin only)
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
      const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90); // Limit to 90 days max
      const windowType = url.searchParams.get('windowType') || 'daily'; // daily, hourly

      logger.debug(`Admin ${auth.user.id} fetching system-wide API key usage trends for ${days} days`);

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Get usage trends from rate limit records
      const usageTrends = await prisma.apiKeyRateLimit.findMany({
        where: {
          windowType: windowType === 'hourly' ? 'hourly' : 'daily',
          windowStart: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          windowStart: true,
          requestCount: true,
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
          windowStart: 'asc',
        },
      });

      // Aggregate data by time period
      const aggregatedData = new Map<string, {
        date: string;
        totalRequests: number;
        uniqueApiKeys: Set<string>;
        uniqueUsers: Set<string>;
        topApiKeys: Map<string, { name: string; requests: number; userName: string | null }>;
      }>();

      usageTrends.forEach(trend => {
        const dateKey = windowType === 'hourly'
          ? trend.windowStart.toISOString().substring(0, 13) + ':00:00.000Z' // Hour precision
          : trend.windowStart.toISOString().split('T')[0]; // Day precision

        if (!aggregatedData.has(dateKey)) {
          aggregatedData.set(dateKey, {
            date: dateKey,
            totalRequests: 0,
            uniqueApiKeys: new Set(),
            uniqueUsers: new Set(),
            topApiKeys: new Map(),
          });
        }

        const data = aggregatedData.get(dateKey)!;
        data.totalRequests += trend.requestCount;
        data.uniqueApiKeys.add(trend.apiKey.id);
        data.uniqueUsers.add(trend.apiKey.user.id);

        // Track top API keys for this period
        const apiKeyKey = trend.apiKey.id;
        const existing = data.topApiKeys.get(apiKeyKey);
        if (existing) {
          existing.requests += trend.requestCount;
        } else {
          data.topApiKeys.set(apiKeyKey, {
            name: trend.apiKey.name,
            requests: trend.requestCount,
            userName: trend.apiKey.user.name,
          });
        }
      });

      // Convert to array and format the response
      const trendsArray = Array.from(aggregatedData.values()).map(data => ({
        date: data.date,
        totalRequests: data.totalRequests,
        uniqueApiKeys: data.uniqueApiKeys.size,
        uniqueUsers: data.uniqueUsers.size,
        topApiKeys: Array.from(data.topApiKeys.entries())
          .map(([id, info]) => ({ id, ...info }))
          .sort((a, b) => b.requests - a.requests)
          .slice(0, 5), // Top 5 API keys for each period
      }));

      // Fill in missing dates with zero values
      const completeData: Array<{
        date: string;
        totalRequests: number;
        uniqueApiKeys: number;
        uniqueUsers: number;
        topApiKeys: Array<{ id: string; name: string; requests: number; userName: string | null }>;
      }> = [];

      if (windowType === 'hourly') {
        // Generate hourly data
        for (let i = 0; i < days * 24; i++) {
          const date = new Date(startDate.getTime() + i * 60 * 60 * 1000);
          const dateKey = date.toISOString().substring(0, 13) + ':00:00.000Z';
          const existing = trendsArray.find(d => d.date === dateKey);
          completeData.push(existing || {
            date: dateKey,
            totalRequests: 0,
            uniqueApiKeys: 0,
            uniqueUsers: 0,
            topApiKeys: [],
          });
        }
      } else {
        // Generate daily data
        for (let i = 0; i < days; i++) {
          const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
          const dateKey = date.toISOString().split('T')[0];
          const existing = trendsArray.find(d => d.date === dateKey);
          completeData.push(existing || {
            date: dateKey,
            totalRequests: 0,
            uniqueApiKeys: 0,
            uniqueUsers: 0,
            topApiKeys: [],
          });
        }
      }

      // Calculate summary statistics
      const totalRequests = completeData.reduce((sum, d) => sum + d.totalRequests, 0);
      const avgRequestsPerPeriod = completeData.length > 0 ? totalRequests / completeData.length : 0;
      const peakUsage = Math.max(...completeData.map(d => d.totalRequests));
      const peakDate = completeData.find(d => d.totalRequests === peakUsage)?.date || null;

      const response = {
        success: true,
        data: {
          trends: completeData,
          summary: {
            totalRequests,
            avgRequestsPerPeriod: Math.round(avgRequestsPerPeriod * 100) / 100,
            peakUsage,
            peakDate,
            periodType: windowType,
            daysAnalyzed: days,
          },
        },
      };

      return NextResponse.json(response);
    } catch (error) {
      logger.error('Error fetching system-wide API key usage trends:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to retrieve usage trends'
      }, { status: 500 });
    }
  });
}
