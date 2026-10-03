import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authenticateRequest,
  getHostAliases,
  addIpToGroup,
  removeIpFromGroup,
  deleteAliasItem,
  setAliasItem,
  reconfigureAliases,
  exportAliases,
  prismaMock,
  logAuditEvent,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn<(request: Request) => Promise<{ user: { id: string; role: string } | null; method?: string }>>(async () => ({
    user: null,
  })),
  getHostAliases: vi.fn(),
  addIpToGroup: vi.fn(),
  removeIpFromGroup: vi.fn(),
  deleteAliasItem: vi.fn(),
  setAliasItem: vi.fn(),
  reconfigureAliases: vi.fn(),
  exportAliases: vi.fn(),
  prismaMock: {
    opnsenseGroupDisplay: { findMany: vi.fn(async () => []) },
  },
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: vi.fn(
    async (request: Request, callback: (auth: unknown) => Promise<Response>) =>
      callback(await authenticateRequest(request))
  ),
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/opnsense-api', () => ({
  getHostAliases,
  addAliasItem: vi.fn(),
  setAliasItem,
  reconfigureAliases,
  deleteAliasItem,
  addIpToGroup,
  removeIpFromGroup,
  exportAliases,
  fetchFromOpnsense: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent }));

import { DELETE, GET, POST, PUT } from './aliases/[uuid]/route';

const ADMIN = { id: 'admin-user-1', role: 'ADMIN' };
const SUPER_ADMIN = { id: 'super-admin-user-1', role: 'SUPER_ADMIN' };
const USER = { id: 'regular-user-1', role: 'USER' };

const VALID_UUID = 'alias-uuid-1';
const INVALID_UUID = '../etc/passwd';
const BASE_URL = `http://localhost/api/opnsense/aliases/${VALID_UUID}`;

const POST_BODY = { ipAddress: '192.168.1.55', description: 'test', hostAliasName: 'host' };
const PUT_BODY = { alias: { name: 'NEW_ALIAS', content: '192.168.1.55', description: '', enabled: '1' } };

function plainRequest(url: string): Request {
  return new Request(url);
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(uuid: string) {
  return { params: Promise.resolve({ uuid }) };
}

describe('aliases/[uuid] auth gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockImplementation(
      async (): Promise<{ user: { id: string; role: string } | null; method?: string }> => ({ user: null })
    );
    getHostAliases.mockResolvedValue([]);
  });

  describe('GET', () => {
    it('returns 401 for anonymous users', async () => {
      const res = await GET(plainRequest(BASE_URL), ctx(VALID_UUID));

      expect(res.status).toBe(401);
      expect(getHostAliases).not.toHaveBeenCalled();
    });

    it('returns 400 for a malformed uuid before any data access', async () => {
      authenticateRequest.mockResolvedValue({ user: SUPER_ADMIN });

      const res = await GET(plainRequest(`http://localhost/api/opnsense/aliases/${INVALID_UUID}`), ctx(INVALID_UUID));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(getHostAliases).not.toHaveBeenCalled();
    });

    it('returns 403 for USER role and does not fetch aliases', async () => {
      authenticateRequest.mockResolvedValue({ user: USER });

      const res = await GET(plainRequest(BASE_URL), ctx(VALID_UUID));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(getHostAliases).not.toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER.id,
          action: 'OPNSENSE_ALIAS_READ_FAILURE',
          details: expect.objectContaining({ aliasUuid: VALID_UUID, reason: 'Insufficient role' }),
        })
      );
    });

    it('proceeds past the gate for ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: ADMIN });

      const res = await GET(plainRequest(BASE_URL), ctx(VALID_UUID));

      expect(getHostAliases).toHaveBeenCalled();
      expect([401, 403]).not.toContain(res.status);
    });

    it('proceeds past the gate for SUPER_ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: SUPER_ADMIN });

      const res = await GET(plainRequest(BASE_URL), ctx(VALID_UUID));

      expect(getHostAliases).toHaveBeenCalled();
      expect([401, 403]).not.toContain(res.status);
    });
  });

  describe('PUT', () => {
    it('returns 403 for USER role and does not mutate the alias', async () => {
      authenticateRequest.mockResolvedValue({ user: USER });

      const res = await PUT(jsonRequest(BASE_URL, 'PUT', PUT_BODY), ctx(VALID_UUID));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(setAliasItem).not.toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER.id,
          action: 'OPNSENSE_ALIAS_UPDATE_FAILURE',
          details: expect.objectContaining({ aliasUuid: VALID_UUID, reason: 'Insufficient role' }),
        })
      );
    });

    it('returns 401 for anonymous users', async () => {
      const res = await PUT(jsonRequest(BASE_URL, 'PUT', PUT_BODY), ctx(VALID_UUID));

      expect(res.status).toBe(401);
      expect(setAliasItem).not.toHaveBeenCalled();
    });

    it('returns 403 for a USER API key', async () => {
      authenticateRequest.mockResolvedValue({ user: USER, method: 'apiKey' });

      const res = await PUT(jsonRequest(BASE_URL, 'PUT', PUT_BODY), ctx(VALID_UUID));

      expect(res.status).toBe(403);
      expect(setAliasItem).not.toHaveBeenCalled();
    });

    it('calls setAliasItem for SUPER_ADMIN when the alias changes', async () => {
      authenticateRequest.mockResolvedValue({ user: SUPER_ADMIN });
      getHostAliases.mockResolvedValue([
        { uuid: VALID_UUID, name: 'OLD_ALIAS', content: '192.168.1.55', description: '', enabled: '1' },
      ]);
      setAliasItem.mockResolvedValue({ result: 'saved' });

      const res = await PUT(jsonRequest(BASE_URL, 'PUT', PUT_BODY), ctx(VALID_UUID));

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(setAliasItem).toHaveBeenCalledWith(VALID_UUID, PUT_BODY.alias);
    });

    it('returns 400 for a malformed uuid even for SUPER_ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: SUPER_ADMIN });

      const res = await PUT(jsonRequest(`http://localhost/api/opnsense/aliases/${INVALID_UUID}`, 'PUT', PUT_BODY), ctx(INVALID_UUID));

      expect(res.status).toBe(400);
      expect(setAliasItem).not.toHaveBeenCalled();
      expect(getHostAliases).not.toHaveBeenCalled();
    });
  });

  describe('DELETE (alias removal)', () => {
    it('returns 403 for USER role and does not delete the alias', async () => {
      authenticateRequest.mockResolvedValue({ user: USER });

      const res = await DELETE(plainRequest(BASE_URL), ctx(VALID_UUID));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(deleteAliasItem).not.toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER.id,
          action: 'OPNSENSE_ALIAS_DELETE_FAILURE',
          details: expect.objectContaining({ aliasUuid: VALID_UUID, reason: 'Insufficient role' }),
        })
      );
    });

    it('proceeds past the gate for ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: ADMIN });

      const res = await DELETE(plainRequest(BASE_URL), ctx(VALID_UUID));

      expect([401, 403]).not.toContain(res.status);
    });
  });

  describe('DELETE (ip removal)', () => {
    it('returns 401 for anonymous users', async () => {
      const res = await DELETE(
        jsonRequest(BASE_URL, 'DELETE', { ipAddress: '192.168.1.55' }),
        ctx(VALID_UUID)
      );

      expect(res.status).toBe(401);
      expect(removeIpFromGroup).not.toHaveBeenCalled();
    });

    it('returns 403 for a USER API key', async () => {
      authenticateRequest.mockResolvedValue({ user: USER, method: 'apiKey' });

      const res = await DELETE(
        jsonRequest(BASE_URL, 'DELETE', { ipAddress: '192.168.1.55' }),
        ctx(VALID_UUID)
      );

      expect(res.status).toBe(403);
      expect(removeIpFromGroup).not.toHaveBeenCalled();
    });

    it('returns 403 for a USER session with an IP body', async () => {
      authenticateRequest.mockResolvedValue({ user: USER });

      const res = await DELETE(
        jsonRequest(BASE_URL, 'DELETE', { ipAddress: '192.168.1.55' }),
        ctx(VALID_UUID)
      );

      expect(res.status).toBe(403);
      expect(removeIpFromGroup).not.toHaveBeenCalled();
    });

    it('rejects an invalid IP with 400 even for ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: ADMIN });

      const res = await DELETE(
        jsonRequest(BASE_URL, 'DELETE', { ipAddress: 'not-an-ip' }),
        ctx(VALID_UUID)
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Invalid IP address');
      expect(removeIpFromGroup).not.toHaveBeenCalled();
    });

    it('proceeds past the gate for ADMIN with a valid IP', async () => {
      authenticateRequest.mockResolvedValue({ user: ADMIN });

      const res = await DELETE(
        jsonRequest(BASE_URL, 'DELETE', { ipAddress: '192.168.1.55' }),
        ctx(VALID_UUID)
      );

      expect([401, 403]).not.toContain(res.status);
    });
  });

  describe('POST (add ip)', () => {
    it('returns 401 for anonymous users', async () => {
      const res = await POST(jsonRequest(BASE_URL, 'POST', POST_BODY), ctx(VALID_UUID));

      expect(res.status).toBe(401);
      expect(addIpToGroup).not.toHaveBeenCalled();
    });

    it('returns 403 for a USER API key', async () => {
      authenticateRequest.mockResolvedValue({ user: USER, method: 'apiKey' });

      const res = await POST(jsonRequest(BASE_URL, 'POST', POST_BODY), ctx(VALID_UUID));

      expect(res.status).toBe(403);
      expect(addIpToGroup).not.toHaveBeenCalled();
    });
    it('returns 403 for USER role and does not mutate the group', async () => {
      authenticateRequest.mockResolvedValue({ user: USER });

      const res = await POST(
        jsonRequest(BASE_URL, 'POST', { ipAddress: '192.168.1.55', description: 'test', hostAliasName: 'host' }),
        ctx(VALID_UUID)
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(addIpToGroup).not.toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER.id,
          action: 'OPNSENSE_GROUP_IP_ADD_FAILURE',
          details: expect.objectContaining({ aliasUuid: VALID_UUID, reason: 'Insufficient role' }),
        })
      );
    });

    it('rejects an invalid IP with 400 even for ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: ADMIN });

      const res = await POST(
        jsonRequest(BASE_URL, 'POST', { ipAddress: 'not-an-ip', description: 'test', hostAliasName: 'host' }),
        ctx(VALID_UUID)
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Invalid IP address');
      expect(addIpToGroup).not.toHaveBeenCalled();
    });

    it('rejects a CIDR range with 400 even for ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: ADMIN });

      const res = await POST(
        jsonRequest(BASE_URL, 'POST', { ...POST_BODY, ipAddress: '10.0.0.0/24' }),
        ctx(VALID_UUID)
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Invalid IP address');
      expect(addIpToGroup).not.toHaveBeenCalled();
    });

    it('rejects a non-string ipAddress with 400 even for ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: ADMIN });

      const res = await POST(
        jsonRequest(BASE_URL, 'POST', { ...POST_BODY, ipAddress: 42 }),
        ctx(VALID_UUID)
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Invalid IP address');
      expect(addIpToGroup).not.toHaveBeenCalled();
    });

    it('calls addIpToGroup with the trimmed IP for ADMIN', async () => {
      authenticateRequest.mockResolvedValue({ user: ADMIN });
      exportAliases.mockResolvedValue([]);
      addIpToGroup.mockResolvedValue({ success: true });

      const res = await POST(
        jsonRequest(BASE_URL, 'POST', { ...POST_BODY, ipAddress: ' 192.168.1.55 ' }),
        ctx(VALID_UUID)
      );

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(addIpToGroup).toHaveBeenCalledWith(VALID_UUID, '192.168.1.55', 'test');
    });
  });
});
