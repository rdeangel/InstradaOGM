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

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

import { POST } from '@/app/api/auth/2fa/disable/route';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/2fa/disable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/2fa/disable re-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAuthDenied.mockReturnValue(null);
    authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
      handler({ user: { id: 'user-1' }, method: 'session' }),
    );
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      is2FAEnabled: true,
      password: 'hash',
      totpSecret: 'secret',
      backupCodes: null,
    });
  });

  it('rejects API key authentication', async () => {
    authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
      handler({ user: { id: 'user-1' }, method: 'apiKey' }),
    );
    sessionAuthDenied.mockReturnValue({ status: 403, message: 'This action requires an interactive session' });

    const response = await POST(jsonRequest({ totpCode: '123456' }));
    expect(response.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects disable without password or TOTP', async () => {
    verifySensitiveReauth.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Current password or authenticator code is required',
    });

    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('disables 2FA when re-auth succeeds', async () => {
    verifySensitiveReauth.mockResolvedValue({ ok: true });
    prismaMock.user.update.mockResolvedValue({ id: 'user-1' });

    const response = await POST(jsonRequest({ totpCode: '123456' }));
    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        is2FAEnabled: false,
        totpSecret: null,
        backupCodes: null,
        passwordChangedAt: expect.any(Date),
      }),
    });
    expect(revokeOtherCredentials).toHaveBeenCalledWith('user-1');
  });
});
