import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateAndTrackRequest, prismaMock, verifySensitiveReauth, sessionAuthDenied, revokeOtherCredentials } = vi.hoisted(() => ({
  authenticateAndTrackRequest: vi.fn(),
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  verifySensitiveReauth: vi.fn(),
  sessionAuthDenied: vi.fn(),
  revokeOtherCredentials: vi.fn(),
}));

vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateAndTrackRequest: (req: Request, handler: (auth: unknown) => Promise<Response>) =>
    authenticateAndTrackRequest(req, handler),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/server/sensitive-reauth', () => ({
  verifySensitiveReauth,
  sessionAuthDenied,
  revokeOtherCredentials,
  getSessionIssuedAt: vi.fn(async () => Math.floor(Date.now() / 1000)),
}));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => false) },
}));

import { POST } from '@/app/api/account/set-password/route';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/account/set-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/account/set-password re-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAuthDenied.mockReturnValue(null);
    verifySensitiveReauth.mockResolvedValue({ ok: true });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password: 'old-hash',
      is2FAEnabled: false,
      totpSecret: null,
      backupCodes: null,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-1' });
  });

  it('rejects API key authentication', async () => {
    authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
      handler({ user: { id: 'user-1' }, method: 'apiKey' }),
    );
    sessionAuthDenied.mockReturnValue({ status: 403, message: 'This action requires an interactive session' });

    const response = await POST(jsonRequest({ password: 'newpassword12', currentPassword: 'old' }));
    expect(response.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects a missing current password when the account has a password', async () => {
    authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
      handler({ user: { id: 'user-1', password: 'x' }, method: 'session' }),
    );
    verifySensitiveReauth.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Current password or authenticator code is required',
    });

    const response = await POST(jsonRequest({ password: 'newpassword12' }));
    expect(response.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
