import { describe, it, expect } from 'vitest';
import type { OpnsenseExportResponse, OpnsenseAliasDetailFromExport } from '@/lib/opnsense-api';
import {
  buildBatchSnapshot,
  resolveGroupFromSnapshot,
  resolveHostAliasFromSnapshot,
  findGroupsContainingAlias,
  type GroupDisplayInfo,
} from '@/lib/host-group-batch';

function alias(partial: Partial<OpnsenseAliasDetailFromExport> & { name: string; type: string }): OpnsenseAliasDetailFromExport {
  return {
    enabled: '1',
    proto: '',
    interface: '',
    counters: '',
    updatefreq: '',
    content: '',
    categories: '',
    description: '',
    ...partial,
  };
}

function makeExport(aliases: Record<string, OpnsenseAliasDetailFromExport>): OpnsenseExportResponse {
  return { aliases: { alias: aliases } };
}

// A small fixture: two host aliases, two groups (one SingleSelect, one MultiSelect), one disabled group.
const exportResponse = makeExport({
  'uuid-host-a': alias({ name: 'host_a', type: 'host', content: '10.0.0.1' }),
  'uuid-host-b': alias({ name: 'host_b', type: 'host', content: '10.0.0.2' }),
  'uuid-group-ss': alias({ name: 'group_ss', type: 'networkgroup', content: 'host_a\nhost_b' }),
  'uuid-group-ms': alias({ name: 'group_ms', type: 'networkgroup', content: 'host_a' }),
  'uuid-group-disabled': alias({ name: 'group_disabled', type: 'networkgroup', content: 'host_a' }),
});

const groupDisplays: GroupDisplayInfo[] = [
  { opnsenseUuid: 'uuid-group-ss', friendlyName: 'Single Group', groupType: 'SingleSelect' },
  { opnsenseUuid: 'uuid-group-ms', friendlyName: 'Multi Group', groupType: 'MultiSelect' },
];

const snapshot = buildBatchSnapshot({
  exportResponse,
  groupDisplays,
  disabledGroupUuids: ['uuid-group-disabled'],
});

describe('resolveGroupFromSnapshot', () => {
  it('resolves by groupId', () => {
    const result = resolveGroupFromSnapshot(snapshot, { groupId: 'uuid-group-ss' });
    expect(result?.groupId).toBe('uuid-group-ss');
    expect(result?.group.name).toBe('group_ss');
    expect(result?.group.enabled).toBe(true);
    expect(result?.group.rawContent).toBe('host_a\nhost_b');
    expect(result?.group.type).toBe('networkgroup');
  });

  it('resolves by groupName', () => {
    const result = resolveGroupFromSnapshot(snapshot, { groupName: 'group_ms' });
    expect(result?.groupId).toBe('uuid-group-ms');
  });

  it('resolves by groupFriendlyName via display mapping', () => {
    const result = resolveGroupFromSnapshot(snapshot, { groupFriendlyName: 'Single Group' });
    expect(result?.groupId).toBe('uuid-group-ss');
  });

  it('falls back to group name when friendly name has no mapping', () => {
    const result = resolveGroupFromSnapshot(snapshot, { groupFriendlyName: 'group_ms' });
    expect(result?.groupId).toBe('uuid-group-ms');
  });

  it('excludes globally disabled groups', () => {
    expect(resolveGroupFromSnapshot(snapshot, { groupId: 'uuid-group-disabled' })).toBeNull();
    expect(resolveGroupFromSnapshot(snapshot, { groupName: 'group_disabled' })).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(resolveGroupFromSnapshot(snapshot, { groupId: 'nope' })).toBeNull();
  });
});

describe('resolveHostAliasFromSnapshot', () => {
  it('resolves when ip and name match', () => {
    const result = resolveHostAliasFromSnapshot(snapshot, { ipAddress: '10.0.0.1', hostAliasName: 'host_a' });
    expect(result).toEqual({ ipAddress: '10.0.0.1', hostAliasName: 'host_a' });
  });

  it('uses the actual alias name when ip and name disagree', () => {
    const result = resolveHostAliasFromSnapshot(snapshot, { ipAddress: '10.0.0.1', hostAliasName: 'stale_name' });
    expect(result).toEqual({ ipAddress: '10.0.0.1', hostAliasName: 'host_a' });
  });

  it('returns null when no alias exists for the ip (so caller can create)', () => {
    const result = resolveHostAliasFromSnapshot(snapshot, { ipAddress: '10.0.0.99', hostAliasName: 'host_a' });
    expect(result).toBeNull();
  });

  it('resolves by name only, returning the alias content as ip', () => {
    const result = resolveHostAliasFromSnapshot(snapshot, { hostAliasName: 'host_b' });
    expect(result).toEqual({ ipAddress: '10.0.0.2', hostAliasName: 'host_b' });
  });

  it('returns null when name only has no match', () => {
    expect(resolveHostAliasFromSnapshot(snapshot, { hostAliasName: 'ghost' })).toBeNull();
  });
});

describe('findGroupsContainingAlias', () => {
  it('returns all groups containing the alias, excluding the target group, including disabled groups', () => {
    const groups = findGroupsContainingAlias(snapshot, { aliasName: 'host_a', excludeGroupUuid: 'uuid-group-ss' });
    const ids = groups.map(g => g.uuid).sort();
    expect(ids).toEqual(['uuid-group-disabled', 'uuid-group-ms']);
  });

  it('restricts removals to SingleSelect groups when requested (disabled group defaults to SingleSelect)', () => {
    const groups = findGroupsContainingAlias(snapshot, {
      aliasName: 'host_a',
      excludeGroupUuid: 'uuid-group-ss',
      restrictToSingleSelect: true,
    });
    // group_ms is MultiSelect → excluded; group_disabled has no display → defaults SingleSelect → kept
    expect(groups.map(g => g.uuid)).toEqual(['uuid-group-disabled']);
  });
});
