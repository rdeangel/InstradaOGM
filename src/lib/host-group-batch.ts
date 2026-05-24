import type { NetworkGroup } from '@/types/opnsense';
import type { OpnsenseExportResponse, OpnsenseAliasDetailFromExport } from '@/lib/opnsense-api';

/**
 * Snapshot-based resolution for batch host-alias/group operations.
 *
 * The host-group-management batch route previously called the OPNsense alias export once per
 * item (host-alias resolution, group resolution, and per-group lookup), turning an N-item batch
 * into hundreds of sequential exports. These helpers take a SINGLE export snapshot and resolve
 * everything in memory, mirroring the behaviour of the equivalent live helpers in opnsense-api.ts:
 *   - resolveGroupFromSnapshot      ↔ resolveGroupIdentifier / getNetworkGroupById
 *   - resolveHostAliasFromSnapshot  ↔ resolveHostAliasIdentifier
 *   - findGroupsContainingAlias     ↔ the moveFromExisting export scan
 */

export interface GroupDisplayInfo {
  opnsenseUuid: string;
  friendlyName: string;
  groupType?: 'SingleSelect' | 'MultiSelect';
}

interface RawNetworkGroup {
  uuid: string;
  alias: OpnsenseAliasDetailFromExport;
}

export interface BatchSnapshot {
  /** Host/network aliases keyed by name (host + network types, matching getHostAliasesByName). */
  hostAliasByName: Map<string, OpnsenseAliasDetailFromExport & { uuid: string }>;
  /** Host aliases keyed by their content IP (host type only, matching getHostAliasesByIp). */
  hostAliasesByIp: Map<string, (OpnsenseAliasDetailFromExport & { uuid: string })[]>;
  /** Enabled (non globally-disabled) network groups keyed by uuid. */
  groupByUuid: Map<string, NetworkGroup>;
  /** Enabled (non globally-disabled) network groups keyed by OPNsense name. */
  groupByName: Map<string, NetworkGroup>;
  /** friendlyName -> uuid, from the group display mappings. */
  friendlyNameToUuid: Map<string, string>;
  /** All network groups including globally-disabled ones (for moveFromExisting scans). */
  rawNetworkGroups: RawNetworkGroup[];
  /** groupType keyed by lowercased uuid. */
  groupTypeByUuid: Map<string, 'SingleSelect' | 'MultiSelect'>;
  /** friendlyName keyed by lowercased uuid. */
  friendlyNameByUuid: Map<string, string>;
}

export function buildBatchSnapshot(params: {
  exportResponse: OpnsenseExportResponse;
  groupDisplays: GroupDisplayInfo[];
  disabledGroupUuids?: Iterable<string>;
}): BatchSnapshot {
  const { exportResponse, groupDisplays, disabledGroupUuids } = params;
  const disabled = new Set(disabledGroupUuids ?? []);

  const groupTypeByUuid = new Map<string, 'SingleSelect' | 'MultiSelect'>();
  const friendlyNameByUuid = new Map<string, string>();
  const friendlyNameToUuid = new Map<string, string>();
  for (const d of groupDisplays) {
    if (d.groupType) groupTypeByUuid.set(d.opnsenseUuid.toLowerCase(), d.groupType);
    if (d.friendlyName) {
      friendlyNameByUuid.set(d.opnsenseUuid.toLowerCase(), d.friendlyName);
      friendlyNameToUuid.set(d.friendlyName, d.opnsenseUuid);
    }
  }

  const hostAliasByName = new Map<string, OpnsenseAliasDetailFromExport & { uuid: string }>();
  const hostAliasesByIp = new Map<string, (OpnsenseAliasDetailFromExport & { uuid: string })[]>();
  const groupByUuid = new Map<string, NetworkGroup>();
  const groupByName = new Map<string, NetworkGroup>();
  const rawNetworkGroups: RawNetworkGroup[] = [];

  for (const [uuid, alias] of Object.entries(exportResponse.aliases.alias)) {
    if (alias.type === 'host' || alias.type === 'network') {
      const withUuid = { ...alias, uuid };
      if (!hostAliasByName.has(alias.name)) hostAliasByName.set(alias.name, withUuid);
      if (alias.type === 'host') {
        const ip = alias.content.trim();
        const list = hostAliasesByIp.get(ip);
        if (list) list.push(withUuid);
        else hostAliasesByIp.set(ip, [withUuid]);
      }
    } else if (alias.type === 'networkgroup') {
      rawNetworkGroups.push({ uuid, alias });
      if (!disabled.has(uuid)) {
        const group = toNetworkGroup(uuid, alias, groupTypeByUuid, friendlyNameByUuid);
        groupByUuid.set(uuid, group);
        if (!groupByName.has(alias.name)) groupByName.set(alias.name, group);
      }
    }
  }

  return {
    hostAliasByName,
    hostAliasesByIp,
    groupByUuid,
    groupByName,
    friendlyNameToUuid,
    rawNetworkGroups,
    groupTypeByUuid,
    friendlyNameByUuid,
  };
}

function toNetworkGroup(
  uuid: string,
  alias: OpnsenseAliasDetailFromExport,
  groupTypeByUuid: Map<string, 'SingleSelect' | 'MultiSelect'>,
  friendlyNameByUuid: Map<string, string>,
): NetworkGroup {
  const lc = uuid.toLowerCase();
  return {
    id: uuid,
    uuid,
    name: alias.name,
    description: alias.description,
    enabled: alias.enabled === '1',
    members: [],
    rawContent: alias.content,
    type: alias.type,
    proto: alias.proto,
    interface: alias.interface,
    counters: alias.counters,
    updatefreq: alias.updatefreq,
    categories: alias.categories,
    friendlyName: friendlyNameByUuid.get(lc),
    groupType: groupTypeByUuid.get(lc),
  };
}

/** Mirrors resolveGroupIdentifier: priority groupId > groupName > groupFriendlyName (with name fallback). */
export function resolveGroupFromSnapshot(
  snapshot: BatchSnapshot,
  ref: { groupId?: string; groupName?: string; groupFriendlyName?: string },
): { groupId: string; group: NetworkGroup } | null {
  const { groupId, groupName, groupFriendlyName } = ref;

  if (groupId) {
    const group = snapshot.groupByUuid.get(groupId);
    if (group) return { groupId: group.id, group };
  }

  if (groupName) {
    const group = snapshot.groupByName.get(groupName);
    if (group) return { groupId: group.id, group };
  }

  if (groupFriendlyName) {
    const mappedUuid = snapshot.friendlyNameToUuid.get(groupFriendlyName);
    if (mappedUuid) {
      const group = snapshot.groupByUuid.get(mappedUuid);
      if (group) return { groupId: group.id, group };
    }
    // Fallback: treat the friendly name as a raw group name.
    const byName = snapshot.groupByName.get(groupFriendlyName);
    if (byName) return { groupId: byName.id, group: byName };
  }

  return null;
}

/** Mirrors resolveHostAliasIdentifier cases 1-4 against the snapshot. */
export function resolveHostAliasFromSnapshot(
  snapshot: BatchSnapshot,
  ref: { ipAddress?: string; hostAliasName?: string; hostAliasHostName?: string },
): { ipAddress: string; hostAliasName: string } | null {
  const { ipAddress, hostAliasName, hostAliasHostName } = ref;

  // Case 1: ipAddress with hostAliasName (validate they match, else use actual current name).
  if (ipAddress && hostAliasName) {
    const aliases = snapshot.hostAliasesByIp.get(ipAddress) ?? [];
    if (aliases.some(a => a.name === hostAliasName)) {
      return { ipAddress, hostAliasName };
    }
    if (aliases.length > 0) {
      return { ipAddress, hostAliasName: aliases[0].name };
    }
    return null;
  }

  // Case 2: ipAddress only.
  if (ipAddress && !hostAliasName && !hostAliasHostName) {
    const aliases = snapshot.hostAliasesByIp.get(ipAddress) ?? [];
    if (aliases.length > 0) return { ipAddress, hostAliasName: aliases[0].name };
    return null;
  }

  // Case 3: hostAliasName only.
  if (hostAliasName && !ipAddress && !hostAliasHostName) {
    const found = snapshot.hostAliasByName.get(hostAliasName);
    if (found) return { ipAddress: found.content.trim(), hostAliasName };
    return null;
  }

  // Case 4: hostAliasHostName only (treated the same as a name).
  if (hostAliasHostName && !ipAddress && !hostAliasName) {
    const found = snapshot.hostAliasByName.get(hostAliasHostName);
    if (found) return { ipAddress: found.content.trim(), hostAliasName: hostAliasHostName };
    return null;
  }

  return null;
}

/**
 * Mirrors the moveFromExisting scan: every network group (including globally-disabled ones, since
 * the original used the raw export) whose content includes aliasName, excluding the target group.
 * When restrictToSingleSelect is set, groups without a known type default to SingleSelect.
 */
export function findGroupsContainingAlias(
  snapshot: BatchSnapshot,
  params: { aliasName: string; excludeGroupUuid?: string; restrictToSingleSelect?: boolean },
): NetworkGroup[] {
  const { aliasName, excludeGroupUuid, restrictToSingleSelect } = params;
  const excludeLc = excludeGroupUuid?.toLowerCase();

  const result: NetworkGroup[] = [];
  for (const { uuid, alias } of snapshot.rawNetworkGroups) {
    if (!alias.content) continue;
    if (excludeLc && uuid.toLowerCase() === excludeLc) continue;

    const members = alias.content.split(/\n|,/).map(n => n.trim()).filter(Boolean);
    if (!members.includes(aliasName)) continue;

    if (restrictToSingleSelect) {
      const groupType = snapshot.groupTypeByUuid.get(uuid.toLowerCase()) ?? 'SingleSelect';
      if (groupType !== 'SingleSelect') continue;
    }

    result.push(toNetworkGroup(uuid, alias, snapshot.groupTypeByUuid, snapshot.friendlyNameByUuid));
  }
  return result;
}
