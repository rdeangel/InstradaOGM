import { NextRequest, NextResponse } from 'next/server';
import { isPrivateIP, lookupNetworkDetails } from '@/lib/server/network-utils';
import { logger } from '@/lib/logger';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';
import { exportAliases } from '@/lib/opnsense-api';
import type { ValidLocalNetwork } from '@/types/settings';
import { toJsonArrayOrUndefined } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetIp = searchParams.get('ip');

  // Determine client IP using standardized helper
  const { getClientIp } = await import('@/lib/network-utils');
  let clientIp = getClientIp(request);

  if (clientIp && clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.substring(7); // Remove '::ffff:' IPv4-mapped IPv6 address prefix
  }

  // Use targetIp from query parameter if provided, otherwise use clientIp
  const ipToLookup = targetIp || clientIp;

  // Normalize IPs for comparison
  const normalizedTargetIp = targetIp ? targetIp.trim().replace(/^::ffff:/, '') : undefined;
  const normalizedClientIp = clientIp ? clientIp.trim().replace(/^::ffff:/, '') : undefined;

  if (!ipToLookup) {
    return NextResponse.json({ error: 'Could not determine IP address to lookup' }, { status: 500 });
  }

  // Authenticate the request
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // For unauthenticated users, check if self-service is globally disabled
  if (!auth.user) {
    // Check if self-service is globally disabled
    const globalSettings = await prisma.globalSettings.findFirst({
      orderBy: { id: 'asc' },
    });

    if (globalSettings?.removeSelfServicePage) {
      logger.info(`Unauthenticated IP lookup blocked - self - service functionality is disabled`);
      return NextResponse.json({
        error: 'Forbidden: Self-service functionality is disabled'
      }, { status: 403 });
    }

    // Restrict to their own IP only
    if (targetIp && normalizedTargetIp !== normalizedClientIp) {
      logger.warn(`Unauthenticated user attempted to query IP ${targetIp} from client IP ${clientIp}.Blocked.`);
      return NextResponse.json({
        error: 'Unauthorized: Unauthenticated users can only query their own IP address'
      }, { status: 403 });
    }

    // Check if client IP is allowed for self-service operations
    const { isIpAllowedForSelfService } = await import('@/lib/network-utils');
    const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

    const ipValidation = isIpAllowedForSelfService(
      clientIp || null,
      ipToLookup,
      allowedNetworks,
      false // unauthenticated
    );

    if (!ipValidation.isAllowed) {
      logger.info(`Self - service access denied for IP lookup from client IP ${clientIp}: ${ipValidation.reason} `);
      return NextResponse.json({
        error: `Forbidden: ${ipValidation.reason} `
      }, { status: 403 });
    }
  } else {
    // For authenticated users, allow access to their own IP for self-service
    logger.debug(`Authenticated user ${auth.user.email} - targetIp: ${targetIp}, clientIp: ${clientIp}, normalizedTargetIp: ${normalizedTargetIp}, normalizedClientIp: ${normalizedClientIp} `);
    if (!targetIp || normalizedTargetIp === normalizedClientIp) {
      logger.debug(`Authenticated user ${auth.user.email} querying their own IP ${ipToLookup} (self - service)`);
      // Allow: skip all group/alias permission checks
    } else {
      // For other IPs, check if they have permission to access this IP
      // by checking if the IP corresponds to a host alias they have permission to manage

      // Get user's group memberships (both direct and SSO)
      const userAccounts = await prisma.account.findMany({
        where: { userId: auth.user.id },
        select: { externalGroups: true, provider: true },
      });

      // Collect external group memberships
      const externalGroups: { provider: string; groupName: string }[] = [];
      userAccounts.forEach(account => {
        if (account.externalGroups && Array.isArray(account.externalGroups)) {
          account.externalGroups.forEach(groupName => {
            if (typeof groupName === 'string') {
              externalGroups.push({ provider: account.provider, groupName: groupName });
            }
          });
        }
      });

      // Find local groups mapped to these external groups (case-insensitive provider matching)
      const mappedLocalGroups = externalGroups.length > 0
        ? await prisma.ssoGroupMapping.findMany({
          where: {
            OR: externalGroups.map(eg => ({
              ssoProvider: {
                equals: eg.provider,
                ...getCaseInsensitiveMode(),
              },
              ssoGroupName: eg.groupName,
            })),
          },
          select: { localGroupId: true },
        })
        : [];

      const ssoLocalGroupIds = mappedLocalGroups.map(mapping => mapping.localGroupId);

      // Get direct group memberships
      const userWithDirectGroups = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { groups: { select: { id: true } } },
      });

      const directLocalGroupIds = userWithDirectGroups?.groups.map(group => group.id) || [];

      // Combine all local group IDs
      const allLocalGroupIds = [...new Set([...ssoLocalGroupIds, ...directLocalGroupIds])];

      if (allLocalGroupIds.length === 0) {
        logger.warn(`Authenticated user ${auth.user.email} has no group memberships.Access denied.`);
        return NextResponse.json({
          error: 'Unauthorized: You do not have permission to access this IP address'
        }, { status: 403 });
      }

      // Get user's host alias permissions
      const groupPermissions = await prisma.groupHostAliasPermission.findMany({
        where: {
          groupId: {
            in: allLocalGroupIds,
          },
        },
        select: {
          opnsenseAliasUuid: true,
        },
      });

      const permittedAliasUuids = groupPermissions.map(permission => permission.opnsenseAliasUuid);
      const hasWildcardPermission = permittedAliasUuids.includes('*');

      if (!hasWildcardPermission && permittedAliasUuids.length === 0) {
        logger.warn(`Authenticated user ${auth.user.email} has no host alias permissions.Access denied.`);
        return NextResponse.json({
          error: 'Unauthorized: You do not have permission to access any IP addresses'
        }, { status: 403 });
      }

      // If user has wildcard permission, they can access any IP
      if (!hasWildcardPermission) {
        // Check if the target IP corresponds to a host alias the user has permission to access
        const allAliasesResponse = await exportAliases();
        if (!allAliasesResponse?.aliases?.alias) {
          logger.error('Could not retrieve aliases from OPNsense for permission check');
          return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }

        const allAliasDetails = Object.entries(allAliasesResponse.aliases.alias)
          .map(([uuid, detail]) => ({ ...detail, uuid }));

        // Find host aliases that contain the target IP
        const matchingAliases = allAliasDetails.filter(alias => {
          if (alias.type !== 'host') return false;
          if (typeof alias.content !== 'string') return false;

          const entries = alias.content.split(/[\s,]+/).filter(Boolean);
          return entries.includes(ipToLookup);
        });

        // Check if user has permission to access any of the matching aliases
        const hasPermission = matchingAliases.some(alias =>
          permittedAliasUuids.includes(alias.uuid)
        );

        if (!hasPermission) {
          logger.warn(`Authenticated user ${auth.user.email} attempted to query IP ${ipToLookup} without permission.Blocked.`);
          return NextResponse.json({
            error: 'Unauthorized: You do not have permission to access this IP address'
          }, { status: 403 });
        }
      }

      logger.debug(`Authenticated user ${auth.user.email} querying IP ${ipToLookup} with permission`);
    }
  }

  let macFromOpnsense: string | null = null;
  let vendorFromOpnsense: string | null = null;
  let hostnameFromOpnsense: string | null = null;

  let macFromLocal: string | null = null;
  let vendorFromLocal: string | null = null;
  let vendorSource: 'OPNsense' | 'Local DB' | null = null;

  // Only attempt MAC lookup if the IP is a private IP address.
  if (isPrivateIP(ipToLookup)) {
    const networkDetailsResult = await lookupNetworkDetails(ipToLookup);
    if (networkDetailsResult) {
      if (networkDetailsResult.source === 'opnsense') {
        macFromOpnsense = networkDetailsResult.mac;
        vendorFromOpnsense = networkDetailsResult.vendor;
        hostnameFromOpnsense = networkDetailsResult.hostname;
        if (vendorFromOpnsense) {
          vendorSource = 'OPNsense';
        }
      } else if (networkDetailsResult.source === 'local') {
        macFromLocal = networkDetailsResult.mac;
        vendorFromLocal = networkDetailsResult.vendor;
        if (vendorFromLocal) {
          vendorSource = 'Local DB';
        }
      }
    }
  } else {
    logger.debug(`Skipping network details lookup for non - private IP: ${ipToLookup} `);
  }

  const finalMac = macFromOpnsense || macFromLocal;
  const finalVendor = vendorFromOpnsense || vendorFromLocal;
  const finalHostname = hostnameFromOpnsense; // Hostname only comes from OPNsense

  // Track usage for both authenticated and unauthenticated requests
  if (auth && auth.user) {
    await trackUsageByAuthMethod(request, auth, 200);
  } else {
    // For unauthenticated requests, use session tracking instead of audit logs
    // This will appear in real-time monitoring but not clutter audit logs
    const { trackSessionUsageEvent } = await import('@/lib/session-usage-tracker');
    await trackSessionUsageEvent({
      sessionToken: `unauth - ${clientIp || 'unknown'} `, // Generate dummy session token for unauthenticated
      userId: null, // No user ID for unauthenticated
      endpoint: '/api/ip',
      method: 'GET',
      actionType: 'api_call',
      statusCode: 200,
      responseTime: 0, // Not tracking response time for unauthenticated
      ipAddress: clientIp || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      pageUrl: undefined, // Not a page view
      referrer: undefined,
      requestSize: 0,
      errorType: undefined,
      errorMessage: undefined,
    });
  }

  return NextResponse.json({
    ip: ipToLookup,
    mac: finalMac,
    vendor: finalVendor,
    vendorSource: vendorSource,
    hostname: finalHostname,
    clientIp: clientIp || null,
  });
}