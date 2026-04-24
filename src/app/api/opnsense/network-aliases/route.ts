import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import { logApiAccess } from '@/lib/auditLog';
import { exportAliases, addAliasItem, reconfigureAliases } from '@/lib/opnsense-api';
import { enrichNetworkAliasesWithGroups } from '@/lib/network-alias-filtering';
import type { NetworkAlias } from '@/types/opnsense';

async function getFeatureToggle(): Promise<boolean> {
  const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
  return settings?.manageNetworkAliasesEnabled ?? false;
}

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const enabled = await getFeatureToggle();
      if (!enabled) {
        return NextResponse.json(
          { error: 'Feature disabled', code: 'NETWORK_ALIAS_MANAGEMENT_DISABLED' },
          { status: 403 }
        );
      }

      const allAliasesResponse = await exportAliases();
      if (!allAliasesResponse?.aliases?.alias) {
        return NextResponse.json({ error: 'Failed to retrieve aliases from OPNsense' }, { status: 502 });
      }

      const aliasMap = allAliasesResponse.aliases.alias;
      const networkAliases: NetworkAlias[] = Object.entries(aliasMap)
        .filter(([, alias]) => alias.type === 'network')
        .map(([uuid, alias]) => ({
          uuid,
          name: alias.name,
          type: 'network' as const,
          content: alias.content,
          description: alias.description || '',
          enabled: (alias.enabled as '0' | '1') || '1',
        }));

      const enriched = enrichNetworkAliasesWithGroups(networkAliases, aliasMap as Record<string, { type: string; name: string; content: string; description: string; enabled: string }>);

      return NextResponse.json(enriched);
    } catch (error) {
      logger.error('Error fetching network aliases:', error);
      return NextResponse.json({ error: 'Failed to fetch network aliases' }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const enabled = await getFeatureToggle();
      if (!enabled) {
        return NextResponse.json(
          { error: 'Feature disabled', code: 'NETWORK_ALIAS_MANAGEMENT_DISABLED' },
          { status: 403 }
        );
      }

      const body: { name: string; content: string; description?: string; enabled?: boolean } = await request.json();

      await logApiAccess(auth, 'NETWORK_ALIAS_CREATE_ATTEMPT', {
        aliasName: body.name,
        content: body.content,
        description: body.description || '',
      }, request);

      const result = await addAliasItem({
        alias: {
          name: body.name,
          type: 'network',
          content: body.content,
          description: body.description || '',
          enabled: body.enabled !== false ? '1' : '0',
        },
      });

      await reconfigureAliases();

      await logApiAccess(auth, 'NETWORK_ALIAS_CREATE_SUCCESS', {
        aliasName: body.name,
        aliasUuid: result.uuid || 'unknown',
        content: body.content,
      }, request);

      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      logger.error('Error creating network alias:', error);
      await logApiAccess(auth, 'NETWORK_ALIAS_CREATE_FAILURE', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, request, error instanceof Error ? error.message : 'Unknown error');
      return NextResponse.json({ error: 'Failed to create network alias' }, { status: 500 });
    }
  });
}
