import { OpnsenseVpnEntry, isOpnsenseVpnSession, isOpnsenseWireguardClient, isOpnsenseIpsecConnection } from '@/types/opnsense';
import { getOpenVpnSessions, getWireguardClients, getIpsecConnections } from '@/lib/opnsense-api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Server-side utility to get VPN status information
 * This function can only be imported by server-side code (API routes, server components, etc.)
 * and cannot be accessed from client-side code.
 */
export async function getVpnStatusServer() {
  try {
    logger.debug('getVpnStatusServer called');

    // Fetch all active VPN sessions from OPNsense
    const openVpnSessions = await getOpenVpnSessions();
    const wireguardClients = await getWireguardClients();
    const ipsecConnections = await getIpsecConnections();

    // Combine all VPN entries
    const allVpnEntries: OpnsenseVpnEntry[] = [
      ...openVpnSessions,
      ...wireguardClients,
      ...ipsecConnections,
    ];
    
    // Filter out entries with undefined IDs early to ensure vpn.id is always a string
    const validVpnEntries = allVpnEntries.filter((vpn): vpn is OpnsenseVpnEntry & { id: string } => vpn.id !== undefined);

    const vpnNames = validVpnEntries.map(vpn => vpn.name).filter(name => name !== undefined);
    logger.info(`getVpnStatusServer: Found ${validVpnEntries.length} OPNsense VPN sessions. Names: ${vpnNames.join(', ')}`);

    // Fetch existing VPN mappings from the database with full details
    const dbVpnMappings = await prisma.vpnMapping.findMany({
      orderBy: {
        vpnName: 'asc',
      },
      select: {
        vpnUuid: true,
        vpnName: true,
        friendlyName: true,
        opnsenseNetworkGroupId: true,
        opnsenseNetworkGroup: {
          select: {
            id: true, // This is the OPNsense UUID
            name: true,
            description: true,
          },
        },
      },
    });

    // Create a map for quick lookup of vpnUuid by OpnsenseNetworkGroup's OPNsense UUID
    const groupToVpnMap: { [key: string]: string } = {};
    dbVpnMappings.forEach(m => {
      if (m.opnsenseNetworkGroupId && m.vpnUuid) {
        groupToVpnMap[m.opnsenseNetworkGroupId] = m.vpnUuid;
      }
    });

    // Extract detailed information for internal use
    const vpnStatuses = validVpnEntries.map(vpn => {
      let status: 'connected' | 'disconnected' | 'disabled' = 'disconnected';
      let enabled: string | undefined;
      let details: Record<string, unknown> = {};

      if (isOpnsenseVpnSession(vpn)) {
        status = (vpn.status === 'up' || vpn.status === 'connected') ? 'connected' : 'disconnected';
        enabled = (vpn.status === 'up' || vpn.status === 'connected') ? '1' : '0';
        details = {
          type: 'openvpn',
          status: vpn.status,
          virtualAddress: vpn.virtual_address,
          realAddress: vpn.real_address,
          bytesReceived: vpn.bytes_received,
          bytesSent: vpn.bytes_sent,
          connectedSince: vpn.connected_since,
        };
      } else if (isOpnsenseWireguardClient(vpn)) {
        if (vpn.enabled === '0') {
          status = 'disabled';
        } else if (vpn.status === 'online') {
          status = 'connected';
        } else if (vpn.status === 'offline') {
          status = 'disconnected';
        } else {
          status = 'disconnected';
        }
        enabled = vpn.enabled;
        details = {
          type: 'wireguard',
          status: vpn.status,
          enabled: vpn.enabled,
          publicKey: vpn.pubkey,
          allowedIPs: vpn.tunneladdress,
          endpoint: vpn.endpoint,
          lastHandshake: vpn.keepalive,
          transferRx: vpn.transfer_rx,
          transferTx: vpn.transfer_tx,
        };
      } else if (isOpnsenseIpsecConnection(vpn)) {
        status = vpn.connected ? 'connected' : 'disconnected';
        enabled = undefined;
        details = {
          type: 'ipsec',
          connected: vpn.connected,
          localSubnet: vpn['local-addrs'],
          remoteSubnet: vpn['remote-addrs'],
          remoteEndpoint: vpn['remote-addrs'],
        };
      }

      // Find the mapping associated with this VPN UUID
      const matchingMapping = dbVpnMappings.find(m => m.vpnUuid === vpn.id);
      const opnsenseNetworkGroupId = matchingMapping?.opnsenseNetworkGroupId || '';

      return {
        id: vpn.id,
        name: vpn.name,
        status: status,
        enabled: enabled,
        opnsenseNetworkGroupId: opnsenseNetworkGroupId,
        vpnName: matchingMapping?.vpnName || null,
        friendlyName: matchingMapping?.friendlyName || null,
        networkGroupFriendlyName: matchingMapping?.opnsenseNetworkGroup?.name || null,
        type: details.type, // Add top-level type field
        details: details,
      };
    });

    //logger.debug('getVpnStatusServer: Final vpnStatuses:', vpnStatuses);
    
    return {
      success: true,
      data: {
        vpnStatuses, 
        groupVpnMap: groupToVpnMap,
        totalCount: validVpnEntries.length,
        summary: {
          connected: vpnStatuses.filter(v => v.status === 'connected').length,
          disconnected: vpnStatuses.filter(v => v.status === 'disconnected').length,
          disabled: vpnStatuses.filter(v => v.status === 'disabled').length,
        }
      }
    };
  } catch (error) {
    logger.error('Error in getVpnStatusServer:', error);
    return { success: false, error: 'Failed to fetch VPN status' };
  }
} 