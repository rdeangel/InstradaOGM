import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { getHostAliasesForIps } from '@/lib/opnsense-api';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';

// GET /api/admin/mac-tracking/search - Advanced search functionality
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
      const mac = searchParams.get('mac');
      const ip = searchParams.get('ip');
      const hostname = searchParams.get('hostname');
      const vendor = searchParams.get('vendor');
      const hostAlias = searchParams.get('hostAlias');
      const q = searchParams.get('q'); // General search query
      const limit = parseInt(searchParams.get('limit') || '50');

      // Build search conditions
      const conditions: Prisma.MacAddressWhereInput[] = [];

      if (mac) {
        conditions.push({
          macAddress: { contains: mac.toLowerCase(), ...getCaseInsensitiveMode() }
        });
      }

      if (hostname) {
        conditions.push({
          deviceName: { contains: hostname, ...getCaseInsensitiveMode() }
        });
      }

      if (vendor) {
        conditions.push({
          vendor: { contains: vendor, ...getCaseInsensitiveMode() }
        });
      }

      if (ip) {
        conditions.push({
          ipAssociations: {
            some: {
              ipAddress: { contains: ip, ...getCaseInsensitiveMode() }
            }
          }
        });
      }

      // Handle host alias search
      if (hostAlias) {
        try {
          const { getHostAliases } = await import('@/lib/opnsense-api');
          const allHostAliases = await getHostAliases();

          // Find host aliases that match the search term
          const matchingAliases = allHostAliases.filter(alias =>
            alias.type === 'host' &&
            alias.name.toLowerCase().includes(hostAlias.toLowerCase())
          );

          // Extract IP addresses from matching host aliases
          const hostAliasIps = matchingAliases.map(alias => alias.content.trim()).filter(Boolean);

          if (hostAliasIps.length > 0) {
            // Add each host alias IP as a separate condition
            hostAliasIps.forEach(ip => {
              conditions.push({
                ipAssociations: {
                  some: {
                    ipAddress: ip
                  }
                }
              });
            });
          }
        } catch (error) {
          logger.warn('Failed to search host aliases:', error);
        }
      }

      // Handle general search query (searches across all fields including host aliases)
      if (q) {
        // First, check if the search term might match a host alias
        let hostAliasIps: string[] = [];
        try {
          const { getHostAliases } = await import('@/lib/opnsense-api');
          const allHostAliases = await getHostAliases();

          // Find host aliases that match the search term
          const matchingAliases = allHostAliases.filter(alias =>
            alias.type === 'host' &&
            alias.name.toLowerCase().includes(q.toLowerCase())
          );

          // Extract IP addresses from matching host aliases
          hostAliasIps = matchingAliases.map(alias => alias.content.trim()).filter(Boolean);
        } catch (error) {
          logger.warn('Failed to search host aliases:', error);
        }

        // Build general search conditions
        const generalSearchConditions: Prisma.MacAddressWhereInput[] = [
          { macAddress: { contains: q, ...getCaseInsensitiveMode() } },
          { deviceName: { contains: q, ...getCaseInsensitiveMode() } },
          { vendor: { contains: q, ...getCaseInsensitiveMode() } },
          {
            ipAssociations: {
              some: {
                ipAddress: { contains: q, ...getCaseInsensitiveMode() }
              }
            }
          }
        ];

        // Add host alias IP search if we found matching aliases
        if (hostAliasIps.length > 0) {
          // Add each host alias IP as a separate OR condition
          hostAliasIps.forEach(ip => {
            generalSearchConditions.push({
              ipAssociations: {
                some: {
                  ipAddress: ip
                }
              }
            });
          });
        }

        conditions.push({
          OR: generalSearchConditions
        });
      }

      // If no search criteria provided, return empty results
      if (conditions.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            macAddresses: [],
            totalCount: 0
          }
        });
      }

      // Search MAC addresses
      const macAddresses = await prisma.macAddress.findMany({
        where: {
          AND: conditions
        },
        include: {
          ipAssociations: {
            where: { isActive: true },
            orderBy: { lastSeen: 'desc' },
            take: 1
          }
        },
        orderBy: { lastSeen: 'desc' },
        take: limit
      });

      // Get host aliases for current IPs
      const currentIps = macAddresses
        .map(mac => mac.ipAssociations[0]?.ipAddress)
        .filter(Boolean);

      const hostAliasMap = currentIps.length > 0
        ? await getHostAliasesForIps(currentIps)
        : new Map();

      // Format response
      const formattedMacs = macAddresses.map(mac => ({
        ...mac,
        currentIp: mac.ipAssociations[0]?.ipAddress || null,
        currentInterface: mac.ipAssociations[0]?.networkInterface || null,
        hostAlias: mac.ipAssociations[0]?.ipAddress
          ? hostAliasMap.get(mac.ipAssociations[0].ipAddress)?.aliases[0] || null
          : null
      }));

      return NextResponse.json({
        success: true,
        data: {
          macAddresses: formattedMacs,
          totalCount: formattedMacs.length
        }
      });

    } catch (error) {
      logger.error('Error searching MAC addresses:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to search MAC addresses'
      }, { status: 500 });
    }
  });
}
