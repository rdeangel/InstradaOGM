import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getHostAliasChangeAnalytics } from '@/lib/audit-analytics';
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

      logger.debug(`Admin ${auth.user.id} fetching host alias change analytics from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Get host alias change analytics with date range
      const analytics = await getHostAliasChangeAnalytics(startDate, endDate);

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
    } else {
      // Use legacy days parameter
      days = Math.min(parseInt(daysParam || '30'), 90);
      endDate = new Date();
      startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      logger.debug(`Admin ${auth.user.id} fetching host alias change analytics for ${days} days`);

      // Get host alias change analytics with days
      const analytics = await getHostAliasChangeAnalytics(days);

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
    }
  } catch (error) {
    logger.error(`Failed to get host alias change analytics:`, error);
    return NextResponse.json({ 
      success: false,
      message: 'Failed to retrieve host alias change analytics'
    }, { status: 500 });
  }
  });
}
