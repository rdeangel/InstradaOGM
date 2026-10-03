import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchFromOpnsense, isAnonSelfServiceAllowed } = vi.hoisted(() => ({
  fetchFromOpnsense: vi.fn(),
  isAnonSelfServiceAllowed: vi.fn(),
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
  exportAliases: vi.fn(),
}));
vi.mock('@/lib/unmanaged-group-utils', () => ({
  fetchUnmanagedGroupFilterData: vi.fn(),
  isHostInUnmanagedGroups: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    vpnMapping: { findFirst: vi.fn() },
    opnsenseGroupDisplay: { findMany: vi.fn() },
    globalSettings: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/server/global-settings', () => ({
  isAnonSelfServiceAllowed,
}));

import { POST } from '@/app/api/vpn/safe-restart/route';

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
