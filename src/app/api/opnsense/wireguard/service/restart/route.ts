import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role, OpnsenseWireguardClientResponse, OpnsenseWireguardClient } from '@/types/opnsense';
import { fetchFromOpnsense } from '@/lib/opnsense-api';

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

    // 1. Get current status of the WireGuard client
    const searchResponse: OpnsenseWireguardClientResponse = await fetchFromOpnsense('/api/wireguard/client/searchClient', 'POST', {});
    const client = searchResponse.rows.find((c: OpnsenseWireguardClient) => c.uuid === vpnUuid);

    if (!client) {
      return NextResponse.json({ error: `WireGuard client with UUID ${vpnUuid} not found.` }, { status: 404 });
    }

    let opnsenseResponse: ToggleClientResponse; // Use the specific interface

    if (client.enabled === '1') {
      // VPN is currently enabled, so toggle twice to restart
      logger.info(`WireGuard VPN ${vpnUuid} is enabled. Toggling to disable for restart...`);
      await fetchFromOpnsense<ToggleClientResponse>(`/api/wireguard/client/toggleClient/${vpnUuid}`, 'POST', {});
      await fetchFromOpnsense('/api/wireguard/service/reconfigure', 'POST', {});
      logger.info(`WireGuard VPN ${vpnUuid} disabled. Toggling to enable for restart...`);
      opnsenseResponse = await fetchFromOpnsense<ToggleClientResponse>(`/api/wireguard/client/toggleClient/${vpnUuid}`, 'POST', {});
      await fetchFromOpnsense('/api/wireguard/service/reconfigure', 'POST', {});
      logger.info(`WireGuard VPN ${vpnUuid} re-enabled.`);
    } else {
      // VPN is currently disabled, so toggle once to enable
      logger.info(`WireGuard VPN ${vpnUuid} is disabled. Toggling to enable for restart...`);
      opnsenseResponse = await fetchFromOpnsense<ToggleClientResponse>(`/api/wireguard/client/toggleClient/${vpnUuid}`, 'POST', {});
      await fetchFromOpnsense('/api/wireguard/service/reconfigure', 'POST', {});
      logger.info(`WireGuard VPN ${vpnUuid} enabled.`);
    }

    return NextResponse.json({ message: 'WireGuard VPN restart initiated successfully', opnsenseResponse });
  } catch (error) {
    logger.error('Failed to restart WireGuard VPN:', error);
    return NextResponse.json({ error: 'Failed to restart WireGuard VPN' }, { status: 500 });
  }
  });
}