import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { getHostAliasesForIps } from '@/lib/opnsense-api';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';

// GET /api/admin/mac-tracking/export - Export MAC data in CSV/JSON formats
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
      const { searchParams } = new URL(request.url);
      const format = searchParams.get('format') || 'csv';
      const search = searchParams.get('search') || '';
      const activeOnly = searchParams.get('activeOnly') === 'true';

      // Special filters
      const dhcpOnly = searchParams.get('dhcpOnly') === 'true';
      const dhcpConflictOnly = searchParams.get('dhcpConflictOnly') === 'true';
      const privacyOnly = searchParams.get('privacyOnly') === 'true';
      const activeOnlyFilter = searchParams.get('activeOnly') === 'true';
      const inactiveOnly = searchParams.get('inactiveOnly') === 'true';
      const interfaceFilter = searchParams.get('interface') || '';

      // Build where clause
      const where: Prisma.MacAddressWhereInput = {};
      if (activeOnly) {
        where.isActive = true;
      }
      if (activeOnlyFilter) {
        where.isActive = true;
      }
      if (inactiveOnly) {
        where.isActive = false;
      }
      if (privacyOnly) {
        where.isPrivacyMac = true;
      }
      if (dhcpOnly) {
        where.ipAssociations = {
          some: {
            isActive: true,
            isDhcpReserved: true
          }
        };
      }
      if (dhcpConflictOnly) {
        where.ipAssociations = {
          some: {
            isActive: true,
            isDhcpReserved: true,
            hasDhcpConflict: true
          }
        };
      }
      if (interfaceFilter) {
        where.ipAssociations = {
          some: {
            isActive: true,
            networkInterface: { contains: interfaceFilter, ...getCaseInsensitiveMode() }
          }
        };
      }
      if (search) {
        where.OR = [
          { macAddress: { contains: search, ...getCaseInsensitiveMode() } },
          { deviceName: { contains: search, ...getCaseInsensitiveMode() } },
          { vendor: { contains: search, ...getCaseInsensitiveMode() } },
          {
            ipAssociations: {
              some: {
                ipAddress: { contains: search, ...getCaseInsensitiveMode() },
                isActive: true
              }
            }
          }
        ];
      }

      // Get MAC addresses with current IP associations
      const macAddresses = await prisma.macAddress.findMany({
        where,
        include: {
          ipAssociations: {
            where: { isActive: true },
            orderBy: { lastSeen: 'desc' }
          },
          exclusion: {
            select: {
              enabled: true,
              exclusionMode: true,
              excludedBy: true,
              excludedAt: true,
              lastModifiedBy: true,
              lastModifiedAt: true
            }
          },
          _count: {
            select: {
              ipAssociations: true // Count all IP associations (history)
            }
          }
        },
        orderBy: { lastSeen: 'desc' }
      });

      // Get host aliases for all current IPs
      const allCurrentIps = macAddresses
        .flatMap(mac => mac.ipAssociations.map(ip => ip.ipAddress))
        .filter(Boolean);

      const hostAliasMap = allCurrentIps.length > 0
        ? await getHostAliasesForIps(allCurrentIps)
        : new Map();

      // Get OPNsense MAC addresses for detection
      const { getOpnsenseMacAddresses } = await import('@/lib/opnsense-api');
      const opnsenseMacs = await getOpnsenseMacAddresses();

      // Import the virtual router MAC detection function
      const { isVirtualRouterMac } = await import('@/lib/mac-tracking-service');

      // Format data for export - matching table view structure
      const exportData = macAddresses.map(mac => {
        const isOpnsenseMac = opnsenseMacs.includes(mac.macAddress.toLowerCase());
        const virtualRouterMacInfo = isVirtualRouterMac(mac.macAddress);

        // Build array of all current active IPs with their details
        const currentIps = mac.ipAssociations.map(ip => ({
          ipAddress: ip.ipAddress,
          networkInterface: ip.networkInterface,
          hostAlias: hostAliasMap.get(ip.ipAddress)?.aliases[0] || undefined,
          isDhcpReserved: ip.isDhcpReserved,
          hasDhcpConflict: ip.hasDhcpConflict,
          isActive: ip.isActive
        }));

        return {
          id: mac.id,
          macAddress: mac.macAddress,
          deviceName: mac.deviceName || '',
          vendor: mac.vendor || '',
          isActive: mac.isActive,
          isPrivacyMac: mac.isPrivacyMac,
          isOpnsenseMac: isOpnsenseMac,
          isVrrpMac: virtualRouterMacInfo.protocolType === 'VRRP',
          isHsrpMac: virtualRouterMacInfo.protocolType === 'HSRP',
          firstSeen: mac.firstSeen.toISOString(),
          lastSeen: mac.lastSeen.toISOString(),
          createdAt: mac.createdAt.toISOString(),
          updatedAt: mac.updatedAt.toISOString(),
          currentIp: mac.ipAssociations[0]?.ipAddress || null,
          currentInterface: mac.ipAssociations[0]?.networkInterface || null,
          isDhcpReserved: mac.ipAssociations[0]?.isDhcpReserved || false,
          hasDhcpConflict: mac.ipAssociations[0]?.hasDhcpConflict || false,
          hostAlias: mac.ipAssociations[0]?.ipAddress
            ? hostAliasMap.get(mac.ipAssociations[0].ipAddress)?.aliases[0] || null
            : null,
          historyCount: mac._count.ipAssociations,
          currentIpsCount: mac.ipAssociations.length,
          currentIps: currentIps,
          exclusion: mac.exclusion
        };
      });

      if (format === 'json') {
        return NextResponse.json(exportData, {
          headers: {
            'Content-Disposition': 'attachment; filename="mac-addresses.json"',
            'Content-Type': 'application/json'
          }
        });
      } else {
        // Generate CSV with comprehensive fields matching table view
        const headers = [
          'MAC Address',
          'Device Name',
          'Vendor',
          'Status',
          'Privacy MAC',
          'OPNsense MAC',
          'VRRP MAC',
          'HSRP MAC',
          'Current IP',
          'Interface',
          'Host Alias',
          'DHCP Reserved',
          'DHCP Conflict',
          'First Seen',
          'Last Seen',
          'History Count',
          'Current IPs Count',
          'Excluded'
        ];

        const csvRows = [
          headers.join(','),
          ...exportData.map(row => [
            `"${row.macAddress}"`,
            `"${row.deviceName}"`,
            `"${row.vendor}"`,
            `"${row.isActive ? 'Online' : 'Offline'}"`,
            `"${row.isPrivacyMac ? 'Yes' : 'No'}"`,
            `"${row.isOpnsenseMac ? 'Yes' : 'No'}"`,
            `"${row.isVrrpMac ? 'Yes' : 'No'}"`,
            `"${row.isHsrpMac ? 'Yes' : 'No'}"`,
            `"${row.currentIp || ''}"`,
            `"${row.currentInterface || ''}"`,
            `"${row.hostAlias || ''}"`,
            `"${row.isDhcpReserved ? 'Yes' : 'No'}"`,
            `"${row.hasDhcpConflict ? 'Yes' : 'No'}"`,
            `"${row.firstSeen}"`,
            `"${row.lastSeen}"`,
            `"${row.historyCount}"`,
            `"${row.currentIpsCount}"`,
            `"${row.exclusion?.enabled ? (row.exclusion.exclusionMode || 'Unknown') : 'No'}"`
          ].join(','))
        ];

        const csvContent = csvRows.join('\n');

        return new NextResponse(csvContent, {
          headers: {
            'Content-Disposition': 'attachment; filename="mac-addresses.csv"',
            'Content-Type': 'text/csv'
          }
        });
      }

    } catch (error) {
      logger.error('Error exporting MAC addresses:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to export MAC addresses'
      }, { status: 500 });
    }
  });
}
