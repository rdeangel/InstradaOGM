import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, bcryptMock } = vi.hoisted(() => {
  process.env.AUTH_ALLOW_LOCAL_LOGIN = 'true';
  return {
    prismaMock: {
      user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      account: { findFirst: vi.fn(), update: vi.fn() },
      ssoGroupMapping: { findMany: vi.fn() },
      globalSettings: { findFirst: vi.fn() },
    },
    bcryptMock: {
      compare: vi.fn(),
      hash: vi.fn(),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('bcryptjs', () => ({ default: bcryptMock }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/auth-config', () => ({
  loadOidcProviders: () => [],
  mapConfigToProvider: vi.fn(),
}));
vi.mock('@next-auth/prisma-adapter', () => ({
  PrismaAdapter: () => ({}),
}));
vi.mock('next-auth/providers/credentials', () => ({
  default: (options: { authorize: unknown }) => ({
    id: 'credentials',
    name: 'Credentials',
    type: 'credentials',
    ...options,
  }),
}));
vi.mock('otplib', () => ({
  authenticator: { verify: vi.fn(() => false) },
}));
vi.mock('@/lib/totp-encryption', () => ({
  getTotpSecretWithMigration: vi.fn(async () => 'JBSWY3DPEHPK3PXP'),
}));

import { authOptions } from '@/lib/auth';
import { noteCredentialFailure, resetAuthThrottleForTests } from '@/lib/auth-throttle';

type Authorize = (
  credentials: Record<string, string> | undefined,
  req?: { headers?: Record<string, unknown> },
) => Promise<unknown>;

function credentialsAuthorize(): { authorize: Authorize } {
  const provider = authOptions.providers.find((p) => p.id === 'credentials');
  if (!provider || !('authorize' in provider) || typeof provider.authorize !== 'function') {
    throw new Error('credentials provider not registered');
  }
  return { authorize: provider.authorize as Authorize };
}

const lockedReq = {
  headers: { 'x-ogm-client-ip': '10.2.0.4' },
};

const localUser = {
  id: 'u1',
  email: 'ada@example.com',
  username: 'ada',
  password: 'hash',
  mustChangePassword: false,
  role: 'USER',
  is2FAEnabled: false,
  emailVerified: new Date(),
};

describe('credentials authorize throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthThrottleForTests();
    process.env.AUTH_ALLOW_LOCAL_LOGIN = 'true';
    delete process.env.AUTH_LOGIN_MAX_FAILURES;
    delete process.env.AUTH_THROTTLE_ENABLED;
    (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard = true;
    prismaMock.user.findFirst.mockResolvedValue({ ...localUser });
    bcryptMock.compare.mockResolvedValue(false);
  });

  afterEach(() => {
    resetAuthThrottleForTests();
    delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
    delete process.env.AUTH_LOGIN_MAX_FAILURES;
    delete process.env.AUTH_REQUIRE_VERIFIED_EMAIL_LOCAL;
  });

  it('throws TOO_MANY_ATTEMPTS before bcrypt when the account is locked', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    const { authorize } = credentialsAuthorize();
    await expect(authorize(
      { email: 'ada@example.com', password: 'wrong' },
      lockedReq,
    )).rejects.toThrow('CredentialsSignin');
    await expect(authorize(
      { email: 'ada@example.com', password: 'wrong' },
      { headers: { 'x-ogm-client-ip': '10.9.9.9' } },
    )).rejects.toThrow('TOO_MANY_ATTEMPTS');
    expect(bcryptMock.compare).toHaveBeenCalledTimes(1);
  });

  it('does not count a correct password that must be changed', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    prismaMock.user.findFirst.mockResolvedValue({
      ...localUser,
      mustChangePassword: true,
    });
    bcryptMock.compare.mockResolvedValue(true);
    const { authorize } = credentialsAuthorize();
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct' },
      lockedReq,
    )).resolves.toBeNull();
    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(authorize(
      { email: 'ada@example.com', password: 'nope' },
      lockedReq,
    )).rejects.toThrow('CredentialsSignin');
  });

  it('clears the account counter after a correct must-change password', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '2';
    const { authorize } = credentialsAuthorize();
    await expect(authorize(
      { email: 'ada@example.com', password: 'wrong' },
      lockedReq,
    )).rejects.toThrow('CredentialsSignin');

    bcryptMock.compare.mockResolvedValue(true);
    prismaMock.user.findFirst.mockResolvedValue({
      ...localUser,
      mustChangePassword: true,
    });
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct' },
      lockedReq,
    )).resolves.toBeNull();

    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(authorize(
      { email: 'ada@example.com', password: 'nope' },
      lockedReq,
    )).rejects.toThrow('CredentialsSignin');
    await expect(authorize(
      { email: 'ada@example.com', password: 'nope' },
      lockedReq,
    )).rejects.toThrow('CredentialsSignin');
  });

  it('does not clear the account counter on must-change for a 2FA user', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '5';
    prismaMock.user.findFirst.mockResolvedValue({
      ...localUser,
      mustChangePassword: true,
      is2FAEnabled: true,
      totpSecret: 'secret',
    });
    bcryptMock.compare.mockResolvedValue(true);
    const { authorize } = credentialsAuthorize();
    for (let i = 0; i < 4; i++) {
      expect(noteCredentialFailure('ada@example.com', '10.2.0.4', 'password-check').limited).toBe(false);
    }
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct' },
      lockedReq,
    )).resolves.toBeNull();
    expect(noteCredentialFailure('ada@example.com', '10.2.0.4', 'password-check').limited).toBe(false);
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct' },
      lockedReq,
    )).rejects.toThrow('TOO_MANY_ATTEMPTS');
  });

  it('does not count a correct password on an unverified account', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    prismaMock.user.findFirst.mockResolvedValue({
      ...localUser,
      role: 'PENDING',
      emailVerified: null,
      mustChangePassword: false,
    });
    bcryptMock.compare.mockResolvedValue(true);
    const { authorize } = credentialsAuthorize();
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct' },
      lockedReq,
    )).rejects.toThrow('EMAIL_NOT_VERIFIED');

    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(authorize(
      { email: 'ada@example.com', password: 'nope' },
      lockedReq,
    )).rejects.toThrow('CredentialsSignin');
  });

  it('does not clear the account counter on 2FA_REQUIRED so TOTP guesses still lock', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '5';
    prismaMock.user.findFirst.mockResolvedValue({
      ...localUser,
      is2FAEnabled: true,
      totpSecret: 'secret',
    });
    bcryptMock.compare.mockResolvedValue(true);
    const { authorize } = credentialsAuthorize();
    for (let i = 0; i < 4; i++) {
      await expect(authorize(
        { email: 'ada@example.com', password: 'correct', totpCode: '000000' },
        lockedReq,
      )).rejects.toThrow('INVALID_2FA_CODE');
    }
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct' },
      lockedReq,
    )).rejects.toThrow('2FA_REQUIRED');
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct', totpCode: '000000' },
      lockedReq,
    )).rejects.toThrow('INVALID_2FA_CODE');
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct', totpCode: '000000' },
      lockedReq,
    )).rejects.toThrow('TOO_MANY_ATTEMPTS');
  });

  it('does not count a correct password on a suspended account', async () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    prismaMock.user.findFirst.mockResolvedValue({
      ...localUser,
      role: 'SUSPENDED',
    });
    bcryptMock.compare.mockResolvedValue(true);
    const { authorize } = credentialsAuthorize();
    await expect(authorize(
      { email: 'ada@example.com', password: 'correct' },
      lockedReq,
    )).rejects.toThrow('ACCOUNT_SUSPENDED');

    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(authorize(
      { email: 'ada@example.com', password: 'nope' },
      lockedReq,
    )).rejects.toThrow('CredentialsSignin');
  });
});
