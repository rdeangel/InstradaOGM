import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { getFilteredHostAliases } from '@/lib/host-alias-filtering';
import { prisma } from '@/lib/prisma';
import type { ValidLocalNetwork } from '@/types/settings';
import { isIpAllowedForSelfService } from '@/lib/network-utils';
import type { OpnsenseAliasDetailFromExport } from '@/types/opnsense';
import { toJsonArrayOrUndefined } from '@/lib/utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ipAddress = searchParams.get('ipAddress');
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'UNKNOWN_IP';

  try {
    if (ipAddress) {
      // Get allowed networks for self-service validation
      const globalSettings = await prisma.globalSettings.findFirst({
        orderBy: { id: 'asc' },
      });

      // Check if self-service is globally disabled for unauthenticated users
      // Note: Authenticated admin users should still be able to access this endpoint for admin functionality
      if (!auth.user && globalSettings?.removeSelfServicePage) {
        logger.info(`Unauthenticated filtered host alias lookup blocked - self-service functionality is disabled`);
        return new NextResponse(JSON.stringify({
          error: 'Forbidden: Self-service functionality is disabled'
        }), { status: 403 });
      }

      const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

      // Check if the IP is allowed for self-service operations
      const ipValidation = isIpAllowedForSelfService(
        clientIp,
        ipAddress,
        allowedNetworks,
        !!auth.user
      );

      if (!ipValidation.isAllowed) {
        logger.warn(`Self-service access denied for IP ${ipAddress} from client IP ${clientIp}: ${ipValidation.reason}`);
        return new NextResponse(JSON.stringify({ error: `Forbidden: ${ipValidation.reason}` }), { status: 403 });
      }

      // Use server-side utility to get host aliases
      const { getHostAliasesServer } = await import('@/lib/server/host-alias-management-utils');
      const internalResult = await getHostAliasesServer();

      if (!internalResult.success) {
        throw new Error('Failed to fetch host aliases from server utility');
      }

      const hostAliases = internalResult.data?.hostAliases || [];

      // Find the alias where content matches the detected IP
      const matchingAlias = hostAliases.find((alias: OpnsenseAliasDetailFromExport & { uuid: string; detectedMac?: string | null; detectedVendor?: string | null; }) =>
        alias.content.split('\n').includes(ipAddress) && alias.type === 'host'
      );

      if (matchingAlias) {
        // Always return only name and uuid for public/user-facing requests
        return NextResponse.json({ name: matchingAlias.name, uuid: matchingAlias.uuid });
      } else {
        return NextResponse.json({ name: null, uuid: null }, { status: 200 });
      }
    }

    // If no IP address provided, require authentication and return filtered host aliases based on user permissions
    if (!auth.user) {
      logger.warn(`Unauthenticated user attempted to access filtered host aliases without IP parameter. Blocked.`);
      return new NextResponse(JSON.stringify({ error: 'Unauthorized: Authentication required to access host aliases' }), { status: 401 });
    }

    // Use the getFilteredHostAliases function which includes proper filtering for globally disabled network groups
    const { displayableHostAliases, filteredCount } = await getFilteredHostAliases();

    return NextResponse.json({
      displayableHostAliases: displayableHostAliases,
      totalCount: filteredCount,
    });

    // Track usage for authenticated requests
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 200);
    }
  } catch (error) {
    logger.error('Error in filtered-host-aliases API:', error);

    // Track usage for authenticated requests (even failed ones)
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 500);
    }

    return new NextResponse(JSON.stringify({ error: 'Failed to fetch host aliases' }), { status: 500 });
  }
}