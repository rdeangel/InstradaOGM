import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role, OpnsenseWireguardClientResponse, OpnsenseWireguardClient } from '@/types/opnsense';
import { fetchFromOpnsense, reconfigureWireguard, restartWireguardClient } from '@/lib/opnsense-api';
import { assertOpnsenseId, isOpnsenseId } from '@/lib/opnsense-id';

interface ToggleClientResponse {
  result: string; // e.g., "toggled"
  uuid: string;
}

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

    const { vpnUuid } = await req.json();

    if (!vpnUuid) {
      return NextResponse.json({ error: 'WireGuard VPN UUID is required' }, { status: 400 });
    }

    if (!isOpnsenseId(vpnUuid)) {
      return NextResponse.json({ error: 'Invalid VPN identifier' }, { status: 400 });
    }

    const vpnId = assertOpnsenseId(vpnUuid);

    // 1. Get current status of the WireGuard client
    const searchResponse: OpnsenseWireguardClientResponse = await fetchFromOpnsense('/api/wireguard/client/search_client', 'POST', {});
    const client = searchResponse.rows.find((c: OpnsenseWireguardClient) => c.uuid === vpnId);

    if (!client) {
      return NextResponse.json({ error: `WireGuard client with UUID ${vpnUuid} not found.` }, { status: 404 });
    }

    let opnsenseResponse: ToggleClientResponse; // Use the specific interface

    if (client.enabled === '1') {
      logger.info(`WireGuard VPN ${vpnUuid} is enabled. Restarting client.`);
      const wg = await restartWireguardClient(vpnId);
      if (!wg.ok) {
        logger.error(`WireGuard VPN ${vpnUuid} restart did not re-enable the client`, wg);
        return NextResponse.json({ error: 'Failed to restart WireGuard VPN' }, { status: 500 });
      }
      opnsenseResponse = { result: wg.result, uuid: vpnId };
    } else {
      // VPN is currently disabled, so toggle once to enable
      logger.info(`WireGuard VPN ${vpnUuid} is disabled. Toggling to enable for restart...`);
      opnsenseResponse = await fetchFromOpnsense<ToggleClientResponse>(`/api/wireguard/client/toggle_client/${vpnId}`, 'POST', {});
      await reconfigureWireguard();
      logger.info(`WireGuard VPN ${vpnId} enabled.`);
    }

    return NextResponse.json({ message: 'WireGuard VPN restart initiated successfully', opnsenseResponse });
  } catch (error) {
    logger.error('Failed to restart WireGuard VPN:', error);
    return NextResponse.json({ error: 'Failed to restart WireGuard VPN' }, { status: 500 });
  }
  });
}