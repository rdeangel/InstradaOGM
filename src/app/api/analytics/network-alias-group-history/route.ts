import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { Role } from '@/types/opnsense';

export async function GET(request: Request) {
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
      const currentGroupsParam = searchParams.get('currentGroups');

      if (!aliasUuid && !aliasName) {
        return NextResponse.json({ success: false, message: 'aliasUuid or aliasName is required' }, { status: 400 });
      }

      let currentGroups: { id?: string; uuid?: string; name: string; friendlyName?: string }[] = [];
      if (currentGroupsParam) {
        try {
          currentGroups = JSON.parse(currentGroupsParam);
        } catch {
          currentGroups = [];
        }
      }

      const logs = await prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              'NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS',
              'NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS',
            ],
          },
        },
        orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          timestamp: true,
          action: true,
          details: true,
          user: { select: { name: true, email: true } },
        },
      });

      interface LogDetails {
        aliasUuid?: string;
        aliasName?: string;
        groupUuid?: string;
        groupName?: string;
        [key: string]: unknown;
      }

      const aliasLogs = logs.filter(log => {
        const details = log.details as unknown as LogDetails;
        if (!details) return false;
        if (aliasUuid && details.aliasUuid === aliasUuid) return true;
        if (aliasName && details.aliasName === aliasName) return true;
        return false;
      });

      const currentGroupIds = new Set<string>();
      const groupNameMap = new Map<string, string>();

      currentGroups.forEach(g => {
        const id = g.uuid || g.id || g.name;
        const displayName = g.friendlyName || g.name;
        if (id) {
          currentGroupIds.add(id);
          groupNameMap.set(id, displayName);
        }
      });

      const getGroupInfo = (details: LogDetails): { id: string; name: string } | null => {
        const id = details.groupUuid || details.groupName;
        const name = details.groupName || id;
        return id ? { id: id as string, name: (name || id) as string } : null;
      };

      const reversedLogs = [...aliasLogs].reverse();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const history: any[] = [];

      for (const log of reversedLogs) {
        const details = log.details as unknown as LogDetails;
        const groupInfo = getGroupInfo(details);

        const getCurrentGroupNames = () => {
          return Array.from(currentGroupIds).map(id => groupNameMap.get(id) || id);
        };

        if (log.action === 'NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS') {
          if (groupInfo) {
            history.push({
              id: log.id,
              timestamp: log.timestamp,
              groupCount: currentGroupIds.size,
              currentGroupNames: getCurrentGroupNames(),
              action: log.action,
              change: 1,
              details: {
                groupName: groupInfo.name,
                targetGroup: groupInfo.name,
                user: log.user?.name || 'System',
                removedGroups: 0,
                originalAction: log.action,
              },
            });
            currentGroupIds.delete(groupInfo.id);
          }
        } else if (log.action === 'NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS') {
          if (groupInfo) {
            history.push({
              id: log.id,
              timestamp: log.timestamp,
              groupCount: currentGroupIds.size,
              currentGroupNames: getCurrentGroupNames(),
              action: log.action,
              change: -1,
              details: {
                groupName: groupInfo.name,
                targetGroup: null,
                user: log.user?.name || 'System',
                removedGroups: 0,
                originalAction: log.action,
              },
            });
            currentGroupIds.add(groupInfo.id);
            groupNameMap.set(groupInfo.id, groupInfo.name);
          }
        }
      }

      history.reverse();

      for (let i = 1; i < history.length; i++) {
        const prevTime = new Date(history[i - 1].timestamp).getTime();
        // eslint-disable-next-line security/detect-object-injection
        const currTime = new Date(history[i].timestamp).getTime();
        if (currTime <= prevTime) {
          const newTime = new Date(prevTime + 1000);
          // eslint-disable-next-line security/detect-object-injection
          history[i].timestamp = newTime.toISOString();
        }
      }

      return NextResponse.json({ success: true, data: history, historyIncomplete: false, incompleteReason: '' });
    } catch (error) {
      logger.error('Error fetching network alias group history:', error);
      return NextResponse.json({ success: false, message: 'Failed to fetch network alias group history' }, { status: 500 });
    }
  });
}
