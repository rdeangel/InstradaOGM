import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest, authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { logAuditEvent } from '@/lib/auditLog';
import { logger } from '@/lib/logger';
import { fetchFromOpnsense, get_arpTable, exportAliases, OpnsenseAliasDetailFromExport } from '@/lib/opnsense-api';
import { Role, OpnsenseDhcpReservation, OpnsenseKeaLease, NetworkGroup } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import * as ipaddr from 'ipaddr.js';

import { userHasDeviceIpAccess, userHasDhcpAccess } from '@/lib/user-permissions';
import { checkMacRandomization, getRandomizedMacWarning } from '@/lib/mac-utils';
import { fetchUnmanagedGroupFilterData, isHostInUnmanagedGroups } from '@/lib/unmanaged-group-utils';

// Helper function to check if alias content contains an IP
function aliasContentContainsIp(content: string, ip: string): boolean {
  if (!content || !ip) return false;

  try {
    const parsedIp = ipaddr.process(ip);
    const entries = content.split(/\n|,/).map(entry => entry.trim()).filter(Boolean);

    return entries.some(entry => {
      // Direct IP match
      if (entry === ip) {
        return true;
      }

      // CIDR notation check using ipaddr.js
      if (entry.includes('/')) {
        try {
          const cidr = ipaddr.parseCIDR(entry);
          // Ensure IP versions match before attempting to match CIDR
          if (parsedIp.kind() !== cidr[0].kind()) {
            return false; // Skip this entry, continue to the next
          }
          if (parsedIp.match(cidr)) {
            return true;
          }
        } catch {
          // Invalid CIDR entry, skip
        }
      }
      return false;
    });
  } catch {
    // Handle cases where the input 'ip' itself is invalid
    return false;
  }
}

// Helper function to get IP group membership for an IP address
async function getIpGroupMembership(ipAddress: string): Promise<NetworkGroup[]> {
  try {
    const [allAliasesResponse, globallyDisabledGroups] = await Promise.all([
      exportAliases(),
      prisma.globallyDisabledGroup.findMany(),
    ]);

    if (!allAliasesResponse?.aliases?.alias) {
      throw new Error('Could not retrieve aliases from OPNsense');
    }

    const allAliasDetails: OpnsenseAliasDetailFromExport[] = Object.entries(allAliasesResponse.aliases.alias)
      .map(([uuid, detail]) => ({ ...detail, uuid }));

    const disabledUuids = new Set(globallyDisabledGroups.map(g => g.opnsenseUuid));

    // Find aliases that contain this IP address
    const hostAndNetworkAliasesContainingIp: OpnsenseAliasDetailFromExport[] = [];
    for (const alias of allAliasDetails) {
      if (alias.type !== 'networkgroup') {
        if (aliasContentContainsIp(alias.content, ipAddress)) {
          hostAndNetworkAliasesContainingIp.push(alias);
        }
      }
    }

    const memberOfGroups: NetworkGroup[] = [];
    for (const groupAlias of allAliasDetails) {
      if (groupAlias.type === 'networkgroup' && groupAlias.content) {
        const memberAliasNames = groupAlias.content.split(/\n|,/).map((name: string) => name.trim()).filter(Boolean);

        for (const memberAlias of hostAndNetworkAliasesContainingIp) {
          if (memberAliasNames.includes(memberAlias.name) && groupAlias.uuid) {
            const isDisabled = disabledUuids.has(groupAlias.uuid);
            memberOfGroups.push({
              id: groupAlias.uuid,
              uuid: groupAlias.uuid,
              name: groupAlias.name,
              friendlyName: groupAlias.name,
              type: groupAlias.type,
              enabled: !isDisabled && groupAlias.enabled === '1',
              rawContent: groupAlias.content,
              description: groupAlias.description || '',
              proto: groupAlias.proto || '',
              interface: groupAlias.interface || '',
              counters: groupAlias.counters || '',
              updatefreq: groupAlias.updatefreq || '',
              categories: groupAlias.categories || '',
              members: []
            });
            break;
          }
        }
      }
    }

    return memberOfGroups;
  } catch (error) {
    logger.error('Error getting IP group membership:', error);
    return [];
  }
}

// Define types for OPNsense API responses
interface OpnsenseApiError {
  message?: string;
  messages?: Array<{ message: string }>;
  result?: string;
  validations?: Record<string, { message: string }>;
}

interface OpnsenseSubnetResponse {
  rows: Array<{
    uuid: string;
    subnet: string;
    [key: string]: unknown;
  }>;
}

interface OpnsenseReservationResponse {
  rows: Array<OpnsenseDhcpReservation & {
    manufacturer?: string;
    [key: string]: unknown;
  }>;
}

interface OpnsenseLeaseResponse {
  rows: Array<OpnsenseKeaLease & {
    [key: string]: unknown;
  }>;
}

interface OpnsenseAddReservationResponse {
  result: string;
  uuid?: string;
  message?: string;
}

interface OpnsenseDeleteReservationResponse {
  result: string;
  message?: string;
}

// Helper to parse OPNsense API errors
const parseOpnsenseError = (errorBody: OpnsenseApiError | string): string => {
  if (typeof errorBody === 'object' && errorBody !== null) {
    if (errorBody.message) {
      return errorBody.message;
    }
    // Look for validation messages in the 'messages' array
    if (Array.isArray(errorBody.messages)) {
      const validationMessages = errorBody.messages.map((msg) => msg.message).join(', ');
      if (validationMessages) {
        return validationMessages;
      }
    }
    // Fallback for specific known error structures from the XML model
    if (errorBody.result === 'failed' && errorBody.validations) {
      const validationErrors = Object.values(errorBody.validations).map((val) => val.message).join(', ');
      if (validationErrors) {
        return validationErrors;
      }
    }
  }
  return 'An unknown error occurred on OPNsense.';
};

// GET handler for fetching DHCP subnets and searching reservations
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // All DHCP operations now require authentication for security
  return authenticateAndTrackRequest(request, async (auth) => {
    // Require authentication for all DHCP operations
    if (!auth.user) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized - DHCP operations require authentication' }), { status: 401 });
    }

    // Only allow USER, ADMIN, and SUPER_ADMIN roles
    if (!['USER', 'ADMIN', 'SUPER_ADMIN'].includes(auth.user.role)) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden - Insufficient permissions for DHCP operations' }), { status: 403 });
    }

    if (action === 'subnets') {
      // Allow authenticated users (ADMIN, SUPER_ADMIN, and USER roles) to fetch subnets
      // USER role needs this for device management DHCP reservations
      try {
        const response = await fetchFromOpnsense<OpnsenseSubnetResponse>('/api/kea/dhcpv4/search_subnet', 'GET');
        return NextResponse.json(response.rows || []);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error("Failed to fetch DHCP subnets:", error);
        return NextResponse.json({ message: parseOpnsenseError(errorMessage) || 'Failed to fetch DHCP subnets.' }, { status: 500 });
      }
    } else if (action === 'search_reservation') {
      const ipAddress = searchParams.get('ip');
      const macAddress = searchParams.get('mac');
      // Remove unused variable
      // const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'UNKNOWN_IP';

      if (!ipAddress || !macAddress) {
        return NextResponse.json({ message: 'Both IP Address and MAC Address are required for reservation lookup.' }, { status: 400 });
      }

      // Normalize MAC address to lowercase to prevent Kea DHCP crashes
      const normalizedMacAddress = macAddress.toLowerCase();

      // Determine if the user is authenticated and has an ADMIN or SUPER_ADMIN role
      const isAdminOrSuperAdmin = auth.user && (auth.user.role === Role.ADMIN || auth.user.role === Role.SUPER_ADMIN);

      // For authenticated users, allow querying for any IP, as the frontend
      // (e.g., /devices page) is responsible for ensuring the user has access to the device's IP.
      // Admin/Super_Admin roles can query any IP.
      // For USER role, the frontend will only query for devices the user is authorized to see.
      try {
        let foundReservation: (OpnsenseDhcpReservation & { manufacturer?: string }) | null = null;
        let ipConflict = false;
        let macConflict = false;
        let message = 'No matching DHCP reservation found.';

        // 1. Try to find an exact match first
        if (ipAddress && normalizedMacAddress) {
          const exactMatchResponse = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {
            searchPhrase: `${ipAddress} ${normalizedMacAddress}`,
          });
          const exactMatches = exactMatchResponse.rows || [];
          foundReservation = exactMatches.find((res) =>
            res.ip_address === ipAddress && res.hw_address.toLowerCase() === normalizedMacAddress
          ) || null;
          if (foundReservation) {
            message = 'Exact DHCP reservation found.';
          }
        }

        // 2. If no exact match, try to find by MAC only (if MAC provided)
        if (!foundReservation && normalizedMacAddress) {
          const macSearchResponse = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {
            searchPhrase: normalizedMacAddress,
          });
          const macReservations = macSearchResponse.rows || [];
          const potentialMacReservation = macReservations.find((res) =>
            res.hw_address.toLowerCase() === normalizedMacAddress
          );

          if (potentialMacReservation) {
            if (ipAddress && potentialMacReservation.ip_address !== ipAddress) {
              // MAC found, but IP doesn't match the input IP
              macConflict = true;
              message = `MAC address ${normalizedMacAddress} is already reserved for IP ${potentialMacReservation.ip_address}.`;
              foundReservation = potentialMacReservation; // Still return the found reservation
            } else {
              // MAC found, and either no IP provided or IP matches
              message = 'DHCP reservation found by MAC address.';
              foundReservation = potentialMacReservation;
            }
          }
        }

        // 3. If still no reservation found, try to find by IP only (if IP provided)
        if (!foundReservation && ipAddress) {
          const ipSearchResponse = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {
            searchPhrase: ipAddress,
          });
          const ipReservations = ipSearchResponse.rows || [];
          const potentialIpReservation = ipReservations.find((res) =>
            res.ip_address === ipAddress
          );

          if (potentialIpReservation) {
            if (normalizedMacAddress && potentialIpReservation.hw_address.toLowerCase() !== normalizedMacAddress) {
              // IP found, but MAC doesn't match the input MAC
              ipConflict = true;
              message = `IP address ${ipAddress} is already reserved for MAC ${potentialIpReservation.hw_address}.`;
              foundReservation = potentialIpReservation; // Still return the found reservation
            } else {
              // IP found, and either no MAC provided or MAC matches
              message = 'DHCP reservation found by IP address.';
              foundReservation = potentialIpReservation;
            }
          }
        }

        if (foundReservation) {
          if (isAdminOrSuperAdmin) {
            // For ADMIN and SUPER_ADMIN roles, return full reservation details
            return NextResponse.json({
              success: true,
              reservation: foundReservation,
              message: message,
              ipConflict: ipConflict,
              macConflict: macConflict,
            });
          } else {
            // For USER role, only indicate if a reservation exists
            // and include relevant details for conflicts
            return NextResponse.json({
              success: true,
              message: 'DHCP reservation status found.',
              ipConflict: ipConflict,
              macConflict: macConflict,
              dhcpReservedMac: foundReservation.hw_address || null, // Include reserved MAC
              dhcpReservedVendor: foundReservation.manufacturer || null, // Include reserved Vendor
            });
          }
        } else {
          return NextResponse.json({ success: false, message: 'No matching DHCP reservation found.' });
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error("Failed to lookup DHCP reservation:", error);
        return NextResponse.json({ message: parseOpnsenseError(errorMessage) || 'Failed to lookup DHCP reservation.' }, { status: 500 });
      }
    } else if (action === 'list_reservations') {
      if (!auth.user) { // Protect this action
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
      try {
        const response = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {}); // Empty searchPhrase to get all
        let reservations = response.rows || [];

        // For USER role, filter reservations to only show devices they have access to
        if (auth.user.role === Role.USER) {
          const filteredReservations = [];
          for (const reservation of reservations) {
            const hasAccess = await userHasDeviceIpAccess(auth.user.id, reservation.ip_address);
            if (hasAccess) {
              filteredReservations.push(reservation);
            }
          }
          reservations = filteredReservations;
        }

        // Fetch ARP table to check active status
        const arpTable = await get_arpTable();

        // Get host alias information for all reservation IPs
        const { getHostAliasesForIps } = await import('@/lib/opnsense-api');
        const ipAddresses = reservations.map(res => res.ip_address);
        const hostAliasMap = await getHostAliasesForIps(ipAddresses);

        const reservationsWithArpStatus = await Promise.all(reservations.map(async (res) => {
          const matchingArpEntry = arpTable.find(
            (entry) => entry.ip === res.ip_address && entry.mac.toLowerCase() === res.hw_address.toLowerCase()
          );

          let isActiveInArp = false;
          let activeArpIp: string | null = null;
          let activeArpMac: string | null = null;
          let hasArpConflict = false; // New flag for ARP conflict

          if (matchingArpEntry) {
            isActiveInArp = true;
          } else {
            // Check for IP conflict in ARP
            const ipConflictArpEntry = arpTable.find((entry) => entry.ip === res.ip_address);
            // Check for MAC conflict in ARP
            const macConflictArpEntry = arpTable.find((entry) => entry.mac.toLowerCase() === res.hw_address.toLowerCase());

            if (ipConflictArpEntry && macConflictArpEntry) {
              // Both IP and MAC conflict with different ARP entries
              hasArpConflict = true;
              activeArpIp = ipConflictArpEntry.ip;
              activeArpMac = macConflictArpEntry.mac; // Use the MAC from the MAC conflict entry
            } else if (ipConflictArpEntry) {
              // IP conflicts with an ARP entry, but MAC doesn't match
              if (ipConflictArpEntry.mac.toLowerCase() !== res.hw_address.toLowerCase()) {
                hasArpConflict = true;
                activeArpIp = ipConflictArpEntry.ip;
                activeArpMac = ipConflictArpEntry.mac;
              }
            } else if (macConflictArpEntry) {
              // MAC conflicts with an ARP entry, but IP doesn't match
              if (macConflictArpEntry.ip !== res.ip_address) {
                hasArpConflict = true;
                activeArpIp = macConflictArpEntry.ip;
                activeArpMac = macConflictArpEntry.mac;
              }
            }
          }

          // Get actual hostname from ARP table
          let actualHostname: string | null = null;
          if (matchingArpEntry && matchingArpEntry.hostname) {
            actualHostname = matchingArpEntry.hostname;
          }

          // Get host alias conflict information
          const hostAliasInfo = hostAliasMap.get(res.ip_address);
          let hostAlias: string | null = null;
          let hostAliasConflict = false;

          if (hostAliasInfo && hostAliasInfo.aliases.length > 0) {
            if (hostAliasInfo.hasConflict) {
              hostAliasConflict = true;
            } else {
              hostAlias = hostAliasInfo.aliases[0];
            }
          }

          return {
            ...res,
            isActiveInArp,
            activeArpIp,
            activeArpMac,
            hasArpConflict, // Include the new conflict flag
            actualHostname,
            hostAlias,
            hostAliasConflict,
          };
        }));

        return NextResponse.json({ success: true, reservations: reservationsWithArpStatus });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error("Failed to fetch all DHCP reservations:", error);
        return NextResponse.json({ success: false, message: parseOpnsenseError(errorMessage) || 'Failed to fetch all DHCP reservations.' }, { status: 500 });
      }
    } else if (action === 'arp_entries') { // Renamed action for clarity
      if (!auth.user) { // Protect this action
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
      try {
        let arpEntries = await get_arpTable();
        const allReservationsResponse = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {});
        const allReservations = allReservationsResponse.rows || [];

        // For USER role, filter ARP entries to only show devices they have access to
        if (auth.user.role === Role.USER) {
          const filteredArpEntries = [];
          for (const entry of arpEntries) {
            const hasAccess = await userHasDeviceIpAccess(auth.user.id, entry.ip);
            if (hasAccess) {
              filteredArpEntries.push(entry);
            }
          }
          arpEntries = filteredArpEntries;
        }

        // Get host alias information for all IPs
        const { getHostAliasesForIps } = await import('@/lib/opnsense-api');
        const ipAddresses = arpEntries.map(entry => entry.ip);
        const hostAliasMap = await getHostAliasesForIps(ipAddresses);

        const leases = arpEntries.map((entry) => {
          let isDhcpReserved = false;
          let dhcpReservedIp: string | null = null;
          let dhcpReservedMac: string | null = null;
          let dhcpReservedHostname: string | null = null;
          let hasDhcpConflict = false; // New flag for DHCP conflict

          const matchingReservation = allReservations.find(
            (res) => res.ip_address === entry.ip && res.hw_address.toLowerCase() === entry.mac.toLowerCase()
          );

          if (matchingReservation) {
            isDhcpReserved = true;
            dhcpReservedHostname = matchingReservation.hostname || null;
          } else {
            // Check for IP conflict in DHCP reservations
            const ipConflictReservation = allReservations.find((res) => res.ip_address === entry.ip);
            if (ipConflictReservation) {
              dhcpReservedIp = ipConflictReservation.ip_address;
              dhcpReservedMac = ipConflictReservation.hw_address;
              dhcpReservedHostname = ipConflictReservation.hostname || null;
              hasDhcpConflict = true; // Set conflict flag
            }
            // Check for MAC conflict in DHCP reservations
            const macConflictReservation = allReservations.find((res) => res.hw_address.toLowerCase() === entry.mac.toLowerCase());
            if (macConflictReservation) {
              dhcpReservedIp = macConflictReservation.ip_address;
              dhcpReservedMac = macConflictReservation.hw_address;
              dhcpReservedHostname = macConflictReservation.hostname || null;
              hasDhcpConflict = true; // Set conflict flag
            }
          }

          // Get host alias information
          const hostAliasInfo = hostAliasMap.get(entry.ip);
          let hostAlias: string | null = null;
          let hostAliasConflict = false;

          if (hostAliasInfo && hostAliasInfo.aliases.length > 0) {
            if (hostAliasInfo.hasConflict) {
              hostAliasConflict = true;
            } else {
              hostAlias = hostAliasInfo.aliases[0];
            }
          }

          return {
            ip: entry.ip,
            mac: entry.mac,
            hostname: entry.hostname || '',
            description: `ARP Entry - ${entry.intf_description || entry.intf || 'Unknown Interface'}`,
            isDhcpReserved,
            dhcpReservedIp,
            dhcpReservedMac,
            dhcpReservedHostname,
            hasDhcpConflict, // Include the new conflict flag
            hostAlias,
            hostAliasConflict,
            type: entry.type || 'dynamic',
            starts: 'N/A',
            ends: 'N/A',
            intf: entry.intf,
            expired: entry.expired,
            expires: entry.expires,
            permanent: entry.permanent,
            manufacturer: entry.manufacturer,
            intf_description: entry.intf_description,
          };
        });
        return NextResponse.json({ success: true, leases });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error("Failed to fetch ARP entries:", error);
        return NextResponse.json({ success: false, message: parseOpnsenseError(errorMessage) || 'Failed to fetch ARP entries.' }, { status: 500 });
      }
    } else if (action === 'kea_leases') {
      if (!auth.user) { // Protect this action
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
      try {
        const response = await fetchFromOpnsense<OpnsenseLeaseResponse>('/api/kea/leases4/search', 'GET');
        let rawLeases = response.rows || [];

        // For USER role, filter leases to only show devices they have access to
        if (auth.user.role === Role.USER) {
          const filteredLeases = [];
          for (const lease of rawLeases) {
            if (lease.address) {
              const hasAccess = await userHasDeviceIpAccess(auth.user.id, lease.address);
              if (hasAccess) {
                filteredLeases.push(lease);
              }
            }
          }
          rawLeases = filteredLeases;
        }

        // Get DHCP reservations to enrich lease data
        const allReservationsResponse = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {});
        const allReservations = allReservationsResponse.rows || [];

        // Get ARP table to check active status
        const arpTable = await get_arpTable();

        // Get host alias information for all lease IPs
        const { getHostAliasesForIps } = await import('@/lib/opnsense-api');
        const ipAddresses = rawLeases.map(lease => lease.address).filter(Boolean);
        const hostAliasMap = await getHostAliasesForIps(ipAddresses);

        const leases = rawLeases.map((lease) => {
          // Get host alias information
          const hostAliasInfo = hostAliasMap.get(lease.address);
          let hostAlias: string | null = null;
          let hostAliasConflict = false;

          if (hostAliasInfo && hostAliasInfo.aliases.length > 0) {
            if (hostAliasInfo.hasConflict) {
              hostAliasConflict = true;
            } else {
              hostAlias = hostAliasInfo.aliases[0];
            }
          }

          // Get DHCP reservation information
          let isDhcpReserved = false;
          let dhcpReservedIp: string | null = null;
          let dhcpReservedMac: string | null = null;
          let dhcpReservedHostname: string | null = null;
          let hasDhcpConflict = false;

          // Find exact match reservation (same IP and MAC)
          const exactMatchReservation = allReservations.find(res =>
            res.ip_address === lease.address && res.hw_address.toLowerCase() === lease.hwaddr.toLowerCase()
          );

          if (exactMatchReservation) {
            isDhcpReserved = true;
            dhcpReservedHostname = exactMatchReservation.hostname || null;
          } else {
            // Check for IP conflict in DHCP reservations
            const ipConflictReservation = allReservations.find((res) => res.ip_address === lease.address);
            if (ipConflictReservation) {
              dhcpReservedIp = ipConflictReservation.ip_address;
              dhcpReservedMac = ipConflictReservation.hw_address;
              dhcpReservedHostname = ipConflictReservation.hostname || null;
              hasDhcpConflict = true;
            }
            // Check for MAC conflict in DHCP reservations (only if no IP conflict found)
            if (!ipConflictReservation) {
              const macConflictReservation = allReservations.find((res) => res.hw_address.toLowerCase() === lease.hwaddr.toLowerCase());
              if (macConflictReservation) {
                dhcpReservedIp = macConflictReservation.ip_address;
                dhcpReservedMac = macConflictReservation.hw_address;
                dhcpReservedHostname = macConflictReservation.hostname || null;
                hasDhcpConflict = true;
              }
            }
          }

          // Get ARP status information
          const matchingArpEntry = arpTable.find(
            (entry) => entry.ip === lease.address && entry.mac.toLowerCase() === lease.hwaddr.toLowerCase()
          );

          let isActiveInArp = false;
          let activeArpIp: string | null = null;
          let activeArpMac: string | null = null;
          let hasArpConflict = false;

          if (matchingArpEntry) {
            isActiveInArp = true;
          } else {
            // Check for conflicts - IP or MAC exists but not matching
            const ipConflictArp = arpTable.find((entry) => entry.ip === lease.address);
            const macConflictArp = arpTable.find((entry) => entry.mac.toLowerCase() === lease.hwaddr.toLowerCase());

            if (ipConflictArp || macConflictArp) {
              hasArpConflict = true;
              activeArpIp = ipConflictArp?.ip || macConflictArp?.ip || null;
              activeArpMac = ipConflictArp?.mac || macConflictArp?.mac || null;
            }
          }

          return {
            address: lease.address || '', // Add null check
            hwaddr: lease.hwaddr || '',   // Add null check
            hostname: lease.hostname || '',
            description: lease.if_descr || '',
            type: lease.state === '0' ? 'active' : 'expired',
            starts: 'N/A',
            ends: lease.expire ? new Date(parseInt(lease.expire) * 1000).toLocaleString() : 'N/A',
            if: lease.if,
            client_id: lease.client_id,
            valid_lifetime: lease.valid_lifetime,
            subnet_id: lease.subnet_id,
            fqdn_fwd: lease.fqdn_fwd,
            fqdn_rev: lease.fqdn_rev,
            state: lease.state,
            user_context: lease.user_context,
            pool_id: lease.pool_id,
            if_descr: lease.if_descr,
            if_name: lease.if_name,
            mac_info: lease.mac_info,
            hostAlias,
            hostAliasConflict,
            isDhcpReserved,
            dhcpReservedIp,
            dhcpReservedMac,
            dhcpReservedHostname,
            hasDhcpConflict,
            isActiveInArp,
            activeArpIp,
            activeArpMac,
            hasArpConflict,
          };
        });
        return NextResponse.json({ success: true, leases });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error("Failed to fetch Kea DHCP leases:", error);
        return NextResponse.json({ success: false, message: parseOpnsenseError(errorMessage) || 'Failed to fetch Kea DHCP leases.' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ message: 'Invalid action specified.' }, { status: 400 });
    }
  });
}

// POST handler for adding/deleting DHCP reservations
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // All DHCP reservation operations now require authentication for security
  const auth = await authenticateRequest(request);
  const authError = handleAuthResponse(auth);
  if (authError) {
    return authError;
  }

  // Require authentication for all DHCP operations
  if (!auth.user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized - DHCP operations require authentication' }), { status: 401 });
  }

  // Only allow USER, ADMIN, and SUPER_ADMIN roles
  if (!['USER', 'ADMIN', 'SUPER_ADMIN'].includes(auth.user.role)) {
    return new NextResponse(JSON.stringify({ error: 'Forbidden - Insufficient permissions for DHCP operations' }), { status: 403 });
  }

  const userId = auth.user?.id || null;
  // Extract client IP using standardized helper
  const { getClientIp } = await import('@/lib/network-utils');
  const rawClientIp = getClientIp(request);
  const ipAddressReq = rawClientIp?.startsWith('::ffff:') ? rawClientIp.substring(7) : (rawClientIp || 'N/A');

  const userAgent = request.headers.get('user-agent') || 'N/A';

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  const requestBody = await request.json();
  const { payload, reservationUuid } = requestBody; // Remove unused reservationDetails
  // Note: action is already parsed from URL searchParams above

  // Helper to extract and format reservation details for logging
  const getReservationLogDetails = (reservation: OpnsenseDhcpReservation, additionalProps: Record<string, unknown> = {}) => ({
    uuid: reservation.uuid || 'N/A',
    ip_address: reservation.ip_address || 'N/A',
    hw_address: reservation.hw_address || 'N/A',
    hostname: reservation.hostname || 'N/A',
    description: reservation.description || 'N/A',
    ...additionalProps,
  });

  if (action === 'add_reservation') {
    if (!payload || !payload.subnet || !payload.ip_address || !payload.hw_address) {
      return NextResponse.json({ message: 'Missing required fields for adding reservation.' }, { status: 400 });
    }

    // Validate MAC address format
    // This regex is safe - it has bounded quantifiers and no backtracking issues
    // eslint-disable-next-line security/detect-unsafe-regex
    const macRegex = /^([0-9a-f]{2}:){5}([0-9a-f]{2})$/i;
    if (!macRegex.test(payload.hw_address)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid MAC address format. MAC address must be in the format a1:b2:c3:d4:e5:f6.'
      }, { status: 400 });
    }

    // Normalize MAC address to lowercase to prevent Kea DHCP crashes
    const normalizedPayload = {
      ...payload,
      hw_address: payload.hw_address.toLowerCase()
    };

    // Check for MAC address randomization/privacy features
    const macRandomizationCheck = checkMacRandomization(normalizedPayload.hw_address);
    logger.debug(`MAC randomization check for ${normalizedPayload.hw_address}:`, macRandomizationCheck);

    // All DHCP reservation operations now require authentication

    // For authenticated USER role, validate DHCP access permissions
    if (auth.user && auth.user.role === Role.USER) {
      const hasDhcpAccess = await userHasDhcpAccess(auth.user.id, normalizedPayload.ip_address, ipAddressReq);
      if (!hasDhcpAccess) {
        await logAuditEvent({
          action: 'DHCP_RESERVATION_ADD_FAILURE',
          userId,
          ipAddress: ipAddressReq,
          userAgent,
          reason: 'USER role DHCP reservation denied: No permission for this IP address',
          details: { ...normalizedPayload, userRole: auth.user.role, userIpAddress: ipAddressReq },
        });
        return NextResponse.json({
          success: false,
          message: 'You do not have permission to create DHCP reservations for this IP address. The IP must be within your permitted network ranges, or you must be accessing from the same IP address.'
        }, { status: 403 });
      }
    }

    // Check if this is a self-service operation and if the host is in unmanaged groups
    // Self-service operations are typically performed by non-admin users
    if (auth.user && (auth.user.role !== Role.SUPER_ADMIN && auth.user.role !== Role.ADMIN)) {
      try {
        // Get current group memberships for the IP address
        const currentGroups = await getIpGroupMembership(normalizedPayload.ip_address);

        // Fetch filter data
        const filterData = await fetchUnmanagedGroupFilterData(auth.user);

        // Check if host is in unmanaged groups
        const unmanagedResult = await isHostInUnmanagedGroups(
          currentGroups,
          filterData.globalFilters,
          filterData.globallyDisabledGroups,
          auth.user,
          filterData.userSpecificFilters
        );

        if (unmanagedResult.isUnmanaged) {
          logger.warn(`Self-service DHCP reservation creation rejected: IP ${normalizedPayload.ip_address} is in unmanaged groups`);

          await logAuditEvent({
            action: 'DHCP_RESERVATION_ADD_FAILURE',
            userId,
            ipAddress: ipAddressReq,
            userAgent,
            reason: unmanagedResult.message,
            details: {
              ...normalizedPayload,
              validationFailure: 'UNMANAGED_GROUP',
              unmanagedGroups: unmanagedResult.unmanagedGroups.map(g => ({
                id: g.id,
                name: g.name,
                friendlyName: g.friendlyName
              }))
            },
          });

          return NextResponse.json({
            success: false,
            message: `Self-service is restricted: ${unmanagedResult.message}`
          }, { status: 403 });
        }
      } catch (error) {
        logger.error('Error checking unmanaged group status for DHCP reservation:', error);
        // Continue with operation if check fails (fail open)
      }
    }

    await logAuditEvent({
      action: 'DHCP_RESERVATION_ADD_ATTEMPT',
      userId,
      ipAddress: ipAddressReq,
      userAgent,
      details: normalizedPayload,
    });
    try {
      // Fetch ARP table to check for conflicts
      const arpTable = await get_arpTable();

      // Check for IP conflict in ARP table (IP already in use by different MAC)
      const conflictingIpArpEntry = arpTable.find(
        (entry) =>
          entry.ip === normalizedPayload.ip_address &&
          entry.mac.toLowerCase() !== normalizedPayload.hw_address
      );

      if (conflictingIpArpEntry) {
        const errorMessage = `IP address ${normalizedPayload.ip_address} is currently in use by MAC address ${conflictingIpArpEntry.mac} in the ARP table. Cannot reserve for a different MAC.`;
        await logAuditEvent({
          action: 'DHCP_RESERVATION_ADD_FAILURE',
          userId,
          ipAddress: ipAddressReq,
          userAgent,
          reason: errorMessage,
          details: { ...normalizedPayload, conflict_details: conflictingIpArpEntry },
        });
        return NextResponse.json({ success: false, message: errorMessage }, { status: 409 }); // 409 Conflict
      }

      // Check for MAC conflict in ARP table (MAC already in use by different IP)
      const conflictingMacArpEntry = arpTable.find(
        (entry) =>
          entry.mac.toLowerCase() === normalizedPayload.hw_address &&
          entry.ip !== normalizedPayload.ip_address
      );

      if (conflictingMacArpEntry) {
        const errorMessage = `MAC address ${normalizedPayload.hw_address} is currently in use by IP address ${conflictingMacArpEntry.ip} in the ARP table. Cannot reserve the same MAC for a different IP.`;
        await logAuditEvent({
          action: 'DHCP_RESERVATION_ADD_FAILURE',
          userId,
          ipAddress: ipAddressReq,
          userAgent,
          reason: errorMessage,
          details: { ...normalizedPayload, conflict_details: conflictingMacArpEntry },
        });
        return NextResponse.json({ success: false, message: errorMessage }, { status: 409 }); // 409 Conflict
      }

      // Check if MAC address already exists in DHCP reservations (regardless of IP)
      try {
        const allReservationsResponse = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {});
        const allReservations = allReservationsResponse.rows || [];
        const existingMacReservation = allReservations.find(
          (res) => res.hw_address.toLowerCase() === normalizedPayload.hw_address
        );

        if (existingMacReservation) {
          // Check if this is the same IP/MAC combination (not a conflict, just a duplicate)
          if (existingMacReservation.ip_address === normalizedPayload.ip_address) {
            // Same IP and MAC - this is not a conflict, just a duplicate reservation attempt
            // We can either update the existing reservation or return success
            logger.debug(`DHCP reservation already exists for IP ${normalizedPayload.ip_address} and MAC ${normalizedPayload.hw_address}. Treating as success.`);

            await logAuditEvent({
              action: 'DHCP_RESERVATION_ADD_SUCCESS',
              userId,
              ipAddress: ipAddressReq,
              userAgent,
              details: {
                ...normalizedPayload,
                note: 'Reservation already exists with same IP/MAC combination',
                existing_reservation: {
                  uuid: existingMacReservation.uuid,
                  ip_address: existingMacReservation.ip_address,
                  hw_address: existingMacReservation.hw_address,
                  hostname: existingMacReservation.hostname,
                  description: existingMacReservation.description
                }
              },
            });

            return NextResponse.json({
              success: true,
              message: 'DHCP reservation already exists for this IP/MAC combination.',
              uuid: existingMacReservation.uuid,
              note: 'existing_reservation'
            });
          } else {
            // Different IP - this is a real conflict
            const errorMessage = `MAC address ${normalizedPayload.hw_address} is already reserved for IP ${existingMacReservation.ip_address}. Cannot reserve the same MAC address for multiple IPs.`;
            await logAuditEvent({
              action: 'DHCP_RESERVATION_ADD_FAILURE',
              userId,
              ipAddress: ipAddressReq,
              userAgent,
              reason: errorMessage,
              details: {
                ...normalizedPayload,
                existing_reservation: {
                  uuid: existingMacReservation.uuid,
                  ip_address: existingMacReservation.ip_address,
                  hw_address: existingMacReservation.hw_address,
                  hostname: existingMacReservation.hostname,
                  description: existingMacReservation.description
                }
              },
            });
            return NextResponse.json({ success: false, message: errorMessage }, { status: 409 }); // 409 Conflict
          }
        }
      } catch (macCheckError) {
        logger.warn("Failed to check for existing MAC address reservations, proceeding with add:", macCheckError);
        // Continue with the add operation even if we can't check for duplicates
        // This prevents blocking legitimate adds due to temporary API issues
      }

      const response = await fetchFromOpnsense<OpnsenseAddReservationResponse>('/api/kea/dhcpv4/add_reservation', 'POST', { reservation: normalizedPayload });
      if (response.result === 'saved') {
        await logAuditEvent({
          action: 'DHCP_RESERVATION_ADD_SUCCESS',
          userId,
          ipAddress: ipAddressReq,
          userAgent,
          details: {
            ...normalizedPayload,
            opnsense_response: response.message,
            uuid: response.uuid,
            mac_randomization_check: macRandomizationCheck
          },
        });

        // Prepare response with MAC randomization warning if applicable
        const responseData: {
          success: boolean;
          message: string;
          uuid: string;
          macRandomizationWarning?: {
            isRandomized: boolean;
            explanation: string;
            confidence: string;
            warningMessage: string;
          };
        } = {
          success: true,
          message: 'DHCP reservation added successfully.',
          uuid: response.uuid || ''
        };

        if (macRandomizationCheck.isRandomized) {
          responseData.macRandomizationWarning = {
            isRandomized: true,
            explanation: macRandomizationCheck.explanation,
            confidence: macRandomizationCheck.confidence,
            warningMessage: getRandomizedMacWarning(normalizedPayload.hw_address)
          };
        }

        return NextResponse.json(responseData);
      } else {
        const errorMessage = parseOpnsenseError(response) || 'Failed to add DHCP reservation.';
        await logAuditEvent({
          action: 'DHCP_RESERVATION_ADD_FAILURE',
          userId,
          ipAddress: ipAddressReq,
          userAgent,
          reason: errorMessage,
          details: { ...normalizedPayload, opnsense_response: response.message },
        });
        return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error("Failed to add DHCP reservation:", error);
      const parsedErrorMessage = parseOpnsenseError(errorMessage) || 'Failed to add DHCP reservation.';
      await logAuditEvent({
        action: 'DHCP_RESERVATION_ADD_ERROR',
        userId,
        ipAddress: ipAddressReq,
        userAgent,
        reason: parsedErrorMessage,
        details: { ...normalizedPayload, error_details: errorMessage },
      });
      return NextResponse.json({ success: false, message: parsedErrorMessage }, { status: 500 });
    }
  } else if (action === 'del_reservation') {
    // Delete operations always require authentication
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!reservationUuid) {
      return NextResponse.json({ message: 'Reservation UUID is required for deletion.' }, { status: 400 });
    }

    // Attempt to fetch all reservations to get full details before deletion
    let reservationToDeleteDetails: OpnsenseDhcpReservation = { uuid: reservationUuid, subnet: '', ip_address: '', hw_address: '' };
    try {
      const allReservationsResponse = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {}); // Fetch all
      const allReservations = allReservationsResponse.rows || [];
      const foundReservation = allReservations.find((res) => res.uuid === reservationUuid);
      if (foundReservation) {
        reservationToDeleteDetails = foundReservation;
      }
    } catch (searchError) {
      logger.warn(`Could not fetch full details for reservation ${reservationUuid} before deletion:`, searchError);
    }

    await logAuditEvent({
      action: 'DHCP_RESERVATION_DELETE_ATTEMPT',
      userId,
      ipAddress: ipAddressReq,
      userAgent,
      details: getReservationLogDetails(reservationToDeleteDetails),
    });
    try {
      const response = await fetchFromOpnsense<OpnsenseDeleteReservationResponse>(`/api/kea/dhcpv4/del_reservation/${reservationUuid}`, 'POST', {});
      if (response.result === 'deleted') {
        await logAuditEvent({
          action: 'DHCP_RESERVATION_DELETE_SUCCESS',
          userId,
          ipAddress: ipAddressReq,
          userAgent,
          details: getReservationLogDetails(reservationToDeleteDetails, { opnsense_response: response.message }),
        });
        return NextResponse.json({ success: true, message: 'DHCP reservation deleted successfully.' });
      } else {
        const errorMessage = parseOpnsenseError(response) || 'Failed to delete DHCP reservation.';
        await logAuditEvent({
          action: 'DHCP_RESERVATION_DELETE_FAILURE',
          userId,
          ipAddress: ipAddressReq,
          userAgent,
          reason: errorMessage,
          details: getReservationLogDetails(reservationToDeleteDetails, { opnsense_response: response.message }),
        });
        return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error("Failed to delete DHCP reservation:", error);
      const parsedErrorMessage = parseOpnsenseError(errorMessage) || 'Failed to delete DHCP reservation.';
      await logAuditEvent({
        action: 'DHCP_RESERVATION_DELETE_ERROR',
        userId,
        ipAddress: ipAddressReq,
        userAgent,
        reason: parsedErrorMessage,
        details: getReservationLogDetails(reservationToDeleteDetails, { error_details: errorMessage }),
      });
      return NextResponse.json({ success: false, message: parsedErrorMessage }, { status: 500 });
    }
  } else if (action === 'del_reservations_bulk') {
    // Bulk delete operations always require authentication
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reservationUuids } = requestBody;
    if (!Array.isArray(reservationUuids) || reservationUuids.length === 0) {
      return NextResponse.json({ success: false, message: 'An array of reservation UUIDs is required for bulk deletion.' }, { status: 400 });
    }

    // Fetch all reservation details for bulk deletion before attempting deletions
    let allReservationsDetails: OpnsenseDhcpReservation[] = [];
    try {
      const allReservationsResponse = await fetchFromOpnsense<OpnsenseReservationResponse>('/api/kea/dhcpv4/search_reservation', 'POST', {}); // Fetch all
      allReservationsDetails = allReservationsResponse.rows || [];
    } catch (searchError) {
      logger.warn("Could not fetch details for some reservations during bulk deletion attempt:", searchError);
    }

    await logAuditEvent({
      action: 'DHCP_RESERVATIONS_BULK_DELETE_ATTEMPT',
      userId,
      ipAddress: ipAddressReq,
      userAgent,
      details: { reservationUuids, bulk_details_fetched: allReservationsDetails.length > 0 },
    });

    try {
      let allSuccess = true;
      const failedUuids: string[] = []; // Change to const
      for (const uuid of reservationUuids) {
        const currentReservationDetails = allReservationsDetails.find((d) => d.uuid === uuid) || { uuid, subnet: '', ip_address: '', hw_address: '' };

        try {
          const response = await fetchFromOpnsense<OpnsenseDeleteReservationResponse>(`/api/kea/dhcpv4/del_reservation/${uuid}`, 'POST', {});
          if (response.result === 'deleted') {
            await logAuditEvent({
              action: 'DHCP_RESERVATION_DELETE_SUCCESS',
              userId,
              ipAddress: ipAddressReq,
              userAgent,
              details: getReservationLogDetails(currentReservationDetails, { opnsense_response: response.message, bulk_operation: true }),
            });
          } else {
            allSuccess = false;
            failedUuids.push(uuid);
            const errorMessage = parseOpnsenseError(response) || `Failed to delete reservation ${uuid}.`;
            logger.error(`Failed to delete reservation ${uuid}:`, response);
            await logAuditEvent({
              action: 'DHCP_RESERVATION_DELETE_FAILURE',
              userId,
              ipAddress: ipAddressReq,
              userAgent,
              reason: errorMessage,
              details: getReservationLogDetails(currentReservationDetails, { opnsense_response: response.message, bulk_operation: true }),
            });
          }
        } catch (error) {
          allSuccess = false;
          failedUuids.push(uuid);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const parsedErrorMessage = parseOpnsenseError(errorMessage) || `Error deleting reservation ${uuid}.`;
          logger.error(`Error deleting reservation ${uuid}:`, error);
          await logAuditEvent({
            action: 'DHCP_RESERVATION_DELETE_ERROR',
            userId,
            ipAddress: ipAddressReq,
            userAgent,
            reason: parsedErrorMessage,
            details: getReservationLogDetails(currentReservationDetails, { error_details: errorMessage, bulk_operation: true }),
          });
        }
      }

      if (allSuccess) {
        return NextResponse.json({ success: true, message: 'Selected DHCP reservations deleted successfully.' });
      } else {
        return NextResponse.json({ success: false, message: `Failed to delete some DHCP reservations. Failed UUIDs: ${failedUuids.join(', ')}` }, { status: 500 });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error("Failed to bulk delete DHCP reservations:", error);
      return NextResponse.json({ success: false, message: parseOpnsenseError(errorMessage) || 'Failed to bulk delete DHCP reservations.' }, { status: 500 });
    }
  } else {
    // Track usage for authenticated requests (invalid action)
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 400);
    }
    return NextResponse.json({ message: 'Invalid action specified.' }, { status: 400 });
  }

  // Track usage for authenticated requests (successful operations)
  if (auth && auth.user) {
    await trackUsageByAuthMethod(request, auth, 200);
  }
}