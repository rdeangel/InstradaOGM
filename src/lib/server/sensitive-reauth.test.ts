import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getToken, bcryptCompare, prismaMock } = vi.hoisted(() => ({
  getToken: vi.fn(),
  bcryptCompare: vi.fn(),
  prismaMock: {
    user: { update: vi.fn() },
    session: { deleteMany: vi.fn() },
    apiKey: { updateMany: vi.fn() },
  },
}));

vi.mock('next-auth/jwt', () => ({ getToken }));
vi.mock('bcryptjs', () => ({
  default: { compare: (...args: unknown[]) => bcryptCompare(...args) },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));
vi.mock('@/lib/totp-encryption', () => ({
  getTotpSecretWithMigration: vi.fn(),
}));
vi.mock('@/lib/backup-codes', () => ({
  verifyAndConsumeBackupCode: vi.fn(),
}));

import {
  getSessionIssuedAt,
  isRecentLogin,
  revokeOtherCredentials,
  sessionAuthDenied,
  verifySensitiveReauth,
} from './sensitive-reauth';

const passwordUser = {
  id: 'user-1',
  password: 'hash',
  is2FAEnabled: false,
  totpSecret: null,
  backupCodes: null,
};

const passwordlessUser = {
  id: 'oidc-1',
  password: null,
  is2FAEnabled: false,
  totpSecret: null,
  backupCodes: null,
};

describe('isRecentLogin', () => {
  it('accepts a session issued within 10 minutes', () => {
    expect(isRecentLogin(1_000, 1_000 + 599)).toBe(true);
  });

  it('rejects a session older than 10 minutes', () => {
    expect(isRecentLogin(1_000, 1_000 + 601)).toBe(false);
    expect(isRecentLogin(null, 1_000)).toBe(false);
  });
});

describe('sessionAuthDenied', () => {
  it('rejects API keys and allows sessions', () => {
    expect(sessionAuthDenied('session')).toBeNull();
    expect(sessionAuthDenied('apiKey')).toEqual({
      status: 403,
      message: 'This action requires an interactive session',
    });
  });
});

describe('getSessionIssuedAt', () => {
  beforeEach(() => {
    getToken.mockReset();
  });

  it('returns authTime and ignores a refreshed iat from GET /api/auth/session', async () => {
    getToken.mockResolvedValue({ iat: 9_999, authTime: 100 });
    await expect(getSessionIssuedAt(new Request('http://localhost/'))).resolves.toBe(100);
  });

  it('returns null when authTime is missing even if iat is recent', async () => {
    getToken.mockResolvedValue({ iat: Math.floor(Date.now() / 1000) });
    await expect(getSessionIssuedAt(new Request('http://localhost/'))).resolves.toBeNull();
  });
});

describe('verifySensitiveReauth', () => {
  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    bcryptCompare.mockReset();
  });

  it('rejects empty input when the account has a password', async () => {
    await expect(verifySensitiveReauth(passwordUser, {}, now)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Current password or authenticator code is required',
    });
  });

  it('accepts a passwordless account inside the authTime window', async () => {
    await expect(verifySensitiveReauth(passwordlessUser, {}, now)).resolves.toEqual({ ok: true });
  });

  it('rejects a passwordless account outside the authTime window', async () => {
    await expect(verifySensitiveReauth(passwordlessUser, {}, now - 601)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'A recent login or authenticator code is required',
    });
  });

  it('rejects a passwordless account when authTime is missing (fresh iat is not enough)', async () => {
    await expect(verifySensitiveReauth(passwordlessUser, {}, null)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'A recent login or authenticator code is required',
    });
  });

  it('rejects a wrong current password', async () => {
    bcryptCompare.mockResolvedValue(false);
    await expect(verifySensitiveReauth(passwordUser, { currentPassword: 'nope' }, now)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Current password is incorrect',
    });
  });

  it('accepts the current password', async () => {
    bcryptCompare.mockResolvedValue(true);
    await expect(verifySensitiveReauth(passwordUser, { currentPassword: 'correct' }, now)).resolves.toEqual({
      ok: true,
    });
  });

  it('rejects a code when 2FA is not enabled', async () => {
    await expect(verifySensitiveReauth(passwordUser, { totpCode: '123456' }, now)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Invalid authenticator or backup code',
    });
  });

  it('rejects a currentPassword on a passwordless account', async () => {
    await expect(verifySensitiveReauth(passwordlessUser, { currentPassword: 'x' }, now)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'No password is set on this account',
    });
  });
});

describe('revokeOtherCredentials', () => {
  it('deletes sessions and disables API keys', async () => {
    prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 1 });

    await revokeOtherCredentials('u1');

    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(prismaMock.apiKey.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { enabled: false },
    });
  });
});
