import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock, bcryptMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn() },
  },
  bcryptMock: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('bcryptjs', () => ({ default: bcryptMock }));
vi.mock('@/lib/server/password-change-token', () => ({
  PASSWORD_CHANGE_COOKIE: 'password_change_token',
  LEGACY_PASSWORD_CHANGE_COOKIE: 'password_change_email',
  passwordChangeCookieOptions: () => ({ path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: false }),
  signPasswordChangeToken: () => 'signed',
}));

import { POST } from '@/app/api/auth/check-password-change/route';
import { resetAuthThrottleForTests } from '@/lib/auth-throttle';

function jsonRequest(body: unknown, ip: string): NextRequest {
  return new NextRequest('http://localhost/api/auth/check-password-change', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ogm-client-ip': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/check-password-change throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthThrottleForTests();
    delete process.env.AUTH_LOGIN_MAX_FAILURES;
    (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard = true;
    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'ada@example.com',
      password: 'hash',
      mustChangePassword: false,
      is2FAEnabled: false,
    });
  });

  afterEach(() => {
    resetAuthThrottleForTests();
    delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
    delete process.env.AUTH_LOGIN_MAX_FAILURES;
    delete process.env.AUTH_THROTTLE_ENABLED;
  });

  it('returns 429 and does not compare on the locked attempt', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1', email: 'ada@example.com', password: 'hash',
      mustChangePassword: false, is2FAEnabled: false,
    });
    const first = await POST(jsonRequest({ email: 'ada@example.com', password: 'nope' }, '10.1.0.1'));
    expect(first.status).toBe(200);
    const second = await POST(jsonRequest({ email: 'ada@example.com', password: 'nope' }, '10.1.0.2'));
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({
      message: 'Too many attempts. Try again later.',
      retryAfterSeconds: 900,
    });
    expect(second.headers.get('retry-after')).toBe('900');
    expect(bcryptMock.compare).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown users at 200 under the cap and 429 after, without leaking existence', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    prismaMock.user.findFirst.mockResolvedValue(null);
    const first = await POST(jsonRequest({ email: 'ghost@example.com', password: 'nope' }, '10.1.0.1'));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ mustChangePassword: false });
    const second = await POST(jsonRequest({ email: 'ghost@example.com', password: 'nope' }, '10.1.0.2'));
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({
      message: 'Too many attempts. Try again later.',
      retryAfterSeconds: 900,
    });
    expect(second.headers.get('retry-after')).toBe('900');
  });

  it('does not clear the account bucket for a 2FA user after a correct password', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '2';
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'ada@example.com',
      password: 'hash',
      mustChangePassword: false,
      is2FAEnabled: true,
    });
    bcryptMock.compare.mockResolvedValue(false);
    const first = await POST(jsonRequest({ email: 'ada@example.com', password: 'nope' }, '10.1.0.1'));
    expect(first.status).toBe(200);
    bcryptMock.compare.mockResolvedValue(true);
    const correct = await POST(jsonRequest({ email: 'ada@example.com', password: 'ok' }, '10.1.0.1'));
    expect(correct.status).toBe(200);
    expect(await correct.json()).toEqual({ mustChangePassword: false, requires2FA: false });
    bcryptMock.compare.mockResolvedValue(false);
    const secondFail = await POST(jsonRequest({ email: 'ada@example.com', password: 'nope' }, '10.1.0.1'));
    expect(secondFail.status).toBe(200);
    const locked = await POST(jsonRequest({ email: 'ada@example.com', password: 'nope' }, '10.1.0.2'));
    expect(locked.status).toBe(429);
  });

  it('returns 400 for a non-string email even with throttling off', async () => {
    process.env.AUTH_THROTTLE_ENABLED = 'false';
    const response = await POST(jsonRequest({ email: { startsWith: 'a' }, password: 'x' }, '10.1.0.1'));
    expect(response.status).toBe(400);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});
