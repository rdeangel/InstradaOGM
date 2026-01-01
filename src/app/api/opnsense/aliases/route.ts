import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest, authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { OpnsenseAliasDetailFromExport } from '@/lib/opnsense-api';
// Removed unused import NetworkGroup
import type { ValidLocalNetwork } from '@/types/settings';
import { isIpAllowedForSelfService } from '@/lib/network-utils';
import { prisma } from '@/lib/prisma';
import { logApiAccess } from '@/lib/auditLog';
import { toJsonArrayOrUndefined } from '@/lib/utils';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    const { searchParams } = new URL(request.url);
    const ipAddress = searchParams.get('ipAddress');
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'UNKNOWN_IP';

    try {
      if (ipAddress) {
        // Handle self-service IP lookup (requires IP validation)
        const globalSettings = await prisma.globalSettings.findFirst({
          orderBy: { id: 'asc' },
        });

        // Check if self-service is globally disabled for unauthenticated users
        if (!auth.user && globalSettings?.removeSelfServicePage) {
          logger.info(`Unauthenticated alias lookup blocked - self-service functionality is disabled`);
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

        // Use server-side utility for IP lookup
        const { getHostAliasByIpServer } = await import('@/lib/server/aliases-utils');
        const internalResult = await getHostAliasByIpServer(ipAddress);

        if (!internalResult.success) {
          logger.error('Failed to fetch alias from server utility');
          return new NextResponse(JSON.stringify({ error: 'Failed to fetch alias' }), { status: 500 });
        }

        const internalData = internalResult.data;

        if (internalData && internalData.name) {
          // Return only name and uuid for self-service requests
          return NextResponse.json({ name: internalData.name, uuid: internalData.uuid });
        } else {
          return NextResponse.json({ name: null, uuid: null }, { status: 200 });
        }
      }

      // Handle authenticated requests for all aliases
      if (!auth.user) {
        logger.warn(`Unauthenticated user attempted to access aliases without IP parameter. Blocked.`);
        return new NextResponse(JSON.stringify({ error: 'Unauthorized: Authentication required to access aliases' }), { status: 401 });
      }

      // Check role permissions
      if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
        logger.warn(`Aliases API: Unauthorized access attempt by role: ${auth.user.role}`);
        return new NextResponse(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 });
      }

      logger.info(`Aliases API: Authenticated access by user ${auth.user.id} (${auth.user.role})`);

      // Use server-side utility to get all aliases
      const { getAllAliasesServer } = await import('@/lib/server/aliases-utils');
      const internalResult = await getAllAliasesServer();

      if (!internalResult.success) {
        logger.error('Failed to fetch aliases from server utility');
        return new NextResponse(JSON.stringify({ error: 'Failed to fetch aliases' }), { status: 500 });
      }

      const internalData = internalResult.data;

      if (!internalData) {
        logger.error('No data returned from server utility');
        return new NextResponse(JSON.stringify({ error: 'Failed to fetch aliases' }), { status: 500 });
      }

      // Filter data based on user role
      const response: {
        hostAliases: (OpnsenseAliasDetailFromExport & { uuid: string; detectedMac?: string | null; detectedVendor?: string | null; })[];
        networkGroups: unknown[]; // Using unknown[] to match the actual structure from server utility
        totalCount: number;
        allAliases?: Record<string, OpnsenseAliasDetailFromExport>;
      } = {
        hostAliases: internalData.hostAliases,
        networkGroups: internalData.networkGroups,
        totalCount: internalData.totalCount,
      };

      if (auth.user.role === Role.SUPER_ADMIN) {
        // For SUPER_ADMIN, include all data including allAliases
        response.allAliases = internalData.allAliases;
      }

      logger.debug(`Aliases API: Returning data for ${auth.user.role} role`);

      return NextResponse.json(response);
    } catch (error) {
      logger.error('Error in authenticated aliases API:', error);
      return NextResponse.json({ error: 'Failed to fetch aliases' }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  if (!auth.user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Only allow ADMIN and SUPER_ADMIN to create aliases
  if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
    return new NextResponse(JSON.stringify({ error: 'Forbidden: Insufficient permissions' }), { status: 403 });
  }

  let body: { name: string; content: string; description?: string } | undefined;
  try {
    body = await request.json();

    // Log the attempt to create host alias
    await logApiAccess(auth, 'HOST_ALIAS_CREATE_ATTEMPT', {
      aliasName: body!.name,
      aliasType: 'host',
      content: body!.content,
      description: body!.description || ''
    }, request);

    // Use server-side utility to create the alias
    const { createHostAliasServer } = await import('@/lib/server/aliases-utils');
    const internalResult = await createHostAliasServer(body!.name, body!.content, body!.description);

    if (!internalResult.success) {
      // Log failure
      await logApiAccess(auth, 'HOST_ALIAS_CREATE_FAILURE', {
        aliasName: body!.name,
        aliasType: 'host',
        content: body!.content,
        reason: 'Server utility failure',
        error: internalResult.error
      }, request, internalResult.error || 'Failed to create alias');

      logger.error('Failed to create alias via server utility');
      return new NextResponse(JSON.stringify({ error: internalResult.error || 'Failed to create alias' }), { status: 500 });
    }

    const result = internalResult.data;

    // Log successful creation
    await logApiAccess(auth, 'HOST_ALIAS_CREATE_SUCCESS', {
      aliasName: body!.name,
      aliasType: 'host',
      aliasUuid: result?.uuid || 'unknown',
      content: body!.content
    }, request);

    logger.info(`Alias created by user ${auth.user.id} (${auth.user.role})`);

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error creating host alias:', error);

    // Log the error in audit log
    await logApiAccess(auth, 'HOST_ALIAS_CREATE_FAILURE', {
      aliasName: body?.name || 'unknown',
      aliasType: 'host',
      content: body?.content || 'unknown',
      reason: 'API Error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    }, request, `Failed to create host alias: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return new NextResponse(JSON.stringify({ error: 'Failed to create host alias' }), { status: 500 });
  }
}
