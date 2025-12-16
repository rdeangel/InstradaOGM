import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

// GET /api/admin/mac-tracking/analytics - Get MAC tracking analytics
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
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get basic counts
      const [
        totalMacs,
        activeMacs,
        privacyMacs,
        dhcpReservedMacs,
        dhcpConflictMacs,
        newMacsToday,
        newMacsThisWeek,
        newMacsThisMonth,
        fullyExcludedMacs,
        partiallyExcludedMacs
      ] = await Promise.all([
        // Total MACs
        prisma.macAddress.count(),

        // Active MACs
        prisma.macAddress.count({
          where: { isActive: true }
        }),

        // Privacy MACs
        prisma.macAddress.count({
          where: { isPrivacyMac: true }
        }),

        // DHCP Reserved MACs
        prisma.macAddress.count({
          where: {
            ipAssociations: {
              some: {
                isActive: true,
                isDhcpReserved: true
              }
            }
          }
        }),

        // DHCP Conflict MACs
        prisma.macAddress.count({
          where: {
            ipAssociations: {
              some: {
                isActive: true,
                hasDhcpConflict: true
              }
            }
          }
        }),

        // New MACs today
        prisma.macAddress.count({
          where: {
            firstSeen: { gte: todayStart }
          }
        }),

        // New MACs this week
        prisma.macAddress.count({
          where: {
            firstSeen: { gte: weekStart }
          }
        }),

        // New MACs this month
        prisma.macAddress.count({
          where: {
            firstSeen: { gte: monthStart }
          }
        }),

        // Fully Excluded MACs (enabled=true, mode='FULL')
        prisma.macAddress.count({
          where: {
            exclusion: {
              is: {
                enabled: true,
                exclusionMode: 'FULL'
              }
            }
          }
        }),

        // Partially Excluded MACs (enabled=true, mode='PARTIAL')
        prisma.macAddress.count({
          where: {
            exclusion: {
              is: {
                enabled: true,
                exclusionMode: 'PARTIAL'
              }
            }
          }
        })
      ]);

      // Get top interfaces
      const interfaceStats = await prisma.macIpAssociation.groupBy({
        by: ['networkInterface'],
        where: {
          isActive: true,
          networkInterface: { not: null }
        },
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 10
      });

      const topInterfaces = interfaceStats.map(stat => ({
        interface: stat.networkInterface || 'Unknown',
        count: stat._count.id,
        percentage: totalMacs > 0 ? (stat._count.id / totalMacs) * 100 : 0
      }));

      // Get top vendors
      const vendorStats = await prisma.macAddress.groupBy({
        by: ['vendor'],
        where: {
          vendor: { not: null }
        },
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 10
      });

      const topVendors = vendorStats.map(stat => ({
        vendor: stat.vendor || 'Unknown',
        count: stat._count.id,
        percentage: totalMacs > 0 ? (stat._count.id / totalMacs) * 100 : 0
      }));

      // Calculate percentages
      const inactiveMacs = totalMacs - activeMacs;
      const privacyMacPercentage = totalMacs > 0 ? (privacyMacs / totalMacs) * 100 : 0;
      const dhcpCoveragePercentage = totalMacs > 0 ? (dhcpReservedMacs / totalMacs) * 100 : 0;

      // Get activity trend for the specified number of days (default 7, max 365)
      const url = new URL(request.url);
      const daysParam = url.searchParams.get('days');
      const days = Math.min(Math.max(parseInt(daysParam || '7', 10), 1), 365);

      const activityTrend = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const [dayActive, dayTotal] = await Promise.all([
          // Active devices: count distinct MAC addresses that were active during this specific day
          // A device is active on a day if it has an activation period that overlaps with that day:
          // - activatedAt < dayEnd (activated before the day ended)
          // - AND (deactivatedAt is null OR deactivatedAt > dayStart) (still active or deactivated after day started)
          prisma.macIpActivationPeriod.groupBy({
            by: ['macAddressId'],
            where: {
              activatedAt: { lt: dayEnd },
              OR: [
                { deactivatedAt: null },
                { deactivatedAt: { gt: dayStart } }
              ]
            }
          }).then(results => results.length),
          // Total devices: all devices discovered up to and including this day (cumulative)
          prisma.macAddress.count({
            where: {
              firstSeen: { lte: dayEnd }
            }
          })
        ]);

        activityTrend.push({
          date: dayStart.toISOString().split('T')[0],
          active: dayActive,
          total: dayTotal
        });
      }

      const analyticsData = {
        totalMacs,
        activeMacs,
        inactiveMacs,
        privacyMacs,
        dhcpReservedMacs,
        dhcpConflictMacs,
        newMacsToday,
        newMacsThisWeek,
        newMacsThisMonth,
        fullyExcludedMacs,
        partiallyExcludedMacs,
        topInterfaces,
        topVendors,
        activityTrend,
        privacyMacPercentage,
        dhcpCoveragePercentage
      };

      return NextResponse.json({
        success: true,
        data: analyticsData
      });

    } catch (error) {
      logger.error('Error fetching MAC tracking analytics:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch analytics data'
      }, { status: 500 });
    }
  });
}
