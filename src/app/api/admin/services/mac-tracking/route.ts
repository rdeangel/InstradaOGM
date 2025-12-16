import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { macTrackingService } from '@/lib/mac-tracking-service';
import { getServicesStatus, initializeServices } from '@/lib/server/service-initializer';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

// GET /api/admin/services/mac-tracking - Get MAC tracking service status
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

            return NextResponse.json({
                success: true,
                data: {
                    status,
                },
            });
        } catch (error) {
            logger.error('Error fetching MAC tracking status:', error);
            return NextResponse.json({
                success: false,
                message: 'Failed to retrieve service status'
            }, { status: 500 });
        }
    });
}

// POST /api/admin/services/mac-tracking - Control MAC tracking service
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

            logger.info(`Admin ${auth.user.email} requested MAC tracking action: ${action}`);

            switch (action) {
                case 'start':
                    const interval = intervalMinutes || 5;
                    macTrackingService.start(interval);
                    return NextResponse.json({
                        success: true,
                        message: `MAC tracking service started with ${interval} minute interval`,
                    });

                case 'stop':
                    macTrackingService.stop();
                    return NextResponse.json({
                        success: true,
                        message: 'MAC tracking service stopped',
                    });

                case 'run':
                    const result = await macTrackingService.runArpScan();
                    return NextResponse.json({
                        success: true,
                        message: 'Manual ARP scan completed',
                        data: result,
                    });

                case 'initialize':
                    await initializeServices();
                    return NextResponse.json({
                        success: true,
                        message: 'Background services initialized',
                    });

                default:
                    return NextResponse.json({
                        success: false,
                        message: 'Invalid action. Supported actions: start, stop, run, initialize',
                    }, { status: 400 });
            }
        } catch (error) {
            logger.error('Error controlling MAC tracking service:', error);
            return NextResponse.json({
                success: false,
                message: 'Failed to control service'
            }, { status: 500 });
        }
    });
}
