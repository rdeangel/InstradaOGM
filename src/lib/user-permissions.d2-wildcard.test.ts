import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    account: { findMany: vi.fn() },
    ssoGroupMapping: { findMany: vi.fn() },
    groupHostAliasPermission: { findMany: vi.fn() },
    groupFilterSetting: { findMany: vi.fn() },
    globallyDisabledGroup: { findMany: vi.fn() },
    groupSpecificFilterSetting: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/opnsense-api', () => ({ exportAliases: vi.fn() }));

import { resolveUserAliasPermissions, resolveUserPermissions } from '@/lib/user-permissions';

type StubUser = {
  id: string;
  role: string;
  groups?: { id: string }[];
  aliasPerms?: string[];
};

function stubUser(opts: StubUser) {
  const groups = opts.groups ?? [];
  prismaMock.user.findUnique.mockImplementation(async ({ select }: { select?: { role?: boolean; groups?: unknown } }) => {
    if (select?.role && !select?.groups) {
      return { role: opts.role };
    }
    if (select?.groups) {
      return { groups };
    }
    return { role: opts.role, groups };
  });
  prismaMock.account.findMany.mockResolvedValue([]);
  prismaMock.ssoGroupMapping.findMany.mockResolvedValue([]);
  prismaMock.groupHostAliasPermission.findMany.mockResolvedValue(
    (opts.aliasPerms ?? []).map((opnsenseAliasUuid) => ({ opnsenseAliasUuid }))
  );
}

describe('resolveUserAliasPermissions (D2 role wildcard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats SUPER_ADMIN with no groups and no * row as wildcard by role', async () => {
    stubUser({ id: 'super-1', role: 'SUPER_ADMIN', groups: [] });

    const result = await resolveUserAliasPermissions('super-1');

    expect(result.hasWildcard).toBe(true);
    expect(result.permittedAliasUuids.size).toBe(0);
    expect(result.localGroupIds).toEqual([]);
    expect(prismaMock.groupHostAliasPermission.findMany).not.toHaveBeenCalled();
  });

  it('treats ADMIN with a group but no * row as wildcard by role', async () => {
    stubUser({ id: 'admin-1', role: 'ADMIN', groups: [{ id: 'g-admin' }], aliasPerms: [] });

    const result = await resolveUserAliasPermissions('admin-1');

    expect(result.hasWildcard).toBe(true);
    expect(result.permittedAliasUuids.size).toBe(0);
    expect(result.localGroupIds).toEqual(['g-admin']);
    expect(prismaMock.groupHostAliasPermission.findMany).not.toHaveBeenCalled();
  });

  it('does not treat USER with no groups as wildcard', async () => {
    stubUser({ id: 'user-none', role: 'USER', groups: [] });

    const result = await resolveUserAliasPermissions('user-none');

    expect(result.hasWildcard).toBe(false);
    expect(result.permittedAliasUuids.size).toBe(0);
    expect(result.localGroupIds).toEqual([]);
  });

  it('keeps null userId as wildcard (anonymous precondition unchanged)', async () => {
    const result = await resolveUserAliasPermissions(null);

    expect(result.hasWildcard).toBe(true);
    expect(result.permittedAliasUuids.size).toBe(0);
    expect(result.localGroupIds).toEqual([]);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.groupHostAliasPermission.findMany).not.toHaveBeenCalled();
  });

  it('keeps USER with two alias perms non-wildcard with those UUIDs', async () => {
    stubUser({
      id: 'user-two',
      role: 'USER',
      groups: [{ id: 'g-user' }],
      aliasPerms: ['alias-a', 'alias-b'],
    });

    const result = await resolveUserAliasPermissions('user-two');

    expect(result.hasWildcard).toBe(false);
    expect(result.permittedAliasUuids).toEqual(new Set(['alias-a', 'alias-b']));
    expect(result.localGroupIds).toEqual(['g-user']);
  });

  it('keeps PENDING and SUSPENDED on the group/* path (no role wildcard)', async () => {
    stubUser({ id: 'pending-1', role: 'PENDING', groups: [] });
    await expect(resolveUserAliasPermissions('pending-1')).resolves.toMatchObject({ hasWildcard: false });

    stubUser({ id: 'suspended-1', role: 'SUSPENDED', groups: [] });
    await expect(resolveUserAliasPermissions('suspended-1')).resolves.toMatchObject({ hasWildcard: false });
  });
});

describe('resolveUserPermissions (D2 inherited via resolveUserAliasPermissions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('picks up the ADMIN role shortcut with no separate role branch', async () => {
    stubUser({ id: 'admin-1', role: 'ADMIN', groups: [] });

    const result = await resolveUserPermissions('admin-1');

    expect(result.hasWildcard).toBe(true);
    expect(result.permittedGroupUuids.size).toBe(0);
    expect(prismaMock.groupFilterSetting.findMany).not.toHaveBeenCalled();
  });
});
