import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { macTrackingService } from '@/lib/mac-tracking-service';
import { prisma } from '@/lib/prisma';

// GET /api/admin/mac-tracking/service - Get service status
export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    // Check if MAC tracking is enabled
    const settings = await prisma.globalSettings.findFirst();
    if (!settings?.enableMacTracking) {
      return NextResponse.json({
        success: false,
        message: 'MAC Address Tracking feature is disabled'
      }, { status: 403 });
    }

    try {
      const status = macTrackingService.getStatus();
      const settings = await prisma.globalSettings.findFirst();

      // Get basic statistics
      const stats = await prisma.macAddress.aggregate({
        _count: { id: true },
        where: { isActive: true }
      });

      const totalMacs = await prisma.macAddress.count();

      // Get privacy MAC statistics
      const privacyMacStats = await prisma.macAddress.aggregate({
        _count: { id: true },
        where: {
          isActive: true,
          isPrivacyMac: true
        }
      });

      const totalPrivacyMacs = await prisma.macAddress.count({
        where: { isPrivacyMac: true }
      });

      // Get DHCP reservation counts
      const dhcpReservedMacs = await prisma.macAddress.count({
        where: {
          ipAssociations: {
            some: {
              isActive: true,
              isDhcpReserved: true
            }
          }
        }
      });

      // Get DHCP conflict counts
      const dhcpConflictMacs = await prisma.macAddress.count({
        where: {
          ipAssociations: {
            some: {
              isActive: true,
              hasDhcpConflict: true
            }
          }
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          ...status,
          settings: {
            enabled: settings?.enableMacTracking || false,
            interval: settings?.macTrackingInterval || 5,
            inactiveTimeout: settings?.macInactiveTimeout || 1440
          },
          stats: {
            totalMacs,
            activeMacs: stats._count.id,
            privacyMacs: privacyMacStats._count.id,
            totalPrivacyMacs,
            privacyMacPercentage: totalMacs > 0 ? Math.round((totalPrivacyMacs / totalMacs) * 100) : 0,
            dhcpReservedMacs,
            dhcpConflictMacs
          }
        }
      });

    } catch (error) {
      logger.error('Error getting MAC tracking service status:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to get service status'
      }, { status: 500 });
    }
  });
}

// POST /api/admin/mac-tracking/service - Control service (SUPER_ADMIN only)
export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized for service management'
      }, { status: 401 });
    }

    // Check if MAC tracking is enabled (except for stop action)
    const body = await request.json();
    const { action } = body;

    if (action !== 'stop') {
      const settings = await prisma.globalSettings.findFirst();
      if (!settings?.enableMacTracking) {
        return NextResponse.json({
          success: false,
          message: 'MAC Address Tracking feature is disabled'
        }, { status: 403 });
      }
    }

    try {
      const { intervalMinutes, retentionDays } = body;

      logger.info(`Admin ${auth.user.email} requested MAC tracking action: ${action}`);

      switch (action) {
        case 'start':
          // Get interval from global settings if not provided
          const settings = await prisma.globalSettings.findFirst();
          const interval = intervalMinutes || settings?.macTrackingInterval || 5;
          macTrackingService.start(interval);
          return NextResponse.json({
            success: true,
            message: `MAC tracking service started with ${interval} minute interval`
          });

        case 'stop':
          macTrackingService.stop();
          return NextResponse.json({
            success: true,
            message: 'MAC tracking service stopped'
          });

        case 'run':
          const result = await macTrackingService.runArpScan();
          return NextResponse.json({
            success: true,
            message: 'Manual ARP scan completed',
            data: result
          });

        case 'restart':
          // Stop and restart with current settings
          macTrackingService.stop();
          const restartSettings = await prisma.globalSettings.findFirst();
          const restartInterval = restartSettings?.macTrackingInterval || 5;
          macTrackingService.start(restartInterval);
          return NextResponse.json({
            success: true,
            message: `MAC tracking service restarted with ${restartInterval} minute interval`
          });

        case 'cleanup':
          const retention = retentionDays || 90;
          const cleanedCount = await macTrackingService.cleanupOldData(retention);
          return NextResponse.json({
            success: true,
            message: `Cleaned up ${cleanedCount} old MAC associations`,
            data: { cleanedCount }
          });

        default:
          return NextResponse.json({
            success: false,
            message: 'Invalid action. Supported actions: start, stop, restart, run, cleanup'
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
