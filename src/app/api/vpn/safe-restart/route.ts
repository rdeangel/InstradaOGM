import { NextResponse } from 'next/server';
import { authenticateRequest, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { Role, OpnsenseVpnSession, OpnsenseApiResponse, OpnsenseWireguardClient, OpnsenseWireguardClientResponse } from '@/types/opnsense';
import type { NetworkGroup } from '@/types/opnsense';
import { fetchFromOpnsense, getIpsecConnections, exportAliases } from '@/lib/opnsense-api';
import { logger } from '@/lib/logger';
import { isOpnsenseIpsecConnection } from '@/types/opnsense';
import { VpnClientType } from '@prisma/client';
import { fetchUnmanagedGroupFilterData, isHostInUnmanagedGroups } from '@/lib/unmanaged-group-utils';
import { prisma } from '@/lib/prisma';
import { isIpAllowedForSelfService } from '@/lib/network-utils';
import type { ValidLocalNetwork } from '@/types/settings';
import { toJsonArrayOrUndefined } from '@/lib/utils';

interface OpnsenseAliasDetail {
  uuid?: string;
  name: string;
  type: string;
  content: string;
  description?: string;
  enabled?: string;
}

// Helper function to get IP group membership for a VPN UUID
async function getIpGroupMembershipForVpn(vpnUuid: string, clientIp: string): Promise<NetworkGroup[]> {
  try {
    // Find the network group associated with this VPN
    const vpnMapping = await prisma.vpnMapping.findFirst({
      where: { vpnUuid: vpnUuid },
      select: { opnsenseNetworkGroupId: true }
    });

    if (!vpnMapping?.opnsenseNetworkGroupId) {
      return []; // No group mapping found
    }

    // Get the network group details
    const [allAliasesResponse, opnsenseGroupDisplays] = await Promise.all([
      exportAliases(),
      prisma.opnsenseGroupDisplay.findMany({ orderBy: { friendlyName: 'asc' } }),
    ]);

    if (!allAliasesResponse?.aliases?.alias) {
      throw new Error('Could not retrieve aliases from OPNsense');
    }

    const allAliasDetails: OpnsenseAliasDetail[] = Object.entries(allAliasesResponse.aliases.alias)
      .map(([uuid, detail]: [string, unknown]) => ({ ...(detail as OpnsenseAliasDetail), uuid }));

    // Find the network group that matches the VPN mapping
    const networkGroup = allAliasDetails.find(alias =>
      alias.type === 'networkgroup' &&
      (alias.uuid === vpnMapping.opnsenseNetworkGroupId || alias.name === vpnMapping.opnsenseNetworkGroupId)
    );

    if (!networkGroup) {
      return []; // Network group not found
    }

    // Check if the client IP is a member of this group
    const memberAliasNames = networkGroup.content ?
      networkGroup.content.split(/\n|,/).map((name: string) => name.trim()).filter(Boolean) : [];

    // Check if any host alias contains the client IP
    const hostAliasesContainingIp = allAliasDetails.filter(alias => {
      if (alias.type !== 'networkgroup' && alias.content) {
        const ips = alias.content.split(/\n|,/).map((ip: string) => ip.trim()).filter(Boolean);
        return ips.includes(clientIp);
      }
      return false;
    });

    // Check if any of these host aliases are members of the network group
    const isIpMemberOfGroup = hostAliasesContainingIp.some(hostAlias =>
      memberAliasNames.includes(hostAlias.name)
    );

    if (isIpMemberOfGroup) {
      const displayInfo = opnsenseGroupDisplays.find(d =>
        d.opnsenseUuid.toLowerCase() === (networkGroup.uuid || '').toLowerCase()
      );

      return [{
        id: networkGroup.uuid || networkGroup.name,
        uuid: networkGroup.uuid || '',
        name: networkGroup.name,
        description: networkGroup.description || '',
        enabled: networkGroup.enabled === '1',
        members: [], // Required by NetworkGroup type
        lastUpdated: null,
        rawContent: networkGroup.content,
        type: networkGroup.type,
        friendlyName: displayInfo?.friendlyName || networkGroup.name,
        iconIdentifier: displayInfo?.iconIdentifier || null,
      }];
    }

    return []; // IP is not a member of the VPN's network group
  } catch (error) {
    logger.error('Error fetching IP group membership for VPN:', error);
    throw new Error('Failed to determine IP group membership for VPN');
  }
}

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);

  try {
    // Allow access if unauthenticated or if the user is a USER, ADMIN, or SUPER_ADMIN
    if (auth.user) {
      if (auth.user.role !== Role.USER && auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
        // If there's a session but the role is not USER, ADMIN, or SUPER_ADMIN, then it's unauthorized.
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
    }

    const { vpnUuid, vpnType } = await req.json();
    logger.debug(`Safe-restart API received: vpnUuid=${vpnUuid}, vpnType=${vpnType}`);

    if (!vpnUuid || !vpnType) {
      return new NextResponse(JSON.stringify({ error: 'VPN UUID and type are required' }), { status: 400 });
    }

    if (!vpnUuid) {
      return new NextResponse(JSON.stringify({ error: 'VPN UUID is required' }), { status: 400 });
    }

    // Check if this is a self-service operation and if the host is in unmanaged groups
    if (!auth.user) {
      try {
        // Get client IP address for validation
        const { getClientIp } = await import('@/lib/network-utils');
        const clientIp = getClientIp(req) || '0.0.0.0';

        // Get global settings to check allowed networks
        const globalSettings = await prisma.globalSettings.findFirst({
          orderBy: { id: 'asc' },
        });
        const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

        // Check if the client IP is allowed for self-service operations
        const ipValidation = isIpAllowedForSelfService(
          clientIp,
          clientIp,
          allowedNetworks,
          false // unauthenticated
        );

        if (!ipValidation.isAllowed) {
          logger.warn(`Self-service VPN restart denied for IP ${clientIp}: ${ipValidation.reason}`);
          return new NextResponse(JSON.stringify({
            error: `Forbidden: ${ipValidation.reason}`
          }), { status: 403 });
        }

        // Get current group memberships for the VPN
        const currentGroups = await getIpGroupMembershipForVpn(vpnUuid, clientIp);

        if (currentGroups.length > 0) {
          // Fetch filter data
          const filterData = await fetchUnmanagedGroupFilterData();

          // Check if host is in unmanaged groups
          const unmanagedResult = await isHostInUnmanagedGroups(
            currentGroups,
            filterData.globalFilters,
            filterData.globallyDisabledGroups,
            null, // No user for unauthenticated requests
            filterData.userSpecificFilters
          );

          if (unmanagedResult.isUnmanaged) {
            logger.warn(`Self-service VPN restart rejected: VPN ${vpnUuid} is associated with unmanaged groups`);

            return new NextResponse(JSON.stringify({
              error: `Self-service is restricted: ${unmanagedResult.message}`
            }), { status: 403 });
          }
        }
      } catch (error) {
        logger.error('Error checking unmanaged group status for VPN restart:', error);
        // Continue with operation if check fails (fail open)
      }
    }

    let opnsenseResponse: OpnsenseApiResponse;

    if (vpnType === VpnClientType.OpenVPN) {
      // Verify OpenVPN status
      const opnsenseVpnSessionsResponse: { rows: OpnsenseVpnSession[] } = await fetchFromOpnsense('/api/openvpn/service/searchSessions');
      const opnsenseVpns = opnsenseVpnSessionsResponse.rows;
      const targetVpn = opnsenseVpns.find(vpn => vpn.id === vpnUuid);

      if (targetVpn && (targetVpn.status === 'up' || targetVpn.status === 'connected')) {
        logger.warn(`Attempted to restart a connected OpenVPN via safe-restart endpoint: ${vpnUuid}`);
        return new NextResponse(JSON.stringify({ error: 'OpenVPN is already connected. Cannot restart via this endpoint.' }), { status: 403 });
      }

      logger.info(`Attempting to restart OpenVPN service for UUID: ${vpnUuid} via safe-restart endpoint.`);
      opnsenseResponse = await fetchFromOpnsense(`/api/openvpn/service/restartService/${vpnUuid}`, 'POST', {});

    } else if (vpnType === VpnClientType.WireGuard) {
      // Verify WireGuard status
      const wireguardConfigResponse: OpnsenseWireguardClientResponse = await fetchFromOpnsense('/api/opnsense/wireguard/client/searchClient', 'POST', {});
      const wireguardClients = wireguardConfigResponse.rows;
      const targetWg = wireguardClients.find((client: OpnsenseWireguardClient) => client.uuid === vpnUuid);

      if (!targetWg) {
        logger.warn(`WireGuard client not found for UUID: ${vpnUuid}`);
        return new NextResponse(JSON.stringify({ error: 'WireGuard client not found.' }), { status: 404 });
      }

      // WireGuard can only be restarted if it's enabled ('1') AND disconnected (status 'offline')
      if (targetWg.enabled === '0') {
        logger.warn(`Attempted to restart a disabled WireGuard VPN via safe-restart endpoint: ${vpnUuid}`);
        return new NextResponse(JSON.stringify({ error: 'WireGuard is disabled and cannot be restarted via this endpoint.' }), { status: 403 });
      }

      if (targetWg.status === 'online') {
        logger.warn(`Attempted to restart a connected WireGuard VPN via safe-restart endpoint: ${vpnUuid}`);
        return new NextResponse(JSON.stringify({ error: 'WireGuard is already connected. Cannot restart via this endpoint.' }), { status: 403 });
      }

      // Implement the "toggle twice" logic for WireGuard restart
      logger.info(`Attempting to restart WireGuard service for UUID: ${vpnUuid} via safe-restart endpoint (toggle twice).`);

      // 1. Disable the client
      await fetchFromOpnsense(`/api/opnsense/wireguard/client/toggleClient/${vpnUuid}`, 'POST', {});
      await fetchFromOpnsense('/api/opnsense/wireguard/service/reconfigure', 'POST', {});
      logger.info(`WireGuard VPN ${vpnUuid} temporarily disabled.`);

      // 2. Re-enable the client
      opnsenseResponse = await fetchFromOpnsense(`/api/opnsense/wireguard/client/toggleClient/${vpnUuid}`, 'POST', {});
      await fetchFromOpnsense('/api/opnsense/wireguard/service/reconfigure', 'POST', {});
      logger.info(`WireGuard VPN ${vpnUuid} re-enabled.`);

    } else if (vpnType === VpnClientType.IPsec) {
      // Verify IPsec status
      const ipsecConnections = await getIpsecConnections();
      const targetIpsec = ipsecConnections.find(conn => conn.id === vpnUuid);

      if (!targetIpsec) {
        logger.warn(`IPsec connection not found for UUID: ${vpnUuid}`);
        return new NextResponse(JSON.stringify({ error: 'IPsec connection not found.' }), { status: 404 });
      }

      // Use type guard to ensure targetIpsec is OpnsenseIpsecConnection
      if (!isOpnsenseIpsecConnection(targetIpsec)) {
        logger.error(`Found VPN entry for UUID ${vpnUuid} but it is not an IPsec connection type.`);
        return new NextResponse(JSON.stringify({ error: 'Invalid VPN type for IPsec operation.' }), { status: 400 });
      }

      if (targetIpsec.connected) {
        logger.warn(`Attempted to restart a connected IPsec VPN via safe-restart endpoint: ${vpnUuid}`);
        return new NextResponse(JSON.stringify({ error: 'IPsec is already connected. Cannot restart via this endpoint.' }), { status: 403 });
      }

      logger.info(`Attempting to restart IPsec service for UUID: ${vpnUuid} via safe-restart endpoint (connect).`);

      // Connect the IPsec session directly as the frontend ensures it's disconnected
      opnsenseResponse = await fetchFromOpnsense(`/api/ipsec/sessions/connect/${vpnUuid}`, 'POST', {});
      logger.info(`IPsec VPN ${vpnUuid} connected.`);

    } else {
      return new NextResponse(JSON.stringify({ error: 'Unsupported VPN type for safe restart.' }), { status: 400 });
    }

    if (opnsenseResponse.result !== 'ok') {
      logger.error(`OPNsense API reported failure for ${vpnType} VPN restart: ${vpnUuid}`, opnsenseResponse);
      return new NextResponse(JSON.stringify({ error: opnsenseResponse.message || `Failed to restart ${vpnType} VPN service on OPNsense.` }), { status: 500 });
    }

    if (opnsenseResponse.result !== 'ok') {
      logger.error(`OPNsense API reported failure for VPN restart: ${vpnUuid}`, opnsenseResponse);
      return new NextResponse(JSON.stringify({ error: opnsenseResponse.message || 'Failed to restart VPN service on OPNsense.' }), { status: 500 });
    }

    // Track usage for authenticated requests
    if (auth && auth.user) {
      await trackUsageByAuthMethod(req, auth, 200);
    }

    return NextResponse.json({ message: 'VPN restart initiated successfully', opnsenseResponse });
  } catch (error) {
    logger.error('Error in VPN safe-restart:', error);

    // Track usage for authenticated requests (even failed ones)
    if (auth && auth.user) {
      await trackUsageByAuthMethod(req, auth, 500);
    }

    return new NextResponse(JSON.stringify({ error: 'Failed to safe-restart VPN' }), { status: 500 });
  }
}