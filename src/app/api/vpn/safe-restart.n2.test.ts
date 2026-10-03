import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchFromOpnsense,
  isAnonSelfServiceAllowed,
  exportAliases,
  prismaMock,
  isHostInUnmanagedGroups,
  fetchUnmanagedGroupFilterData,
} = vi.hoisted(() => ({
  fetchFromOpnsense: vi.fn(),
  isAnonSelfServiceAllowed: vi.fn(),
  exportAliases: vi.fn(),
  prismaMock: {
    vpnMapping: { findFirst: vi.fn() },
    opnsenseGroupDisplay: { findMany: vi.fn() },
    globalSettings: { findFirst: vi.fn() },
  },
  isHostInUnmanagedGroups: vi.fn(),
  fetchUnmanagedGroupFilterData: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest: vi.fn(async () => ({ user: null })),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/opnsense-api', () => ({
  fetchFromOpnsense,
  getIpsecConnections: vi.fn(),
  exportAliases,
}));
vi.mock('@/lib/unmanaged-group-utils', () => ({
  fetchUnmanagedGroupFilterData,
  isHostInUnmanagedGroups,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));
vi.mock('@/lib/server/global-settings', () => ({
  isAnonSelfServiceAllowed,
}));

import { POST } from '@/app/api/vpn/safe-restart/route';

function restartRequest(): Request {
  return new Request('http://localhost/api/vpn/safe-restart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vpnUuid: '1', vpnType: 'OpenVPN' }),
  });
}

describe('vpn/safe-restart anonymous gate hoist (N2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchFromOpnsense.mockResolvedValue({ result: 'ok' });
  });

  it('returns 403 when the anonymous gate rejects and never restarts', async () => {
    isAnonSelfServiceAllowed.mockResolvedValue({
      allowed: false,
      clientIp: '10.0.0.1',
      settings: {},
      message: 'Unauthorized: IP address is not in allowed networks for self-service access',
    });

    const response = await POST(
      new Request('http://localhost/api/vpn/safe-restart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vpnUuid: '1', vpnType: 'OpenVPN' }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized: IP address is not in allowed networks for self-service access',
    });
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });

  it('returns 500 when the anonymous gate throws and never restarts', async () => {
    isAnonSelfServiceAllowed.mockRejectedValue(new Error('settings unavailable'));

    const response = await POST(
      new Request('http://localhost/api/vpn/safe-restart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vpnUuid: '1', vpnType: 'OpenVPN' }),
      })
    );

    expect(response.status).toBe(500);
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });
});

describe('vpn/safe-restart unmanaged check fails closed (T8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAnonSelfServiceAllowed.mockResolvedValue({
      allowed: true,
      clientIp: '192.168.1.10',
      settings: {},
      message: '',
    });
    prismaMock.opnsenseGroupDisplay.findMany.mockResolvedValue([]);
    fetchUnmanagedGroupFilterData.mockResolvedValue({
      globalFilters: [],
      globallyDisabledGroups: [],
      userSpecificFilters: null,
    });
    fetchFromOpnsense.mockImplementation(async (path: string) => {
      if (String(path).includes('searchSessions')) return { rows: [] };
      return { result: 'ok' };
    });
  });

  it('returns 503 and does not restart when OPNsense export throws', async () => {
    prismaMock.vpnMapping.findFirst.mockResolvedValue({ opnsenseNetworkGroupId: 'g1' });
    exportAliases.mockRejectedValue(new Error('opnsense export failed'));

    const response = await POST(restartRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Could not verify group management status. Try again.',
      message: 'Could not verify group management status. Try again.',
    });
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });

  it('returns 503 and does not restart when isHostInUnmanagedGroups throws', async () => {
    prismaMock.vpnMapping.findFirst.mockResolvedValue({ opnsenseNetworkGroupId: 'g1' });
    exportAliases.mockResolvedValue({
      aliases: {
        alias: {
          g1: {
            type: 'networkgroup',
            name: 'VPN_G',
            content: 'HOST_10',
            enabled: '1',
          },
          h1: {
            type: 'host',
            name: 'HOST_10',
            content: '192.168.1.10',
            enabled: '1',
          },
        },
      },
    });
    isHostInUnmanagedGroups.mockRejectedValue(new Error('unmanaged check failed'));

    const response = await POST(restartRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
    });
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });

  it('does not return 503 on the happy path when vpnMapping is missing', async () => {
    prismaMock.vpnMapping.findFirst.mockResolvedValue(null);

    const response = await POST(restartRequest());

    expect(response.status).not.toBe(503);
    expect(fetchFromOpnsense).toHaveBeenCalled();
  });
});
