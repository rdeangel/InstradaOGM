import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { buildJsonFilter, supportsArrayContains } from '@/lib/db-helpers';

export async function GET(request: NextRequest) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
      if (!settings?.manageNetworkAliasesEnabled) {
        return NextResponse.json({ error: 'Feature disabled' }, { status: 403 });
      }

      const { searchParams } = new URL(request.url);
      const aliasUuid = searchParams.get('aliasUuid');
      const aliasName = searchParams.get('aliasName');

      if (!aliasUuid && !aliasName) {
        return NextResponse.json({ error: 'aliasUuid or aliasName parameter is required' }, { status: 400 });
      }

      const actions = [
        'NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS',
        'NETWORK_ALIAS_GROUP_ASSIGN_MOVE',
        'NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS',
      ];

      let assignments: Array<{
        id: string;
        userId: string | null;
        timestamp: Date;
        action: string;
        details: unknown;
        user: { id: string; name: string | null; email: string | null } | null;
      }>;

      if (supportsArrayContains()) {
        assignments = await prisma.auditLog.findMany({
          where: {
            action: { in: actions },
            ...(aliasUuid
              ? { details: buildJsonFilter(['aliasUuid'], aliasUuid) }
              : { details: buildJsonFilter(['aliasName'], aliasName!) }
            ),
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { timestamp: 'desc' },
          take: 1,
        }) as typeof assignments;
      } else {
        const allAssignments = await prisma.auditLog.findMany({
          where: { action: { in: actions } },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { timestamp: 'desc' },
        }) as typeof assignments;

        assignments = allAssignments.filter(a => {
          const details = a.details as Record<string, unknown> | null;
          if (!details) return false;
          if (aliasUuid && details.aliasUuid === aliasUuid) return true;
          if (aliasName && details.aliasName === aliasName) return true;
          return false;
        }).slice(0, 1);
      }

      const lastAssignment = assignments[0] || null;

      if (!lastAssignment) {
        return NextResponse.json({
          timestamp: null,
          operationType: null,
          action: null,
          groupName: null,
          userName: null,
        });
      }

      const details = lastAssignment.details as Record<string, unknown>;

      const isMove = lastAssignment.action === 'NETWORK_ALIAS_GROUP_ASSIGN_MOVE';
      let operationType: string;
      if (isMove) {
        operationType = 'move';
      } else if (lastAssignment.action.includes('ASSIGN') && !lastAssignment.action.includes('UNASSIGN')) {
        operationType = 'assign';
      } else {
        operationType = 'unassign';
      }

      const groupName = (typeof details.groupName === 'string' ? details.groupName : null) || null;

      const groupDisplays = await prisma.opnsenseGroupDisplay.findMany({
        select: { opnsenseUuid: true, friendlyName: true },
      });
      const groupFriendlyNameMap = new Map<string, string>();
      for (const gd of groupDisplays) {
        groupFriendlyNameMap.set(gd.opnsenseUuid.toLowerCase(), gd.friendlyName);
      }

      const resolveFriendlyName = (name: string | null, groupUuid?: string | null): string | null => {
        if (!name) return null;
        if (groupUuid) {
          const friendly = groupFriendlyNameMap.get(groupUuid.toLowerCase());
          if (friendly) return friendly;
        }
        return name;
      };

      const targetUuid = typeof details.groupUuid === 'string' ? details.groupUuid : null;
      const resolvedGroupName = resolveFriendlyName(groupName, targetUuid);

      const response: Record<string, unknown> = {
        timestamp: lastAssignment.timestamp.toISOString(),
        operationType,
        action: lastAssignment.action,
        groupName: resolvedGroupName,
        userName: lastAssignment.user?.name || lastAssignment.user?.email || null,
      };

      // For move operations logged by ASSIGN_MOVE: build targetGroup from groupUuid/groupName
      if (isMove && targetUuid) {
        response.targetGroup = {
          id: targetUuid,
          name: groupName || '',
          friendlyName: groupFriendlyNameMap.get(targetUuid.toLowerCase()) || groupName || null,
        };
      }

      if (!isMove && details.targetGroup && typeof details.targetGroup === 'object') {
        const tg = details.targetGroup as Record<string, unknown>;
        const tgFriendly = typeof tg.friendlyName === 'string' ? tg.friendlyName : null;
        const tgId = typeof tg.id === 'string' ? tg.id : null;
        response.targetGroup = {
          id: tgId || '',
          name: typeof tg.name === 'string' ? tg.name : '',
          friendlyName: tgFriendly || (tgId ? groupFriendlyNameMap.get(tgId.toLowerCase()) : null) || null,
        };
      }

      if (details.sourceGroups && Array.isArray(details.sourceGroups)) {
        response.sourceGroups = (details.sourceGroups as Array<Record<string, unknown>>).map((sg) => {
          const sgId = typeof sg.id === 'string' ? sg.id : '';
          const sgName = typeof sg.name === 'string' ? sg.name : '';
          const sgFriendly = typeof sg.friendlyName === 'string' ? sg.friendlyName : null;
          return {
            id: sgId,
            name: sgName,
            friendlyName: sgFriendly || (sgId ? groupFriendlyNameMap.get(sgId.toLowerCase()) : null) || null,
          };
        });
      }

      if (details.removedFromGroups && Array.isArray(details.removedFromGroups)) {
        response.sourceGroups = (details.removedFromGroups as Array<Record<string, unknown>>).map((sg) => {
          const sgId = typeof sg.uuid === 'string' ? sg.uuid : typeof sg.id === 'string' ? sg.id : '';
          const sgName = typeof sg.name === 'string' ? sg.name : '';
          const sgFriendly = typeof sg.friendlyName === 'string' ? sg.friendlyName : null;
          return {
            id: sgId,
            name: sgName,
            friendlyName: sgFriendly || (sgId ? groupFriendlyNameMap.get(sgId.toLowerCase()) : null) || null,
          };
        });
      }

      return NextResponse.json(response);
    } catch (error) {
      logger.error('Error fetching network alias last assignment:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
