import type { NetworkAlias } from '@/types/opnsense';

export function enrichNetworkAliasesWithGroups(
  networkAliases: NetworkAlias[],
  allAliasMap: Record<string, { type: string; name: string; content: string; description: string; enabled: string }>
): NetworkAlias[] {
  const nameToGroups = new Map<string, { uuid: string; name: string }[]>();

  for (const [uuid, alias] of Object.entries(allAliasMap)) {
    if (alias.type !== 'networkgroup') continue;
    const members = (alias.content || '').split('\n').map(s => s.trim()).filter(Boolean);
    for (const memberName of members) {
      if (!nameToGroups.has(memberName)) nameToGroups.set(memberName, []);
      nameToGroups.get(memberName)!.push({ uuid, name: alias.name });
    }
  }

  return networkAliases.map(a => ({
    ...a,
    memberOfGroups: nameToGroups.get(a.name) ?? [],
  }));
}
