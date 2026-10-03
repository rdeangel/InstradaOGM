import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, sendPasswordResetEmail } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/email', () => ({ sendPasswordResetEmail }));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }));

import { POST as requestReset } from '@/app/api/auth/password-reset/request/route';
import { resetAuthThrottleForTests } from '@/lib/auth-throttle';

const GENERIC = 'If an account with that email exists, a password reset link has been sent.';

function jsonRequest(email: string, ip: string): Request {
  return new Request('http://localhost/api/auth/password-reset/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ogm-client-ip': ip,
    },
    body: JSON.stringify({ email }),
  });
}

describe('POST /api/auth/password-reset/request throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthThrottleForTests();
    delete process.env.AUTH_RESET_EMAIL_MAX;
    delete process.env.AUTH_RESET_IP_MAX;
    process.env.NEXTAUTH_URL = 'http://localhost';
    (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard = true;
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'ada@example.com',
      password: 'existing-hash',
      accounts: [{ provider: 'credentials' }],
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-a' });
    sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetAuthThrottleForTests();
    delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
    delete process.env.AUTH_RESET_EMAIL_MAX;
    delete process.env.AUTH_RESET_IP_MAX;
  });

  it('stops mail after the email cap and uses the same body for an unknown address', async () => {
    process.env.AUTH_RESET_EMAIL_MAX = '2';
    const a = await requestReset(jsonRequest('ada@example.com', '10.4.0.1'));
    const b = await requestReset(jsonRequest('ada@example.com', '10.4.0.2'));
    const c = await requestReset(jsonRequest('ada@example.com', '10.4.0.3'));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(429);
    const adaOver = await c.json();
    expect(adaOver.message).toBe(GENERIC);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(2);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(2);

    prismaMock.user.findUnique.mockResolvedValue(null);
    const unknown = await requestReset(jsonRequest('ghost@example.com', '10.4.0.4'));
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual({ message: GENERIC });
    await requestReset(jsonRequest('ghost@example.com', '10.4.0.5'));
    const ghostOverResponse = await requestReset(jsonRequest('ghost@example.com', '10.4.0.6'));
    expect(ghostOverResponse.status).toBe(429);
    expect(await ghostOverResponse.json()).toEqual(adaOver);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(2);
  });

  it('limits the ip across different emails', async () => {
    process.env.AUTH_RESET_IP_MAX = '1';
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { email?: string } }) => ({
      id: `user-${where.email}`,
      email: where.email,
      password: 'existing-hash',
      accounts: [{ provider: 'credentials' }],
    }));
    const first = await requestReset(jsonRequest('ada@example.com', '10.5.0.1'));
    const second = await requestReset(jsonRequest('grace@example.com', '10.5.0.1'));
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });
});
