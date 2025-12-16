import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { setServiceState, getServiceState, clearServiceState, updateServiceActivity } from '@/lib/server/service-state-manager';
import { get_arpTable, getOpnsenseMacAddresses, getHostAliasesForIps } from '@/lib/opnsense-api';
import { lookupMacVendor } from '@/lib/server/network-utils';
import type { MacTrackingJobResult } from '@/types/mac-tracking';
import type { MacExclusion, ExclusionMode } from '@/types/mac-exclusion';

// Cache for OPNsense MAC addresses to avoid repeated API calls
let opnsenseMacCache: string[] = [];
let opnsenseMacCacheTime: Date | null = null;
const OPNSENSE_MAC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// Cache for MAC exclusions to avoid repeated database queries
const macExclusionCache: Map<string, { enabled: boolean; exclusionMode: ExclusionMode; reason?: string }> = new Map();
let macExclusionCacheTime: Date | null = null;
const MAC_EXCLUSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// Regex patterns for VRRP and HSRP MAC address detection
const VRRP_PATTERN = /^00005E0001[0-9A-F]{2}$/;
const HSRP_PATTERN = /^00000C07AC[0-9A-F]{2}$/;

/**
 * Normalizes a MAC address by removing separators and converting to uppercase
 * @param macAddress The MAC address to normalize
 * @returns Normalized MAC address string
 */
function normalizeMacAddress(macAddress: string): string {
  return macAddress.replace(/[:-]/g, '').toUpperCase();
}

/**
 * Detects if a MAC address is a VRRP or HSRP protocol MAC
 * @param macAddress The MAC address to check
 * @returns Object indicating if it's a protocol MAC and which type
 */
function isVirtualRouterMac(macAddress: string): {
  isVirtualRouterMac: boolean;
  protocolType?: 'VRRP' | 'HSRP';
} {
  if (!macAddress) {
    return { isVirtualRouterMac: false };
  }

  try {
    const normalizedMac = normalizeMacAddress(macAddress);

    if (VRRP_PATTERN.test(normalizedMac)) {
      return { isVirtualRouterMac: true, protocolType: 'VRRP' };
    }

    if (HSRP_PATTERN.test(normalizedMac)) {
      return { isVirtualRouterMac: true, protocolType: 'HSRP' };
    }

    return { isVirtualRouterMac: false };
  } catch (error) {
    logger.warn(`Error checking virtual router MAC for ${macAddress}:`, error);
    return { isVirtualRouterMac: false };
  }
}

/**
 * Get cached OPNsense MAC addresses or fetch them if cache is expired
 */
async function getCachedOpnsenseMacAddresses(): Promise<string[]> {
  const now = new Date();

  // Return cached data if still valid
  if (opnsenseMacCacheTime && (now.getTime() - opnsenseMacCacheTime.getTime()) < OPNSENSE_MAC_CACHE_TTL) {
    return opnsenseMacCache;
  }

  try {
    // Fetch fresh OPNsense MAC addresses
    opnsenseMacCache = await getOpnsenseMacAddresses();
    opnsenseMacCacheTime = now;
    logger.debug(`Cached ${opnsenseMacCache.length} OPNsense MAC addresses`);
    return opnsenseMacCache;
  } catch (error) {
    logger.warn('Failed to fetch OPNsense MAC addresses, using empty cache:', error);
    opnsenseMacCache = [];
    opnsenseMacCacheTime = now;
    return [];
  }
}

/**
 * Get cached MAC exclusions or fetch them if cache is expired
 */
async function getCachedMacExclusions(): Promise<Map<string, { enabled: boolean; exclusionMode: ExclusionMode; reason?: string }>> {
  const now = new Date();

  // Return cached data if still valid
  if (macExclusionCacheTime && (now.getTime() - macExclusionCacheTime.getTime()) < MAC_EXCLUSION_CACHE_TTL) {
    return macExclusionCache;
  }

  try {
    // Fetch fresh MAC exclusions from database
    const exclusions = await prisma.macExclusion.findMany({
      include: {
        macAddress: {
          select: {
            macAddress: true
          }
        }
      }
    });

    // Rebuild cache
    macExclusionCache.clear();
    for (const exclusion of exclusions) {
      if (exclusion.macAddress) {
        macExclusionCache.set(exclusion.macAddress.macAddress, {
          enabled: exclusion.enabled,
          exclusionMode: exclusion.exclusionMode as ExclusionMode,
          reason: exclusion.reason || undefined
        });
      }
    }

    macExclusionCacheTime = now;
    logger.debug(`Cached ${macExclusionCache.size} MAC exclusions`);
    return macExclusionCache;
  } catch (error) {
    logger.warn('Failed to fetch MAC exclusions, using empty cache:', error);
    macExclusionCache.clear();
    macExclusionCacheTime = now;
    return new Map();
  }
}

/**
 * Check if a MAC address is manually excluded
 * @param macAddress The MAC address to check (normalized lowercase)
 * @returns Promise resolving to exclusion status
 */
async function isMacExcluded(macAddress: string): Promise<{ excluded: boolean; mode?: ExclusionMode; reason?: string }> {
  try {
    // Check if MAC exclusions are enabled in settings
    const settings = await prisma.globalSettings.findFirst();
    if (!settings?.enableMacExclusions) {
      return { excluded: false };
    }

    // Get cached exclusions
    const exclusions = await getCachedMacExclusions();
    const exclusion = exclusions.get(macAddress);

    if (exclusion && exclusion.enabled) {
      return {
        excluded: true,
        mode: exclusion.exclusionMode,
        reason: exclusion.reason
      };
    }

    return { excluded: false };
  } catch (error) {
    logger.warn(`Error checking exclusion status for ${macAddress}:`, error);
    return { excluded: false };
  }
}

/**
 * Update IP history for a MAC address (only for non-excluded MACs)
 * For PARTIAL exclusion: history creation is skipped (already cleaned up when enabling PARTIAL)
 * For FULL exclusion: history creation is skipped
 * For non-excluded: history entries are created/updated
 * @param tx The Prisma transaction context
 * @param macAddressId The MAC address ID
 * @param ipAddress The IP address
 * @param networkInterface The network interface
 * @param scanTime The scan timestamp
 * @param macAddress The MAC address string (for exclusion check)
 */
async function updateMacIpHistory(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  macAddressId: string,
  ipAddress: string,
  networkInterface: string | undefined,
  scanTime: Date,
  macAddress: string
): Promise<void> {
  try {
    // Check if MAC exclusions are enabled
    const settings = await tx.globalSettings.findFirst();
    if (!settings?.enableMacExclusions) {
      return; // Skip history tracking if exclusions are disabled
    }

    // Check if this MAC is excluded
    const exclusionStatus = await isMacExcluded(macAddress);
    if (exclusionStatus.excluded) {
      // For both FULL and PARTIAL exclusions, skip history creation
      // PARTIAL exclusion history was already cleaned up when enabling the exclusion
      // FULL exclusion should not create any history
      const modeLabel = exclusionStatus.mode === 'PARTIAL' ? 'PARTIAL' : 'FULL';
      logger.debug(`Skipping history creation for ${modeLabel} excluded MAC address: ${macAddress} (IP: ${ipAddress}) - Reason: ${exclusionStatus.reason || 'No reason provided'}`);
      return;
    }

    // Upsert IP history entry only for non-excluded MACs
    await tx.macIpHistoryEntry.upsert({
      where: {
        macAddressId_ipAddress: {
          macAddressId,
          ipAddress
        }
      },
      update: {
        lastSeen: scanTime,
        detectionCount: {
          increment: 1
        },
        networkInterface: networkInterface || undefined
      },
      create: {
        macAddressId,
        ipAddress,
        networkInterface,
        firstSeen: scanTime,
        lastSeen: scanTime,
        detectionCount: 1
      }
    });
  } catch (error) {
    logger.warn(`Failed to update IP history for ${ipAddress}:`, error);
  }
}

/**
 * Get comprehensive exclusion status for a MAC address
 * @param macAddress The MAC address to check
 * @returns Promise resolving to comprehensive exclusion status
 */
async function getExclusionStatus(macAddress: string): Promise<{
  isExcluded: boolean;
  exclusion?: MacExclusion;
  isVirtualRouterMac: boolean;
  protocolType?: 'VRRP' | 'HSRP';
  isPrivacyMac: boolean;
}> {
  try {
    const normalizedMac = macAddress.toLowerCase();

    // Check manual exclusion
    const exclusionStatus = await isMacExcluded(normalizedMac);

    // Get exclusion details if excluded
    let exclusion: MacExclusion | undefined;
    if (exclusionStatus.excluded) {
      const exclusionRecord = await prisma.macExclusion.findFirst({
        where: {
          macAddress: {
            macAddress: normalizedMac
          }
        },
        include: {
          macAddress: true
        }
      });

      if (exclusionRecord) {
        exclusion = {
          id: exclusionRecord.id,
          macAddressId: exclusionRecord.macAddressId,
          macAddress: {
            id: exclusionRecord.macAddress.id,
            macAddress: exclusionRecord.macAddress.macAddress,
            deviceName: exclusionRecord.macAddress.deviceName,
            vendor: exclusionRecord.macAddress.vendor
          },
          enabled: exclusionRecord.enabled,
          reason: exclusionRecord.reason,
          excludedBy: exclusionRecord.excludedBy,
          excludedAt: exclusionRecord.excludedAt,
          lastModifiedBy: exclusionRecord.lastModifiedBy,
          lastModifiedAt: exclusionRecord.lastModifiedAt,
          exclusionMode: exclusionRecord.exclusionMode as ExclusionMode
        };
      }
    }

    // Check virtual router MAC
    const virtualRouterInfo = isVirtualRouterMac(normalizedMac);

    // Check privacy MAC
    const isPrivacy = isPrivacyMac(normalizedMac);

    return {
      isExcluded: exclusionStatus.excluded,
      exclusion,
      isVirtualRouterMac: virtualRouterInfo.isVirtualRouterMac,
      protocolType: virtualRouterInfo.protocolType,
      isPrivacyMac: isPrivacy
    };
  } catch (error) {
    logger.warn(`Error getting exclusion status for ${macAddress}:`, error);
    return {
      isExcluded: false,
      isVirtualRouterMac: false,
      isPrivacyMac: false
    };
  }
}

/**
 * Utility function to detect privacy/randomized MAC addresses
 * Privacy MACs have the locally administered bit set (bit 1 of first octet)
 */
function isPrivacyMac(macAddress: string): boolean {
  // Remove colons and convert to uppercase
  const cleanMac = macAddress.replace(/[:-]/g, '').toUpperCase();

  if (cleanMac.length !== 12) {
    return false;
  }

  // Get the first octet (first two hex characters)
  const firstOctet = parseInt(cleanMac.substring(0, 2), 16);

  // Check if the locally administered bit (bit 1) is set
  // This is indicated by the second least significant bit being 1
  const isLocallyAdministered = (firstOctet & 0x02) !== 0;

  // Additional heuristics for privacy MAC detection
  const isUnicast = (firstOctet & 0x01) === 0; // Unicast addresses

  return isLocallyAdministered && isUnicast;
}

/**
 * Fetch all DHCP reservations from OPNsense once per scan
 * This is much more efficient than fetching for each IP individually
 */
async function fetchAllDhcpReservations(): Promise<Array<{ hw_address?: string; ip_address?: string }>> {
  try {
    // Import the DHCP API function dynamically to avoid circular dependencies
    const { fetchFromOpnsense } = await import('@/lib/opnsense-api');

    // Fetch DHCP reservations using the correct endpoint
    const response = await fetchFromOpnsense('/api/kea/dhcpv4/search_reservation', 'POST', {}) as { rows?: Array<{ hw_address?: string; ip_address?: string }> };
    return response.rows || [];
  } catch (error) {
    logger.warn('Failed to fetch DHCP reservations:', error);
    return [];
  }
}

/**
 * Check DHCP reservation status and conflicts for a MAC/IP combination against cached reservations
 * This function does NOT make API calls - it uses the pre-fetched reservations array
 */
function checkDhcpReservationStatus(
  macAddress: string,
  ipAddress: string,
  reservations: Array<{ hw_address?: string; ip_address?: string }>
): {
  isDhcpReserved: boolean;
  hasDhcpConflict: boolean;
} {
  // Check for exact match (MAC and IP both match)
  const exactMatch = reservations.find((reservation) =>
    reservation.hw_address?.toLowerCase() === macAddress.toLowerCase() &&
    reservation.ip_address === ipAddress
  );

  if (exactMatch) {
    return { isDhcpReserved: true, hasDhcpConflict: false };
  }

  // Check for conflicts
  // IP conflict: IP matches a reservation but with different MAC
  const ipConflictReservation = reservations.find((reservation) =>
    reservation.ip_address === ipAddress &&
    reservation.hw_address?.toLowerCase() !== macAddress.toLowerCase()
  );

  // MAC conflict: MAC matches a reservation but with different IP
  const macConflictReservation = reservations.find((reservation) =>
    reservation.hw_address?.toLowerCase() === macAddress.toLowerCase() &&
    reservation.ip_address !== ipAddress
  );

  const hasDhcpConflict = !!(ipConflictReservation || macConflictReservation);

  return { isDhcpReserved: false, hasDhcpConflict };
}

/**
 * Background service to track MAC addresses through ARP table monitoring
 */
export class MacTrackingService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastScanTime: Date | null = null;

  /**
   * Start the MAC tracking service with specified interval
   */
  start(intervalMinutes: number = 5): void {
    // Check if already running (in this worker or another)
    const existingState = getServiceState('mac-tracking');
    if (existingState?.isRunning) {
      logger.info('MAC tracking service already running in another worker or instance');
      return;
    }

    if (this.isRunning) {
      logger.warn('MAC tracking service is already running in this worker');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting MAC tracking service with ${intervalMinutes} minute interval`);

    // Write state to file system for cross-worker coordination
    setServiceState('mac-tracking', {
      isRunning: true,
      startedAt: new Date().toISOString(),
      workerPid: process.pid,
      intervalMinutes
    });

    // Schedule automatic cleanup
    this.scheduleAutomaticCleanup();

    // Run immediately on start
    this.runArpScan().catch(error => {
      logger.error('Initial ARP scan failed:', error);
    });

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      // Check if service should still be running
      // This handles the case where another worker stopped the service
      const state = getServiceState('mac-tracking');

      if (!state || !state.isRunning) {
        logger.info('Detected service stop signal from another worker. Stopping local interval.');
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
        this.isRunning = false;
        return;
      }

      this.runArpScan().catch(error => {
        logger.error('Scheduled ARP scan failed:', error);
      });
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the MAC tracking service
   */
  stop(): void {
    // ALWAYS clear state file first, even if this worker didn't start the service
    // This ensures the stop command works across all workers
    clearServiceState('mac-tracking');

    // Clean up this worker's interval if it exists
    if (this.isRunning) {
      this.isRunning = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }

    logger.info('MAC tracking service stopped');
  }

  /**
   * Run a single ARP scan cycle
   */
  async runArpScan(): Promise<MacTrackingJobResult> {
    const startTime = Date.now();
    let processedEntries = 0;
    let newMacs = 0;
    let updatedMacs = 0;
    let errors = 0;
    let vrrpMacsSkipped = 0;
    let hsrpMacsSkipped = 0;
    let excludedMacsSkipped = 0;

    try {
      logger.info('Starting ARP table scan for MAC tracking');

      const arpEntries = await get_arpTable();
      const scanTime = new Date();

      // Group ARP entries by MAC address to handle multiple IPs per MAC correctly
      const entriesByMac = new Map<string, typeof arpEntries>();
      for (const entry of arpEntries) {
        if (!entry.mac || !entry.ip) continue;
        const normalizedMac = entry.mac.toLowerCase();
        if (!entriesByMac.has(normalizedMac)) {
          entriesByMac.set(normalizedMac, []);
        }
        entriesByMac.get(normalizedMac)!.push(entry);
      }

      logger.info(`Processing ${arpEntries.length} ARP entries (${entriesByMac.size} unique MACs)`);

      // Convert to array of [mac, entries] for batching
      const macEntries = Array.from(entriesByMac.entries());

      // Process MACs in batches to avoid transaction timeouts
      const BATCH_SIZE = 25; // Process 25 MACs per transaction (reduced from 50 entries since each MAC may have multiple IPs)
      const batches = [];

      for (let i = 0; i < macEntries.length; i += BATCH_SIZE) {
        batches.push(macEntries.slice(i, i + BATCH_SIZE));
      }

      logger.info(`Processing ${macEntries.length} MACs in ${batches.length} batches of ${BATCH_SIZE}`);

      // Get OPNsense MAC addresses once per scan
      const opnsenseMacs = await getCachedOpnsenseMacAddresses();
      logger.debug(`Processing ARP scan with ${opnsenseMacs.length} known OPNsense MAC addresses`);

      // Fetch host aliases for all IPs in the scan to avoid repeated API calls
      const allIpsInScan = arpEntries.map(e => e.ip).filter(Boolean);
      const hostAliasMap = await getHostAliasesForIps(allIpsInScan);
      logger.debug(`Fetched host aliases for ${allIpsInScan.length} IPs`);

      // Fetch DHCP reservations ONCE for the entire scan to avoid repeated API calls
      const dhcpReservations = await fetchAllDhcpReservations();
      logger.debug(`Fetched ${dhcpReservations.length} DHCP reservations for scan`);

      for (const [batchIndex, batch] of batches.entries()) {
        try {
          await prisma.$transaction(async (tx) => {
            for (const [normalizedMac, entries] of batch) {
              try {
                // Get vendor from OPNsense ARP table first (most accurate), fallback to local file lookup
                // OPNsense provides vendor info in the 'manufacturer' field of ARP entries
                const opnsenseVendor = entries[0].manufacturer;
                const vendor = opnsenseVendor || lookupMacVendor(normalizedMac);
                const vendorSource = opnsenseVendor ? 'OPNsense' : 'Local DB';

                // Log vendor source for debugging
                if (vendor && vendor !== 'Unknown Vendor') {
                  logger.debug(`Vendor for ${normalizedMac}: ${vendor} (source: ${vendorSource})`);
                }

                const isOpnsense = opnsenseMacs.includes(normalizedMac);

                // Check if this MAC is manually excluded
                const exclusionStatus = await isMacExcluded(normalizedMac);
                const isPartialExclusion = exclusionStatus.excluded && exclusionStatus.mode === 'PARTIAL';
                if (exclusionStatus.excluded && !isPartialExclusion) {
                  excludedMacsSkipped++;
                  logger.debug(`Skipping excluded MAC address (FULL): ${normalizedMac} (${entries.length} IPs) - Reason: ${exclusionStatus.reason || 'No reason provided'}`);
                  processedEntries += entries.length;
                  continue; // Skip to next MAC without creating database records
                }

                // Check if this is a VRRP or HSRP virtual router MAC
                const virtualRouterMacInfo = isVirtualRouterMac(normalizedMac);
                if (virtualRouterMacInfo.isVirtualRouterMac) {
                  if (virtualRouterMacInfo.protocolType === 'VRRP') {
                    vrrpMacsSkipped++;
                  } else if (virtualRouterMacInfo.protocolType === 'HSRP') {
                    hsrpMacsSkipped++;
                  }
                  logger.debug(`Skipping ${virtualRouterMacInfo.protocolType} MAC address: ${normalizedMac} (${entries.length} IPs)`);
                  processedEntries += entries.length;
                  continue; // Skip to next MAC without creating database records
                }

                // Find or create MAC address record
                const existingMac = await tx.macAddress.findUnique({
                  where: { macAddress: normalizedMac }
                });

                // Detect if this is a privacy MAC
                const isPrivacy = isPrivacyMac(normalizedMac);

                // Use the first entry's hostname (they should all be the same for the same MAC)
                const hostname = entries[0].hostname;

                let macRecord: { id: string } | null;
                if (existingMac) {
                  // Update existing MAC
                  await tx.macAddress.update({
                    where: { id: existingMac.id },
                    data: {
                      lastSeen: scanTime,
                      isActive: true,
                      isPrivacyMac: isPrivacy,
                      deviceName: hostname || existingMac.deviceName,
                      vendor: vendor || existingMac.vendor,
                    }
                  });
                  updatedMacs++;
                  macRecord = existingMac;
                } else {
                  // Create new MAC
                  macRecord = await tx.macAddress.create({
                    data: {
                      macAddress: normalizedMac,
                      firstSeen: scanTime,
                      lastSeen: scanTime,
                      isActive: true,
                      isPrivacyMac: isPrivacy,
                      deviceName: hostname,
                      vendor: vendor,
                    }
                  });
                  newMacs++;
                }

                // Handle IP associations - batch process all IPs for this MAC
                await this.updateIpAssociationsForMac(
                  tx,
                  macRecord.id,
                  normalizedMac,
                  entries,
                  scanTime,
                  isOpnsense,
                  isPartialExclusion,
                  dhcpReservations // Pass cached DHCP reservations
                );

                // Update IP activation periods with hostname and hostAlias
                // Only update for non-excluded MACs and PARTIAL exclusions
                if (!exclusionStatus.excluded || isPartialExclusion) {
                  await this.updateMacIpActivationPeriods(
                    tx,
                    macRecord.id,
                    entries,
                    scanTime,
                    normalizedMac,
                    hostname,
                    hostAliasMap  // Pass the entire map, not just first IP's alias
                  );
                }

                // Update IP history for each IP (history function will skip for partial exclusions)
                for (const entry of entries) {
                  await updateMacIpHistory(tx, macRecord.id, entry.ip, entry.intf, scanTime, normalizedMac);
                }

                processedEntries += entries.length;

              } catch (error) {
                logger.error(`Error processing MAC ${normalizedMac}:`, error);
                errors++;
              }
            }
          }, {
            timeout: 15000 // 15 second timeout per batch (increased from 10s due to batch processing)
          });

          logger.debug(`Completed batch ${batchIndex + 1}/${batches.length}`);

        } catch (error) {
          logger.error(`Error processing batch ${batchIndex + 1}:`, error);
          errors += batch.length; // Count all MACs in failed batch as errors
        }
      }

      // Mark inactive MACs
      await this.markInactiveMacs();

      this.lastScanTime = scanTime;
      const duration = Date.now() - startTime;

      // Update activity timestamp in state file
      updateServiceActivity('mac-tracking');

      // Log comprehensive statistics including protocol MAC and exclusion filtering
      const totalProtocolMacsSkipped = vrrpMacsSkipped + hsrpMacsSkipped;
      let logMessage = `ARP scan completed: ${processedEntries} processed, ${newMacs} new, ${updatedMacs} updated, ${errors} errors in ${duration}ms`;

      if (totalProtocolMacsSkipped > 0 || excludedMacsSkipped > 0) {
        const filterParts = [];
        if (vrrpMacsSkipped > 0) filterParts.push(`${vrrpMacsSkipped} VRRP MACs`);
        if (hsrpMacsSkipped > 0) filterParts.push(`${hsrpMacsSkipped} HSRP MACs`);
        if (excludedMacsSkipped > 0) filterParts.push(`${excludedMacsSkipped} excluded MACs`);
        logMessage += ` (filtered: ${filterParts.join(', ')})`;
      }

      logger.info(logMessage);

      // Log detailed filtering statistics if any were found
      if (totalProtocolMacsSkipped > 0 || excludedMacsSkipped > 0) {
        const debugParts = [];
        if (vrrpMacsSkipped > 0) debugParts.push(`${vrrpMacsSkipped} VRRP addresses skipped`);
        if (hsrpMacsSkipped > 0) debugParts.push(`${hsrpMacsSkipped} HSRP addresses skipped`);
        if (excludedMacsSkipped > 0) debugParts.push(`${excludedMacsSkipped} excluded MACs skipped`);
        logger.debug(`MAC filtering summary: ${debugParts.join(', ')}`);
      }

      return { processedEntries, newMacs, updatedMacs, errors, duration };

    } catch (error) {
      logger.error('ARP scan failed:', error);
      throw error;
    }
  }

  /**
   * Update IP activation periods for a MAC address based on current scan
   */
  private async updateMacIpActivationPeriods(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    macAddressId: string,
    ipEntries: Array<{ ip: string; intf?: string }>, // IP entries with interface information
    scanTime: Date,
    normalizedMac: string, // For logging purposes
    hostname?: string,
    hostAliasMap?: Map<string, { aliases: string[] }> // Map of IP to host aliases
  ): Promise<void> {
    const ipsInScan = ipEntries.map(e => e.ip);
    const ipToInterfaceMap = new Map(ipEntries.map(e => [e.ip, e.intf]));

    const existingActivePeriods = await tx.macIpActivationPeriod.findMany({
      where: {
        macAddressId,
        deactivatedAt: null // Only consider currently active periods
      }
    });

    const existingActiveIps = new Set(existingActivePeriods.map(p => p.ipAddress));

    // 1. Deactivate periods for IPs no longer seen in scan
    for (const period of existingActivePeriods) {
      if (!ipsInScan.includes(period.ipAddress)) {
        await tx.macIpActivationPeriod.update({
          where: { id: period.id },
          data: { deactivatedAt: scanTime }
        });
        logger.debug(`Deactivated IP activation period for MAC ${normalizedMac}, IP ${period.ipAddress}`);
      }
    }

    // 2. Activate or confirm active periods for IPs seen in scan
    for (const ip of ipsInScan) {
      if (!existingActiveIps.has(ip)) {
        // IP was not previously active, or is new -> create a new activation period
        // Look up the host alias for this specific IP
        const ipHostAlias = hostAliasMap?.get(ip)?.aliases[0];

        await tx.macIpActivationPeriod.create({
          data: {
            macAddressId,
            ipAddress: ip,
            activatedAt: scanTime,
            deactivatedAt: null, // Still active
            networkInterface: ipToInterfaceMap.get(ip) || null,
            hostname: hostname || null,
            hostAlias: ipHostAlias || null  // Use IP-specific alias
          }
        });
        logger.debug(`Created new IP activation period for MAC ${normalizedMac}, IP ${ip} on interface ${ipToInterfaceMap.get(ip) || 'unknown'}`);
      }
      // If it exists and is active, no need to do anything, as deactivatedAt is already null
    }
  }

  /**
   * Update IP associations for a MAC address (batch process all IPs seen in current scan)
   * This correctly handles MACs with multiple simultaneous IPs (e.g., keepalived, HA clusters)
   */
  private async updateIpAssociationsForMac(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    macAddressId: string,
    macAddress: string,
    entries: Array<{ ip: string; intf?: string }>,
    scanTime: Date,
    isOpnsenseMac: boolean = false,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isPartialExclusion: boolean = false,
    dhcpReservations: Array<{ hw_address?: string; ip_address?: string }> = []
  ): Promise<void> {
    // Collect all IPs seen for this MAC in current scan
    const ipsInScan = entries.map(e => e.ip);

    // Special handling for OPNsense MACs - they should only have one active IP
    // (OPNsense firewall interfaces shouldn't have multiple IPs on same MAC)
    if (isOpnsenseMac) {
      // Use the first IP only for OPNsense MACs
      const entry = entries[0];
      const dhcpStatus = checkDhcpReservationStatus(macAddress, entry.ip, dhcpReservations);

      const existingAssociation = await tx.macIpAssociation.findFirst({
        where: {
          macAddressId,
          isActive: true
        }
      });

      if (existingAssociation) {
        // Update existing association
        await tx.macIpAssociation.update({
          where: { id: existingAssociation.id },
          data: {
            ipAddress: entry.ip,
            networkInterface: entry.intf,
            lastSeen: scanTime,
            isDhcpReserved: dhcpStatus.isDhcpReserved,
            hasDhcpConflict: dhcpStatus.hasDhcpConflict
          }
        });
      } else {
        // Create new association
        await tx.macIpAssociation.create({
          data: {
            macAddressId,
            ipAddress: entry.ip,
            networkInterface: entry.intf,
            isDhcpReserved: dhcpStatus.isDhcpReserved,
            hasDhcpConflict: dhcpStatus.hasDhcpConflict,
            firstSeen: scanTime,
            lastSeen: scanTime,
            isActive: true
          }
        });
      }
      return;
    }

    // For PARTIAL exclusion and normal MACs: Allow multiple active IPs
    // Mark IPs NOT seen in this scan as inactive
    await tx.macIpAssociation.updateMany({
      where: {
        macAddressId,
        isActive: true,
        ipAddress: {
          notIn: ipsInScan
        }
      },
      data: { isActive: false }
    });

    // Create or update each IP seen in this scan
    for (const entry of entries) {
      const dhcpStatus = checkDhcpReservationStatus(macAddress, entry.ip, dhcpReservations);

      // Check if this IP association already exists
      const existingAssociation = await tx.macIpAssociation.findFirst({
        where: {
          macAddressId,
          ipAddress: entry.ip
        },
        orderBy: { lastSeen: 'desc' }
      });

      if (existingAssociation) {
        // Update existing association and mark as active
        await tx.macIpAssociation.update({
          where: { id: existingAssociation.id },
          data: {
            lastSeen: scanTime,
            networkInterface: entry.intf || existingAssociation.networkInterface,
            isDhcpReserved: dhcpStatus.isDhcpReserved,
            hasDhcpConflict: dhcpStatus.hasDhcpConflict,
            isActive: true
          }
        });
      } else {
        // Create new association
        await tx.macIpAssociation.create({
          data: {
            macAddressId,
            ipAddress: entry.ip,
            networkInterface: entry.intf,
            isDhcpReserved: dhcpStatus.isDhcpReserved,
            hasDhcpConflict: dhcpStatus.hasDhcpConflict,
            firstSeen: scanTime,
            lastSeen: scanTime,
            isActive: true
          }
        });
      }
    }

    // Log if this MAC has multiple active IPs (useful for debugging)
    if (entries.length > 1) {
      logger.debug(`MAC ${macAddress} has ${entries.length} active IPs: ${ipsInScan.join(', ')}`);
    }

    // Update MacIpActivationPeriod records is now called inside the transaction loop above
    // to ensure we have access to hostname and hostAlias
    // await this.updateMacIpActivationPeriods(
    //   tx,
    //   macAddressId,

  }

  /**
          await tx.macIpAssociation.create({
            data: {
              macAddressId: macRecord.id,
              ipAddress: ipAddress,
              networkInterface: networkInterface,
              isDhcpReserved: dhcpStatus.isDhcpReserved,
              hasDhcpConflict: dhcpStatus.hasDhcpConflict,
              firstSeen: scanTime,
              lastSeen: scanTime,
              isActive: true
            }
          });
          logger.debug(`Created initial association for OPNsense MAC ${macAddress} with IP ${ipAddress} on interface ${networkInterface}`);
        } else {
          // Check if this is the same interface (same IP and interface name)
          const isSameInterface =
            existingOpnsenseAssociation.ipAddress === ipAddress &&
            existingOpnsenseAssociation.networkInterface === networkInterface;

          if (isSameInterface) {
            // Same interface - just update the timestamp
            await tx.macIpAssociation.update({
              where: { id: existingOpnsenseAssociation.id },
              data: {
                lastSeen: scanTime,
                isDhcpReserved: dhcpStatus.isDhcpReserved,
                hasDhcpConflict: dhcpStatus.hasDhcpConflict
              }
            });
            logger.debug(`Updated existing OPNsense MAC ${macAddress} association timestamp for same interface`);
          } else {
            // Different interface - update the existing association without creating history
            // This handles shared MACs across VLAN interfaces
            await tx.macIpAssociation.update({
              where: { id: existingOpnsenseAssociation.id },
              data: {
                ipAddress: ipAddress, // Update IP address
                networkInterface: networkInterface, // Update interface
                isDhcpReserved: dhcpStatus.isDhcpReserved,
                hasDhcpConflict: dhcpStatus.hasDhcpConflict,
                lastSeen: scanTime
              }
            });
            logger.debug(`Updated OPNsense MAC ${macAddress} association from ${existingOpnsenseAssociation.ipAddress} (${existingOpnsenseAssociation.networkInterface}) to ${ipAddress} (${networkInterface}) without creating history - shared MAC handling`);
          }
        }
      } else if (isPartialExclusion) {
        // For PARTIAL exclusion: Allow multiple IPs to be tracked (don't mark old ones as inactive)
        // Check if this IP association already exists
        const existingAssociation = await tx.macIpAssociation.findFirst({
          where: {
            macAddressId: macRecord.id,
            ipAddress: ipAddress,
            isActive: true
          }
        });

        if (existingAssociation) {
          // Update existing association
          await tx.macIpAssociation.update({
            where: { id: existingAssociation.id },
            data: {
              lastSeen: scanTime,
              networkInterface: networkInterface || existingAssociation.networkInterface,
              isDhcpReserved: dhcpStatus.isDhcpReserved,
              hasDhcpConflict: dhcpStatus.hasDhcpConflict
            }
          });
          logger.debug(`Updated existing association for PARTIAL excluded MAC ${macAddress} with IP ${ipAddress}`);
        } else {
          // Create new association without marking old ones as inactive
          // This allows multiple IPs to be tracked simultaneously
          await tx.macIpAssociation.create({
            data: {
              macAddressId: macRecord.id,
              ipAddress: ipAddress,
              networkInterface: networkInterface,
              isDhcpReserved: dhcpStatus.isDhcpReserved,
              hasDhcpConflict: dhcpStatus.hasDhcpConflict,
              firstSeen: scanTime,
              lastSeen: scanTime,
              isActive: true
            }
          });
          logger.debug(`Created new association for PARTIAL excluded MAC ${macAddress} with IP ${ipAddress} (allowing multiple IPs)`);
        }
      } else {
        // Normal handling for non-OPNsense, non-PARTIAL MACs
        // Mark old associations for this MAC as inactive
        await tx.macIpAssociation.updateMany({
          where: {
            macAddressId: macRecord.id,
            isActive: true
          },
          data: { isActive: false }
        });

        // Create new association
        await tx.macIpAssociation.create({
          data: {
            macAddressId: macRecord.id,
            ipAddress: ipAddress,
            networkInterface: networkInterface,
            isDhcpReserved: dhcpStatus.isDhcpReserved,
            hasDhcpConflict: dhcpStatus.hasDhcpConflict,
            firstSeen: scanTime,
            lastSeen: scanTime,
            isActive: true
          }
        });
      }
    }
  }

  /**
   * Mark MAC addresses as inactive based on timeout setting
   */
  private async markInactiveMacs(): Promise<void> {
    try {
      // Get inactive timeout from settings
      const settings = await prisma.globalSettings.findFirst();
      const inactiveTimeoutMinutes = settings?.macInactiveTimeout || 1440; // 24 hours default

      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - inactiveTimeoutMinutes);

      // First, get all MAC addresses that should be marked inactive
      const macsToMarkInactive = await prisma.macAddress.findMany({
        where: {
          lastSeen: { lt: cutoffTime },
          isActive: true
        },
        select: { id: true }
      });

      if (macsToMarkInactive.length === 0) {
        return; // Nothing to do
      }

      const macIds = macsToMarkInactive.map(mac => mac.id);

      // Use a transaction to ensure both updates happen together
      const [macResult, ipResult, activationResult] = await prisma.$transaction([
        // Mark MAC addresses as inactive
        prisma.macAddress.updateMany({
          where: {
            id: { in: macIds }
          },
          data: { isActive: false }
        }),
        // Mark their IP associations as inactive
        prisma.macIpAssociation.updateMany({
          where: {
            macAddressId: { in: macIds },
            isActive: true
          },
          data: { isActive: false }
        }),
        // Mark their IP activation periods as inactive
        prisma.macIpActivationPeriod.updateMany({
          where: {
            macAddressId: { in: macIds },
            deactivatedAt: null // Only update currently active periods
          },
          data: { deactivatedAt: cutoffTime } // Use cutoffTime for deactivation
        })
      ]);

      if (macResult.count > 0 || ipResult.count > 0 || activationResult.count > 0) {
        logger.info(`Marked ${macResult.count} MAC addresses, ${ipResult.count} IP associations, and ${activationResult.count} IP activation periods as inactive (not seen for ${inactiveTimeoutMinutes} minutes)`);
      }
    } catch (error) {
      logger.error('Failed to mark inactive MACs:', error);
    }
  }

  /**
   * Get service status
   * Checks file system state to ensure accuracy across workers
   */
  getStatus(): { isRunning: boolean; intervalId: number | null; lastScanTime: Date | null } {
    // Check shared state from file system
    const state = getServiceState('mac-tracking');

    return {
      isRunning: state?.isRunning ?? false,
      intervalId: this.intervalId ? Number(this.intervalId) : null,
      lastScanTime: this.lastScanTime
    };
  }

  /**
   * Clean up old MAC data based on retention policy
   * If retentionDays is 0, purges all inactive records
   */
  async cleanupOldData(retentionDays: number = 90): Promise<number> {
    try {
      let whereClause: { isActive: boolean; lastSeen?: { lt: Date } };
      let activationWhereClause: { deactivatedAt: { lt: Date } };

      if (retentionDays === 0) {
        // Purge all inactive records
        whereClause = {
          isActive: false
        };
        // For activation periods, we only delete those that are actually deactivated
        activationWhereClause = {
          deactivatedAt: { lt: new Date() }
        };
      } else {
        // Delete records older than retention period
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        whereClause = {
          lastSeen: { lt: cutoffDate },
          isActive: false
        };
        activationWhereClause = {
          deactivatedAt: { lt: cutoffDate }
        };
      }

      // Delete old inactive IP associations
      const associationResult = await prisma.macIpAssociation.deleteMany({
        where: whereClause
      });

      // Delete old inactive IP activation periods
      const activationResult = await prisma.macIpActivationPeriod.deleteMany({
        where: activationWhereClause
      });

      // Delete MAC addresses with no active associations
      const orphanedMacs = await prisma.macAddress.deleteMany({
        where: {
          ...whereClause,
          ipAssociations: {
            none: {}
          },
          ipActivationPeriods: {
            none: {}
          }
        }
      });

      const totalCleaned = associationResult.count + activationResult.count + orphanedMacs.count;
      logger.info(`Cleaned up ${associationResult.count} old MAC IP associations, ${activationResult.count} IP activation periods and ${orphanedMacs.count} orphaned MAC addresses older than ${retentionDays} days`);
      return totalCleaned;
    } catch (error) {
      logger.error('Failed to clean up old MAC data:', error);
      throw error;
    }
  }

  /**
   * Schedule automatic cleanup based on settings
   */
  private scheduleAutomaticCleanup(): void {
    // Run cleanup daily at 2 AM
    const now = new Date();
    const tomorrow2AM = new Date(now);
    tomorrow2AM.setDate(tomorrow2AM.getDate() + 1);
    tomorrow2AM.setHours(2, 0, 0, 0);

    const msUntil2AM = tomorrow2AM.getTime() - now.getTime();

    setTimeout(() => {
      this.runAutomaticCleanup();
      // Then schedule it to run every 24 hours
      setInterval(() => {
        this.runAutomaticCleanup();
      }, 24 * 60 * 60 * 1000);
    }, msUntil2AM);

    logger.info(`Automatic MAC data cleanup scheduled for ${tomorrow2AM.toLocaleString()}`);
  }

  /**
   * Run automatic cleanup using settings
   */
  private async runAutomaticCleanup(): Promise<void> {
    try {
      // Check if service should be running
      const state = getServiceState('mac-tracking');
      if (!state || !state.isRunning) {
        logger.info('Skipping automatic cleanup - service is stopped');
        return;
      }

      const settings = await prisma.globalSettings.findFirst();
      if (!settings?.enableMacTracking) {
        return; // Skip cleanup if MAC tracking is disabled
      }

      const retentionDays = settings.macDataRetentionDays || 90;
      const result = await this.cleanupOldData(retentionDays);

      if (result > 0) {
        logger.info(`Automatic cleanup completed: ${result} records removed`);
      }
    } catch (error) {
      logger.error('Automatic cleanup failed:', error);
    }
  }

  /**

   * Clean up ONLY IP history entries for a MAC address (preserve current associations)
   * Used when enabling PARTIAL exclusion mode.
   * @param macAddress The MAC address to clean up history for (normalized lowercase)
   * @param userId The ID of the user performing the cleanup (for audit logging)
   * @returns Promise resolving to the number of history records cleaned up
   */
  async cleanupMacHistoryOnly(macAddress: string, userId?: string): Promise<number> {
    try {
      logger.info(`Starting history-only cleanup for MAC address: ${macAddress}`);

      const macRecord = await prisma.macAddress.findUnique({
        where: { macAddress }
      });

      if (!macRecord) {
        logger.warn(`MAC address not found for history-only cleanup: ${macAddress}`);
        return 0;
      }

      let totalCleaned = 0;

      await prisma.$transaction(async (tx) => {
        const historyResult = await tx.macIpHistoryEntry.deleteMany({
          where: { macAddressId: macRecord.id }
        });
        totalCleaned += historyResult.count;
        logger.info(`Cleaned up ${historyResult.count} history entries (associations preserved) for MAC ${macAddress}`);

        const activationPeriodResult = await tx.macIpActivationPeriod.deleteMany({
          where: { macAddressId: macRecord.id }
        });
        totalCleaned += activationPeriodResult.count;
        logger.info(`Cleaned up ${activationPeriodResult.count} IP activation periods for MAC ${macAddress}`);

        if (userId) {
          const { logAuditEvent } = await import('@/lib/auditLog');
          await logAuditEvent({
            userId,
            action: 'MAC_HISTORY_ONLY_CLEANED_UP',
            method: 'SYSTEM',
            details: {
              macAddress: macRecord.macAddress,
              historyEntriesDeleted: historyResult.count,
              activationPeriodsDeleted: activationPeriodResult.count
            },
            reason: `Automatic history-only cleanup for partial excluded MAC address ${macRecord.macAddress}`
          });
        }
      });

      // Invalidate exclusion cache
      macExclusionCache.clear();
      macExclusionCacheTime = null;

      logger.info(`History-only cleanup completed for MAC ${macAddress}: ${totalCleaned} history records removed`);
      return totalCleaned;
    } catch (error) {
      logger.error(`Failed to clean up history-only for MAC ${macAddress}:`, error);
      throw error;
    }
  }

  /**
    * Clean up all IP history entries and IP associations for a MAC address
    * @param macAddress The MAC address to clean up history for (normalized lowercase)
    * @param userId The ID of the user performing the cleanup (for audit logging)
    * @returns Promise resolving to the number of records cleaned up
    */
  async cleanupMacHistory(macAddress: string, userId?: string): Promise<number> {
    try {
      logger.info(`Starting history cleanup for MAC address: ${macAddress}`);

      // Find the MAC address record
      const macRecord = await prisma.macAddress.findUnique({
        where: { macAddress }
      });

      if (!macRecord) {
        logger.warn(`MAC address not found for history cleanup: ${macAddress}`);
        return 0;
      }

      let totalCleaned = 0;

      // Perform cleanup in a transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // Delete all IP history entries for this MAC address
        const historyResult = await tx.macIpHistoryEntry.deleteMany({
          where: {
            macAddressId: macRecord.id
          }
        });

        // Delete all IP associations for this MAC address
        const associationResult = await tx.macIpAssociation.deleteMany({
          where: {
            macAddressId: macRecord.id
          }
        });

        // Delete all IP activation periods for this MAC address
        const activationResult = await tx.macIpActivationPeriod.deleteMany({
          where: {
            macAddressId: macRecord.id
          }
        });

        totalCleaned = historyResult.count + associationResult.count + activationResult.count;

        logger.info(`Cleaned up ${historyResult.count} history entries, ${associationResult.count} IP associations, and ${activationResult.count} IP activation periods for MAC ${macAddress}`);

        // Log audit event if userId is provided
        if (userId) {
          const { logAuditEvent } = await import('@/lib/auditLog');
          await logAuditEvent({
            userId,
            action: 'MAC_HISTORY_CLEANED_UP',
            method: 'SYSTEM',
            details: {
              macAddress: macRecord.macAddress,
              historyEntriesDeleted: historyResult.count,
              ipAssociationsDeleted: associationResult.count,
              activationPeriodsDeleted: activationResult.count,
              totalRecordsDeleted: totalCleaned
            },
            reason: `Automatic history cleanup for excluded MAC address ${macRecord.macAddress}`
          });
        }
      });

      // Invalidate MAC exclusion cache since we've modified data
      macExclusionCache.clear();
      macExclusionCacheTime = null;

      logger.info(`History cleanup completed for MAC ${macAddress}: ${totalCleaned} total records removed`);
      return totalCleaned;

    } catch (error) {
      logger.error(`Failed to clean up history for MAC ${macAddress}:`, error);
      throw error;
    }
  }

  /**
   * Detect if a MAC address has been associated with multiple IP addresses
   * This is useful for identifying potential MAC spoofing, device roaming, or firewall MACs with multiple subinterfaces
   * @param macAddress The MAC address to check (normalized lowercase)
   * @returns Promise resolving to detection result with IP count and details
   */
  async detectMultipleIpAssociations(macAddress: string): Promise<{
    hasMultipleIps: boolean;
    ipCount: number;
    ips: Array<{
      ipAddress: string;
      firstSeen: Date;
      lastSeen: Date;
      networkInterface?: string | null;
      isActive: boolean;
    }>;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }> {
    try {
      logger.debug(`Detecting multiple IP associations for MAC: ${macAddress}`);

      const macRecord = await prisma.macAddress.findUnique({
        where: { macAddress }
      });

      if (!macRecord) {
        logger.debug(`MAC address not found for multi-IP detection: ${macAddress}`);
        return {
          hasMultipleIps: false,
          ipCount: 0,
          ips: [],
          riskLevel: 'LOW'
        };
      }

      // Get all IP associations (both active and inactive)
      const ipAssociations = await prisma.macIpAssociation.findMany({
        where: {
          macAddressId: macRecord.id
        },
        orderBy: { lastSeen: 'desc' }
      });

      const hasMultipleIps = ipAssociations.length > 1;
      const riskLevel = this.calculateMultiIpRiskLevel(ipAssociations, macRecord);

      logger.debug(`Multi-IP detection for ${macAddress}: ${ipAssociations.length} IPs found, risk level: ${riskLevel}`);

      return {
        hasMultipleIps,
        ipCount: ipAssociations.length,
        ips: ipAssociations.map(ip => ({
          ipAddress: ip.ipAddress,
          firstSeen: ip.firstSeen,
          lastSeen: ip.lastSeen,
          networkInterface: ip.networkInterface,
          isActive: ip.isActive
        })),
        riskLevel
      };
    } catch (error) {
      logger.error(`Failed to detect multiple IPs for MAC ${macAddress}:`, error);
      throw error;
    }
  }

  /**
   * Calculate risk level for multiple IP associations
   * @param ipAssociations Array of IP associations
   * @param macRecord The MAC address record
   * @returns Risk level: LOW, MEDIUM, or HIGH
   */
  private calculateMultiIpRiskLevel(
    ipAssociations: Array<{ ipAddress: string; networkInterface?: string | null; lastSeen: Date }>,
    macRecord: { macAddress: string; isActive: boolean; lastSeen: Date; vendor?: string | null; deviceName?: string | null }
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    // Single IP or no IPs = LOW risk
    if (ipAssociations.length <= 1) {
      return 'LOW';
    }

    // Check if MAC is known infrastructure (OPNsense, VRRP, HSRP)
    const isInfrastructureMac =
      macRecord.vendor?.toLowerCase().includes('opnsense') ||
      macRecord.vendor?.toLowerCase().includes('vmware') ||
      macRecord.deviceName?.toUpperCase().includes('VRRP') ||
      macRecord.deviceName?.toUpperCase().includes('HSRP') ||
      macRecord.deviceName?.toUpperCase().includes('FIREWALL');

    if (isInfrastructureMac) {
      return 'LOW'; // Expected behavior for network infrastructure
    }

    // Multiple IPs on different subnets or many IPs = higher risk
    if (ipAssociations.length > 2) {
      return 'HIGH';
    }

    // 2 IPs = MEDIUM risk (could be device roaming or MAC spoofing)
    return 'MEDIUM';
  }

  /**
   * Invalidate the MAC exclusion cache
   * This forces the next ARP scan to fetch fresh exclusion data from the database
   */
  invalidateExclusionCache(): void {
    macExclusionCache.clear();
    macExclusionCacheTime = null;
    logger.debug('MAC exclusion cache invalidated');
  }
}

// Export the virtual router MAC detection function for use in API routes
export { isVirtualRouterMac, getExclusionStatus };

export const macTrackingService = new MacTrackingService();
