import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { fetchFromOpnsense } from '@/lib/opnsense-api';

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

    const { vpnUuid } = await req.json();

    if (!vpnUuid) {
      return NextResponse.json({ error: 'VPN UUID is required' }, { status: 400 });
    }

    // Call OPNsense API to stop the VPN service
    const opnsenseResponse = await fetchFromOpnsense(`/api/openvpn/service/stopService/${vpnUuid}`, 'POST', {});

    return NextResponse.json({ message: 'VPN stop initiated successfully', opnsenseResponse });
    } catch (error) {
      logger.error('Failed to stop VPN:', error);
      return NextResponse.json({ error: 'Failed to stop VPN' }, { status: 500 });
    }
  });
}