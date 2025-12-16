import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role, OpnsenseApiResponse } from '@/types/opnsense';
import { fetchFromOpnsense } from '@/lib/opnsense-api';

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

    let opnsenseResponse: OpnsenseApiResponse;

    if (vpnType === 'OpenVPN') {
      opnsenseResponse = await fetchFromOpnsense(`/api/openvpn/service/restartService/${vpnUuid}`, 'POST', {});
    } else if (vpnType === 'WireGuard') {
      opnsenseResponse = await fetchFromOpnsense(`/api/opnsense/wireguard/service/restartService/${vpnUuid}`, 'POST', {});
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