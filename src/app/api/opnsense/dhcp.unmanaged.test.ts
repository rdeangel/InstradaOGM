import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchFromOpnsense,
  authenticateRequest,
  exportAliases,
  get_arpTable,
  userHasDhcpAccess,
  isHostInUnmanagedGroups,
  fetchUnmanagedGroupFilterData,
  checkMacRandomization,
} = vi.hoisted(() => ({
  fetchFromOpnsense: vi.fn(),
  authenticateRequest: vi.fn(async () => ({
    user: { id: 'user-1', role: 'USER' },
    method: 'session',
  })),
  exportAliases: vi.fn(),
  get_arpTable: vi.fn(),
  userHasDhcpAccess: vi.fn(),
  isHostInUnmanagedGroups: vi.fn(),
  fetchUnmanagedGroupFilterData: vi.fn(),
  checkMacRandomization: vi.fn(),
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
  get_arpTable,
  exportAliases,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    globallyDisabledGroup: { findMany: vi.fn(async () => []) },
    opnsenseGroupDisplay: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/user-permissions', () => ({
  userHasDeviceIpAccess: vi.fn(),
  userHasDhcpAccess,
}));
vi.mock('@/lib/mac-utils', () => ({
  checkMacRandomization,
  getRandomizedMacWarning: vi.fn(),
}));
vi.mock('@/lib/unmanaged-group-utils', () => ({
  fetchUnmanagedGroupFilterData,
  isHostInUnmanagedGroups,
}));

import { POST } from '@/app/api/opnsense/dhcp/route';

function addReservationRequest(): Request {
  return new Request('http://localhost/api/opnsense/dhcp?action=add_reservation', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.1.10' },
    body: JSON.stringify({
      payload: {
        subnet: '192.168.1.0/24',
        ip_address: '192.168.1.10',
        hw_address: 'aa:bb:cc:dd:ee:ff',
      },
    }),
  });
}

describe('dhcp unmanaged check fails closed (T8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({
      user: { id: 'user-1', role: 'USER' },
      method: 'session',
    });
    userHasDhcpAccess.mockResolvedValue(true);
    checkMacRandomization.mockReturnValue({ isRandomized: false });
    get_arpTable.mockResolvedValue([]);
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
    fetchFromOpnsense.mockImplementation(async (path: string) => {
      if (String(path).includes('search_reservation')) return { rows: [] };
      if (String(path).includes('add_reservation')) return { result: 'saved', uuid: 'res-1' };
      return { result: 'ok' };
    });
  });

  it('returns 503 and does not add a reservation when exportAliases throws', async () => {
    exportAliases.mockRejectedValue(new Error('opnsense export failed'));

    const response = await POST(addReservationRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Could not verify group management status. Try again.',
    });
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });

  it('returns 503 and does not add a reservation when isHostInUnmanagedGroups throws', async () => {
    exportAliases.mockResolvedValue({ aliases: { alias: {} } });
    isHostInUnmanagedGroups.mockRejectedValue(new Error('unmanaged check failed'));

    const response = await POST(addReservationRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'Could not verify group management status. Try again.',
    });
    expect(fetchFromOpnsense).not.toHaveBeenCalled();
  });

  it('does not return 503 for ADMIN even when exportAliases would reject', async () => {
    authenticateRequest.mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
      method: 'session',
    });
    exportAliases.mockRejectedValue(new Error('opnsense export failed'));

    const response = await POST(addReservationRequest());

    expect(response.status).not.toBe(503);
    expect(fetchFromOpnsense).toHaveBeenCalled();
  });
});
