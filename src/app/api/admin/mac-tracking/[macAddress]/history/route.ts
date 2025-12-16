import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import type { MacIpHistoryEntry } from '@prisma/client';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';

interface IPConfigurationSnapshot {
  id: string; // Synthetic ID for UI and consistency
  macAddressId: string;
  ipAddresses: string[]; // Sorted list of IPs active in this period
  networkInterface?: string | null; // Network interface (if all IPs share the same interface)
  ipToInterfaceMap?: Record<string, string | null>; // Map of IP address to network interface
  ipToHostnameMap?: Record<string, string | null>; // Map of IP address to hostname
  ipToHostAliasMap?: Record<string, string | null>; // Map of IP address to host alias
  firstSeen: Date;
  lastSeen: Date;
  rawPeriodsCount: number; // Number of underlying activation periods contributing to this snapshot
}

interface FinalHistoryEntry extends IPConfigurationSnapshot {
  isOpnsenseMac: boolean;
  hostAliases: Array<{ ipAddress: string; alias: string }>;
  hostnames: Array<{ ipAddress: string; hostname: string }>;
}

interface CurrentIpData {
  id?: string;
  macAddressId: string;
  ipAddress: string;
  networkInterface?: string | null;
  firstSeen: Date;
  lastSeen: Date;
  isOpnsenseMac: boolean;
  hostAlias: string | null;
}

/**
 * Consolidate consecutive IP configuration snapshots into ranges.
 *
 * This function analyzes MacIpActivationPeriod records to reconstruct
 * historical "IP configuration snapshots" – periods where the set of active
 * IP addresses for a MAC remained constant.
 *
 * @param macAddressId - The MAC address ID
 * @param activationPeriods - All activation periods for the MAC address, sorted by activatedAt
 * @returns Consolidated array of IPConfigurationSnapshot
 */
function consolidateIPConfigurationSnapshots(
  macAddressId: string,
  activationPeriods: Array<{
    ipAddress: string;
    networkInterface?: string | null;
    hostname?: string | null;
    hostAlias?: string | null;
    activatedAt: Date;
    deactivatedAt: Date | null
  }>
): IPConfigurationSnapshot[] {
  if (activationPeriods.length === 0) return [];

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

  const snapshots: IPConfigurationSnapshot[] = [];
  let currentIpSignature: string | null = null;
  let currentSnapshot: IPConfigurationSnapshot | null = null;

  // Iterate through each event timestamp to build snapshots of active IPs
  for (let i = 0; i < sortedTimestamps.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    const currentEventTime = new Date(sortedTimestamps[i]);
    // The end of the current snapshot is the start of the next distinct configuration period.
    // If it's the last event, the snapshot extends indefinitely (or until now).
    const nextEventTime = i + 1 < sortedTimestamps.length ? new Date(sortedTimestamps[i + 1]) : null;

    const activeIpsAtCurrentTime = new Set<string>();
    const contributingPeriods = [];

    for (const period of activationPeriods) {
      // An IP is active at currentEventTime if:
      // 1. It was activated at or before currentEventTime
      // 2. It has not been deactivated yet, OR it was deactivated strictly after currentEventTime
      if (period.activatedAt.getTime() <= currentEventTime.getTime() &&
        (!period.deactivatedAt || period.deactivatedAt.getTime() > currentEventTime.getTime())) {
        activeIpsAtCurrentTime.add(period.ipAddress);
        contributingPeriods.push(period);
      }
    }

    const newIpSignature = [...activeIpsAtCurrentTime].sort().join(',');

    if (newIpSignature !== currentIpSignature) {
      // IP configuration changed, or this is the first snapshot
      if (currentSnapshot) {
        // Close the previous snapshot with its actual lastSeen time
        // The lastSeen should be the timestamp right before the new configuration started
        currentSnapshot.lastSeen = currentEventTime;
        snapshots.push(currentSnapshot);
      }

      // Determine network interface for this snapshot
      // If all contributing periods have the same interface, use it; otherwise null
      const interfaces = new Set(contributingPeriods.map(p => p.networkInterface).filter(Boolean));
      const networkInterface = interfaces.size === 1 ? Array.from(interfaces)[0] : null;

      // Build IP-to-interface mapping for this snapshot
      const ipToInterfaceMap: Record<string, string | null> = {};
      for (const period of contributingPeriods) {
        ipToInterfaceMap[period.ipAddress] = period.networkInterface || null;
      }

      // Build IP-to-hostname and IP-to-hostAlias mapping for this snapshot
      const ipToHostnameMap: Record<string, string | null> = {};
      const ipToHostAliasMap: Record<string, string | null> = {};
      for (const period of contributingPeriods) {
        ipToHostnameMap[period.ipAddress] = period.hostname || null;
        ipToHostAliasMap[period.ipAddress] = period.hostAlias || null;
      }

      // Start a new snapshot
      currentSnapshot = {
        id: `${macAddressId}-${newIpSignature}-${currentEventTime.toISOString()}`, // Synthetic ID
        macAddressId: macAddressId,
        ipAddresses: [...activeIpsAtCurrentTime].sort(),
        networkInterface: networkInterface,
        ipToInterfaceMap: ipToInterfaceMap,
        ipToHostnameMap: ipToHostnameMap,
        ipToHostAliasMap: ipToHostAliasMap,
        firstSeen: currentEventTime,
        lastSeen: nextEventTime || new Date(), // If no next event, it's active until "now"
        rawPeriodsCount: contributingPeriods.length
      };
      currentIpSignature = newIpSignature;
    } else if (currentSnapshot) {
      // Same IP configuration, extend the lastSeen of the current snapshot
      currentSnapshot.lastSeen = nextEventTime || new Date(); // Extend to next event or "now"
    }
  }

  // Ensure the last snapshot is added if it's still ongoing
  if (currentSnapshot && !snapshots.includes(currentSnapshot)) {
    snapshots.push(currentSnapshot);
  }

  return snapshots;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ macAddress: string }> }
) {
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
      const { macAddress } = await params;
      const normalizedMac = macAddress.toLowerCase();

      // Parse query parameters
      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(500, Math.max(1, parseInt(url.searchParams.get('pageSize') || '25')));
      const includeIpHistory = url.searchParams.get('includeIpHistory') === 'true'; // If true, use MacIpActivationPeriod for detailed history
      const days = url.searchParams.get('days') ? parseInt(url.searchParams.get('days')!) : null;

      const skip = (page - 1) * pageSize;

      // Build date filter if days parameter is provided
      const dateFilter = days ? {
        // For MacIpActivationPeriod, filter by activatedAt
        activatedAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        }
      } : {};

      // Find MAC address record
      const macRecord = await prisma.macAddress.findUnique({
        where: { macAddress: normalizedMac }
      });

      if (!macRecord) {
        return NextResponse.json({
          success: false,
          message: 'MAC address not found'
        }, { status: 404 });
      }

      let consolidatedHistory: IPConfigurationSnapshot[] | MacIpHistoryEntry[] = [];
      let totalCountForPagination = 0;

      if (includeIpHistory) {
        // Use MacIpActivationPeriod to build consolidated snapshots
        const rawPeriods = await prisma.macIpActivationPeriod.findMany({
          where: {
            macAddressId: macRecord.id,
            // Only consider periods that were active within the date filter
            activatedAt: dateFilter.activatedAt
          },
          orderBy: { activatedAt: 'asc' } // Need to sort asc for consolidation logic
        });
        consolidatedHistory = consolidateIPConfigurationSnapshots(macRecord.id, rawPeriods);
        totalCountForPagination = consolidatedHistory.length;
      } else {
        // Default to MacIpHistoryEntry for aggregated history
        const historyEntries = await prisma.macIpHistoryEntry.findMany({
          where: {
            macAddressId: macRecord.id,
            lastSeen: dateFilter.activatedAt // Map activatedAt filter to lastSeen for MacIpHistoryEntry
          },
          orderBy: { lastSeen: 'desc' }
        });
        consolidatedHistory = historyEntries;
        totalCountForPagination = historyEntries.length;
      }

      // Apply pagination to consolidated results
      const history = consolidatedHistory.slice(skip, skip + pageSize);

      // Get exclusion data for this MAC address
      const exclusion = await prisma.macExclusion.findUnique({
        where: { macAddressId: macRecord.id },
        include: {
          macAddress: {
            select: {
              id: true,
              macAddress: true,
              deviceName: true,
              vendor: true
            }
          }
        }
      });

      // Determine partial exclusion mode
      const isExcludedAndEnabled = exclusion?.enabled === true;
      const isPartialExclusion = isExcludedAndEnabled && exclusion?.exclusionMode === 'PARTIAL';

      // Get OPNsense MAC addresses for detection
      const { getOpnsenseMacAddresses, getHostAliasesByIp } = await import('@/lib/opnsense-api');
      const opnsenseMacs = await getOpnsenseMacAddresses();

      // Get current IPs from MacIpAssociation for 'currentIps' field
      const currentAssociations = await prisma.macIpAssociation.findMany({
        where: {
          macAddressId: macRecord.id,
          isActive: true // Only currently active IPs
        },
        orderBy: { lastSeen: 'desc' }
      });

      // Fetch host aliases for current IPs
      const currentIpAddressesForAliases = currentAssociations.map(ip => ip.ipAddress);
      const currentHostAliasMap = new Map<string, string>();
      for (const ip of currentIpAddressesForAliases) {
        try {
          const aliases = await getHostAliasesByIp(ip);
          if (aliases.length > 0) {
            currentHostAliasMap.set(ip, aliases[0].name);
          }
        } catch (error) {
          logger.debug(`Failed to fetch host alias for IP ${ip}:`, error);
        }
      }

      const currentIps: CurrentIpData[] = currentAssociations.map(ip => ({
        id: ip.id,
        macAddressId: ip.macAddressId,
        ipAddress: ip.ipAddress,
        networkInterface: ip.networkInterface,
        firstSeen: ip.firstSeen,
        lastSeen: ip.lastSeen,
        isOpnsenseMac: opnsenseMacs.includes(macRecord.macAddress.toLowerCase()),
        hostAlias: currentHostAliasMap.get(ip.ipAddress) || null
      }));

      // If MAC is excluded and enabled (FULL), return empty history; if PARTIAL, return current IPs
      let finalHistory: FinalHistoryEntry[] = [];
      let finalTotalCount = 0;
      let finalTotalPages = 0;

      if (isExcludedAndEnabled && !isPartialExclusion) {
        logger.info(`Returning empty history for excluded MAC address (FULL): ${macRecord.macAddress}`);
        finalHistory = [];
        finalTotalCount = 0;
        finalTotalPages = 0;
      } else if (isPartialExclusion) {
        logger.info(`Returning current IPs only for partially excluded MAC address: ${macRecord.macAddress}`);
        finalHistory = [];
        finalTotalCount = 0;
        finalTotalPages = 0;
      } else {
        // For non-excluded MACs, provide both history and current IPs
        // Fetch host aliases for all unique IPs in the consolidated history
        const uniqueIpsInHistory = [...new Set(history.flatMap(h => 'ipAddresses' in h ? h.ipAddresses : [h.ipAddress]))];
        const hostAliasMap = new Map<string, string>();

        for (const ip of uniqueIpsInHistory) {
          try {
            const aliases = await getHostAliasesByIp(ip);
            if (aliases.length > 0) {
              hostAliasMap.set(ip, aliases[0].name);
            }
          } catch (error) {
            logger.debug(`Failed to fetch host alias for IP ${ip}:`, error);
          }
        }

        finalHistory = history.map(entry => {
          if ('ipAddresses' in entry) { // This is an IPConfigurationSnapshot
            return {
              ...entry,
              isOpnsenseMac: opnsenseMacs.includes(macRecord.macAddress.toLowerCase()),
              hostAliases: entry.ipAddresses.map((ip: string) => {
                // Only use stored host alias from the snapshot time
                // eslint-disable-next-line security/detect-object-injection
                const storedAlias = entry.ipToHostAliasMap?.[ip];
                return { ipAddress: ip, alias: storedAlias || null };
              }).filter((a: { ipAddress: string; alias: string | null; }) => a.alias !== null) as Array<{ ipAddress: string; alias: string }>,
              hostnames: entry.ipAddresses.map((ip: string) => {
                // eslint-disable-next-line security/detect-object-injection
                const storedHostname = entry.ipToHostnameMap?.[ip];
                return { ipAddress: ip, hostname: storedHostname || null };
              }).filter((h: { ipAddress: string; hostname: string | null; }) => h.hostname !== null) as Array<{ ipAddress: string; hostname: string }>
            };
          } else { // This is a MacIpHistoryEntry
            return {
              id: entry.id,
              macAddressId: entry.macAddressId,
              ipAddresses: [entry.ipAddress], // Wrap single IP in array for consistency
              networkInterface: entry.networkInterface || null,
              firstSeen: entry.firstSeen,
              lastSeen: entry.lastSeen,
              rawPeriodsCount: entry.detectionCount || 1,
              isOpnsenseMac: opnsenseMacs.includes(macRecord.macAddress.toLowerCase()),
              hostAliases: [{ ipAddress: entry.ipAddress, alias: hostAliasMap.get(entry.ipAddress) || null }].filter((a: { ipAddress: string; alias: string | null; }) => a.alias !== null) as Array<{ ipAddress: string; alias: string }>,
              hostnames: []
            };
          }
        }) as FinalHistoryEntry[];
        finalTotalCount = totalCountForPagination;
        finalTotalPages = Math.ceil(totalCountForPagination / pageSize);
      }

      // Also add OPNsense flag and multi-IP flag to the main MAC address record
      const hasMultipleIps = currentIps && currentIps.length > 1;
      const formattedMacAddress = {
        ...macRecord,
        isOpnsenseMac: opnsenseMacs.includes(macRecord.macAddress.toLowerCase()),
        hasMultipleIps
      };

      logger.debug('MAC History API - Including exclusion data:', {
        macAddress: macRecord.macAddress,
        hasExclusion: !!exclusion,
        exclusionEnabled: exclusion?.enabled,
        exclusionReason: exclusion?.reason,
        isExcludedAndEnabled,
        historyEntriesReturned: finalHistory.length,
        currentIpsCount: currentIps?.length ?? 0,
        currentIps: currentIps
      });

      return NextResponse.json({
        success: true,
        data: {
          macAddress: formattedMacAddress,
          history: finalHistory,
          exclusion, // Include exclusion data in response
          isExcludedAndEnabled, // Explicit flag for UI convenience
          currentIps: currentIps,
          pagination: {
            currentPage: (isExcludedAndEnabled ? 1 : page),
            pageSize,
            totalCount: finalTotalCount,
            totalPages: finalTotalPages
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching MAC history:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch MAC history'
      }, { status: 500 });
    }
  });
}