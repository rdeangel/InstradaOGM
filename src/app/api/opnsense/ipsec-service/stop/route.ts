import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role, OpnsenseApiResponse } from '@/types/opnsense';
import { fetchFromOpnsense } from '@/lib/opnsense-api';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      // Only allow ADMIN and SUPER_ADMIN roles to access this endpoint
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        logger.warn(`IPsec Stop API: Unauthorized access attempt by role: ${auth.user?.role}`);
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

    const { vpnUuid } = await req.json();
    logger.debug(`IPsec Stop API received: vpnUuid=${vpnUuid}`);

    if (!vpnUuid) {
      return new NextResponse(JSON.stringify({ error: 'VPN UUID is required' }), { status: 400 });
    }

    logger.info(`Attempting to disconnect IPsec session for UUID: ${vpnUuid}`);
    const opnsenseResponse: OpnsenseApiResponse = await fetchFromOpnsense(`/api/ipsec/sessions/disconnect/${vpnUuid}`, 'POST', {});

    logger.debug(`OPNsense disconnectResponse for ${vpnUuid}:`, opnsenseResponse);
    if (opnsenseResponse.result !== 'ok') {
      logger.error(`OPNsense API reported failure for IPsec stop: ${vpnUuid}`, opnsenseResponse);
      return new NextResponse(JSON.stringify({ error: opnsenseResponse.message || 'Failed to stop IPsec service on OPNsense.' }), { status: 500 });
    }

    return NextResponse.json({ message: 'IPsec stop initiated successfully', opnsenseResponse });
    } catch (error) {
      logger.error('Failed to stop IPsec via API endpoint:', error);
      return new NextResponse(JSON.stringify({ error: 'Failed to stop IPsec' }), { status: 500 });
    }
  });
}