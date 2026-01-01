import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import { fetchFromOpnsense, getHostAliases, get_arpTable, exportAliases, getAliasTableSize } from '@/lib/opnsense-api';
import { logger } from '@/lib/logger';
import path from 'path';
import { promises as fs } from 'fs';
import { getDataPath } from '@/lib/server/data-paths';
import { toJsonArrayOrUndefined } from '@/lib/utils';
import { ValidLocalNetwork } from '@/types/settings';

type KeaDhcpv4ReservationRow = object;
interface KeaLeases4Row { state: string; }
interface OpenVpnSessionApiRow { description: string; bytes_received: string; bytes_sent: string; }
interface WireguardClientApiRow { name: string; }
interface WireguardPeerApiRow { type: string; name: string; 'transfer-rx'?: string; 'transfer-tx'?: string; }
interface IpsecConnectionApiRow { name: string; 'bytes-in'?: string; 'bytes-out'?: string; }

interface KeaDhcpv4ReservationResponse { rows: KeaDhcpv4ReservationRow[]; }
interface KeaLeases4Response { rows: KeaLeases4Row[]; }
interface OpenVpnSessionApiRowsResponse { rows: OpenVpnSessionApiRow[]; }
interface WireguardClientApiRowsResponse { rows: WireguardClientApiRow[]; }
interface WireguardServiceApiRowsResponse { rows: WireguardPeerApiRow[]; }
interface IpsecConnectionApiRowsResponse { rows: IpsecConnectionApiRow[]; }

interface VpnStatus {
  id: string;
  name?: string;
  status: string;
  type?: unknown;
  enabled?: string;
  opnsenseNetworkGroupId?: string;
  vpnName?: string | null;
  friendlyName?: string | null;
  networkGroupFriendlyName?: string | null;
  details?: Record<string, unknown>;
}

// Host Alias related interfaces - matches OpnsenseAliasDetailFromExport structure
interface HostAlias {
  uuid: string;
  name: string;
  content: string;
  description: string;
  enabled: string;
  type: string;
  proto: string;
  interface: string;
  counters: string;
  updatefreq: string;
  categories: string;
  detectedMac?: string | null;
  detectedVendor?: string | null;
}

interface NetworkGroup {
  uuid: string;
  name: string;
  friendlyName?: string;
  iconIdentifier?: string;
}

interface EnrichedHostAlias extends HostAlias {
  memberOfGroups: NetworkGroup[];
  category?: 'managed' | 'unmanaged';
}

interface OpnsenseAlias {
  type: string;
  name: string;
  content: string;
  description?: string;
  enabled: string;
  uuid: string;
}



export async function GET(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {

      // 1. Enabled global options & 2. List of Allowed Networks
      const globalSettings = await prisma.globalSettings.findFirst();

      // 3. List of Device Filters (Global Filters)
      const globalGroupFilters = await prisma.groupFilterSetting.findMany();

      // 4. Number of Backups in the last week and last backup date and file name
      const backupsDirectory = getDataPath('backups');

      let backupsLastWeek = 0;
      let backupsLastMonth = 0;
      let backupsLast3Months = 0;
      let lastBackup = null;

      try {
        // Path is validated by getDataPath() utility
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const files = await fs.readdir(backupsDirectory);
        const backupFiles: string[] = files.filter((file: string) => file.endsWith('.aes'));

        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        for (const file of backupFiles) {
          const filePath = path.join(backupsDirectory, file);
          // Path is constructed from backupsDirectory and readdir results
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          const stats = await fs.stat(filePath);
          const fileDate = new Date(stats.mtime);

          if (fileDate >= oneWeekAgo) backupsLastWeek++;
          if (fileDate >= oneMonthAgo) backupsLastMonth++;
          if (fileDate >= threeMonthsAgo) backupsLast3Months++;

          if (!lastBackup || fileDate > lastBackup.date) {
            lastBackup = { name: file, date: fileDate };
          }
        }
      } catch (error) {
        logger.error('Error reading backup directory:', error);
      }

      // 5. Number of Users (Local and SSO)
      const totalUsers = await prisma.user.count();
      const localUsers = await prisma.user.count({
        where: {
          accounts: {
            none: {}
          }
        }
      });
      const ssoUsers = await prisma.user.count({
        where: {
          accounts: {
            some: {}
          }
        }
      });

      // 6. Get Groups with detailed information
      const groups = await prisma.group.findMany({
        include: {
          users: true,
          ssoMappings: true,
          hostAliasPermissions: true,
          groupSpecificFilters: true,
        }
      });

      // 7. Get SSO Group Mappings with details
      const ssoGroupMappings = await prisma.ssoGroupMapping.findMany({
        include: {
          localGroup: true,
        }
      });

      // 7.1. Get provider display names for resolving SSO provider IDs to display names
      const { loadOidcProviders } = await import('@/lib/auth-config');
      const oidcProviders = loadOidcProviders();
      const providerDisplayNames = oidcProviders.reduce((acc, provider) => {
        acc[provider.id.toLowerCase()] = provider.name; // provider.name comes from AUTH_OIDC_PROVIDER_${alias}_DISPLAY_NAME
        return acc;
      }, {} as Record<string, string>);

      // 8. Get VPN Mappings with details
      const vpnMappings = await prisma.vpnMapping.findMany({
        include: {
          opnsenseNetworkGroup: true,
        }
      });

      // 9. Get Network Groups from raw OPNsense data (like NetworkDisplayMappingsTab)
      let networkGroups: { name: string; uuid: string; memberCount: number; description: string; friendlyName: string; isGloballyDisabled: boolean; }[] = [];
      try {
        // Get raw OPNsense data with correct member counts
        const [exportedAliasesResponse, aliasSizesResponse, opnsenseGroupDisplays, globallyDisabledGroups] = await Promise.all([
          exportAliases(),
          getAliasTableSize(),
          prisma.opnsenseGroupDisplay.findMany({ orderBy: { friendlyName: 'asc' } }),
          prisma.globallyDisabledGroup.findMany({ orderBy: { opnsenseUuid: 'asc' } }),
        ]);

        const aliases = exportedAliasesResponse.aliases.alias;
        const aliasSizes = aliasSizesResponse.details;
        const globallyDisabledUuids = new Set(globallyDisabledGroups.map(g => g.opnsenseUuid.toLowerCase()));

        // Create a map for quick lookup of group display details by opnsenseUuid
        const groupDisplayMap = new Map(opnsenseGroupDisplays.map(display => [display.opnsenseUuid.toLowerCase(), display]));

        // Process all network groups from raw OPNsense data
        networkGroups = Object.keys(aliases)
          // eslint-disable-next-line security/detect-object-injection
          .filter(uuid => aliases[uuid].type === 'networkgroup')
          .map(uuid => {
            // uuid is from Object.keys of aliases
            // eslint-disable-next-line security/detect-object-injection
            const aliasDetail = aliases[uuid];

            const sizeDetail = aliasSizes[aliasDetail.name];
            const displayMapping = groupDisplayMap.get(uuid.toLowerCase());
            const isGloballyDisabled = globallyDisabledUuids.has(uuid.toLowerCase());

            return {
              name: aliasDetail.name,
              uuid: uuid,
              memberCount: sizeDetail?.count || 0,
              description: aliasDetail.description || '',
              friendlyName: displayMapping?.friendlyName || '',
              isGloballyDisabled: isGloballyDisabled,
            };
          });

        logger.info(`Network groups processed: ${networkGroups.length} total groups`);
        logger.info(`Globally disabled groups: ${globallyDisabledGroups.length}`);
        logger.info(`Sample network group:`, networkGroups[0]);
      } catch (error) {
        logger.error('Error fetching network groups:', error);
        logger.error('Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : 'Unknown'
        });
      }

      // 10. Get DHCP and ARP information using direct OPNsense API calls
      let dhcpReservations = 0;
      let dhcpLeases = 0;
      let arpEntries = 0;
      let activeDevicesWithDhcpReservedCount = 0;

      try {
        let reservationsData: KeaDhcpv4ReservationRow[] = [];
        let arpTable: { ip: string; mac: string; hostname?: string }[] = [];

        // Get DHCP reservations using direct OPNsense API
        try {
          const reservationsResponse = await fetchFromOpnsense('/api/kea/dhcpv4/search_reservation', 'POST', {}) as KeaDhcpv4ReservationResponse;
          if (reservationsResponse && reservationsResponse.rows) {
            reservationsData = reservationsResponse.rows;
            dhcpReservations = reservationsData.length;
          }
        } catch (error) {
          logger.error('Error fetching DHCP reservations:', error);
        }

        // Get DHCP leases (active leases) using direct OPNsense API
        try {
          const leasesResponse = await fetchFromOpnsense('/api/kea/leases4/search', 'GET');
          if (leasesResponse && (leasesResponse as KeaLeases4Response).rows) {
            // Filter for active leases (state === '0' means active)
            const activeLeases = (leasesResponse as KeaLeases4Response).rows.filter((lease) => lease.state === '0');
            dhcpLeases = activeLeases.length;
          }
        } catch (error) {
          logger.error('Error fetching DHCP leases:', error);
        }

        // Get ARP table using direct OPNsense API
        try {
          arpTable = await get_arpTable();
          arpEntries = arpTable.length;
        } catch (error) {
          logger.error('Error fetching ARP table:', error);
        }

        // Calculate active devices with DHCP reservations
        if (arpTable.length > 0 && reservationsData.length > 0) {
          const arpIps = new Set(arpTable.map((entry: { ip: string; }) => entry.ip));
          const reservedIps = new Set((reservationsData as Array<{ ip_address: string; }>).map(reservation => reservation.ip_address));

          activeDevicesWithDhcpReservedCount = Array.from(arpIps).filter(ip => reservedIps.has(ip)).length;
        }
      } catch (error) {
        logger.error('Error fetching DHCP/ARP data:', error);
      }

      // 11. Get Host Aliases and calculate statistics with managed/unmanaged breakdown
      // Managed = Host aliases that pass all filtering criteria (basic + group filters + globally disabled)
      // Unmanaged = Host aliases that meet basic criteria but are filtered out by group filters or globally disabled groups
      let managedHostAliases = 0;
      let managedAssignedToGroups = 0;
      let managedNotAssignedToGroups = 0;
      let managedActiveDevices = 0;

      let unmanagedHostAliases = 0;
      let unmanagedAssignedToGroups = 0;
      let unmanagedNotAssignedToGroups = 0;
      let unmanagedActiveDevices = 0;

      let totalHostAliases = 0;
      let totalAssignedToGroups = 0;
      let totalNotAssignedToGroups = 0;
      let totalActiveDevices = 0;
      let totalActiveDevicesInArp = 0;

      // Declare arrays outside try-catch so they're available in response construction
      let enrichedManagedAliases: EnrichedHostAlias[] = [];
      let managedAssignedAliases: EnrichedHostAlias[] = [];
      let managedNotAssignedAliases: EnrichedHostAlias[] = [];
      let managedActiveAliases: EnrichedHostAlias[] = [];
      let unmanagedAliases: HostAlias[] = [];
      let unmanagedActiveAliases: HostAlias[] = [];
      let aliases: Record<string, OpnsenseAlias> = {};

      try {
        // Get all host aliases from OPNsense first
        const allHostAliases = await getHostAliases();
        const allHostTypeAliases = allHostAliases.filter((alias) => alias.type === 'host');

        // Get ARP table for active device calculations
        const arpTable = await get_arpTable();
        const arpIps = new Set(arpTable.map((entry) => entry.ip));

        // Apply the same filtering logic as getFilteredHostAliases to determine managed vs unmanaged
        // Import the filtering function to get managed aliases (same as HostAliasesTab)
        const { getFilteredHostAliases } = await import('@/lib/host-alias-filtering');

        // Get managed (filtered) host aliases - same logic as HostAliasesTab
        const { displayableHostAliases: managedAliases } = await getFilteredHostAliases();

        // Create a set of managed alias UUIDs for easy lookup
        const managedAliasUuids = new Set(managedAliases.map(alias => alias.uuid));

        // Now we need to properly categorize unmanaged aliases
        // Unmanaged aliases are those that exist in OPNsense but are filtered out by:
        // 1. Not being type 'host'
        // 2. Not having exactly 1 valid IP
        // 3. Being members of globally disabled groups
        // 4. Being filtered out by group filter patterns
        // 5. Being in groups that are not visible due to filtering

        // For proper categorization, we need to separate:
        // - Aliases that meet basic criteria but are filtered out (these are "unmanaged")
        // - Aliases that don't meet basic criteria (these shouldn't be counted at all)

        // Apply basic filtering criteria to get potentially manageable aliases
        const potentiallyManageableAliases = allHostTypeAliases.filter((alias: HostAlias) => {
          // 1. Only host aliases of type 'host' (already filtered above)

          // 2. Only host aliases with exactly 1 valid IP (not CIDR)
          const ipEntries = alias.content.split(/[\n\s]+/).filter((entry) => entry.trim() !== '');
          if (ipEntries.length !== 1) {
            return false;
          }

          const ip = ipEntries[0];
          // Basic IP validation (simplified)
          // This regex is safe - it has bounded quantifiers and no backtracking issues
          // eslint-disable-next-line security/detect-unsafe-regex
          const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
          if (!ipRegex.test(ip)) {
            return false;
          }

          return true;
        });

        // Separate managed and unmanaged from potentially manageable aliases
        unmanagedAliases = potentiallyManageableAliases.filter((alias: HostAlias) =>
          !managedAliasUuids.has(alias.uuid)
        );

        // For managed aliases, we need to enrich them with group membership like HostAliasesTab does
        // Get network groups for enrichment
        const [exportedAliasesResponse, opnsenseGroupDisplays] = await Promise.all([
          exportAliases(),
          prisma.opnsenseGroupDisplay.findMany({ orderBy: { friendlyName: 'asc' } }),
        ]);

        aliases = exportedAliasesResponse.aliases.alias as Record<string, OpnsenseAlias>;
        const groupDisplayMap = new Map(opnsenseGroupDisplays.map(display => [display.opnsenseUuid.toLowerCase(), display]));

        // Create enriched managed aliases with group membership
        enrichedManagedAliases = managedAliases.map((alias: HostAlias): EnrichedHostAlias => {
          // Create a map of host alias names to their IP addresses
          const hostNameToIpMap = new Map<string, string>();
          Object.values(aliases).forEach((a: OpnsenseAlias) => {
            if (a.type === 'host' && a.name && a.content) {
              hostNameToIpMap.set(a.name, a.content);
            }
          });

          // Create a map of IP addresses to their groups
          const ipToGroupsMap = new Map<string, NetworkGroup[]>();
          Object.entries(aliases).forEach(([uuid, a]: [string, OpnsenseAlias]) => {
            if (a.type === 'networkgroup') {
              const displayMapping = groupDisplayMap.get(uuid.toLowerCase());
              const members = a.content.split('\n').filter(member => member.trim() !== '');

              members.forEach((memberName) => {
                const ipAddress = hostNameToIpMap.get(memberName) || memberName;
                const currentGroups = ipToGroupsMap.get(ipAddress) || [];
                ipToGroupsMap.set(ipAddress, [...currentGroups, {
                  uuid: uuid,
                  name: a.name,
                  friendlyName: displayMapping?.friendlyName || a.name,
                  iconIdentifier: displayMapping?.iconIdentifier || undefined,
                }]);
              });
            }
          });

          // Get groups for this alias
          const groupsForAlias = ipToGroupsMap.get(alias.content) || [];
          const groupsByName = ipToGroupsMap.get(alias.name) || [];
          const allGroups = [...groupsForAlias, ...groupsByName];

          return {
            ...alias,
            memberOfGroups: allGroups
          };
        });

        // Separate managed aliases into categories
        managedAssignedAliases = enrichedManagedAliases.filter((alias: EnrichedHostAlias) =>
          alias.memberOfGroups && alias.memberOfGroups.length > 0
        );
        managedNotAssignedAliases = enrichedManagedAliases.filter((alias: EnrichedHostAlias) =>
          !alias.memberOfGroups || alias.memberOfGroups.length === 0
        );
        managedActiveAliases = enrichedManagedAliases.filter((alias: EnrichedHostAlias) => {
          const ips = alias.content.split(/[,\s]+/).filter(ip => ip.trim());
          return ips.some(ip => arpIps.has(ip.trim()));
        });

        // Separate unmanaged aliases into categories
        unmanagedActiveAliases = unmanagedAliases.filter((alias: HostAlias) => {
          const ips = alias.content.split(/[,\s]+/).filter(ip => ip.trim());
          return ips.some(ip => arpIps.has(ip.trim()));
        });

        // Calculate managed statistics
        managedHostAliases = enrichedManagedAliases.length;
        managedAssignedToGroups = managedAssignedAliases.length;
        managedNotAssignedToGroups = managedNotAssignedAliases.length;
        managedActiveDevices = managedActiveAliases.length;

        // Calculate unmanaged statistics
        unmanagedHostAliases = unmanagedAliases.length;

        // Check actual group membership for unmanaged aliases
        // They may be assigned to groups, but we're not managing those groups
        let unmanagedWithGroups = 0;
        let unmanagedWithoutGroups = 0;

        unmanagedAliases.forEach((alias: HostAlias) => {
          // Check if this alias is referenced in any network group
          let isInAnyGroup = false;

          Object.entries(aliases).forEach(([, a]: [string, OpnsenseAlias]) => {
            if (a.type === 'networkgroup') {
              const members = a.content.split('\n').filter(member => member.trim() !== '');
              if (members.includes(alias.name) || members.includes(alias.content)) {
                isInAnyGroup = true;
              }
            }
          });

          if (isInAnyGroup) {
            unmanagedWithGroups++;
          } else {
            unmanagedWithoutGroups++;
          }
        });

        unmanagedAssignedToGroups = unmanagedWithGroups;
        unmanagedNotAssignedToGroups = unmanagedWithoutGroups;
        unmanagedActiveDevices = unmanagedActiveAliases.length;

        // Calculate total statistics
        totalHostAliases = managedHostAliases + unmanagedHostAliases;
        totalAssignedToGroups = managedAssignedToGroups + unmanagedAssignedToGroups;
        totalNotAssignedToGroups = managedNotAssignedToGroups + unmanagedNotAssignedToGroups;
        totalActiveDevices = managedActiveDevices + unmanagedActiveDevices;
        totalActiveDevicesInArp = arpTable.length;



      } catch (error) {
        logger.error('Error fetching host aliases:', error);
      }

      // 12. Get VPN Statistics with detailed information using the VPN status endpoint
      const vpnStats: { totalVpns: number; vpnMappings: { opnsenseGroupUuid: string; opnsenseGroupName: string; vpnServer: string; vpnUser: string; description: string; mappedNetworkGroup: string; dataTransferredRx: string; dataTransferredTx: string; vpnType: string; vpnStatus: string; }[] } = {
        totalVpns: 0,
        vpnMappings: []
      };

      try {
        // Use server-side utility to get VPN status
        const { getVpnStatusServer } = await import('@/lib/server/vpn-status-utils');
        const internalResult = await getVpnStatusServer();
        let vpnStatuses: VpnStatus[] = [];

        if (internalResult.success && internalResult.data) {
          vpnStatuses = internalResult.data.vpnStatuses || [];
        }

        // Set total VPNs to all VPNs found, not just mapped ones
        vpnStats.totalVpns = vpnStatuses.length;

        // Create VPN entries for all VPNs, including unmapped ones
        for (const vpnStatus of vpnStatuses) {
          // Find if this VPN has a mapping
          const mapping = vpnMappings.find(m => m.vpnUuid === vpnStatus.id);
          const vpnUuid = vpnStatus.id;

          // Format data transfer bytes like in VpnMappingsTab
          const formatBytes = (bytes: number): string => {
            if (isNaN(bytes)) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let i = 0;
            let value = bytes;
            while (value >= 1024 && i < units.length - 1) {
              value /= 1024;
              i++;
            }
            // i is bounded by units.length check
            // eslint-disable-next-line security/detect-object-injection
            return `${value.toFixed(1)} ${units[i]}`;
          };

          let dataTransferredRx = '0 B';
          let dataTransferredTx = '0 B';
          const vpnStatusText = vpnStatus.status || 'down';

          // Get data transfer information from OPNsense API
          try {
            if (mapping && mapping.vpnClient === 'OpenVPN') {
              const sessionsResponse = await fetchFromOpnsense('/api/openvpn/service/searchSessions', 'GET');
              if (sessionsResponse && (sessionsResponse as OpenVpnSessionApiRowsResponse).rows) {
                const session = (sessionsResponse as OpenVpnSessionApiRowsResponse).rows.find((s) => s.description === mapping.vpnName);
                if (session) {
                  dataTransferredRx = formatBytes(parseInt(session.bytes_received || '0'));
                  dataTransferredTx = formatBytes(parseInt(session.bytes_sent || '0'));
                }
              }
            } else if (mapping && mapping.vpnClient === 'WireGuard') {
              // For WireGuard, we need to get both client info and service status
              const clientsResponse = await fetchFromOpnsense('/api/wireguard/client/search_client', 'GET');
              const serviceResponse = await fetchFromOpnsense('/api/wireguard/service/show', 'GET');

              if (clientsResponse && (clientsResponse as WireguardClientApiRowsResponse).rows && serviceResponse && (serviceResponse as WireguardServiceApiRowsResponse).rows) {
                const client = (clientsResponse as WireguardClientApiRowsResponse).rows.find((c) => c.name === mapping.vpnName);
                if (client) {
                  // Find matching peer in service data
                  const peer = (serviceResponse as WireguardServiceApiRowsResponse).rows.find((p) => p.type === 'peer' && p.name === client.name);
                  if (peer) {
                    dataTransferredRx = formatBytes(parseInt(peer['transfer-rx']?.toString() || '0'));
                    dataTransferredTx = formatBytes(parseInt(peer['transfer-tx']?.toString() || '0'));
                  }
                }
              }
            } else if (mapping && mapping.vpnClient === 'IPsec') {
              const connectionsResponse = await fetchFromOpnsense('/api/ipsec/sessions/search_phase1', 'GET');
              if (connectionsResponse && (connectionsResponse as IpsecConnectionApiRowsResponse).rows) {
                const connection = (connectionsResponse as IpsecConnectionApiRowsResponse).rows.find((c) => c.name === mapping.vpnName);
                if (connection) {
                  dataTransferredRx = formatBytes(parseInt(connection['bytes-in']?.toString() || '0'));
                  dataTransferredTx = formatBytes(parseInt(connection['bytes-out']?.toString() || '0'));
                }
              }
            }
          } catch (error) {
            logger.error(`Error fetching VPN data for ${vpnStatus.name || vpnUuid}:`, error);
          }

          // Normalize VPN type capitalization
          const normalizeVpnType = (vpnType: string): string => {
            const type = vpnType.toLowerCase();
            switch (type) {
              case 'openvpn':
                return 'OpenVPN';
              case 'wireguard':
              case 'wireguard':
                return 'WireGuard';
              case 'ipsec':
                return 'IPsec';
              default:
                // For unknown types, capitalize first letter
                return vpnType.charAt(0).toUpperCase() + vpnType.slice(1).toLowerCase();
            }
          };

          const rawVpnType = mapping?.vpnClient || (vpnStatus.type as string) || 'Unknown';
          const normalizedVpnType = normalizeVpnType(rawVpnType);

          const vpnData = {
            opnsenseGroupUuid: mapping?.opnsenseNetworkGroupId || 'Unknown',
            opnsenseGroupName: mapping?.opnsenseNetworkGroup?.name || 'Unknown',
            vpnServer: mapping?.friendlyName || mapping?.vpnName || vpnStatus.name || 'Unknown',
            vpnUser: mapping?.vpnName || vpnStatus.name || 'Unknown',
            description: mapping?.vpnName || vpnStatus.name || '',
            mappedNetworkGroup: mapping?.opnsenseNetworkGroup?.name || '-',
            dataTransferredRx,
            dataTransferredTx,
            vpnType: normalizedVpnType,
            vpnStatus: vpnStatusText
          };

          vpnStats.vpnMappings.push(vpnData);
        }

        // Sort VPN mappings by VPN Server name
        vpnStats.vpnMappings.sort((a, b) => a.vpnServer.localeCompare(b.vpnServer));
      } catch (error) {
        logger.error('Error fetching VPN statistics:', error);
      }

      const summary = {
        globalSettings: {
          enableRegistration: globalSettings?.enableRegistration ?? false,
          removeSelfServicePage: globalSettings?.removeSelfServicePage ?? false,
          enableRenamingSelfServicePage: globalSettings?.enableRenamingSelfServicePage ?? false,
          enableRenamingDeviceManagementPage: globalSettings?.enableRenamingDeviceManagementPage ?? false,
          // Group Type Settings (with fallbacks for older schemas)
          enableGroupTypes: globalSettings?.enableGroupTypes ?? false,
          enableSelfServiceMultiSelect: globalSettings?.enableSelfServiceMultiSelect ?? true,
          singleSelectName: globalSettings?.singleSelectName ?? 'Single Select',
          multiSelectName: globalSettings?.multiSelectName ?? 'Multi Select',
          singleSelectIcon: globalSettings?.singleSelectIcon ?? 'DEFAULT',
          multiSelectIcon: globalSettings?.multiSelectIcon ?? 'DEFAULT',
          // Advanced Features (with fallbacks for older schemas)
          enableAdvancedAnalytics: globalSettings?.enableAdvancedAnalytics ?? false,
          // MAC Tracking Settings (with fallbacks for older schemas)
          enableMacTracking: globalSettings?.enableMacTracking ?? false,
          macTrackingInterval: globalSettings?.macTrackingInterval ?? 5,
          macInactiveTimeout: globalSettings?.macInactiveTimeout ?? 1440,
          macDataRetentionDays: globalSettings?.macDataRetentionDays ?? 90,
          // Application Subtitle Settings (with fallbacks for older schemas)
          enableApplicationSubtitle: globalSettings?.enableApplicationSubtitle ?? false,
          enableLoginPageSubtitle: globalSettings?.enableLoginPageSubtitle ?? false,
          subtitleText: globalSettings?.subtitleText ?? null,
          // Custom Symbols (with safe JSON parsing and array handling)
          customLucideIcons: (() => {
            try {
              const icons = globalSettings?.customLucideIcons;
              if (Array.isArray(icons)) return icons;
              if (typeof icons === 'string') return JSON.parse(icons);
              return [];
            } catch (e) {
              logger.warn('Failed to parse customLucideIcons:', e);
              return [];
            }
          })(),
          customEmojis: (() => {
            try {
              const emojis = globalSettings?.customEmojis;
              if (Array.isArray(emojis)) return emojis;
              if (typeof emojis === 'string') return JSON.parse(emojis);
              return [];
            } catch (e) {
              logger.warn('Failed to parse customEmojis:', e);
              return [];
            }
          })(),
          customFlags: (() => {
            try {
              const flags = globalSettings?.customFlags;
              if (Array.isArray(flags)) return flags;
              if (typeof flags === 'string') return JSON.parse(flags);
              return [];
            } catch (e) {
              logger.warn('Failed to parse customFlags:', e);
              return [];
            }
          })(),
        },
        allowedNetworks: toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [],
        groupFilters: globalGroupFilters.map(filter => ({
          pattern: filter.pattern,
          description: filter.description || '',
          type: filter.type
        })),
        backupStats: {
          lastWeekCount: backupsLastWeek,
          lastMonthCount: backupsLastMonth,
          last3MonthsCount: backupsLast3Months,
          lastBackupDate: lastBackup?.date ? lastBackup.date.toISOString() : null,
          lastBackupFileName: lastBackup?.name || null,
        },
        hostAliasStats: {
          managed: {
            hostAliases: managedHostAliases,
            assignedToNetworkGroups: managedAssignedToGroups,
            notAssignedToNetworkGroups: managedNotAssignedToGroups,
            activeDevicesInArpTable: managedActiveDevices,
            // Include the actual lists for modal display
            lists: {
              all: enrichedManagedAliases.map((alias: EnrichedHostAlias) => ({
                uuid: alias.uuid,
                name: alias.name,
                content: alias.content,
                description: alias.description || '',
                enabled: alias.enabled,
                memberOfGroups: alias.memberOfGroups || [],
                detectedMac: alias.detectedMac || null,
                detectedVendor: alias.detectedVendor || null,
              })),
              assignedToNetworkGroups: managedAssignedAliases.map((alias: EnrichedHostAlias) => ({
                uuid: alias.uuid,
                name: alias.name,
                content: alias.content,
                description: alias.description || '',
                enabled: alias.enabled,
                memberOfGroups: alias.memberOfGroups || [],
                detectedMac: alias.detectedMac || null,
                detectedVendor: alias.detectedVendor || null,
              })),
              notAssignedToNetworkGroups: managedNotAssignedAliases.map((alias: EnrichedHostAlias) => ({
                uuid: alias.uuid,
                name: alias.name,
                content: alias.content,
                description: alias.description || '',
                enabled: alias.enabled,
                memberOfGroups: alias.memberOfGroups || [],
                detectedMac: alias.detectedMac || null,
                detectedVendor: alias.detectedVendor || null,
              })),
              activeDevicesInArpTable: managedActiveAliases.map((alias: EnrichedHostAlias) => ({
                uuid: alias.uuid,
                name: alias.name,
                content: alias.content,
                description: alias.description || '',
                enabled: alias.enabled,
                memberOfGroups: alias.memberOfGroups || [],
                detectedMac: alias.detectedMac || null,
                detectedVendor: alias.detectedVendor || null,
              })),
            },
          },
          unmanaged: {
            hostAliases: unmanagedHostAliases,
            assignedToNetworkGroups: unmanagedAssignedToGroups,
            notAssignedToNetworkGroups: unmanagedNotAssignedToGroups,
            activeDevicesInArpTable: unmanagedActiveDevices,
            // Include the actual lists for modal display
            lists: {
              all: unmanagedAliases.map((alias: HostAlias) => {
                // Check group membership for this unmanaged alias
                const memberOfGroups: NetworkGroup[] = [];
                Object.entries(aliases).forEach(([uuid, a]: [string, OpnsenseAlias]) => {
                  if (a.type === 'networkgroup') {
                    const members = a.content.split('\n').filter(member => member.trim() !== '');
                    if (members.includes(alias.name) || members.includes(alias.content)) {
                      memberOfGroups.push({
                        uuid: uuid,
                        name: a.name,
                        friendlyName: a.name, // No display mapping for unmanaged groups
                        iconIdentifier: undefined,
                      });
                    }
                  }
                });

                return {
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: memberOfGroups,
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                };
              }),
              assignedToNetworkGroups: unmanagedAliases.filter((alias: HostAlias) => {
                // Check if this alias is in any group
                let isInAnyGroup = false;
                Object.entries(aliases).forEach(([, a]: [string, OpnsenseAlias]) => {
                  if (a.type === 'networkgroup') {
                    const members = a.content.split('\n').filter(member => member.trim() !== '');
                    if (members.includes(alias.name) || members.includes(alias.content)) {
                      isInAnyGroup = true;
                    }
                  }
                });
                return isInAnyGroup;
              }).map((alias: HostAlias) => {
                // Get group membership for this alias
                const memberOfGroups: NetworkGroup[] = [];
                Object.entries(aliases).forEach(([uuid, a]: [string, OpnsenseAlias]) => {
                  if (a.type === 'networkgroup') {
                    const members = a.content.split('\n').filter(member => member.trim() !== '');
                    if (members.includes(alias.name) || members.includes(alias.content)) {
                      memberOfGroups.push({
                        uuid: uuid,
                        name: a.name,
                        friendlyName: a.name,
                        iconIdentifier: undefined,
                      });
                    }
                  }
                });

                return {
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: memberOfGroups,
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                };
              }),
              notAssignedToNetworkGroups: unmanagedAliases.filter((alias: HostAlias) => {
                // Check if this alias is NOT in any group
                let isInAnyGroup = false;
                Object.entries(aliases).forEach(([, a]: [string, OpnsenseAlias]) => {
                  if (a.type === 'networkgroup') {
                    const members = a.content.split('\n').filter(member => member.trim() !== '');
                    if (members.includes(alias.name) || members.includes(alias.content)) {
                      isInAnyGroup = true;
                    }
                  }
                });
                return !isInAnyGroup;
              }).map((alias: HostAlias) => ({
                uuid: alias.uuid,
                name: alias.name,
                content: alias.content,
                description: alias.description || '',
                enabled: alias.enabled,
                memberOfGroups: [], // These are truly not assigned to any groups
                detectedMac: alias.detectedMac || null,
                detectedVendor: alias.detectedVendor || null,
              })),
              activeDevicesInArpTable: unmanagedActiveAliases.map((alias: HostAlias) => {
                // Check group membership for active unmanaged aliases
                const memberOfGroups: NetworkGroup[] = [];
                Object.entries(aliases).forEach(([uuid, a]: [string, OpnsenseAlias]) => {
                  if (a.type === 'networkgroup') {
                    const members = a.content.split('\n').filter(member => member.trim() !== '');
                    if (members.includes(alias.name) || members.includes(alias.content)) {
                      memberOfGroups.push({
                        uuid: uuid,
                        name: a.name,
                        friendlyName: a.name,
                        iconIdentifier: undefined,
                      });
                    }
                  }
                });

                return {
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: memberOfGroups,
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                };
              }),
            },
          },
          total: {
            hostAliases: totalHostAliases,
            assignedToNetworkGroups: totalAssignedToGroups,
            notAssignedToNetworkGroups: totalNotAssignedToGroups,
            activeDevicesInArpTable: totalActiveDevices,
            totalActiveDevicesInArp: totalActiveDevicesInArp,
            // Include combined lists for total statistics
            lists: {
              all: [
                ...enrichedManagedAliases.map((alias: EnrichedHostAlias) => ({
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: alias.memberOfGroups || [],
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                  category: 'managed' as const,
                })),
                ...unmanagedAliases.map((alias: HostAlias) => ({
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: [],
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                  category: 'unmanaged' as const,
                })),
              ],
              assignedToNetworkGroups: managedAssignedAliases.map((alias: EnrichedHostAlias) => ({
                uuid: alias.uuid,
                name: alias.name,
                content: alias.content,
                description: alias.description || '',
                enabled: alias.enabled,
                memberOfGroups: alias.memberOfGroups || [],
                detectedMac: alias.detectedMac || null,
                detectedVendor: alias.detectedVendor || null,
                category: 'managed' as const,
              })),
              notAssignedToNetworkGroups: [
                ...managedNotAssignedAliases.map((alias: EnrichedHostAlias) => ({
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: alias.memberOfGroups || [],
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                  category: 'managed' as const,
                })),
                ...unmanagedAliases.map((alias: HostAlias) => ({
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: [],
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                  category: 'unmanaged' as const,
                })),
              ],
              activeDevicesInArpTable: [
                ...managedActiveAliases.map((alias: EnrichedHostAlias) => ({
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: alias.memberOfGroups || [],
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                  category: 'managed' as const,
                })),
                ...unmanagedActiveAliases.map((alias: HostAlias) => ({
                  uuid: alias.uuid,
                  name: alias.name,
                  content: alias.content,
                  description: alias.description || '',
                  enabled: alias.enabled,
                  memberOfGroups: [],
                  detectedMac: alias.detectedMac || null,
                  detectedVendor: alias.detectedVendor || null,
                  category: 'unmanaged' as const,
                })),
              ],
            },
          },
        },
        groupStats: {
          totalManagedGroups: groups.length,
          groups: [] as Array<{
            name: string;
            uuid: string;
            deviceCount: number;
            assignedHostAliases: string[];
            assignedHostAliasesCount: string | number;
            assignedHostAliasesCountLabel: string;
            directUsersCount: number;
            ssoUsersCount: number;
            filtersCount: number;
            isGloballyDisabled: boolean;
          }>
        },
        userStats: {
          totalUsers,
          localUsers,
          ssoUsers,
        },
        networkGroupStats: {
          totalNetworkGroups: networkGroups.length,
          networkGroups: networkGroups.map((group: { name: string; uuid: string; memberCount: number; description: string; friendlyName: string; isGloballyDisabled: boolean; }) => ({
            name: group.name,
            uuid: group.uuid,
            memberCount: group.memberCount,
            description: group.description || '',
            friendlyName: group.friendlyName || '',
            isGloballyDisabled: group.isGloballyDisabled,
          })).sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically by group name
        },
        ssoGroupMappingStats: {
          totalSsoGroupMappings: ssoGroupMappings.length,
          ssoGroupMappings: ssoGroupMappings.map(mapping => ({
            ssoProvider: mapping.ssoProvider,
            ssoProviderDisplayName: providerDisplayNames[mapping.ssoProvider.toLowerCase()] || mapping.ssoProvider,
            ssoGroupName: mapping.ssoGroupName,
            localGroup: mapping.localGroup ? {
              name: mapping.localGroup.name
            } : null,
          })).sort((a, b) => {
            const aName = a.localGroup?.name || '';
            const bName = b.localGroup?.name || '';
            return aName.localeCompare(bName);
          })
        },
        vpnStats,
        dhcpStats: {
          reservationsCount: dhcpReservations,
          activeLeasesCount: dhcpLeases,
          activeDevicesCount: arpEntries,
          activeDevicesWithDhcpReservedCount,
        },
      };

      // Now populate the groups array after managedHostAliases is calculated
      summary.groupStats.groups = groups.map(group => {
        // Check if the group has wildcard permission
        const hasWildcardPermission = group.hostAliasPermissions.some(p => p.opnsenseAliasUuid === '*');
        const count = hasWildcardPermission ? managedHostAliases : group.hostAliasPermissions.length;
        return {
          name: group.name,
          uuid: group.id,
          deviceCount: group.users.length + group.ssoMappings.length,
          assignedHostAliases: group.hostAliasPermissions.map(p => p.opnsenseAliasUuid),
          assignedHostAliasesCount: count,
          assignedHostAliasesCountLabel: hasWildcardPermission ? `ALL (${count})` : `${count}`,
          directUsersCount: group.users.length,
          ssoUsersCount: group.ssoMappings.length,
          filtersCount: group.groupSpecificFilters.length,
          isGloballyDisabled: false, // This would need to be calculated based on globallyDisabledGroups
        };
      }).sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by group name

      return NextResponse.json(summary);
    } catch (error) {
      logger.error('Error generating system summary:', error);
      return new NextResponse(JSON.stringify({ error: 'Failed to generate system summary' }), { status: 500 });
    }
  });
}