import type { NetworkAlias } from '@/types/opnsense';

interface GroupDisplayInfo {
  opnsenseUuid: string;
  friendlyName: string;
  iconIdentifier?: string | null;
  groupType?: string;
}

export function enrichNetworkAliasesWithGroups(
  networkAliases: NetworkAlias[],
  allAliasMap: Record<string, { type: string; name: string; content: string; description: string; enabled: string }>,
  groupDisplayMap?: Map<string, GroupDisplayInfo>
): NetworkAlias[] {
  const nameToGroups = new Map<string, { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[]>();

  for (const [uuid, alias] of Object.entries(allAliasMap)) {
    if (alias.type !== 'networkgroup') continue;
    const members = (alias.content || '').split('\n').map(s => s.trim()).filter(Boolean);
    for (const memberName of members) {
      if (!nameToGroups.has(memberName)) nameToGroups.set(memberName, []);
      const display = groupDisplayMap?.get(uuid.toLowerCase());
      nameToGroups.get(memberName)!.push({
        uuid,
        name: alias.name,
        friendlyName: display?.friendlyName || undefined,
        iconIdentifier: display?.iconIdentifier ?? null,
        groupType: (display?.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect') as 'SingleSelect' | 'MultiSelect',
      });
    }
  }

  return networkAliases.map(a => ({
    ...a,
    memberOfGroups: nameToGroups.get(a.name) ?? [],
  }));
}
