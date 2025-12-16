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
        logger.warn(`IPsec Restart API: Unauthorized access attempt by role: ${auth.user?.role}`);
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

    const { vpnUuid } = await req.json();
    logger.debug(`IPsec Restart API received: vpnUuid=${vpnUuid}`);

    if (!vpnUuid) {
      return new NextResponse(JSON.stringify({ error: 'VPN UUID is required' }), { status: 400 });
    }

    logger.info(`Attempting to restart IPsec session for UUID: ${vpnUuid} (disconnect then connect)`);

    logger.debug(`Calling OPNsense disconnect API for UUID: ${vpnUuid}`);
    // 1. Disconnect the IPsec session
    const disconnectResponse: OpnsenseApiResponse = await fetchFromOpnsense(`/api/ipsec/sessions/disconnect/${vpnUuid}`, 'POST', {});
    logger.debug(`OPNsense disconnectResponse for ${vpnUuid}:`, disconnectResponse);
    if (disconnectResponse.result !== 'ok') {
      logger.error(`OPNsense API reported failure for IPsec disconnect during restart: ${vpnUuid}`, disconnectResponse);
      return new NextResponse(JSON.stringify({ error: disconnectResponse.message || 'Failed to disconnect IPsec service on OPNsense during restart.' }), { status: 500 });
    }
    logger.info(`IPsec VPN ${vpnUuid} disconnected.`);

    // Introduce a delay to allow OPNsense to fully process the disconnect
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 2. Connect the IPsec session again
    logger.debug(`Calling OPNsense connect API for UUID: ${vpnUuid}`);
    const connectResponse: OpnsenseApiResponse = await fetchFromOpnsense(`/api/ipsec/sessions/connect/${vpnUuid}`, 'POST', {});
    logger.debug(`OPNsense connectResponse for ${vpnUuid}:`, connectResponse);
    if (connectResponse.result !== 'ok') {
      logger.error(`OPNsense API reported failure for IPsec connect during restart: ${vpnUuid}`, connectResponse);
      return new NextResponse(JSON.stringify({ error: connectResponse.message || 'Failed to connect IPsec service on OPNsense during restart.' }), { status: 500 });
    }
    logger.info(`IPsec VPN ${vpnUuid} connected.`);

    return new NextResponse(JSON.stringify({ message: 'IPsec restart initiated successfully', disconnectResponse, connectResponse }));
    } catch (error) {
      logger.error('Failed to restart IPsec via API endpoint:', error);
      return new NextResponse(JSON.stringify({ error: 'Failed to restart IPsec' }), { status: 500 });
    }
  });
}