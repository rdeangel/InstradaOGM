import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { macTrackingService } from '@/lib/mac-tracking-service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// POST /api/admin/mac-tracking/cleanup - Manual cleanup of old MAC tracking data
export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
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
      const body = await request.json();
      const retentionDays = body.retentionDays || settings.macDataRetentionDays || 90;

      // Validate retention days (0 means purge all records)
      if (retentionDays < 0 || retentionDays > 365) {
        return NextResponse.json({
          success: false,
          message: 'Retention days must be between 0 and 365'
        }, { status: 400 });
      }

      const cleanedCount = await macTrackingService.cleanupOldData(retentionDays);

      return NextResponse.json({
        success: true,
        message: `Successfully cleaned up ${cleanedCount} old MAC tracking records`,
        data: {
          cleanedCount,
          retentionDays
        }
      });

    } catch (error) {
      logger.error('Error during MAC tracking cleanup:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to cleanup MAC tracking data'
      }, { status: 500 });
    }
  });
}

// GET /api/admin/mac-tracking/cleanup - Get cleanup statistics
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
      const retentionDays = settings.macDataRetentionDays || 90;

      let whereClause: { isActive: boolean; lastSeen?: { lt: Date } };
      let cutoffDate: Date | null = null;

      if (retentionDays === 0) {
        // Count all inactive records
        whereClause = {
          isActive: false
        };
      } else {
        // Count records older than retention period
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        whereClause = {
          lastSeen: { lt: cutoffDate },
          isActive: false
        };
      }

      // Count records that would be cleaned up
      const [oldAssociations, oldMacs] = await Promise.all([
        prisma.macIpAssociation.count({
          where: whereClause
        }),
        prisma.macAddress.count({
          where: {
            ...whereClause,
            ipAssociations: {
              none: {}
            }
          }
        })
      ]);

      const totalCleanupCandidates = oldAssociations + oldMacs;

      // Get total counts for context
      const [totalMacs, totalAssociations] = await Promise.all([
        prisma.macAddress.count(),
        prisma.macIpAssociation.count()
      ]);

      return NextResponse.json({
        success: true,
        data: {
          retentionDays,
          cutoffDate: cutoffDate ? cutoffDate.toISOString() : null,
          cleanupCandidates: {
            oldAssociations,
            oldMacs,
            total: totalCleanupCandidates
          },
          currentTotals: {
            totalMacs,
            totalAssociations
          },
          percentageToCleanup: totalMacs > 0 ? (totalCleanupCandidates / totalMacs) * 100 : 0
        }
      });

    } catch (error) {
      logger.error('Error getting cleanup statistics:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to get cleanup statistics'
      }, { status: 500 });
    }
  });
}
