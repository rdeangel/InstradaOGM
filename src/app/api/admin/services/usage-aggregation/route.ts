import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { usageAggregationService } from '@/lib/usage-aggregation-service';
import { getServicesStatus, initializeServices } from '@/lib/server/service-initializer';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

// GET /api/admin/services/usage-aggregation - Get usage aggregation service status
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
      const status = getServicesStatus();
      const stats = await usageAggregationService.getAggregationStats();

      return NextResponse.json({
        success: true,
        data: {
          status,
          stats,
        },
      });
    } catch (error) {
      logger.error('Error fetching usage aggregation status:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to retrieve service status'
      }, { status: 500 });
    }
  });
}

// POST /api/admin/services/usage-aggregation - Control usage aggregation service
export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Check if the user is authenticated and has admin privileges
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    try {
      const body = await request.json();
      const { action, intervalMinutes } = body;

      logger.info(`Admin ${auth.user.email} requested usage aggregation action: ${action}`);

      switch (action) {
        case 'start':
          const interval = intervalMinutes || 30;
          usageAggregationService.start(interval);
          return NextResponse.json({
            success: true,
            message: `Usage aggregation service started with ${interval} minute interval`,
          });

        case 'stop':
          usageAggregationService.stop();
          return NextResponse.json({
            success: true,
            message: 'Usage aggregation service stopped',
          });

        case 'run':
          const result = await usageAggregationService.runAggregation();
          return NextResponse.json({
            success: true,
            message: 'Manual aggregation completed',
            data: result,
          });

        case 'initialize':
          await initializeServices();
          return NextResponse.json({
            success: true,
            message: 'Background services initialized',
          });

        case 'cleanup':
          const retentionDays = body.retentionDays || 90;
          const cleanedCount = await usageAggregationService.cleanupOldEvents(retentionDays);
          return NextResponse.json({
            success: true,
            message: `Cleaned up ${cleanedCount} old usage events`,
            data: { cleanedCount },
          });

        default:
          return NextResponse.json({
            success: false,
            message: 'Invalid action. Supported actions: start, stop, run, initialize, cleanup',
          }, { status: 400 });
      }
    } catch (error) {
      logger.error('Error controlling usage aggregation service:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to control service'
      }, { status: 500 });
    }
  });
}
