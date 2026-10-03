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

function jsonRequest(body: Record<string, string>, ip: string): NextRequest {
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
});
