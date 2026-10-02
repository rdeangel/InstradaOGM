import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authenticateRequest,
  getHostAliases,
  addAliasItem,
  deleteAliasItem,
  setAliasItem,
  reconfigureAliases,
  exportAliases,
  prismaMock,
  fetchUnmanagedGroupFilterData,
  isHostInUnmanagedGroups,
  resolveUserAliasPermissions,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async (): Promise<{ user: { id: string; role: string } | null; method?: string }> => ({
    user: null,
  })),
  getHostAliases: vi.fn(),
  addAliasItem: vi.fn(),
  deleteAliasItem: vi.fn(),
  setAliasItem: vi.fn(),
  reconfigureAliases: vi.fn(),
  exportAliases: vi.fn(),
  prismaMock: {
    globalSettings: { findFirst: vi.fn(), create: vi.fn() },
    opnsenseGroupDisplay: { findMany: vi.fn() },
    groupHostAliasPermission: { deleteMany: vi.fn() },
  },
  fetchUnmanagedGroupFilterData: vi.fn(),
  isHostInUnmanagedGroups: vi.fn(),
  resolveUserAliasPermissions: vi.fn(async () => ({ hasWildcard: false, permittedAliasUuids: new Set(), localGroupIds: [] })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest,
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/opnsense-api', () => ({
  getHostAliases,
  addAliasItem,
  reconfigureAliases,
  deleteAliasItem,
  setAliasItem,
  fetchFromOpnsense: vi.fn(),
  exportAliases,
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/unmanaged-group-utils', () => ({
  fetchUnmanagedGroupFilterData,
  isHostInUnmanagedGroups,
}));
vi.mock('@/lib/user-permissions', () => ({
  resolveUserAliasPermissions,
}));
vi.mock('@/lib/auditLog', () => ({ logApiAccess: vi.fn() }));
vi.mock('@/lib/host-alias-filtering', () => ({ getFilteredHostAliases: vi.fn() }));
vi.mock('@/lib/server/network-utils', () => ({ lookupMacVendor: vi.fn() }));

import { DELETE, GET, POST, PUT } from '@/app/api/opnsense/host-alias-management/route';

const ALIAS_UUID = 'alias-uuid-1';
const INSIDE_NETWORKS = [{ type: 'include', network: '192.168.1.0/24' }];

function stubSettings(overrides: Record<string, unknown> = {}) {
  prismaMock.globalSettings.findFirst.mockResolvedValue({
    allowedNetworks: INSIDE_NETWORKS,
    removeSelfServicePage: false,
    enableRenamingSelfServicePage: true,
    ...overrides,
  });
}

function jsonRequest(method: string, url: string, body?: unknown, xff = '192.168.1.10'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ownAlias = {
  uuid: ALIAS_UUID,
  name: 'OFFICE_DESK',
  type: 'host',
  content: '192.168.1.10',
  enabled: '1',
  description: '',
  proto: '',
  interface: '',
  counters: '',
  updatefreq: '',
  categories: '',
};

describe('host-alias-management auth and self-service gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({ user: null });
    stubSettings();
    getHostAliases.mockResolvedValue([ownAlias]);
    addAliasItem.mockResolvedValue({ uuid: 'new-alias', result: 'saved' });
    deleteAliasItem.mockResolvedValue({ result: 'deleted' });
    setAliasItem.mockResolvedValue({ result: 'saved' });
    reconfigureAliases.mockResolvedValue({ status: 'ok' });
    exportAliases.mockResolvedValue({ aliases: { alias: {} } });
    prismaMock.opnsenseGroupDisplay.findMany.mockResolvedValue([]);
    prismaMock.groupHostAliasPermission.deleteMany.mockResolvedValue({ count: 0 });
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
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: false, permittedAliasUuids: new Set(), localGroupIds: [] });
  });

  it('returns 401 for anonymous POST and never creates', async () => {
    const response = await POST(jsonRequest('POST', 'http://localhost/api/opnsense/host-alias-management', {
      alias: { name: 'X', type: 'host', content: '192.168.1.10' },
    }));

    expect(response.status).toBe(401);
    expect(addAliasItem).not.toHaveBeenCalled();
    expect(getHostAliases).not.toHaveBeenCalled();
  });

  it('returns 403 for USER POST', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    const response = await POST(jsonRequest('POST', 'http://localhost/api/opnsense/host-alias-management', {
      alias: { name: 'X', type: 'host', content: '192.168.1.10' },
    }));

    expect(response.status).toBe(403);
    expect(addAliasItem).not.toHaveBeenCalled();
  });

  it('lets ADMIN POST past the gate and call addAliasItem', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' }, method: 'session' });
    getHostAliases.mockResolvedValue([]);
    const response = await POST(jsonRequest('POST', 'http://localhost/api/opnsense/host-alias-management', {
      alias: { name: 'X', type: 'host', content: '192.168.1.10' },
    }));

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(addAliasItem).toHaveBeenCalled();
  });

  it('returns 401 for anonymous DELETE and never deletes', async () => {
    const response = await DELETE(jsonRequest('DELETE', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`));

    expect(response.status).toBe(401);
    expect(deleteAliasItem).not.toHaveBeenCalled();
  });

  it('returns 403 for USER DELETE without a permission on the uuid', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    const response = await DELETE(jsonRequest('DELETE', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`));

    expect(response.status).toBe(403);
    expect(deleteAliasItem).not.toHaveBeenCalled();
  });

  it('lets USER DELETE when permittedAliasUuids contains the uuid', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({
      hasWildcard: false,
      permittedAliasUuids: new Set([ALIAS_UUID]),
      localGroupIds: [],
    });
    const response = await DELETE(jsonRequest('DELETE', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`));

    expect(deleteAliasItem).toHaveBeenCalledWith(ALIAS_UUID);
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });

  it('lets ADMIN DELETE via wildcard', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' }, method: 'session' });
    resolveUserAliasPermissions.mockResolvedValue({ hasWildcard: true, permittedAliasUuids: new Set(), localGroupIds: [] });
    const response = await DELETE(jsonRequest('DELETE', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`));

    expect(deleteAliasItem).toHaveBeenCalled();
    expect(response.status).not.toBe(403);
  });

  it('returns 403 for anonymous PUT when renaming is disabled, without fetching aliases', async () => {
    stubSettings({ enableRenamingSelfServicePage: false });
    const response = await PUT(jsonRequest('PUT', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`, {
      alias: { name: 'NEW_NAME' },
    }));

    expect(response.status).toBe(403);
    expect(getHostAliases).not.toHaveBeenCalled();
    expect(setAliasItem).not.toHaveBeenCalled();
  });

  it('lets anonymous PUT rename an alias whose content is the caller own IP', async () => {
    const response = await PUT(jsonRequest('PUT', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`, {
      alias: { name: 'NEW_NAME' },
    }));

    expect(setAliasItem).toHaveBeenCalled();
    expect(response.status).not.toBe(403);
    expect(response.status).not.toBe(503);
  });

  it('returns 403 for anonymous PUT of an alias whose content is a foreign IP', async () => {
    getHostAliases.mockResolvedValue([{ ...ownAlias, content: '192.168.1.99' }]);
    const response = await PUT(jsonRequest('PUT', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`, {
      alias: { name: 'NEW_NAME' },
    }));

    expect(response.status).toBe(403);
    expect(setAliasItem).not.toHaveBeenCalled();
  });

  it('returns 403 for anonymous PUT when the client is outside Allowed Networks', async () => {
    const response = await PUT(jsonRequest('PUT', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`, {
      alias: { name: 'NEW_NAME' },
    }, '10.9.9.9'));

    expect(response.status).toBe(403);
    expect(getHostAliases).not.toHaveBeenCalled();
    expect(setAliasItem).not.toHaveBeenCalled();
  });

  it('returns 403 for anonymous PUT when Allowed Networks is empty', async () => {
    stubSettings({ allowedNetworks: [] });
    const response = await PUT(jsonRequest('PUT', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`, {
      alias: { name: 'NEW_NAME' },
    }));

    expect(response.status).toBe(403);
    expect(setAliasItem).not.toHaveBeenCalled();
  });

  it('returns 503 for anonymous PUT of own IP when the unmanaged check cannot complete', async () => {
    fetchUnmanagedGroupFilterData.mockRejectedValue(new Error('filter lookup failed'));
    const response = await PUT(jsonRequest('PUT', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`, {
      alias: { name: 'NEW_NAME' },
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Could not verify group management status. Try again.',
    });
    expect(setAliasItem).not.toHaveBeenCalled();
  });

  it('returns 403 for USER PUT with no permission and not own device', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    getHostAliases.mockResolvedValue([{ ...ownAlias, content: '192.168.1.99' }]);
    const response = await PUT(jsonRequest('PUT', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`, {
      alias: { name: 'NEW_NAME' },
    }));

    expect(response.status).toBe(403);
    expect(setAliasItem).not.toHaveBeenCalled();
  });

  it('lets USER PUT rename their own device without a permission row', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' }, method: 'session' });
    const response = await PUT(jsonRequest('PUT', `http://localhost/api/opnsense/host-alias-management?uuid=${ALIAS_UUID}`, {
      alias: { name: 'NEW_NAME' },
    }));

    expect(setAliasItem).toHaveBeenCalled();
    expect(response.status).not.toBe(403);
  });

  it('returns 200 for anonymous GET of own IP inside networks', async () => {
    getHostAliases.mockResolvedValue([]);
    const response = await GET(jsonRequest('GET', 'http://localhost/api/opnsense/host-alias-management?ipAddress=192.168.1.10'));

    expect(response.status).toBe(200);
  });

  it('returns 403 for anonymous GET of own IP outside Allowed Networks', async () => {
    const response = await GET(jsonRequest('GET', 'http://localhost/api/opnsense/host-alias-management?ipAddress=10.9.9.9', undefined, '10.9.9.9'));

    expect(response.status).toBe(403);
    expect(getHostAliases).not.toHaveBeenCalled();
  });

  it('returns 403 for anonymous GET when Allowed Networks is empty', async () => {
    stubSettings({ allowedNetworks: [] });
    const response = await GET(jsonRequest('GET', 'http://localhost/api/opnsense/host-alias-management?ipAddress=192.168.1.10'));

    expect(response.status).toBe(403);
  });

  it('returns 403 for anonymous GET of a foreign IP', async () => {
    const response = await GET(jsonRequest('GET', 'http://localhost/api/opnsense/host-alias-management?ipAddress=192.168.1.99'));

    expect(response.status).toBe(403);
    expect(getHostAliases).not.toHaveBeenCalled();
  });
});
