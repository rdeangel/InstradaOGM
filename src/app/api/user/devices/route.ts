import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { get_arpTable, fetchFromOpnsense, exportAliases } from '@/lib/opnsense-api'; // Import exportAliases
import { isValidIpAddress } from '@/lib/network-utils'; // Import isValidIpAddress
import * as ipaddr from 'ipaddr.js'; // Import ipaddr.js to check for CIDR
import type { OpnsenseAliasDetailFromExport, OpnsenseDhcpReservation, NetworkGroup, User } from '@/types/opnsense'; // Import OpnsenseAliasDetailFromExport, OpnsenseDhcpReservation, NetworkGroup, and User
import type { GroupFilter } from '@/types/settings'; // Import GroupFilter
import { GroupSpecificFilterSetting } from '@prisma/client'; // Add these imports
import { filterNetworkGroups } from '@/lib/group-filter-utils'; // Import filterNetworkGroups
import { lookupMacVendor } from '@/lib/server/network-utils'; // Import lookupMacVendor

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      // 1. Check if user is authenticated
      if (!auth.user) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

      const userId = auth.user.id; // Assuming user ID is available on session.user

      if (!userId) {
        return NextResponse.json({ message: 'User ID not found in session' }, { status: 401 });
      }

      // 2. Fetch the user's accounts to get external group memberships
      const userAccounts = await prisma.account.findMany({
        where: { userId: userId },
        orderBy: {
          provider: 'asc',
        },
        select: { externalGroups: true, provider: true },
      });

      // Collect all unique external group names from all accounts
      const externalGroups: { provider: string; groupName: string }[] = [];
      userAccounts.forEach(account => {
        if (account.externalGroups && Array.isArray(account.externalGroups)) {
          account.externalGroups.forEach(groupName => {
            // Ensure groupName is a string before pushing
            if (typeof groupName === 'string') {
              externalGroups.push({ provider: account.provider, groupName: groupName });
            }
          });
        }
      });

      // 3. Find local groups mapped to these external groups (case-insensitive provider matching)
      const mappedLocalGroups = externalGroups.length > 0
        ? await prisma.ssoGroupMapping.findMany({
          where: {
            OR: externalGroups.map(eg => ({
              ssoProvider: {
                equals: eg.provider,
                ...getCaseInsensitiveMode(),
              },
              ssoGroupName: eg.groupName,
            })),
          },
          orderBy: {
            ssoGroupName: 'asc',
          },
          select: { localGroupId: true },
        })
        : [];

      const ssoLocalGroupIds = mappedLocalGroups.map((mapping: { localGroupId: string }) => mapping.localGroupId);

      // 4. Fetch the local groups the user is directly a member of using the many-to-many relationship
      const userWithDirectGroups = await prisma.user.findUnique({
        where: { id: userId },
        select: { groups: { select: { id: true } } },
      });

      const directLocalGroupIds = userWithDirectGroups?.groups.map(group => group.id) || [];

      // 5. Combine local group IDs from SSO mappings and direct memberships
      const allLocalGroupIds = [...new Set([...ssoLocalGroupIds, ...directLocalGroupIds])];

      if (allLocalGroupIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      // 6. Find all opnsenseAliasUuid associated with these local groups
      const groupAliasPermissions = await prisma.groupHostAliasPermission.findMany({
        where: {
          groupId: {
            in: allLocalGroupIds,
          },
        },
        orderBy: {
          opnsenseAliasUuid: 'asc',
        },
        select: { opnsenseAliasUuid: true },
      });

      if (!groupAliasPermissions || groupAliasPermissions.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      const permittedAliasUuids = groupAliasPermissions.map(permission => permission.opnsenseAliasUuid);

      // Fetch all OPNsense aliases (host and networkgroup types)
      const allOpnsenseAliasesResponse = await exportAliases();
      const allOpnsenseAliases = Object.entries(allOpnsenseAliasesResponse.aliases.alias).map(([uuid, alias]) => ({ ...alias, uuid }));

      // Filter for network group aliases
      // Filter for network group aliases and map them to NetworkGroup type
      const networkGroupAliases: NetworkGroup[] = allOpnsenseAliases.filter(alias => alias.type === 'networkgroup').map(alias => ({
        id: alias.uuid || '', // Map uuid to id
        uuid: alias.uuid || '',
        name: alias.name,
        description: alias.description,
        enabled: alias.enabled === '1', // Convert "1" or "0" to boolean
        members: [], // Initialize as empty, as filterNetworkGroups doesn't use it directly for filtering logic
        rawContent: alias.content, // Store original content for later use if needed
        type: alias.type,
        proto: alias.proto,
        interface: alias.interface,
        counters: alias.counters,
        updatefreq: alias.updatefreq,
        categories: alias.categories,
        // friendlyName and iconIdentifier will be added later from groupDisplayMap if needed for NetworkGroup itself
      }));

      // Fetch OpnsenseGroupDisplay for friendly names and icons
      const opnsenseGroupDisplays = await prisma.opnsenseGroupDisplay.findMany({
        select: {
          opnsenseUuid: true,
          friendlyName: true,
          iconIdentifier: true,
          groupType: true,
        },
      });

      // Create a map for quick lookup of group display details by opnsenseUuid
      const groupDisplayMap = new Map(opnsenseGroupDisplays.map(display => [display.opnsenseUuid, display]));

      const arpTable = await get_arpTable();
      const dhcpReservationsResponse = await fetchFromOpnsense('/api/kea/dhcpv4/search_reservation', 'POST', {});
      const dhcpReservations: OpnsenseDhcpReservation[] = (dhcpReservationsResponse as { rows?: OpnsenseDhcpReservation[] }).rows || [];

      // NEW: Fetch global and user-specific group filters
      const globalFilters: GroupFilter[] = (await prisma.groupFilterSetting.findMany()).map(f => ({
        ...f,
        type: f.type as 'include' | 'exclude', // Explicitly cast type
      }));
      const globallyDisabledGroups = await prisma.globallyDisabledGroup.findMany();
      const userSpecificFilters: GroupSpecificFilterSetting[] = allLocalGroupIds.length > 0
        ? (await prisma.groupSpecificFilterSetting.findMany({
          where: {
            groupId: {
              in: allLocalGroupIds,
            },
          },
        })).map(f => ({
          ...f,
          type: f.type as 'include' | 'exclude', // Explicitly cast type
        }))
        : [];

      // Filter network group aliases based on global and user-specific rules
      const displayableNetworkGroupAliases = await filterNetworkGroups(
        networkGroupAliases,
        globalFilters,
        globallyDisabledGroups,
        auth.user as User, // Cast auth.user to User type
        userSpecificFilters
      );

      const userPermittedHostAliases = allOpnsenseAliases.filter((alias: OpnsenseAliasDetailFromExport) => {
        // Apply basic host alias filtering rules
        if (alias.type !== 'host') {
          return false;
        }

        // Ensure alias.content is a string before splitting
        if (typeof alias.content !== 'string') {
          logger.warn(`Alias ${alias.name} (${alias.uuid}) has non-string content: ${alias.content}`);
          return false;
        }

        const rawIpEntries = alias.content.split(/\n|\s+/).filter(entry => entry.trim() !== '');
        if (rawIpEntries.length !== 1) {
          return false; // Must have exactly one entry
        }

        const ip = rawIpEntries[0];
        if (!isValidIpAddress(ip)) {
          return false; // Must be a valid IP address
        }

        try {
          ipaddr.parseCIDR(ip); // This will throw if it's not a CIDR
          return false; // It's a CIDR, so exclude it
        } catch {
          // Not a CIDR, proceed
        }

        // Check if this host alias is a member of any globally disabled network groups
        // If it is, exclude it entirely from being manageable
        for (const networkGroup of networkGroupAliases) {
          const members = (networkGroup.rawContent || '').split('\n');
          if (members.includes(alias.name)) {
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

        // Apply user-specific permission filtering
        // Ensure alias.uuid is a string before using .includes()
        return (typeof alias.uuid === 'string' && permittedAliasUuids.includes(alias.uuid)) || permittedAliasUuids.includes('*');
      }).map(alias => {
        // Enrich with MAC and vendor information
        const ip = (typeof alias.content === 'string' && alias.content.split(/\n|\s+/).filter(entry => entry.trim() !== '')[0]) || null;
        let detectedMac: string | null = null;
        let detectedVendor: string | null = null;
        let detectedVendorSource: 'OPNsense' | 'Local DB' | null = null;
        let detectedHostname: string | null = null; // Add hostname detection

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
            detectedHostname = arpEntry.hostname || null; // Get hostname from ARP table
          }
        }

        // Determine group memberships for the current alias based on *displayable* OPNsense network groups
        const memberOfGroups = displayableNetworkGroupAliases
          .filter(networkGroupAlias => {
            const networkGroupMembers = networkGroupAlias.rawContent?.split(/\n|\s+/).filter(entry => entry.trim() !== '') || [];
            return networkGroupMembers.includes(alias.name) || (ip && networkGroupMembers.includes(ip));
          })
          .map(networkGroupAlias => {
            const groupDisplay = groupDisplayMap.get(networkGroupAlias.uuid);
            return {
              uuid: networkGroupAlias.uuid,
              name: networkGroupAlias.name,
              friendlyName: groupDisplay?.friendlyName ?? null,
              iconIdentifier: groupDisplay?.iconIdentifier ?? null,
              groupType: (groupDisplay?.groupType === 'MultiSelect' ? 'MultiSelect' : groupDisplay?.groupType === 'SingleSelect' ? 'SingleSelect' : undefined)
            };
          });

        return {
          ...alias,
          enabled: alias.enabled, // Ensure enabled is included
          detectedMac: detectedMac,
          detectedVendor: detectedVendor,
          detectedVendorSource: detectedVendorSource,
          detectedHostname: detectedHostname, // Include hostname in returned data
          isDhcpReserved: dhcpReservations.some(res => res.ip_address === ip),
          dhcpReservedMac: dhcpReservations.find(res => res.ip_address === ip)?.hw_address?.toLowerCase() || null,
          dhcpReservedVendor: dhcpReservations.find(res => res.ip_address === ip)?.hw_address ? lookupMacVendor(dhcpReservations.find(res => res.ip_address === ip)!.hw_address.toLowerCase()) : null,
          memberOfGroups: memberOfGroups,
        };
      });

      return NextResponse.json(userPermittedHostAliases);

    } catch (error) {
      logger.error("API Error fetching user devices:", error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      if (errorMessage.includes("OPNsense API credentials are not configured")) {
        return NextResponse.json({ message: "OPNsense API connection is not configured in the settings." }, { status: 503 });
      }
      return NextResponse.json({ message: `Failed to fetch user devices: ${errorMessage}` }, { status: 500 });
    }
  });
}