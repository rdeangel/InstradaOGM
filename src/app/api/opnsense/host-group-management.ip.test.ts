import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveHostAliasIdentifier, getBestHostAliasName, exportAliases, prismaMock } = vi.hoisted(() => ({
  resolveHostAliasIdentifier: vi.fn(),
  getBestHostAliasName: vi.fn(),
  exportAliases: vi.fn(),
  prismaMock: {
    opnsenseGroupDisplay: { findMany: vi.fn() },
    globalSettings: { findFirst: vi.fn() },
    globallyDisabledGroup: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest: vi.fn(async () => ({ user: { id: 'admin-1', role: 'ADMIN' }, method: 'session' })),
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/opnsense-api', () => ({
  resolveHostAliasIdentifier,
  getBestHostAliasName,
  exportAliases,
  removeIpFromGroup: vi.fn(),
  resolveGroupIdentifier: vi.fn(),
  batchAliasOperations: vi.fn(),
  getNetworkGroupById: vi.fn(),
  getHostAliasesByName: vi.fn(),
  createHostAliasFromHostname: vi.fn(),
  addAliasItem: vi.fn(),
  parseGroupContent: vi.fn(),
}));
vi.mock('@/lib/host-group-batch', () => ({
  buildBatchSnapshot: vi.fn(),
  resolveGroupFromSnapshot: vi.fn(),
  resolveHostAliasFromSnapshot: vi.fn(),
  findGroupsContainingAlias: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/unmanaged-group-utils', () => ({
  fetchUnmanagedGroupFilterData: vi.fn(),
  isHostInUnmanagedGroups: vi.fn(),
}));
vi.mock('@/lib/user-permissions', () => ({
  resolveUserAliasPermissions: vi.fn(async () => ({ hasWildcard: true, permittedAliasUuids: new Set(), localGroupIds: [] })),
  resolveUserPermissions: vi.fn(),
}));

import { POST } from '@/app/api/opnsense/host-group-management/route';

function requestWithBody(body: unknown): Request {
  return new Request('http://localhost/api/opnsense/host-group-management', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.10' },
    body: JSON.stringify(body),
  });
}

describe('host-group-management invalid IP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.opnsenseGroupDisplay.findMany.mockResolvedValue([]);
    prismaMock.globalSettings.findFirst.mockResolvedValue({
      allowedNetworks: [],
      removeSelfServicePage: false,
    });
  });

  it('returns 400 for assign with an injection IP and never resolves a host alias', async () => {
    const response = await POST(requestWithBody({
      operation: 'assign',
      ipAddress: '1.2.3.4;id',
      groupName: 'G_TEST',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Invalid IP address',
    });
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
    expect(getBestHostAliasName).not.toHaveBeenCalled();
    expect(exportAliases).not.toHaveBeenCalled();
  });

  it('returns 400 for unassign with an invalid IP before OPNsense', async () => {
    const response = await POST(requestWithBody({
      operation: 'unassign',
      ipAddress: '1.2.3.4$(id)',
    }));

    expect(response.status).toBe(400);
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
  });

  it('returns 400 for batch when any hostAlias.ipAddress is invalid', async () => {
    const response = await POST(requestWithBody({
      operation: 'batch',
      operationType: 'assign',
      hostAliases: [{ ipAddress: '10.0.0.1' }, { ipAddress: '1.2.3.4;id' }],
      groups: [{ groupName: 'G_TEST' }],
    }));

    expect(response.status).toBe(400);
    expect(exportAliases).not.toHaveBeenCalled();
    expect(resolveHostAliasIdentifier).not.toHaveBeenCalled();
  });
});
