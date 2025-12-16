import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getApiKeyUsageStats, getApiKeyUsageTrends } from '@/lib/api-key-usage-stats';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/account/api-keys/[id]/usage - Get usage statistics for a specific API key
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
    const includeTrends = url.searchParams.get('includeTrends') === 'true';
    const trendDays = parseInt(url.searchParams.get('trendDays') || '30');

    logger.debug(`Fetching usage stats for API key ${id} (${apiKey.name}) for user ${auth.user.id}`);

    // Get usage statistics
    const usageStats = await getApiKeyUsageStats(id);

    if (!usageStats) {
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to retrieve usage statistics' 
      }, { status: 500 });
    }

    // Optionally include usage trends
    let trends = null;
    if (includeTrends) {
      try {
        trends = await getApiKeyUsageTrends(id, Math.min(trendDays, 90)); // Limit to 90 days max
      } catch (error) {
        logger.warn(`Failed to fetch trends for API key ${id}:`, error);
        // Don't fail the entire request if trends fail
      }
    }

    const response = {
      success: true,
      data: {
        ...usageStats,
        ...(trends && { trends }),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error(`Error fetching usage statistics for API key ${id}:`, error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to retrieve usage statistics' 
    }, { status: 500 });
  }
  });
}
