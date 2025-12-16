import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { exportAliases, OpnsenseAliasDetailFromExport, get_arpTable, getHostAliases } from '@/lib/opnsense-api';
import { filterNetworkGroups } from '@/lib/group-filter-utils';
import { isValidIpAddress } from '@/lib/network-utils'; // Import isValidIpAddress
import type { NetworkGroup } from '@/types/opnsense';
import type { GloballyDisabledGroup } from '@prisma/client';
import type { GroupFilter } from '@/types/settings';
import * as ipaddr from 'ipaddr.js'; // Import ipaddr.js to check for CIDR
import { lookupMacVendor } from '@/lib/server/network-utils'; // Import lookupMacVendor

/**
 * Fetches all OPNsense host and network aliases, applies visibility filters,
 * and returns the filtered list and its count.
 * This function centralizes the logic used in admin panels for consistent display.
 *
 * @returns An object containing the filtered host aliases and their count.
 */
export async function getFilteredHostAliases(): Promise<{ displayableHostAliases: (OpnsenseAliasDetailFromExport & { uuid: string; detectedMac?: string | null; detectedVendor?: string | null; detectedVendorSource?: 'OPNsense' | 'Local DB' | null; })[]; filteredCount: number }> {
  try {
    // Fetch group filter settings directly from the database and map to GroupFilter type
    const fetchedGroupFilterSettings = await prisma.groupFilterSetting.findMany();
    const activeGroupFilters: GroupFilter[] = fetchedGroupFilterSettings.map(filter => ({
      id: filter.id,
      pattern: filter.pattern,
      description: filter.description || undefined, // Convert null to undefined
      type: filter.type as 'include' | 'exclude',
    }));

    const arpTable = await get_arpTable(); // Fetch ARP table once

    // Fetch all network groups from OPNsense using exportAliases
    const allNetworkGroupsData = await exportAliases();
    const allNetworkGroups: NetworkGroup[] = Object.entries(allNetworkGroupsData.aliases.alias)
      .filter(([, alias]: [string, OpnsenseAliasDetailFromExport]) => alias.type === 'networkgroup')
      .map(([uuid, alias]: [string, OpnsenseAliasDetailFromExport]) => ({
        id: uuid,
        uuid,
        name: alias.name,
        description: alias.description,
        enabled: alias.enabled === '1',
        members: [],
        itemCount: 0,
        lastUpdated: null,
        rawContent: alias.content,
        type: alias.type,
        proto: alias.proto,
        interface: alias.interface,
        counters: alias.counters,
        updatefreq: alias.updatefreq,
        categories: alias.categories
      }));

    // Fetch globally disabled groups directly from the database
    const globallyDisabledGroups: GloballyDisabledGroup[] = await prisma.globallyDisabledGroup.findMany();

    const visibleNetworkGroups = await filterNetworkGroups(allNetworkGroups, activeGroupFilters, globallyDisabledGroups);
    const visibleNetworkGroupNames = new Set(visibleNetworkGroups.map(g => g.name));

    // Fetch all OPNsense host aliases directly
    const allOpnsenseAliases = await getHostAliases();

    // Apply filtering logic for host aliases and enrich with MAC/Vendor
    const displayableHostAliases = allOpnsenseAliases.filter(hostAlias => {
      // 1. Only host aliases of type 'host' should be shown
      if (hostAlias.type !== 'host') {
        return false;
      }

      // 2. Only host aliases with exactly 1 valid IP (not CIDR) should be shown
      // Split by newlines or spaces, then filter out empty strings
      const ipEntries = hostAlias.content.split(/[\n\s]+/).filter(entry => entry.trim() !== '');

      if (ipEntries.length !== 1) {
        return false; // Must have exactly one entry
      }

      const ip = ipEntries[0];
      if (!isValidIpAddress(ip)) {
        return false; // Must be a valid IP address
      }

      // Additionally, ensure it's not a CIDR range for host aliases
      try {
        ipaddr.parseCIDR(ip); // This will throw if it's not a CIDR
        return false; // It's a CIDR, so exclude it
      } catch {
        // Not a CIDR, proceed
      }

      // 3. Check if this host alias is a member of any globally disabled network groups
      // If it is, exclude it entirely from being manageable
      for (const networkGroup of allNetworkGroups) {
        const members = (networkGroup.rawContent || '').split('\n');
        if (members.includes(hostAlias.name)) {
          // Check if this network group is globally disabled
          const isGloballyDisabled = globallyDisabledGroups.some(disabledGroup =>
            disabledGroup.opnsenseUuid === networkGroup.uuid
          );

          if (isGloballyDisabled) {
            // This host alias is a member of a globally disabled network group
            // Exclude it entirely from being manageable
            return false;
          }
        }
      }

      // 4. Apply normal visibility logic for non-globally-disabled groups
      // Show if not in any group OR if in at least one visible group
      let isMemberOfAnyGroup = false;
      let isMemberOfVisibleGroup = false;

      for (const networkGroup of allNetworkGroups) {
        const members = (networkGroup.rawContent || '').split('\n');
        if (members.includes(hostAlias.name)) {
          isMemberOfAnyGroup = true;
          if (visibleNetworkGroupNames.has(networkGroup.name)) {
            isMemberOfVisibleGroup = true;
            break;
          }
        }
      }
      return !isMemberOfAnyGroup || isMemberOfVisibleGroup;
    }).map(hostAlias => {
      // Enrich with MAC and vendor information
      const ip = hostAlias.content.split(/[\n\s]+/).filter(entry => entry.trim() !== '')[0];
      let detectedMac: string | null = null;
      let detectedVendor: string | null = null;
      let detectedVendorSource: 'OPNsense' | 'Local DB' | null = null;

      if (ip) {
        const arpEntry = arpTable.find(entry => entry.ip === ip);
        if (arpEntry) {
          detectedMac = arpEntry.mac;
          const opnsenseVendor = arpEntry.manufacturer;
          if (opnsenseVendor) {
            detectedVendor = opnsenseVendor;
            detectedVendorSource = 'OPNsense';
          } else {
            detectedVendor = lookupMacVendor(arpEntry.mac);
            detectedVendorSource = detectedVendor ? 'Local DB' : null;
          }
        }
      }

      return {
        ...hostAlias,
        detectedMac: detectedMac,
        detectedVendor: detectedVendor,
        detectedVendorSource: detectedVendorSource,
      };
    });

    const filteredCount = displayableHostAliases.length;

    return { displayableHostAliases, filteredCount };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Error in getFilteredHostAliases:', errorMessage, errorStack);
    throw new Error(`Failed to fetch and filter host aliases: ${errorMessage}`);
  }
}