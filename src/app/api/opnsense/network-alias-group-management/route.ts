import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import { logApiAccess } from '@/lib/auditLog';
import { exportAliases, batchAliasOperations, reconfigureAliases, parseGroupContent } from '@/lib/opnsense-api';

async function getVpnStatusForGroup(groupId: string): Promise<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string } | null> {
  try {
    const vpnMapping = await prisma.vpnMapping.findFirst({
      where: { opnsenseNetworkGroupId: groupId },
      select: { vpnUuid: true }
    });
    if (!vpnMapping?.vpnUuid) return null;

    const { getVpnStatusServer } = await import('@/lib/server/vpn-status-utils');
    const internalResult = await getVpnStatusServer();
    if (!internalResult.success || !internalResult.data) return null;

    const vpnInfo = internalResult.data.vpnStatuses?.find((vpn: { id: string; status: 'connected' | 'disconnected' | 'disabled'; enabled?: string; type: unknown; details: Record<string, unknown> }) => vpn.id === vpnMapping.vpnUuid);
    if (vpnInfo) {
      return {
        vpnUuid: vpnMapping.vpnUuid,
        status: vpnInfo.status,
        type: (vpnInfo.details?.type || vpnInfo.type || 'unknown') as string,
        enabled: vpnInfo.enabled
      };
    }
    return null;
  } catch (error) {
    logger.error(`Error checking VPN status for group ${groupId}:`, error);
    return null;
  }
}

async function getFeatureToggle(): Promise<boolean> {
  const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
  return settings?.manageNetworkAliasesEnabled ?? false;
}

export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const enabled = await getFeatureToggle();
      if (!enabled) {
        return NextResponse.json({ error: 'Feature disabled', code: 'NETWORK_ALIAS_MANAGEMENT_DISABLED' }, { status: 403 });
      }

      const body: { operation: 'assign' | 'unassign'; aliasUuid: string; groupId: string } = await request.json();

      if (!body.operation || !body.aliasUuid || !body.groupId) {
        return NextResponse.json({ error: 'Missing required fields: operation, aliasUuid, groupId' }, { status: 400 });
      }

      if (body.operation !== 'assign' && body.operation !== 'unassign') {
        return NextResponse.json({ error: 'Invalid operation. Must be "assign" or "unassign"' }, { status: 400 });
      }

      const allAliasesResponse = await exportAliases();
      if (!allAliasesResponse?.aliases?.alias) {
        return NextResponse.json({ error: 'Failed to retrieve aliases from OPNsense' }, { status: 502 });
      }

      const aliasMap = allAliasesResponse.aliases.alias;

      const alias = aliasMap[body.aliasUuid];
      if (!alias) {
        return NextResponse.json({ error: 'Network alias not found' }, { status: 404 });
      }
      if (alias.type !== 'network') {
        return NextResponse.json({ error: 'Alias is not a network type' }, { status: 400 });
      }
      if (alias.enabled !== '1') {
        return NextResponse.json({ error: 'Network alias is disabled in OPNsense' }, { status: 400 });
      }

      const group = aliasMap[body.groupId];
      if (!group || group.type !== 'networkgroup') {
        return NextResponse.json({ error: 'Network group not found' }, { status: 404 });
      }
      if (group.enabled === '0') {
        return NextResponse.json({ error: 'Target group is disabled in OPNsense' }, { status: 400 });
      }

      const disabledGroup = await prisma.globallyDisabledGroup.findFirst({ where: { opnsenseUuid: body.groupId } });
      if (disabledGroup) {
        return NextResponse.json({ error: 'Target group is globally disabled' }, { status: 400 });
      }

      const vpnStatus = await getVpnStatusForGroup(body.groupId);
      if (vpnStatus && (vpnStatus.status === 'disconnected' || vpnStatus.status === 'disabled')) {
        return NextResponse.json({ error: `Target group's VPN is ${vpnStatus.status}` }, { status: 400 });
      }

      await logApiAccess(auth, `NETWORK_ALIAS_GROUP_${body.operation.toUpperCase()}_ATTEMPT`, {
        aliasUuid: body.aliasUuid, aliasName: alias.name, groupUuid: body.groupId, groupName: group.name,
      }, request);

      const currentContent = new Set(parseGroupContent(group.content, group.name));
      let changed = false;

      if (body.operation === 'assign') {
        if (!currentContent.has(alias.name)) {
          currentContent.add(alias.name);
          changed = true;
        }
      } else {
        if (currentContent.has(alias.name)) {
          currentContent.delete(alias.name);
          changed = true;
        }
      }

      if (changed) {
        const newContent = Array.from(currentContent).join('\n');
        await batchAliasOperations([{
          type: 'update',
          uuid: body.groupId,
          payload: {
            alias: {
              enabled: group.enabled || '1',
              name: group.name,
              type: group.type,
              content: newContent,
              description: group.description || '',
              proto: '',
              interface: '',
              updatefreq: '',
              categories: '',
              counters: '',
            },
          },
        }]);
        await reconfigureAliases();
      }

      await logApiAccess(auth, `NETWORK_ALIAS_GROUP_${body.operation.toUpperCase()}_SUCCESS`, {
        aliasUuid: body.aliasUuid, aliasName: alias.name, groupUuid: body.groupId, groupName: group.name,
      }, request);

      // Compute updated memberOfGroups
      const updatedResponse = await exportAliases();
      const updatedAliasMap = updatedResponse?.aliases?.alias ?? {};
      const updatedGroups: { uuid: string; name: string }[] = [];
      for (const [uuid, a] of Object.entries(updatedAliasMap)) {
        if (a.type !== 'networkgroup') continue;
        const members = (a.content || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (members.includes(alias.name)) {
          updatedGroups.push({ uuid, name: a.name });
        }
      }

      return NextResponse.json({ success: true, memberOfGroups: updatedGroups });
    } catch (error) {
      logger.error('Error in network alias group management:', error);
      await logApiAccess(auth, 'NETWORK_ALIAS_GROUP_MANAGEMENT_FAILURE', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, request, error instanceof Error ? error.message : 'Unknown error');
      return NextResponse.json({ error: 'Failed to manage network alias group assignment' }, { status: 500 });
    }
  });
}
