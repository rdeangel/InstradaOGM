import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchFromOpnsense } = vi.hoisted(() => ({
  fetchFromOpnsense: vi.fn(),
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

import { POST } from '@/app/api/vpn/safe-restart/route';

describe('vpn/safe-restart identifier guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for a vpnUuid with slashes and never fetches OPNsense', async () => {
    const response = await POST(
      new Request('http://localhost/api/vpn/safe-restart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vpnUuid: '1/stopService/2', vpnType: 'OpenVPN' }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid VPN identifier',
    });
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });
});
