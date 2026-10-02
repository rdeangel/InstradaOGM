import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateAndTrackRequest, authenticateRequest, prismaMock, logAuditEvent } = vi.hoisted(() => ({
  authenticateAndTrackRequest: vi.fn(),
  authenticateRequest: vi.fn(),
  logAuditEvent: vi.fn(),
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    ssoGroupMapping: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({
  logAuditEvent,
  logApiAccess: vi.fn(),
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: (req: Request, handler: (auth: unknown) => Promise<Response>) =>
    authenticateAndTrackRequest(req, handler),
  authenticateRequest,
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('bcrypt', () => ({ default: { hash: vi.fn(async () => 'hashed') }, hash: vi.fn(async () => 'hashed') }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => false) } }));

import { POST } from '@/app/api/admin/users/route';
import { PUT } from '@/app/api/admin/users/[id]/route';

const adminAuth = { user: { id: 'admin-1', role: 'ADMIN' }, method: 'session' };

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin user role escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: typeof adminAuth) => Promise<Response>) => handler(adminAuth));
    authenticateRequest.mockResolvedValue(adminAuth);
  });

  it('returns 403 when ADMIN creates SUPER_ADMIN', async () => {
    const response = await POST(jsonRequest('http://localhost/api/admin/users', {
      email: 'new@example.com',
      name: 'New Super',
      username: 'newsuper',
      role: 'SUPER_ADMIN',
      password: 'password12',
    }));

    expect(response.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('returns 403 when ADMIN promotes USER to SUPER_ADMIN', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: 'USER',
      username: 'user1',
      email: 'user@example.com',
      password: 'hash',
      accounts: [],
    });

    const response = await PUT(
      jsonRequest('http://localhost/api/admin/users/user-1', { role: 'SUPER_ADMIN' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns 403 when ADMIN resets a SUPER_ADMIN password', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'super-1',
      role: 'SUPER_ADMIN',
      username: 'admin',
      email: 'admin@example.com',
      password: 'hash',
      accounts: [],
    });

    const response = await PUT(
      jsonRequest('http://localhost/api/admin/users/super-1', { password: 'newpassword12' }),
      { params: Promise.resolve({ id: 'super-1' }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_UPDATE_ATTEMPT',
      details: expect.objectContaining({
        updateData: expect.objectContaining({ password: '[REDACTED]' }),
      }),
    }));
  });
});
