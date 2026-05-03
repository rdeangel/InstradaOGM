import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getNetworkAliasChangeAnalytics } from '@/lib/audit-analytics';
import { logger } from '@/lib/logger';
import { Role } from '@/types/opnsense';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Admin access required'
      }, { status: 403 });
    }

    try {
      const url = new URL(request.url);
      const startDateParam = url.searchParams.get('startDate');
      const endDateParam = url.searchParams.get('endDate');
      const daysParam = url.searchParams.get('days');

      let startDate: Date;
      let endDate: Date;
      let days: number;

      if (startDateParam && endDateParam) {
        startDate = new Date(startDateParam);
        endDate = new Date(endDateParam);

        if (endDate.getHours() === 0 && endDate.getMinutes() === 0 &&
            endDate.getSeconds() === 0 && endDate.getMilliseconds() === 0) {
          endDate.setHours(23, 59, 59, 999);
        }

        days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

        logger.debug(`Admin ${auth.user.id} fetching network alias change analytics from ${startDate.toISOString()} to ${endDate.toISOString()}`);

        const analytics = await getNetworkAliasChangeAnalytics(startDate, endDate);

        const response = {
          success: true,
          data: analytics,
          meta: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            days,
          },
        };

        return NextResponse.json(response);
      } else if (daysParam) {
        days = parseInt(daysParam, 10);
        if (isNaN(days) || days < 1) {
          days = 30;
        }
      } else {
        days = 30;
      }

      // Legacy days-based query
      logger.debug(`Admin ${auth.user.id} fetching network alias change analytics for last ${days} days`);

      const analytics = await getNetworkAliasChangeAnalytics(days);

      const response = {
        success: true,
        data: analytics,
        meta: {
          days,
        },
      };

      return NextResponse.json(response);
    } catch (error) {
      logger.error('Error fetching network alias change analytics:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch network alias change analytics'
      }, { status: 500 });
    }
  });
}
