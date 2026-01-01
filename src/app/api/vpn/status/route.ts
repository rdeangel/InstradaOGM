import { NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { ValidLocalNetwork } from '@/types/settings';
import { isIpAllowedForSelfService } from '@/lib/network-utils';
import { toJsonArrayOrUndefined } from '@/lib/utils';

export async function GET(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  try {
    auth = await authenticateRequest(request);

    // Check for rate limiting and other auth errors (for authenticated users)
    if (auth.user) {
      const authError = handleAuthResponse(auth);
      if (authError) return authError;
    }

    // For unauthenticated users, validate IP is in allowed networks for self-service
    if (!auth.user) {
      const { getClientIp } = await import('@/lib/network-utils');
      const clientIp = getClientIp(request);

      // Get global settings to check allowed networks and self-service status
      const globalSettings = await prisma.globalSettings.findFirst({
        orderBy: { id: 'asc' },
      });

      // Check if self-service is globally disabled
      if (globalSettings?.removeSelfServicePage) {
        logger.info(`Unauthenticated VPN status lookup blocked - self-service functionality is disabled`);
        return NextResponse.json({
          error: 'Forbidden: Self-service functionality is disabled'
        }, { status: 403 });
      }

      const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

      // Check if the client IP is allowed for self-service operations
      const ipValidation = isIpAllowedForSelfService(
        clientIp,
        clientIp || '', // For VPN status, we check if the client's own IP is allowed
        allowedNetworks,
        false // unauthenticated
      );

      if (!ipValidation.isAllowed) {
        logger.info(`Self-service access denied for VPN status from client IP ${clientIp}: ${ipValidation.reason}`);
        return NextResponse.json({ error: `Forbidden: ${ipValidation.reason}` }, { status: 403 });
      }
    }

    logger.info(`VPN Status API: ${auth.user ? 'Authenticated' : 'Unauthenticated'} access by ${auth.user?.role || 'unauthenticated'}`);

    // Use server-side utility to get VPN status
    const { getVpnStatusServer } = await import('@/lib/server/vpn-status-utils');
    const internalResult = await getVpnStatusServer();

    if (!internalResult.success) {
      logger.error('Failed to fetch VPN status from server utility');
      return new NextResponse(JSON.stringify({ error: 'Failed to fetch VPN status' }), { status: 500 });
    }

    const internalData = internalResult.data;

    if (!internalData) {
      logger.error('No data returned from server utility');
      return new NextResponse(JSON.stringify({ error: 'Failed to fetch VPN status' }), { status: 500 });
    }

    // Return different data based on authentication status (context-aware)
    if (!auth.user) {
      // Return minimal data for unauthenticated users (for self-service VPN badges)
      // Only essential data for UI functionality - no sensitive infrastructure details
      logger.info('[vpn-status] Returning minimal VPN data for unauthenticated access');
      const response = {
        vpnStatuses: internalData.vpnStatuses.map((vpn) => ({
          id: vpn.id,
          status: vpn.status,
          enabled: Boolean(vpn.enabled),
          opnsenseNetworkGroupId: vpn.opnsenseNetworkGroupId,
          // Only VPN type for tooltips - no names, interfaces, IPs, or other sensitive data
          type: (vpn.details?.type as string) || (vpn.type as string) || 'unknown'
        })),
        groupVpnMap: internalData.groupVpnMap
      };

      // Track usage for authenticated requests (unauthenticated requests don't get tracked)
      await trackUsageByAuthMethod(request, auth, 200);

      return NextResponse.json(response);
    } else if (auth.user.role === Role.SUPER_ADMIN) {
      // Return full VPN status data for SUPER_ADMIN
      logger.debug(`VPN Status API: Returning full data for SUPER_ADMIN`);
      const response = {
        vpnStatuses: internalData.vpnStatuses,
        groupVpnMap: internalData.groupVpnMap,
        totalCount: internalData.totalCount,
        summary: internalData.summary,
        details: internalData.vpnStatuses // Include full details for SUPER_ADMIN
      };

      // Track usage for authenticated requests
      await trackUsageByAuthMethod(request, auth, 200);

      return NextResponse.json(response);
    } else if (auth.user.role === Role.ADMIN) {
      // Return filtered data for ADMIN role
      logger.debug(`VPN Status API: Returning filtered data for ADMIN`);
      const filteredVpnStatuses = internalData.vpnStatuses.map(vpn => ({
        id: vpn.id,
        status: vpn.status,
        enabled: vpn.enabled,
        opnsenseNetworkGroupId: vpn.opnsenseNetworkGroupId,
        type: (vpn.details?.type as string) || (vpn.type as string) || 'unknown',
        vpnName: vpn.vpnName,
        friendlyName: vpn.friendlyName
      }));

      const response = {
        vpnStatuses: filteredVpnStatuses,
        groupVpnMap: internalData.groupVpnMap,
        totalCount: internalData.totalCount,
        summary: internalData.summary
      };
      return NextResponse.json(response);
    } else if (auth.user.role === Role.USER) {
      // USER role - return minimal data (same as unauthenticated users)
      logger.info('[vpn-status] Returning minimal VPN data for USER role');
      const response = {
        vpnStatuses: internalData.vpnStatuses.map((vpn) => ({
          id: vpn.id,
          status: vpn.status,
          enabled: Boolean(vpn.enabled),
          opnsenseNetworkGroupId: vpn.opnsenseNetworkGroupId,
          type: (vpn.details?.type as string) || (vpn.type as string) || 'unknown'
        })),
        groupVpnMap: internalData.groupVpnMap
      };

      // Track usage for authenticated requests
      await trackUsageByAuthMethod(request, auth, 200);

      return NextResponse.json(response);
    } else {
      // Unknown role - insufficient permissions for VPN status
      logger.warn(`VPN Status API: Unauthorized access attempt by role: ${auth.user.role}`);

      // Track usage for authenticated requests (even failed ones)
      await trackUsageByAuthMethod(request, auth, 403);

      return new NextResponse(JSON.stringify({ error: 'Insufficient permissions - USER, ADMIN or SUPER_ADMIN required' }), { status: 403 });
    }
  } catch (error) {
    logger.error('Error in VPN status admin API:', error);

    // Track usage for authenticated requests (even failed ones)
    if (auth) {
      await trackUsageByAuthMethod(request, auth, 500);
    }

    return new NextResponse(JSON.stringify({ error: 'Failed to fetch VPN status' }), { status: 500 });
  }
}