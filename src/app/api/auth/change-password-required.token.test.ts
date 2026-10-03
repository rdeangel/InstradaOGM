import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, verifyPasswordChangeToken, verifySecondFactor } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  verifyPasswordChangeToken: vi.fn(),
  verifySecondFactor: vi.fn(),
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
  verifySecondFactor,
}));
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(async (plain: string) => plain === 'old-pass'),
    hash: vi.fn(async () => 'new-hash'),
  },
}));

import { POST } from '@/app/api/auth/change-password-required/route';
import { resetAuthThrottleForTests } from '@/lib/auth-throttle';

function requestWithCookie(body: unknown, cookie = 'password_change_token=signed'): Request {
  return new Request('http://localhost/api/auth/change-password-required', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-ogm-client-ip': '10.3.0.1',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/change-password-required token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthThrottleForTests();
    delete process.env.AUTH_LOGIN_MAX_FAILURES;
    (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard = true;
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

  afterEach(() => {
    resetAuthThrottleForTests();
    delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
    delete process.env.AUTH_LOGIN_MAX_FAILURES;
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

  it('requires TOTP in addition to the current password when 2FA is enabled', async () => {
    verifyPasswordChangeToken.mockReturnValue({ userId: 'user-1', email: 'admin@example.com' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      password: 'hash',
      mustChangePassword: true,
      is2FAEnabled: true,
      totpSecret: 'secret',
      backupCodes: null,
    });
    verifySecondFactor.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Authenticator code is required',
    });

    const response = await POST(requestWithCookie({
      currentPassword: 'old-pass',
      newPassword: 'new-pass-12',
    }) as never);

    expect(response.status).toBe(400);
    expect(verifySecondFactor).toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects a valid TOTP when the current password is wrong', async () => {
    verifyPasswordChangeToken.mockReturnValue({ userId: 'user-1', email: 'admin@example.com' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      password: 'hash',
      mustChangePassword: true,
      is2FAEnabled: true,
      totpSecret: 'secret',
      backupCodes: null,
    });

    const response = await POST(requestWithCookie({
      currentPassword: 'wrong-pass',
      newPassword: 'new-pass-12',
      totpCode: '123456',
    }) as never);

    expect(response.status).toBe(400);
    expect(verifySecondFactor).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns 429 after too many wrong current passwords', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    verifyPasswordChangeToken.mockReturnValue({ userId: 'user-1', email: 'admin@example.com' });
    const first = await POST(requestWithCookie({
      currentPassword: 'wrong-pass',
      newPassword: 'new-pass-12',
    }) as never);
    expect(first.status).toBe(400);
    const second = await POST(requestWithCookie({
      currentPassword: 'wrong-pass',
      newPassword: 'new-pass-12',
    }) as never);
    expect(second.status).toBe(429);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('notes a failed TOTP and locks on the next attempt', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    verifyPasswordChangeToken.mockReturnValue({ userId: 'user-1', email: 'admin@example.com' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      password: 'hash',
      mustChangePassword: true,
      is2FAEnabled: true,
      totpSecret: 'secret',
      backupCodes: null,
    });
    verifySecondFactor.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Invalid authenticator or backup code',
    });
    const first = await POST(requestWithCookie({
      currentPassword: 'old-pass',
      newPassword: 'new-pass-12',
      totpCode: '000000',
    }) as never);
    expect(first.status).toBe(400);
    const second = await POST(requestWithCookie({
      currentPassword: 'old-pass',
      newPassword: 'new-pass-12',
      totpCode: '000000',
    }) as never);
    expect(second.status).toBe(429);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
