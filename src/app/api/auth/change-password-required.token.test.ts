import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, verifyPasswordChangeToken, verifySensitiveReauth } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  verifyPasswordChangeToken: vi.fn(),
  verifySensitiveReauth: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/server/password-change-token', () => ({
  PASSWORD_CHANGE_COOKIE: 'password_change_token',
  LEGACY_PASSWORD_CHANGE_COOKIE: 'password_change_email',
  passwordChangeCookieOptions: () => ({ path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: false }),
  verifyPasswordChangeToken,
}));
vi.mock('@/lib/server/sensitive-reauth', () => ({
  verifySensitiveReauth,
}));
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(async (plain: string) => plain === 'old-pass'),
    hash: vi.fn(async () => 'new-hash'),
  },
}));

import { POST } from '@/app/api/auth/change-password-required/route';

function requestWithCookie(body: unknown, cookie = 'password_change_token=signed'): Request {
  return new Request('http://localhost/api/auth/change-password-required', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/change-password-required token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      password: 'hash',
      mustChangePassword: true,
      is2FAEnabled: false,
      totpSecret: null,
      backupCodes: null,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-1' });
  });

  it('rejects a client-settable email cookie without a signed token', async () => {
    verifyPasswordChangeToken.mockReturnValue(null);
    const response = await POST(requestWithCookie(
      { currentPassword: 'old-pass', newPassword: 'new-pass-12' },
      'password_change_email=admin@example.com',
    ) as never);
    expect(response.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('changes the password when the signed token and current password are valid', async () => {
    verifyPasswordChangeToken.mockReturnValue({ userId: 'user-1', email: 'admin@example.com' });
    const response = await POST(requestWithCookie({
      currentPassword: 'old-pass',
      newPassword: 'new-pass-12',
    }) as never);
    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalled();
  });
});
