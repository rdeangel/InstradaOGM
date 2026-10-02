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
  authenticateRequest,
  prismaMock,
  fetchUnmanagedGroupFilterData,
  isHostInUnmanagedGroups,
  resolveUserAliasPermissions,
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
  authenticateRequest: vi.fn(async (): Promise<{ user: { id: string; role: string } | null; method?: string }> => ({
    user: null,
  })),
  prismaMock: {
    opnsenseGroupDisplay: { findMany: vi.fn() },
    globalSettings: { findFirst: vi.fn(), create: vi.fn() },
    globallyDisabledGroup: { findMany: vi.fn() },
  },
  fetchUnmanagedGroupFilterData: vi.fn(),
  isHostInUnmanagedGroups: vi.fn(),
  resolveUserAliasPermissions: vi.fn(async () => ({ hasWildcard: true, permittedAliasUuids: new Set(), localGroupIds: [] })),
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
  getNetworkGroupById: vi.fn(),
  getHostAliasesByName: vi.fn(),
  createHostAliasFromHostname,
  addAliasItem,
  parseGroupContent: vi.fn(),
}));
vi.mock('@/lib/host-group-batch', () => ({
  buildBatchSnapshot: vi.fn(() => ({ aliases: [], groups: [] })),
  resolveGroupFromSnapshot: vi.fn(),
  resolveHostAliasFromSnapshot,
  findGroupsContainingAlias: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/unmanaged-group-utils', () => ({
  fetchUnmanagedGroupFilterData,
  isHostInUnmanagedGroups,
}));
vi.mock('@/lib/user-permissions', () => ({
  resolveUserAliasPermissions,
  resolveUserPermissions: vi.fn(),
}));

import { POST } from '@/app/api/opnsense/host-group-management/route';

const INSIDE_NETWORKS = [{ type: 'include', network: '192.168.1.0/24' }];

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

describe('host-group-management anonymous self-service gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({ user: null });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: true, permittedAliasUuids: new Set(), localGroupIds: [] });
    prismaMock.opnsenseGroupDisplay.findMany.mockResolvedValue([]);
    prismaMock.globallyDisabledGroup.findMany.mockResolvedValue([]);
    stubSettings();
    getBestHostAliasName.mockResolvedValue({ aliasName: 'HOST_192_168_1_10', detectedHostname: null });
    addAliasItem.mockResolvedValue({ result: 'saved' });
    resolveHostAliasIdentifier.mockResolvedValue(null);
    fetchUnmanagedGroupFilterData.mockResolvedValue({
      globalFilters: [],
      globallyDisabledGroups: [],
      userSpecificFilters: null,
    });
    isHostInUnmanagedGroups.mockResolvedValue({
      isUnmanaged: false,
      unmanagedGroups: [],
      reason: 'none',
      message: '',
    });
  });

  it('lets anonymous assign of own IP inside networks past the gate for a brand-new device', async () => {
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_TEST',
    }));

    expect(response.status).not.toBe(403);
    expect(getBestHostAliasName).toHaveBeenCalled();
    expect(addAliasItem).toHaveBeenCalled();
  });

  it('returns 403 for anonymous assign of a foreign IP and never resolves or creates', async () => {
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.99',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Unauthorized: Unauthenticated users can only operate on their own IP address',
    });
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
    expect(getBestHostAliasName).not.toHaveBeenCalled();
    expect(addAliasItem).not.toHaveBeenCalled();
  });

  it('returns 403 with the network message when the client is outside Allowed Networks', async () => {
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '10.9.9.9',
      groupName: 'G_TEST',
    }, '10.9.9.9'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Unauthorized: IP address is not in allowed networks for self-service access',
    });
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
    expect(getBestHostAliasName).not.toHaveBeenCalled();
    expect(addAliasItem).not.toHaveBeenCalled();
    expect(exportAliases).not.toHaveBeenCalled();
  });

  it('returns 403 when Allowed Networks is empty', async () => {
    stubSettings({ allowedNetworks: [] });
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(403);
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
    expect(addAliasItem).not.toHaveBeenCalled();
  });

  it('returns 403 with the disabled message when self-service is disabled', async () => {
    stubSettings({ removeSelfServicePage: true });
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Forbidden: Self-service functionality is disabled',
    });
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
  });

  it('lets an IPv4-mapped client ::ffff:192.168.1.10 assign 192.168.1.10 past the gate', async () => {
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_TEST',
    }, '::ffff:192.168.1.10'));

    expect(response.status).not.toBe(403);
    expect(getBestHostAliasName).toHaveBeenCalled();
    expect(addAliasItem).toHaveBeenCalled();
  });

  it('returns 403 for anonymous assign with hostAliasName only and no ipAddress', async () => {
    const response = await POST(requestWithBody({
      operation: 'assign',
      hostAliasName: 'OFFICE_DESK',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(403);
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
  });

  it('returns 403 for anonymous unassign of a foreign IP and never removes from a group', async () => {
    const response = await POST(requestWithBody({
      operation: 'unassign',
      ipAddress: '192.168.1.99',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(403);
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
    expect(removeIpFromGroup).not.toHaveBeenCalled();
  });

  it('returns 403 for the whole anonymous batch when any host is a foreign IP', async () => {
    const response = await POST(requestWithBody({
      operation: 'batch',
      operationType: 'assign',
      hostAliases: [{ ipAddress: '192.168.1.10' }, { ipAddress: '192.168.1.99' }],
      groups: [{ groupName: 'G_TEST' }],
    }));

    expect(response.status).toBe(403);
    expect(exportAliases).not.toHaveBeenCalled();
    expect(addAliasItem).not.toHaveBeenCalled();
  });

  it('lets an anonymous batch of only the own IP past the gate', async () => {
    exportAliases.mockResolvedValue({ aliases: { alias: {} } });
    const response = await POST(requestWithBody({
      operation: 'batch',
      operationType: 'assign',
      hostAliases: [{ ipAddress: '192.168.1.10' }],
      groups: [{ groupName: 'G_TEST' }],
    }));

    expect(response.status).not.toBe(403);
    expect(exportAliases).toHaveBeenCalled();
  });

  it('denies a restricted USER creating an alias for a brand-new foreign IP before addAliasItem', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: false, permittedAliasUuids: new Set(), localGroupIds: [] });

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.99',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(403);
    expect(addAliasItem).not.toHaveBeenCalled();
    expect(getBestHostAliasName).not.toHaveBeenCalled();
    expect(createHostAliasFromHostname).not.toHaveBeenCalled();
  });

  it('lets a restricted USER create an alias for their own IP inside networks', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: false, permittedAliasUuids: new Set(), localGroupIds: [] });

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_TEST',
    }));

    expect(response.status).not.toBe(403);
    expect(addAliasItem).toHaveBeenCalled();
  });

  it('returns 503 and does not unassign when the unmanaged-group check cannot complete', async () => {
    resolveHostAliasIdentifier.mockResolvedValue({
      ipAddress: '192.168.1.10',
      hostAliasName: 'HOST_192_168_1_10',
    });
    fetchUnmanagedGroupFilterData.mockRejectedValue(new Error('filter lookup failed'));

    const response = await POST(requestWithBody({
      operation: 'unassign',
      ipAddress: '192.168.1.10',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Could not verify group management status. Try again.',
    });
    expect(removeIpFromGroup).not.toHaveBeenCalled();
  });

  it('returns 503 and does not assign when the unmanaged-group check cannot complete', async () => {
    resolveHostAliasIdentifier.mockResolvedValue({
      ipAddress: '192.168.1.10',
      hostAliasName: 'HOST_192_168_1_10',
    });
    resolveGroupIdentifier.mockResolvedValue({
      groupId: 'g-test',
      group: { name: 'G_TEST', enabled: true },
    });
    exportAliases.mockResolvedValue({ aliases: { alias: {} } });
    fetchUnmanagedGroupFilterData.mockRejectedValue(new Error('filter lookup failed'));

    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '192.168.1.10',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Could not verify group management status. Try again.',
    });
    expect(addAliasItem).not.toHaveBeenCalled();
    expect(batchAliasOperations).not.toHaveBeenCalled();
  });

  it('fails the batch item and does not write when the unmanaged-group check cannot complete', async () => {
    exportAliases.mockResolvedValue({ aliases: { alias: {} } });
    resolveHostAliasFromSnapshot.mockReturnValue({
      ipAddress: '192.168.1.10',
      hostAliasName: 'HOST_192_168_1_10',
    });
    fetchUnmanagedGroupFilterData.mockRejectedValue(new Error('filter lookup failed'));

    const response = await POST(requestWithBody({
      operation: 'batch',
      operationType: 'assign',
      hostAliases: [{ ipAddress: '192.168.1.10' }],
      groups: [{ groupName: 'G_TEST' }],
    }));

    expect(response.status).not.toBe(503);
    expect(batchAliasOperations).not.toHaveBeenCalled();
    expect(addAliasItem).not.toHaveBeenCalled();
  });
});
