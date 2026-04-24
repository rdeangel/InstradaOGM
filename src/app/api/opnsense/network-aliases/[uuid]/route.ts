import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import { logApiAccess } from '@/lib/auditLog';
import { exportAliases, setAliasItem, deleteAliasItem, reconfigureAliases } from '@/lib/opnsense-api';

const ALIAS_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

async function getFeatureToggle(): Promise<boolean> {
  const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
  return settings?.manageNetworkAliasesEnabled ?? false;
}

export async function PUT(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
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

      const { uuid } = await params;

      const body: { name: string; content: string; description?: string; enabled?: '0' | '1' } = await request.json();

      // Server-side name validation (match host-alias rules)
      const trimmedName = body.name?.trim();
      if (!trimmedName) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      }
      if (!ALIAS_NAME_REGEX.test(trimmedName)) {
        return NextResponse.json(
          { error: 'Name must be alphanumeric with underscores only (no spaces or hyphens)' },
          { status: 400 }
        );
      }

      // Duplicate-name check
      const allAliasesResponse = await exportAliases();
      if (!allAliasesResponse?.aliases?.alias) {
        return NextResponse.json({ error: 'Failed to retrieve aliases from OPNsense' }, { status: 502 });
      }
      const aliasMap = allAliasesResponse.aliases.alias;
      const duplicate = Object.entries(aliasMap).find(
        ([existingUuid, a]) => a.name === trimmedName && existingUuid !== uuid
      );
      if (duplicate) {
        return NextResponse.json(
          { error: 'Duplicate alias name', duplicateUuid: duplicate[0] },
          { status: 409 }
        );
      }

      const oldAlias = aliasMap[uuid];
      const oldName = oldAlias?.name || uuid;

      await logApiAccess(auth, 'NETWORK_ALIAS_UPDATE_ATTEMPT', {
        uuid,
        oldName,
        newName: trimmedName,
        contentChanged: oldAlias?.content !== body.content,
        descriptionChanged: oldAlias?.description !== (body.description || ''),
      }, request);

      await setAliasItem(uuid, {
        name: trimmedName,
        type: 'network',
        content: body.content,
        description: body.description || '',
        enabled: body.enabled ?? '1',
      });
      await reconfigureAliases();

      await logApiAccess(auth, 'NETWORK_ALIAS_UPDATE_SUCCESS', {
        uuid, oldName, newName: trimmedName,
      }, request);

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error('Error updating network alias:', error);
      await logApiAccess(auth, 'NETWORK_ALIAS_UPDATE_FAILURE', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, request, error instanceof Error ? error.message : 'Unknown error');
      return NextResponse.json({ error: 'Failed to update network alias' }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
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

      const { uuid } = await params;

      // Reject delete if any active NETWORK_ALIAS schedule references this UUID
      const referencingSchedules = await prisma.scheduledAssignment.findMany({
        where: {
          enabled: true,
          targetType: 'NETWORK_ALIAS',
        },
        select: { id: true, name: true, targetSelector: true },
      });

      const blockedBy = referencingSchedules.filter(s => {
        const selector = s.targetSelector as { networkAliasUuids?: string[] };
        return Array.isArray(selector?.networkAliasUuids) && selector.networkAliasUuids.includes(uuid);
      });

      if (blockedBy.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot delete: alias is referenced by active schedules',
            schedules: blockedBy.map(s => ({ id: s.id, name: s.name })),
          },
          { status: 409 }
        );
      }

      const allAliasesResponse = await exportAliases();
      const aliasName = allAliasesResponse?.aliases?.alias?.[uuid]?.name || uuid;

      await logApiAccess(auth, 'NETWORK_ALIAS_DELETE_ATTEMPT', { uuid, name: aliasName }, request);

      await deleteAliasItem(uuid);
      await reconfigureAliases();

      await logApiAccess(auth, 'NETWORK_ALIAS_DELETE_SUCCESS', { uuid, name: aliasName }, request);

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error('Error deleting network alias:', error);
      await logApiAccess(auth, 'NETWORK_ALIAS_DELETE_FAILURE', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, request, error instanceof Error ? error.message : 'Unknown error');
      return NextResponse.json({ error: 'Failed to delete network alias' }, { status: 500 });
    }
  });
}
