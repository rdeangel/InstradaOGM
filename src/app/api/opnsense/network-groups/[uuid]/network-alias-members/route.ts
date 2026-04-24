import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import { logApiAccess } from '@/lib/auditLog';
import { exportAliases, setAliasItem, reconfigureAliases, parseGroupContent } from '@/lib/opnsense-api';

async function getFeatureToggle(): Promise<boolean> {
  const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
  return settings?.manageNetworkAliasesEnabled ?? false;
}

export async function POST(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
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

      const { uuid: networkGroupUuid } = await params;
      const body: { add?: string[]; remove?: string[] } = await request.json();
      const toAdd = Array.isArray(body.add) ? body.add : [];
      const toRemove = Array.isArray(body.remove) ? body.remove : [];

      const allAliasesResponse = await exportAliases();
      if (!allAliasesResponse?.aliases?.alias) {
        return NextResponse.json({ error: 'Failed to retrieve aliases from OPNsense' }, { status: 502 });
      }

      const aliasMap = allAliasesResponse.aliases.alias;

      // eslint-disable-next-line security/detect-object-injection
      const networkGroup = aliasMap[networkGroupUuid];
      if (!networkGroup || networkGroup.type !== 'networkgroup') {
        return NextResponse.json({ error: 'Network group not found' }, { status: 404 });
      }

      const skipped: { uuid: string; reason: 'not-found' | 'wrong-type' }[] = [];
      const addedEntries: { uuid: string; name: string }[] = [];
      const removedEntries: { uuid: string; name: string }[] = [];

      // Resolve UUIDs to names
      const resolveUuid = async (aliasUuid: string): Promise<{ name: string } | null> => {
        const alias = aliasMap[aliasUuid];
        if (!alias) {
          skipped.push({ uuid: aliasUuid, reason: 'not-found' });
          return null;
        }
        if (alias.type !== 'network') {
          skipped.push({ uuid: aliasUuid, reason: 'wrong-type' });
          return null;
        }
        return { name: alias.name };
      };

      // Build current content set
      const currentContent = new Set(parseGroupContent(networkGroup.content, networkGroup.name));

      for (const aliasUuid of toAdd) {
        const resolved = await resolveUuid(aliasUuid);
        if (resolved) {
          currentContent.add(resolved.name);
          addedEntries.push({ uuid: aliasUuid, name: resolved.name });
          await logApiAccess(auth, 'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_ADD_ATTEMPT', {
            networkGroupUuid, networkGroupName: networkGroup.name, networkAliasUuid: aliasUuid, networkAliasName: resolved.name,
          }, request);
        }
      }

      for (const aliasUuid of toRemove) {
        const alias = aliasMap[aliasUuid];
        if (!alias) { skipped.push({ uuid: aliasUuid, reason: 'not-found' }); continue; }
        currentContent.delete(alias.name);
        removedEntries.push({ uuid: aliasUuid, name: alias.name });
        await logApiAccess(auth, 'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_REMOVE_ATTEMPT', {
          networkGroupUuid, networkGroupName: networkGroup.name, networkAliasUuid: aliasUuid, networkAliasName: alias.name,
        }, request);
      }

      const newContent = Array.from(currentContent).join('\n');

      await setAliasItem(networkGroupUuid, {
        name: networkGroup.name,
        type: 'networkgroup',
        content: newContent,
        description: networkGroup.description || '',
        enabled: networkGroup.enabled || '1',
      });
      await reconfigureAliases();

      for (const entry of addedEntries) {
        await logApiAccess(auth, 'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_ADD_SUCCESS', {
          networkGroupUuid, networkGroupName: networkGroup.name, networkAliasUuid: entry.uuid, networkAliasName: entry.name,
        }, request);
      }
      for (const entry of removedEntries) {
        await logApiAccess(auth, 'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_REMOVE_SUCCESS', {
          networkGroupUuid, networkGroupName: networkGroup.name, networkAliasUuid: entry.uuid, networkAliasName: entry.name,
        }, request);
      }

      return NextResponse.json({ added: addedEntries, removed: removedEntries, skipped });
    } catch (error) {
      logger.error('Error updating network alias members:', error);
      await logApiAccess(auth, 'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_ADD_FAILURE', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, request, error instanceof Error ? error.message : 'Unknown error');
      return NextResponse.json({ error: 'Failed to update network alias members' }, { status: 502 });
    }
  });
}
