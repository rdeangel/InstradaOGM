import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchFromOpnsense,
  isAnonSelfServiceAllowed,
  exportAliases,
  prismaMock,
  isHostInUnmanagedGroups,
  fetchUnmanagedGroupFilterData,
  getIpsecConnections,
  getWireguardClients,
  restartWireguardClient,
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
  getIpsecConnections: vi.fn(),
  getWireguardClients: vi.fn(),
  restartWireguardClient: vi.fn(),
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
  getIpsecConnections,
  exportAliases,
  getWireguardClients,
  restartWireguardClient,
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
      if (String(path).includes('search_sessions')) return { rows: [] };
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

describe('vpn/safe-restart per-branch success checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAnonSelfServiceAllowed.mockResolvedValue({
      allowed: true,
      clientIp: '192.168.1.10',
      settings: {},
      message: '',
    });
    prismaMock.vpnMapping.findFirst.mockResolvedValue(null);
  });

  function request(vpnType: string, vpnUuid = 'wg-client-1'): Request {
    return new Request('http://localhost/api/vpn/safe-restart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vpnUuid, vpnType }),
    });
  }

  it('returns the shared 500 message when OpenVPN restart result is not ok', async () => {
    fetchFromOpnsense.mockImplementation(async (path: string) => {
      if (String(path).includes('search_sessions')) return { rows: [] };
      return { result: 'failed', message: 'boom' };
    });

    const response = await POST(request('OpenVPN', '1'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to restart OpenVPN VPN service on OPNsense.',
    });
  });

  it('returns 404 when the WireGuard client is missing and does not restart', async () => {
    getWireguardClients.mockResolvedValue([]);

    const response = await POST(request('WireGuard'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'WireGuard client not found.' });
    expect(getWireguardClients).toHaveBeenCalledOnce();
    expect(restartWireguardClient).not.toHaveBeenCalled();
  });

  it('returns 403 when the WireGuard client is disabled', async () => {
    getWireguardClients.mockResolvedValue([{ id: 'wg-client-1', enabled: '0', status: 'offline' }]);

    const response = await POST(request('WireGuard'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'WireGuard is disabled and cannot be restarted via this endpoint.',
    });
    expect(restartWireguardClient).not.toHaveBeenCalled();
  });

  it('returns 403 when the WireGuard peer is online', async () => {
    getWireguardClients.mockResolvedValue([{ id: 'wg-client-1', enabled: '1', status: 'online' }]);

    const response = await POST(request('WireGuard'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'WireGuard is already connected. Cannot restart via this endpoint.',
    });
    expect(restartWireguardClient).not.toHaveBeenCalled();
  });

  it('succeeds when an offline WireGuard client restarts as enabled', async () => {
    getWireguardClients.mockResolvedValue([{ id: 'wg-client-1', enabled: '1', status: 'offline' }]);
    restartWireguardClient.mockResolvedValue({ ok: true, result: 'Enabled' });

    const response = await POST(request('WireGuard'));

    expect(response.status).toBe(200);
    expect(restartWireguardClient).toHaveBeenCalledWith('wg-client-1');
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      message: 'VPN restart initiated successfully',
      opnsenseResponse: { ok: true, result: 'Enabled' },
    });
  });

  it('returns the shared 500 message when the WireGuard helper is not ok', async () => {
    getWireguardClients.mockResolvedValue([{ id: 'wg-client-1', enabled: '1', status: 'offline' }]);
    restartWireguardClient.mockResolvedValue({ ok: false, result: 'Disabled' });

    const response = await POST(request('WireGuard'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to restart WireGuard VPN service on OPNsense.',
    });
  });

  it('connects IPsec with the canonical connection id', async () => {
    getIpsecConnections.mockResolvedValue([{ id: 'ike-1', type: 'IPsec', connected: false }]);
    fetchFromOpnsense.mockResolvedValue({ result: 'ok' });

    const response = await POST(request('IPsec', 'ike-1'));

    expect(response.status).toBe(200);
    expect(fetchFromOpnsense).toHaveBeenCalledWith('/api/ipsec/sessions/connect/ike-1', 'POST', {});
  });

  it('returns 403 and does not connect a connected IPsec session', async () => {
    getIpsecConnections.mockResolvedValue([{ id: 'ike-1', type: 'IPsec', connected: true }]);

    const response = await POST(request('IPsec', 'ike-1'));

    expect(response.status).toBe(403);
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });

  it('returns the shared 500 message when IPsec connect result is not ok', async () => {
    getIpsecConnections.mockResolvedValue([{ id: 'ike-1', type: 'IPsec', connected: false }]);
    fetchFromOpnsense.mockResolvedValue({ result: 'failed', message: 'nope' });

    const response = await POST(request('IPsec', 'ike-1'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to restart IPsec VPN service on OPNsense.',
    });
  });
});
