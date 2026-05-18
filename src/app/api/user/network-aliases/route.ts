import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import { exportAliases } from '@/lib/opnsense-api';
import { enrichNetworkAliasesWithGroups } from '@/lib/network-alias-filtering';
import { filterNetworkGroups } from '@/lib/group-filter-utils';
import { getNetworkGroups } from '@/lib/opnsense-api';
import type { NetworkAlias, User } from '@/types/opnsense';
import type { GroupSpecificFilterSetting } from '@prisma/client';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
      if (!settings?.manageNetworkAliasesEnabled) {
        return NextResponse.json({ error: 'Feature disabled', code: 'NETWORK_ALIAS_MANAGEMENT_DISABLED' }, { status: 403 });
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

      const groupDisplays = await prisma.opnsenseGroupDisplay.findMany({
        select: { opnsenseUuid: true, friendlyName: true, iconIdentifier: true, groupType: true },
      });
      const groupDisplayMap = new Map<string, { opnsenseUuid: string; friendlyName: string; iconIdentifier?: string | null; groupType?: string }>();
      for (const gd of groupDisplays) {
        groupDisplayMap.set(gd.opnsenseUuid.toLowerCase(), gd);
      }
      const enriched = enrichNetworkAliasesWithGroups(networkAliases, aliasMap as Record<string, { type: string; name: string; content: string; description: string; enabled: string }>, groupDisplayMap);

      const globallyDisabledGroups = await prisma.globallyDisabledGroup.findMany();

      const allGroups = await getNetworkGroups();
      const globalFilters = (await prisma.groupFilterSetting.findMany()).map(f => ({
        id: f.id,
        pattern: f.pattern,
        description: f.description,
        type: f.type as 'include' | 'exclude',
      }));

      const userId = auth.user.id;
      const userAccounts = await prisma.account.findMany({
        where: { userId },
        select: { externalGroups: true, provider: true },
      });
      const externalGroups: { provider: string; groupName: string }[] = [];
      userAccounts.forEach(account => {
        if (account.externalGroups && Array.isArray(account.externalGroups)) {
          account.externalGroups.forEach(groupName => {
            if (typeof groupName === 'string') {
              externalGroups.push({ provider: account.provider, groupName });
            }
          });
        }
      });
      const { getCaseInsensitiveMode } = await import('@/lib/prisma-utils');
      const mappedLocalGroups = externalGroups.length > 0
        ? await prisma.ssoGroupMapping.findMany({
          where: { OR: externalGroups.map(eg => ({ ssoProvider: { equals: eg.provider, ...getCaseInsensitiveMode() }, ssoGroupName: eg.groupName })) },
          select: { localGroupId: true },
        })
        : [];
      const ssoLocalGroupIds = mappedLocalGroups.map((m: { localGroupId: string }) => m.localGroupId);
      const userWithDirectGroups = await prisma.user.findUnique({ where: { id: userId }, select: { groups: { select: { id: true } } } });
      const directLocalGroupIds = userWithDirectGroups?.groups.map(g => g.id) || [];
      const allLocalGroupIds = [...new Set([...ssoLocalGroupIds, ...directLocalGroupIds])];

      const userSpecificFilters: GroupSpecificFilterSetting[] = allLocalGroupIds.length > 0
        ? (await prisma.groupSpecificFilterSetting.findMany({ where: { groupId: { in: allLocalGroupIds } } })).map(f => ({ ...f, type: f.type as 'include' | 'exclude' }))
        : [];

      const displayableNetworkGroups = await filterNetworkGroups(
        allGroups,
        globalFilters,
        globallyDisabledGroups,
        auth.user as User,
        userSpecificFilters
      );

      const displayableGroupUuids = new Set(displayableNetworkGroups.map(g => g.uuid));

      const displaySettings = await prisma.networkAliasDisplaySettings.findMany({ where: { hidden: true } });
      const hiddenUuids = new Set(displaySettings.map(s => s.opnsenseAliasUuid));

      const result = enriched.filter(alias => {
        if (hiddenUuids.has(alias.uuid)) return false;
        const aliasGroups = alias.memberOfGroups || [];
        if (aliasGroups.length === 0) return true;
        return aliasGroups.some(g => displayableGroupUuids.has(g.uuid));
      });

      return NextResponse.json(result);
    } catch (error) {
      logger.error('Error fetching user network aliases:', error);
      return NextResponse.json({ error: 'Failed to fetch network aliases' }, { status: 500 });
    }
  });
}
