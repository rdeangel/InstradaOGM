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
  logAuditEvent,
} = vi.hoisted(() => ({
  fetchFromOpnsense: vi.fn(),
  authenticateRequest: vi.fn<(request: Request) => Promise<{ user: { id: string; role: string } | null; method?: string }>>(async () => ({
    user: { id: 'user-1', role: 'USER' },
    method: 'session',
  })),
  exportAliases: vi.fn(),
  get_arpTable: vi.fn(),
  userHasDhcpAccess: vi.fn(),
  isHostInUnmanagedGroups: vi.fn(),
  fetchUnmanagedGroupFilterData: vi.fn(),
  checkMacRandomization: vi.fn(),
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auditLog', () => ({ logAuditEvent }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: vi.fn(
    async (request: Request, callback: (auth: unknown) => Promise<Response>) =>
      callback(await authenticateRequest(request))
  ),
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

import { GET, POST } from '@/app/api/opnsense/dhcp/route';

const RESERVATION_UUID = 'res-uuid-1';
const RESERVATION = {
  uuid: RESERVATION_UUID,
  subnet: '192.168.1.0/24',
  ip_address: '192.168.1.55',
  hw_address: 'aa:bb:cc:dd:ee:ff',
  hostname: 'dev1',
  description: '',
  manufacturer: 'Acme',
};

function postRequest(action: string, body: unknown): Request {
  return new Request(`http://localhost/api/opnsense/dhcp?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function searchReservationRequest(): Request {
  return new Request(
    'http://localhost/api/opnsense/dhcp?action=search_reservation&ip=192.168.1.55&mac=AA:BB:CC:DD:EE:FF'
  );
}

function mockReservationSearch(rows: unknown[]) {
  fetchFromOpnsense.mockImplementation(async (path: string) => {
    if (path.includes('/del_reservation/')) {
      return { result: 'deleted', message: 'ok' };
    }
    return { rows };
  });
}

function deleteCalls(): string[] {
  return fetchFromOpnsense.mock.calls
    .map((call) => String(call[0]))
    .filter((path) => path.includes('/del_reservation/'));
}

describe('dhcp ownership rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockImplementation(async () => ({
      user: { id: 'user-1', role: 'USER' },
      method: 'session',
    }));
    userHasDhcpAccess.mockResolvedValue(true);
  });

  describe('POST del_reservation', () => {
    it('returns 403 for a USER without access and never deletes', async () => {
      mockReservationSearch([RESERVATION]);
      userHasDhcpAccess.mockResolvedValue(false);

      const res = await POST(postRequest('del_reservation', { reservationUuid: RESERVATION_UUID }));

      expect(res.status).toBe(403);
      expect(deleteCalls()).toHaveLength(0);
    });

    it('checks access against the reservation IP looked up from OPNsense', async () => {
      mockReservationSearch([{ ...RESERVATION, ip_address: '10.9.9.9' }]);

      const res = await POST(postRequest('del_reservation', { reservationUuid: RESERVATION_UUID }));

      expect(res.status).toBe(200);
      expect(userHasDhcpAccess).toHaveBeenCalledWith('user-1', '10.9.9.9', expect.any(String));
      expect(deleteCalls()).toHaveLength(1);
    });

    it('audits the denial for a USER without access', async () => {
      mockReservationSearch([RESERVATION]);
      userHasDhcpAccess.mockResolvedValue(false);

      const res = await POST(postRequest('del_reservation', { reservationUuid: RESERVATION_UUID }));

      expect(res.status).toBe(403);
      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'DHCP_RESERVATION_DELETE_FAILURE',
        userId: 'user-1',
        reason: expect.stringContaining('No permission'),
      }));
      expect(deleteCalls()).toHaveLength(0);
    });

    it('deletes for a USER with access to the reservation IP', async () => {
      mockReservationSearch([RESERVATION]);
      userHasDhcpAccess.mockResolvedValue(true);

      const res = await POST(postRequest('del_reservation', { reservationUuid: RESERVATION_UUID }));

      expect(res.status).toBe(200);
      expect(deleteCalls()).toHaveLength(1);
    });

    it('returns 404 for a USER when the reservation does not exist', async () => {
      mockReservationSearch([]);

      const res = await POST(postRequest('del_reservation', { reservationUuid: RESERVATION_UUID }));

      expect(res.status).toBe(404);
      expect(deleteCalls()).toHaveLength(0);
    });

    it('returns 503 for a USER when the ownership lookup fails (fail closed)', async () => {
      fetchFromOpnsense.mockRejectedValue(new Error('OPNsense down'));

      const res = await POST(postRequest('del_reservation', { reservationUuid: RESERVATION_UUID }));

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(deleteCalls()).toHaveLength(0);
    });

    it('deletes for ADMIN without consulting userHasDhcpAccess', async () => {
      authenticateRequest.mockImplementation(async () => ({
        user: { id: 'admin-1', role: 'ADMIN' },
        method: 'session',
      }));
      mockReservationSearch([RESERVATION]);

      const res = await POST(postRequest('del_reservation', { reservationUuid: RESERVATION_UUID }));

      expect(res.status).toBe(200);
      expect(deleteCalls()).toHaveLength(1);
      expect(userHasDhcpAccess).not.toHaveBeenCalled();
    });
  });

  describe('POST del_reservations_bulk', () => {
    it('returns 403 for USER and deletes nothing', async () => {
      mockReservationSearch([RESERVATION]);

      const res = await POST(
        postRequest('del_reservations_bulk', { reservationUuids: [RESERVATION_UUID] })
      );

      expect(res.status).toBe(403);
      expect(deleteCalls()).toHaveLength(0);
    });

    it('deletes for ADMIN', async () => {
      authenticateRequest.mockImplementation(async () => ({
        user: { id: 'admin-1', role: 'ADMIN' },
        method: 'session',
      }));
      mockReservationSearch([RESERVATION]);

      const res = await POST(
        postRequest('del_reservations_bulk', { reservationUuids: [RESERVATION_UUID] })
      );

      expect(res.status).toBe(200);
      expect(deleteCalls()).toHaveLength(1);
    });
  });

  describe('GET search_reservation', () => {
    it('hides the reserved MAC and vendor from a USER without access', async () => {
      mockReservationSearch([RESERVATION]);
      userHasDhcpAccess.mockResolvedValue(false);

      const res = await GET(searchReservationRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dhcpReservedMac).toBeNull();
      expect(body.dhcpReservedVendor).toBeNull();
      expect(body.ipConflict).toBe(false);
      expect(body.macConflict).toBe(false);
    });

    it('returns the reserved MAC and vendor to a USER with access', async () => {
      mockReservationSearch([RESERVATION]);
      userHasDhcpAccess.mockResolvedValue(true);

      const res = await GET(searchReservationRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dhcpReservedMac).toBe('aa:bb:cc:dd:ee:ff');
      expect(body.dhcpReservedVendor).toBe('Acme');
    });

    it('returns the full reservation to ADMIN without consulting userHasDhcpAccess', async () => {
      authenticateRequest.mockImplementation(async () => ({
        user: { id: 'admin-1', role: 'ADMIN' },
        method: 'session',
      }));
      mockReservationSearch([RESERVATION]);

      const res = await GET(searchReservationRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reservation).toMatchObject({ uuid: RESERVATION_UUID, hw_address: 'aa:bb:cc:dd:ee:ff' });
      expect(userHasDhcpAccess).not.toHaveBeenCalled();
    });
  });

  describe('anonymous requests', () => {
    it('returns 401 before touching OPNsense', async () => {
      authenticateRequest.mockImplementation(async () => ({ user: null }));

      const res = await POST(postRequest('del_reservation', { reservationUuid: RESERVATION_UUID }));

      expect(res.status).toBe(401);
      expect(fetchFromOpnsense).not.toHaveBeenCalled();
    });
  });
});
