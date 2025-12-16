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

    // Only stop if the VPN is currently enabled
    if (client.enabled === '1') {
      logger.info(`WireGuard VPN ${vpnUuid} is enabled. Toggling to disable for stop...`);
      opnsenseResponse = await fetchFromOpnsense<ToggleClientResponse>(`/api/wireguard/client/toggleClient/${vpnUuid}`, 'POST', {});
      await fetchFromOpnsense('/api/wireguard/service/reconfigure', 'POST', {});
      logger.info(`WireGuard VPN ${vpnUuid} disabled.`);
    } else {
      logger.info(`WireGuard VPN ${vpnUuid} is already disabled. No action needed for stop.`);
      // For consistency, construct a response that matches ToggleClientResponse type
      opnsenseResponse = { result: 'Already Disabled', uuid: vpnUuid }; 
    }

    return NextResponse.json({ message: 'WireGuard VPN stop initiated successfully', opnsenseResponse });
  } catch (error) {
    logger.error('Failed to stop WireGuard VPN:', error);
    return NextResponse.json({ error: 'Failed to stop WireGuard VPN' }, { status: 500 });
  }
  });
}