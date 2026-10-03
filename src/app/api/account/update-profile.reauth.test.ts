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

import { PUT } from '@/app/api/account/update-profile/route';

const currentUserRow = {
  id: 'user-1',
  password: 'old-hash',
  is2FAEnabled: false,
  totpSecret: null,
  backupCodes: null,
  email: 'old@x.test',
  username: 'old',
};

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/account/update-profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authAs(method: string, user: Record<string, unknown> = { id: 'user-1' }) {
  authenticateAndTrackRequest.mockImplementation(async (_req: Request, handler: (auth: unknown) => Promise<Response>) =>
    handler({ user, method }),
  );
}

describe('PUT /api/account/update-profile re-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAuthDenied.mockReturnValue(null);
    verifySensitiveReauth.mockResolvedValue({ ok: true });
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { id?: string; email?: string; username?: string } }) => {
      if (args.where.id === 'user-1') return { ...currentUserRow };
      return null;
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-1' });
    authAs('session');
  });

  it('rejects API key password changes', async () => {
    authAs('apiKey');
    sessionAuthDenied.mockReturnValue({ status: 403, message: 'This action requires an interactive session' });

    const response = await PUT(jsonRequest({ password: 'newpassword12', currentPassword: 'x' }));
    expect(response.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects API key email changes', async () => {
    authAs('apiKey');
    sessionAuthDenied.mockReturnValue({ status: 403, message: 'This action requires an interactive session' });

    const response = await PUT(jsonRequest({ email: 'new@x.test' }));
    expect(response.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects API key username changes', async () => {
    authAs('apiKey');
    sessionAuthDenied.mockReturnValue({ status: 403, message: 'This action requires an interactive session' });

    const response = await PUT(jsonRequest({ username: 'new' }));
    expect(response.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('allows API key name-only updates without re-auth', async () => {
    authAs('apiKey');
    sessionAuthDenied.mockReturnValue({ status: 403, message: 'This action requires an interactive session' });

    const response = await PUT(jsonRequest({ name: 'N' }));
    expect(response.status).toBe(200);
    expect(sessionAuthDenied).not.toHaveBeenCalled();
    expect(verifySensitiveReauth).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: 'N' },
    }));
  });

  it('treats an unchanged email on an API key full-object PUT as a name-only update', async () => {
    authAs('apiKey');
    sessionAuthDenied.mockReturnValue({ status: 403, message: 'This action requires an interactive session' });

    const response = await PUT(jsonRequest({ name: 'N', email: 'old@x.test' }));
    expect(response.status).toBe(200);
    expect(sessionAuthDenied).not.toHaveBeenCalled();
    expect(verifySensitiveReauth).not.toHaveBeenCalled();
    const data = prismaMock.user.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toEqual({ name: 'N' });
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('emailSelfChangedAt');
  });

  it('rejects a session password change without re-auth', async () => {
    verifySensitiveReauth.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Current password is required',
    });

    const response = await PUT(jsonRequest({ password: 'newpassword12' }));
    expect(response.status).toBe(400);
    expect(verifySensitiveReauth).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      { password: 'newpassword12' },
      expect.any(Number),
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('updates password, stamps passwordChangedAt, and revokes other credentials', async () => {
    const response = await PUT(jsonRequest({ password: 'newpassword12', currentPassword: 'right' }));
    expect(response.status).toBe(200);
    const data = prismaMock.user.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.password).toBe('hashed');
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    expect(revokeOtherCredentials).toHaveBeenCalledWith('user-1');
  });

  it('stamps emailVerified null and emailSelfChangedAt on a self email change', async () => {
    const response = await PUT(jsonRequest({ email: 'new@x.test', currentPassword: 'right' }));
    expect(response.status).toBe(200);
    const data = prismaMock.user.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.email).toBe('new@x.test');
    expect(data.emailVerified).toBeNull();
    expect(data.emailSelfChangedAt).toBeInstanceOf(Date);
    expect(revokeOtherCredentials).not.toHaveBeenCalled();
  });

  it('rejects password changes on a passwordless SSO account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...currentUserRow, password: null });

    const response = await PUT(jsonRequest({ password: 'newpassword12' }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toBe('Password changes are only available for local accounts.');
    expect(verifySensitiveReauth).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('allows SSO users to edit their name', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...currentUserRow, password: null });

    const response = await PUT(jsonRequest({ name: 'N' }));
    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: 'N' },
    }));
  });

  it('runs re-auth before the duplicate email lookup', async () => {
    verifySensitiveReauth.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Current password is incorrect',
    });

    const response = await PUT(jsonRequest({ email: 'taken@x.test', currentPassword: 'wrong' }));
    expect(response.status).toBe(400);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, password: true, is2FAEnabled: true, totpSecret: true, backupCodes: true, email: true, username: true },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
