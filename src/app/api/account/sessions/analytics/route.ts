import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getUserSessionAnalytics } from '@/lib/session-usage-stats';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Must be authenticated
    if (!auth.user) {
      return NextResponse.json({
        success: false,
        message: 'Authentication required'
      }, { status: 401 });
    }

  try {
    // Get URL parameters for additional options
    const url = new URL(request.url);
    const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);
    const includeEvents = url.searchParams.get('includeEvents') === 'true';

    logger.debug(`Fetching session analytics for user ${auth.user.id} for ${days} days`);

    // Get user session analytics
    const analytics = await getUserSessionAnalytics(auth.user.id, days);

    const response = {
      success: true,
      data: {
        period: {
          days,
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        },
        summary: analytics.summary,
        dailyStats: analytics.dailyStats,
        ...(includeEvents && { recentEvents: analytics.recentEvents }),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error(`Failed to get session analytics for user ${auth.user.id}:`, error);
    return NextResponse.json({ 
      success: false,
      message: 'Failed to retrieve session analytics'
    }, { status: 500 });
  }
  });
}
