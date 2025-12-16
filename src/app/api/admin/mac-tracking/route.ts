import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { getHostAliasesForIps } from '@/lib/opnsense-api';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';

/**
 * Calculate consolidated history count for a MAC address.
 *
 * This function groups consecutive periods with the same set of active IP configurations,
 * returning the number of distinct IP configuration changes. It derives this
 * from the `MacIpActivationPeriod` table, reconstructing the historical "snapshots"
 * of active IPs for a given MAC address.
 *
 * @param macAddressId - The MAC address ID to calculate consolidated count for
 * @returns The number of distinct IP configuration ranges (IP change events)
 */
async function getConsolidatedHistoryCount(macAddressId: string): Promise<number> {
  // Fetch all IP activation periods for this MAC
  const activationPeriods = await prisma.macIpActivationPeriod.findMany({
    where: { macAddressId },
    orderBy: { activatedAt: 'asc' }, // Order by activation time to process chronologically
    select: {
      ipAddress: true,
      activatedAt: true,
      deactivatedAt: true
    }
  });

  if (activationPeriods.length === 0) return 0;

  // Collect all distinct event timestamps (activation and deactivation)
  const eventTimestamps = new Set<number>();
  for (const period of activationPeriods) {
    eventTimestamps.add(period.activatedAt.getTime());
    if (period.deactivatedAt) {
      eventTimestamps.add(period.deactivatedAt.getTime());
    }
  }

  // Sort timestamps chronologically
  const sortedTimestamps = Array.from(eventTimestamps).sort((a, b) => a - b);

  let rangeCount = 0;
  let lastIpSignature: string | null = null;

  // Iterate through each event timestamp to build snapshots of active IPs
  for (const timestampMs of sortedTimestamps) {
    const currentEventTime = new Date(timestampMs);

    const activeIpsAtCurrentTime = new Set<string>();

    for (const period of activationPeriods) {
      // An IP is active at currentEventTime if:
      // 1. It was activated at or before currentEventTime
      // 2. It has not been deactivated yet, OR it was deactivated strictly after currentEventTime
      if (period.activatedAt.getTime() <= currentEventTime.getTime() &&
        (!period.deactivatedAt || period.deactivatedAt.getTime() > currentEventTime.getTime())) {
        activeIpsAtCurrentTime.add(period.ipAddress);
      }
    }

    // Create a signature from the sorted active IP addresses
    const currentIpSignature = [...activeIpsAtCurrentTime].sort().join(',');

    // If the IP configuration changed, increment the range count
    if (currentIpSignature !== lastIpSignature) {
      rangeCount++;
      lastIpSignature = currentIpSignature;
    }
  }

  // Ensure minimum count is 1 if there's any active period, even if it's the only one
  // and its configuration never changes (e.g., a single MAC with one IP always active)
  if (rangeCount === 0 && activationPeriods.length > 0) {
    return 1;
  }

  return rangeCount;
}

// Helper to detect if search term looks like an IP search
const looksLikeIpSearch = (term: string): boolean => {
  return /\d/.test(term) && /\./.test(term);
};

// GET /api/admin/mac-tracking - List MAC addresses with pagination and filtering
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
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '50');
      const search = searchParams.get('search') || '';
      let sortBy = searchParams.get('sortBy') || 'lastSeen';
      const sortDirection = searchParams.get('sortDirection') || 'desc';

      // Handle 'order' sortBy by mapping it to 'lastSeen' for chronological ordering
      if (sortBy === 'order') {
        sortBy = 'lastSeen';
      }
      const activeOnly = searchParams.get('activeOnly') === 'true';

      // Special filters
      const dhcpOnly = searchParams.get('dhcpOnly') === 'true';
      const dhcpConflictOnly = searchParams.get('dhcpConflictOnly') === 'true';
      const privacyOnly = searchParams.get('privacyOnly') === 'true';
      const vrrpOnly = searchParams.get('vrrpOnly') === 'true';
      const hsrpOnly = searchParams.get('hsrpOnly') === 'true';
      const activeOnlyFilter = searchParams.get('activeOnly') === 'true';
      const inactiveOnly = searchParams.get('inactiveOnly') === 'true';
      const excludedOnly = searchParams.get('excludedOnly') === 'true';
      const notExcludedOnly = searchParams.get('notExcludedOnly') === 'true';
      const interfaceFilter = searchParams.get('interface') || '';
      const searchHistory = searchParams.get('searchHistory') === 'true';
      const opnsenseOnly = searchParams.get('opnsenseOnly') === 'true';
      const multiIpOnly = searchParams.get('multiIpOnly') === 'true';

      const skip = (page - 1) * limit;

      // Build where clause
      const where: Prisma.MacAddressWhereInput = {};

      // Apply basic filters
      if (activeOnly || activeOnlyFilter) {
        where.isActive = true;
      }
      if (inactiveOnly) {
        where.isActive = false;
      }
      if (privacyOnly) {
        where.isPrivacyMac = true;
      }

      // Apply exclusion filters
      if (excludedOnly) {
        where.exclusion = {
          enabled: true
        };
      }

      if (notExcludedOnly) {
        where.OR = [
          { exclusion: null },
          { exclusion: { enabled: false } }
        ];
      }

      // Build ipAssociations filters - combine them properly instead of overwriting
      const ipAssociationFilters: Prisma.MacIpAssociationWhereInput[] = [];

      if (dhcpOnly) {
        ipAssociationFilters.push({
          isActive: true,
          isDhcpReserved: true
        });
      }

      if (dhcpConflictOnly) {
        ipAssociationFilters.push({
          isActive: true,
          hasDhcpConflict: true
        });
      }

      if (interfaceFilter) {
        ipAssociationFilters.push({
          isActive: true,
          networkInterface: { contains: interfaceFilter, ...getCaseInsensitiveMode() }
        });
      }

      // Apply ipAssociations filters if any exist
      if (ipAssociationFilters.length > 0) {
        if (ipAssociationFilters.length === 1) {
          where.ipAssociations = { some: ipAssociationFilters[0] };
        } else {
          // Multiple filters - need to combine them with AND logic
          where.ipAssociations = {
            some: {
              AND: ipAssociationFilters
            }
          };
        }
      }

      // Apply VRRP/HSRP filters after fetching the data (client-side filtering)
      // since these are computed properties based on MAC address patterns

      // Apply text search (including host alias search)
      if (search) {
        // First, check if the search term might match a host alias
        let hostAliasIps: string[] = [];
        try {
          const { getHostAliases } = await import('@/lib/opnsense-api');
          const allHostAliases = await getHostAliases();

          // Find host aliases that match the search term
          const matchingAliases = allHostAliases.filter(alias =>
            alias.type === 'host' &&
            alias.name.toLowerCase().includes(search.toLowerCase())
          );

          // Extract IP addresses from matching host aliases
          hostAliasIps = matchingAliases.map(alias => alias.content.trim()).filter(Boolean);
        } catch (error) {
          logger.warn('Failed to search host aliases:', error);
          // Continue with regular search if host alias search fails
        }

        // Build search conditions
        const searchConditions: Prisma.MacAddressWhereInput[] = [
          { macAddress: { contains: search, ...getCaseInsensitiveMode() } },
          { deviceName: { contains: search, ...getCaseInsensitiveMode() } },
          { vendor: { contains: search, ...getCaseInsensitiveMode() } }
        ];

        // Special handling for IP searches to prevent partial matches (e.g. 1.1 matching 1.10)
        if (looksLikeIpSearch(search)) {
          const ipSearchCondition = {
            OR: [
              { ipAddress: { equals: search } },
              { ipAddress: { startsWith: search + '.' } },
              { ipAddress: { endsWith: '.' + search } },
              { ipAddress: { contains: '.' + search + '.' } }
            ]
          };

          searchConditions.push({
            ipAssociations: {
              some: {
                AND: [
                  { isActive: true },
                  ipSearchCondition
                ]
              }
            }
          });
        } else {
          searchConditions.push({
            ipAssociations: {
              some: {
                ipAddress: { contains: search, ...getCaseInsensitiveMode() },
                isActive: true
              }
            }
          });
        }

        // Only search history if enabled
        if (searchHistory) {
          if (looksLikeIpSearch(search)) {
            const ipSearchCondition = {
              OR: [
                { ipAddress: { equals: search } },
                { ipAddress: { startsWith: search + '.' } },
                { ipAddress: { endsWith: '.' + search } },
                { ipAddress: { contains: '.' + search + '.' } }
              ]
            };
            searchConditions.push({
              ipActivationPeriods: {
                some: {
                  OR: [
                    ipSearchCondition,
                    { hostname: { contains: search, ...getCaseInsensitiveMode() } },
                    { hostAlias: { contains: search, ...getCaseInsensitiveMode() } }
                  ]
                }
              }
            });
          } else {
            searchConditions.push({
              ipActivationPeriods: {
                some: {
                  OR: [
                    { ipAddress: { contains: search, ...getCaseInsensitiveMode() } },
                    { hostname: { contains: search, ...getCaseInsensitiveMode() } },
                    { hostAlias: { contains: search, ...getCaseInsensitiveMode() } }
                  ]
                }
              }
            });
          }
        }

        // Add host alias IP search if we found matching aliases
        if (hostAliasIps.length > 0) {
          // Add each host alias IP as a separate OR condition
          hostAliasIps.forEach(ip => {
            searchConditions.push({
              ipAssociations: {
                some: {
                  ipAddress: ip,
                  isActive: true
                }
              }
            });
          });
        }

        where.OR = searchConditions;
      }

      // Get total count
      const totalCount = await prisma.macAddress.count({ where });

      // Get MAC addresses with current IP associations and exclusion data
      const macAddresses = await prisma.macAddress.findMany({
        where,
        include: {
          ipAssociations: {
            // For active MACs: show all active IPs (for Partial Exclusion support)
            // For inactive MACs: show only the most recent IP (last known)
            where: inactiveOnly ? {} : { isActive: true },
            orderBy: { lastSeen: 'desc' },
            take: inactiveOnly ? 1 : undefined
            // Note: For active MACs, we fetch all active IPs (no take limit) to support Partial Exclusion
            // which can have multiple active IPs. For inactive MACs, we only take the most recent one.
          },
          exclusion: {
            select: {
              id: true,
              enabled: true,
              reason: true,
              exclusionMode: true,
              excludedBy: true,
              excludedAt: true,
              lastModifiedBy: true,
              lastModifiedAt: true
            }
          },
          _count: {
            select: {
              ipHistory: true // Count all IP history entries (raw history)
            }
          }
        },
        orderBy: sortBy === 'historyCount'
          ? [{ ipAssociations: { _count: sortDirection as 'asc' | 'desc' } }]
          : { [sortBy]: sortDirection },
        skip,
        take: limit
      });

      // Get host aliases for all current IPs (not just the first one)
      const allCurrentIps = macAddresses
        .flatMap(mac => mac.ipAssociations.map(ip => ip.ipAddress))
        .filter(Boolean);

      const hostAliasMap = allCurrentIps.length > 0
        ? await getHostAliasesForIps(allCurrentIps)
        : new Map();

      // Get OPNsense MAC addresses for detection
      const { getOpnsenseMacAddresses, get_arpTable } = await import('@/lib/opnsense-api');
      const opnsenseMacs = await getOpnsenseMacAddresses();

      // Fetch ARP table to get OPNsense vendor information for comparison
      const arpTable = await get_arpTable();
      const arpVendorMap = new Map<string, string>();
      arpTable.forEach(entry => {
        if (entry.mac && entry.manufacturer) {
          arpVendorMap.set(entry.mac.toLowerCase(), entry.manufacturer);
        }
      });

      // Import the virtual router MAC detection function
      const { isVirtualRouterMac } = await import('@/lib/mac-tracking-service');

      // Calculate consolidated history counts for all MACs in parallel
      const consolidatedHistoryCounts = await Promise.all(
        macAddresses.map(mac => getConsolidatedHistoryCount(mac.id))
      );

      // Format response
      const formattedMacs = macAddresses.map((mac, index) => {
        const isOpnsenseMac = opnsenseMacs.includes(mac.macAddress.toLowerCase());
        const virtualRouterMacInfo = isVirtualRouterMac(mac.macAddress);

        // Build array of all current active IPs with their details
        const currentIps = mac.ipAssociations.map(ip => ({
          ipAddress: ip.ipAddress,
          networkInterface: ip.networkInterface,
          hostAlias: hostAliasMap.get(ip.ipAddress)?.aliases[0] || undefined,
          isDhcpReserved: ip.isDhcpReserved,
          hasDhcpConflict: ip.hasDhcpConflict,
          isActive: ip.isActive // Include active/inactive status for each IP
        }));

        // Check if this MAC has multiple active IPs (e.g., keepalived, HA cluster)
        const hasMultipleIps = mac.ipAssociations.length > 1;

        // Determine vendor source by comparing with OPNsense ARP table
        const opnsenseVendor = arpVendorMap.get(mac.macAddress.toLowerCase());
        let vendorSource: 'OPNsense' | 'Local DB' | null = null;

        if (mac.vendor && mac.vendor !== 'Unknown Vendor') {
          // If we have a vendor and it matches OPNsense, source is OPNsense
          if (opnsenseVendor && mac.vendor === opnsenseVendor) {
            vendorSource = 'OPNsense';
          } else if (opnsenseVendor) {
            // OPNsense has different vendor - this shouldn't happen but prefer OPNsense
            vendorSource = 'OPNsense';
          } else {
            // No OPNsense vendor, must be from local DB
            vendorSource = 'Local DB';
          }
        }

        return {
          ...mac,
          currentIp: mac.ipAssociations[0]?.ipAddress || null,
          currentInterface: mac.ipAssociations[0]?.networkInterface || null,
          isDhcpReserved: mac.ipAssociations[0]?.isDhcpReserved || false,
          hasDhcpConflict: mac.ipAssociations[0]?.hasDhcpConflict || false,
          isOpnsenseMac: isOpnsenseMac, // Flag to identify OPNsense MAC addresses
          isVrrpMac: virtualRouterMacInfo.protocolType === 'VRRP',
          isHsrpMac: virtualRouterMacInfo.protocolType === 'HSRP',
          hasMultipleIps: hasMultipleIps, // Flag for MACs with multiple active IPs (keepalived, HA clusters, etc.)
          hostAlias: mac.ipAssociations[0]?.ipAddress
            ? hostAliasMap.get(mac.ipAssociations[0].ipAddress)?.aliases[0] || null
            : null,
          // eslint-disable-next-line security/detect-object-injection
          historyCount: typeof consolidatedHistoryCounts[index] === 'number' ? consolidatedHistoryCounts[index] : 0, // Number of IP configuration changes (consolidated ranges)
          rawHistoryCount: mac._count.ipHistory, // Total number of scan events (for reference)
          currentIpsCount: mac.ipAssociations.length, // Number of current active IP associations
          currentIps: currentIps, // All current active IP associations with details
          vendorSource: vendorSource // Source of vendor information: 'OPNsense', 'Local DB', or null
        };
      });

      // Apply VRRP/HSRP filters (client-side filtering since these are computed properties)
      let filteredMacs = formattedMacs;
      if (vrrpOnly) {
        filteredMacs = filteredMacs.filter(mac => mac.isVrrpMac);
      }
      if (hsrpOnly) {
        filteredMacs = filteredMacs.filter(mac => mac.isHsrpMac);
      }
      if (opnsenseOnly) {
        filteredMacs = filteredMacs.filter(mac => mac.isOpnsenseMac);
      }
      if (multiIpOnly) {
        filteredMacs = filteredMacs.filter(mac => mac.hasMultipleIps);
      }

      // Recalculate pagination for filtered results
      const hasComputedFilters = vrrpOnly || hsrpOnly || opnsenseOnly || multiIpOnly;
      const filteredTotalCount = hasComputedFilters ? filteredMacs.length : totalCount;
      const filteredTotalPages = Math.ceil(filteredTotalCount / limit);

      // Apply pagination to filtered results
      const paginatedMacs = hasComputedFilters
        ? filteredMacs.slice(skip, skip + limit)
        : filteredMacs;

      return NextResponse.json({
        success: true,
        data: {
          macAddresses: paginatedMacs,
          totalCount: filteredTotalCount,
          currentPage: page,
          totalPages: filteredTotalPages
        }
      });

    } catch (error) {
      logger.error('Error fetching MAC addresses:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch MAC addresses'
      }, { status: 500 });
    }
  });
}
