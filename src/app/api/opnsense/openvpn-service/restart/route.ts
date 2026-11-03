import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role, OpnsenseApiResponse } from '@/types/opnsense';
import { fetchFromOpnsense, restartWireguardClient } from '@/lib/opnsense-api';
import { assertOpnsenseId, isOpnsenseId } from '@/lib/opnsense-id';

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    let vpnType: string | undefined; // Declare vpnType outside try block
    try {
      if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

    const body = await req.json();
    const { vpnUuid } = body;
    vpnType = body.vpnType; // Assign vpnType here

    if (!vpnUuid || !vpnType) {
      return NextResponse.json({ error: 'VPN UUID and type are required' }, { status: 400 });
    }

    if (!vpnUuid) {
      return NextResponse.json({ error: 'VPN UUID is required' }, { status: 400 });
    }

    if (!isOpnsenseId(vpnUuid)) {
      return NextResponse.json({ error: 'Invalid VPN identifier' }, { status: 400 });
    }

    const vpnId = assertOpnsenseId(vpnUuid);

    let opnsenseResponse: OpnsenseApiResponse;

    if (vpnType === 'OpenVPN') {
      opnsenseResponse = await fetchFromOpnsense(`/api/openvpn/service/restart_service/${vpnId}`, 'POST', {});
      if (opnsenseResponse.result !== 'ok') {
        return NextResponse.json({ error: 'Failed to restart OpenVPN VPN' }, { status: 500 });
      }
    } else if (vpnType === 'WireGuard') {
      const wg = await restartWireguardClient(vpnId);
      if (!wg.ok) {
        return NextResponse.json({ error: 'Failed to restart WireGuard VPN' }, { status: 500 });
      }
      return NextResponse.json({ message: 'VPN restart initiated successfully', opnsenseResponse: wg });
    } else {
      return NextResponse.json({ error: 'Unsupported VPN type for restart.' }, { status: 400 });
    }

    return NextResponse.json({ message: 'VPN restart initiated successfully', opnsenseResponse });
    } catch (error) {
      logger.error(`Failed to restart ${vpnType} VPN:`, error);
      return NextResponse.json({ error: `Failed to restart ${vpnType} VPN` }, { status: 500 });
    }
  });
}