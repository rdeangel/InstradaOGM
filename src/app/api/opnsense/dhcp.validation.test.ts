import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchFromOpnsense, authenticateRequest } = vi.hoisted(() => ({
  fetchFromOpnsense: vi.fn(),
  authenticateRequest: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN' },
    method: 'session',
  })),
}));

vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: vi.fn(),
  authenticateRequest,
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/opnsense-api', () => ({
  fetchFromOpnsense,
  get_arpTable: vi.fn(),
  exportAliases: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    globallyDisabledGroup: { findMany: vi.fn() },
    opnsenseGroupDisplay: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/user-permissions', () => ({
  userHasDeviceIpAccess: vi.fn(),
  userHasDhcpAccess: vi.fn(),
}));
vi.mock('@/lib/mac-utils', () => ({
  checkMacRandomization: vi.fn(),
  getRandomizedMacWarning: vi.fn(),
}));
vi.mock('@/lib/unmanaged-group-utils', () => ({
  fetchUnmanagedGroupFilterData: vi.fn(),
  isHostInUnmanagedGroups: vi.fn(),
}));

import { POST } from '@/app/api/opnsense/dhcp/route';

describe('dhcp identifier guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
      method: 'session',
    });
  });

  it('returns 400 for del_reservation with a slash in the uuid and never fetches OPNsense', async () => {
    const response = await POST(
      new Request('http://localhost/api/opnsense/dhcp?action=del_reservation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reservationUuid: '1/stopService/2' }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invalid OPNsense identifier',
    });
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });
});
