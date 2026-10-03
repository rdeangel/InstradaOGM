import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  resolveHostAliasIdentifier,
  getBestHostAliasName,
  exportAliases,
  createHostAliasFromHostname,
  addAliasItem,
  removeIpFromGroup,
  resolveGroupIdentifier,
  batchAliasOperations,
  resolveHostAliasFromSnapshot,
  resolveGroupFromSnapshot,
  buildBatchSnapshot,
  findGroupsContainingAlias,
  getNetworkGroupById,
  parseGroupContent,
  authenticateRequest,
  prismaMock,
  fetchUnmanagedGroupFilterData,
  isHostInUnmanagedGroups,
  resolveUserAliasPermissions,
  resolveUserPermissions,
} = vi.hoisted(() => ({
  resolveHostAliasIdentifier: vi.fn(),
  getBestHostAliasName: vi.fn(),
  exportAliases: vi.fn(),
  createHostAliasFromHostname: vi.fn(),
  addAliasItem: vi.fn(),
  removeIpFromGroup: vi.fn(),
  resolveGroupIdentifier: vi.fn(),
  batchAliasOperations: vi.fn(),
  resolveHostAliasFromSnapshot: vi.fn(),
  resolveGroupFromSnapshot: vi.fn(),
  buildBatchSnapshot: vi.fn(),
  findGroupsContainingAlias: vi.fn(),
  getNetworkGroupById: vi.fn(),
  parseGroupContent: vi.fn(),
  authenticateRequest: vi.fn(async (): Promise<{ user: { id: string; role: string } | null; method?: string }> => ({
    user: null,
  })),
  prismaMock: {
    opnsenseGroupDisplay: { findMany: vi.fn() },
    globalSettings: { findFirst: vi.fn(), create: vi.fn() },
    globallyDisabledGroup: { findMany: vi.fn() },
    vpnMapping: { findFirst: vi.fn() },
  },
  fetchUnmanagedGroupFilterData: vi.fn(),
  isHostInUnmanagedGroups: vi.fn(),
  resolveUserAliasPermissions: vi.fn(async () => ({ hasWildcard: true, permittedAliasUuids: new Set(), localGroupIds: [] })),
  resolveUserPermissions: vi.fn(),
}));

vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest,
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/opnsense-api', () => ({
  resolveHostAliasIdentifier,
  getBestHostAliasName,
  exportAliases,
  removeIpFromGroup,
  resolveGroupIdentifier,
  batchAliasOperations,
  getNetworkGroupById,
  getHostAliasesByName: vi.fn(),
  createHostAliasFromHostname,
  addAliasItem,
  parseGroupContent,
}));
vi.mock('@/lib/host-group-batch', () => ({
  buildBatchSnapshot,
  resolveGroupFromSnapshot,
  resolveHostAliasFromSnapshot,
  findGroupsContainingAlias,
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/unmanaged-group-utils', () => ({
  fetchUnmanagedGroupFilterData,
  isHostInUnmanagedGroups,
}));
vi.mock('@/lib/user-permissions', () => ({
  resolveUserAliasPermissions,
  resolveUserPermissions,
}));

import { POST } from '@/app/api/opnsense/host-group-management/route';
import { logAuditEvent } from '@/lib/auditLog';

const INSIDE_NETWORKS = [{ type: 'include', network: '192.168.1.0/24' }];

const OWN_HOST = {
  ipAddress: '192.168.1.10',
  hostAliasName: 'HOST_192_168_1_10',
};

const VISIBLE_GROUP = {
  uuid: 'g-vis',
  name: 'G_VISIBLE',
  enabled: true,
  rawContent: '',
  type: 'networkgroup',
  description: '',
  friendlyName: 'G_VISIBLE',
  id: 'g-vis',
  members: [],
  lastUpdated: null,
  iconIdentifier: null,
};

const HIDDEN_GROUP = {
  uuid: 'g-hid',
  name: 'G_HIDDEN',
  enabled: true,
  rawContent: '',
  type: 'networkgroup',
  description: '',
  friendlyName: 'G_HIDDEN',
  id: 'g-hid',
  members: [],
  lastUpdated: null,
  iconIdentifier: null,
};

function aliasExport() {
  return {
    aliases: {
      alias: {
        'h-own': { name: 'HOST_192_168_1_10', type: 'host', content: '192.168.1.10', enabled: '1' },
        'g-vis': { name: 'G_VISIBLE', type: 'networkgroup', content: '', enabled: '1' },
        'g-hid': { name: 'G_HIDDEN', type: 'networkgroup', content: '', enabled: '1' },
      },
    },
  };
}

function emptyPermissions() {
  return {
    hasWildcard: false,
    permittedAliasUuids: new Set<string>(),
    permittedGroupUuids: new Set<string>(),
    localGroupIds: [],
  };
}

function requestWithBody(body: unknown, xff = '192.168.1.10'): Request {
  return new Request('http://localhost/api/opnsense/host-group-management', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
    body: JSON.stringify(body),
  });
}

function stubSettings(overrides: Record<string, unknown> = {}) {
  prismaMock.globalSettings.findFirst.mockResolvedValue({
    allowedNetworks: INSIDE_NETWORKS,
    removeSelfServicePage: false,
    enableRenamingSelfServicePage: true,
    ...overrides,
  });
}

function stubVisibleFilterData() {
  fetchUnmanagedGroupFilterData.mockResolvedValue({
    globalFilters: [{ id: 'f1', pattern: '^G_HIDDEN$', type: 'exclude', description: '' }],
    globallyDisabledGroups: [],
    userSpecificFilters: null,
  });
}

function auditValidationFailures(): string[] {
  return vi.mocked(logAuditEvent).mock.calls
    .map((call) => (call[0] as { details?: { validationFailure?: string } }).details?.validationFailure)
    .filter((value): value is string => Boolean(value));
}

function hasTargetDeniedAudit(): boolean {
  return auditValidationFailures().includes('SELF_SERVICE_TARGET_DENIED');
}

describe('host-group-management self-service target authorization (T3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({ user: null });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: true, permittedAliasUuids: new Set(), localGroupIds: [] });
    resolveUserPermissions.mockResolvedValue(emptyPermissions());
    prismaMock.opnsenseGroupDisplay.findMany.mockResolvedValue([]);
    prismaMock.globallyDisabledGroup.findMany.mockResolvedValue([]);
    prismaMock.vpnMapping.findFirst.mockResolvedValue(null);
    stubSettings();
    stubVisibleFilterData();
    exportAliases.mockResolvedValue(aliasExport());
    resolveHostAliasIdentifier.mockResolvedValue(OWN_HOST);
    resolveGroupIdentifier.mockImplementation(async (_id: string | undefined, name: string | undefined) => {
      if (name === 'G_HIDDEN') return { groupId: 'g-hid', group: { name: 'G_HIDDEN', enabled: true } };
      if (name === 'G_VISIBLE') return { groupId: 'g-vis', group: { name: 'G_VISIBLE', enabled: true } };
      return null;
    });
    getBestHostAliasName.mockResolvedValue({ aliasName: 'HOST_192_168_1_10', detectedHostname: null });
    addAliasItem.mockResolvedValue({ result: 'saved' });
    getNetworkGroupById.mockResolvedValue({
      name: 'G_VISIBLE',
      enabled: true,
      rawContent: '',
      type: 'networkgroup',
      description: '',
    });
    parseGroupContent.mockReturnValue([]);
    batchAliasOperations.mockResolvedValue({ success: true, results: [] });
    removeIpFromGroup.mockResolvedValue({ success: true, message: 'removed from G_HIDDEN' });
    isHostInUnmanagedGroups.mockResolvedValue({
      isUnmanaged: false,
      unmanagedGroups: [],
      reason: 'none',
      message: '',
    });
    resolveHostAliasFromSnapshot.mockReturnValue(OWN_HOST);
    findGroupsContainingAlias.mockReturnValue([]);
    buildBatchSnapshot.mockReturnValue({
      aliases: [],
      groups: [],
      hostAliasByName: new Map(),
      hostAliasesByIp: new Map(),
      groupByUuid: new Map([
        ['g-vis', VISIBLE_GROUP],
        ['g-hid', HIDDEN_GROUP],
      ]),
      groupByName: new Map([
        ['G_VISIBLE', VISIBLE_GROUP],
        ['G_HIDDEN', HIDDEN_GROUP],
      ]),
      friendlyNameToUuid: new Map(),
      rawNetworkGroups: [],
      groupTypeByUuid: new Map(),
      friendlyNameByUuid: new Map(),
    });
    resolveGroupFromSnapshot.mockImplementation((_snap: unknown, ident: { groupName?: string }) => {
      if (ident.groupName === 'G_VISIBLE') return { groupId: 'g-vis', group: VISIBLE_GROUP };
      if (ident.groupName === 'G_HIDDEN') return { groupId: 'g-hid', group: HIDDEN_GROUP };
      return null;
    });
  });

  it('returns 403 for anonymous assign to a filter-excluded group and never writes', async () => {
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_HIDDEN',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Forbidden: This group is not available for self-service',
    });
    expect(batchAliasOperations).not.toHaveBeenCalled();
  });

  it('lets anonymous assign of own IP to a visible group reach the write path', async () => {
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_VISIBLE',
    }));

    expect(response.status).not.toBe(403);
    expect(batchAliasOperations).toHaveBeenCalled();
  });

  it('returns 403 for anonymous assign to a globally-disabled group', async () => {
    fetchUnmanagedGroupFilterData.mockResolvedValue({
      globalFilters: [],
      globallyDisabledGroups: [{ opnsenseUuid: 'g-hid' }],
      userSpecificFilters: null,
    });

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_HIDDEN',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Forbidden: This group is not available for self-service',
    });
    expect(batchAliasOperations).not.toHaveBeenCalled();
  });

  it('returns 403 for a restricted USER on the own-device grant assigning a hidden group', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: false, permittedAliasUuids: new Set(), localGroupIds: [] });
    resolveUserPermissions.mockResolvedValue(emptyPermissions());

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_HIDDEN',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Forbidden: This group is not available for self-service',
    });
    expect(batchAliasOperations).not.toHaveBeenCalled();
  });

  it('lets a restricted USER on the own-device grant assign a visible group', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: false, permittedAliasUuids: new Set(), localGroupIds: [] });
    resolveUserPermissions.mockResolvedValue(emptyPermissions());

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_VISIBLE',
    }));

    expect(response.status).not.toBe(403);
    expect(batchAliasOperations).toHaveBeenCalled();
  });

  it('does not target-restrict a USER with genuine permission on a hidden group', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({
      hasWildcard: false,
      permittedAliasUuids: new Set(['h-own']),
      localGroupIds: [],
    });
    resolveUserPermissions.mockResolvedValue({
      hasWildcard: false,
      permittedAliasUuids: new Set(['h-own']),
      permittedGroupUuids: new Set(['g-hid']),
      localGroupIds: [],
    });

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_HIDDEN',
    }));

    expect(response.status).not.toBe(403);
    expect(batchAliasOperations).toHaveBeenCalled();
  });

  it('does not target-check ADMIN wildcard assigns to a hidden group', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: true, permittedAliasUuids: new Set(), localGroupIds: [] });

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_HIDDEN',
    }));

    expect(response.status).not.toBe(403);
    expect(fetchUnmanagedGroupFilterData).not.toHaveBeenCalled();
    expect(batchAliasOperations).toHaveBeenCalled();
  });

  it('fails only the hidden item in an anonymous batch assign and loads the target set once', async () => {
    const response = await POST(requestWithBody({
      operation: 'batch',
      operationType: 'assign',
      hostAliases: [{ ipAddress: '192.168.1.10' }],
      groups: [{ groupName: 'G_VISIBLE' }, { groupName: 'G_HIDDEN' }],
    }));

    expect(response.status).not.toBe(403);
    const body = await response.json() as {
      operationResults?: Array<{ success: boolean; error?: string }>;
    };
    // groups are processed in request order: G_VISIBLE then G_HIDDEN
    expect(body.operationResults).toHaveLength(2);
    expect(body.operationResults?.[0]).toEqual(expect.objectContaining({ success: true }));
    expect(body.operationResults?.[1]).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringMatching(/permission/i),
    }));
    expect(batchAliasOperations).toHaveBeenCalled();
    const writtenUuids = batchAliasOperations.mock.calls
      .flat()
      .flat()
      .map((op: { uuid?: string }) => op.uuid);
    expect(writtenUuids).toContain('g-vis');
    expect(writtenUuids).not.toContain('g-hid');
    // snapshot + unmanaged membership + one memoised target-set load
    expect(exportAliases).toHaveBeenCalledTimes(3);
  });

  it('fails a USER-on-grant batch assign of a hidden group and never writes', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: false, permittedAliasUuids: new Set(), localGroupIds: [] });
    resolveUserPermissions.mockResolvedValue(emptyPermissions());

    const response = await POST(requestWithBody({
      operation: 'batch',
      operationType: 'assign',
      hostAliases: [{ ipAddress: '192.168.1.10' }],
      groups: [{ groupName: 'G_HIDDEN' }],
    }));

    expect(response.status).not.toBe(403);
    expect(batchAliasOperations).not.toHaveBeenCalled();
    expect(addAliasItem).not.toHaveBeenCalled();
    expect(hasTargetDeniedAudit()).toBe(true);
  });

  it('does not apply the target check on anonymous unassign from a hidden group', async () => {
    const response = await POST(requestWithBody({
      operation: 'unassign',
      ipAddress: '192.168.1.10',
      groupName: 'G_HIDDEN',
    }));

    expect(hasTargetDeniedAudit()).toBe(false);
    expect(response.status).not.toBe(403);
    expect(removeIpFromGroup).toHaveBeenCalled();
  });

  it('does not apply the target check on anonymous batch unassign from a hidden group', async () => {
    const response = await POST(requestWithBody({
      operation: 'batch',
      operationType: 'unassign',
      hostAliases: [{ ipAddress: '192.168.1.10' }],
      groups: [{ groupName: 'G_HIDDEN' }],
    }));

    expect(hasTargetDeniedAudit()).toBe(false);
    expect(response.status).not.toBe(403);
    expect(batchAliasOperations).toHaveBeenCalled();
    const writtenUuids = batchAliasOperations.mock.calls
      .flat()
      .flat()
      .map((op: { uuid?: string }) => op.uuid);
    expect(writtenUuids).toContain('g-hid');
  });

  it('returns 503 and does not write when the self-service group set cannot be loaded', async () => {
    fetchUnmanagedGroupFilterData.mockRejectedValue(new Error('filter lookup failed'));

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_VISIBLE',
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Could not verify group management status. Try again.',
    });
    expect(batchAliasOperations).not.toHaveBeenCalled();
    const failures = auditValidationFailures();
    expect(failures).toContain('SELF_SERVICE_TARGET_CHECK_FAILED');
    expect(failures).not.toContain('UNMANAGED_CHECK_FAILED');
  });
});
