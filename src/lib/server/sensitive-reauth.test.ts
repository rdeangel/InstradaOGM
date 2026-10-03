import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getToken, bcryptCompare, prismaMock, totpVerify, getTotpSecretWithMigration, verifyAndConsumeBackupCode } =
  vi.hoisted(() => ({
    getToken: vi.fn(),
    bcryptCompare: vi.fn(),
    prismaMock: {
      user: { update: vi.fn() },
      session: { deleteMany: vi.fn() },
      apiKey: { updateMany: vi.fn() },
    },
    totpVerify: vi.fn(),
    getTotpSecretWithMigration: vi.fn(),
    verifyAndConsumeBackupCode: vi.fn(),
  }));

vi.mock('next-auth/jwt', () => ({ getToken }));
vi.mock('bcryptjs', () => ({
  default: { compare: (...args: unknown[]) => bcryptCompare(...args) },
}));
vi.mock('otplib', () => ({
  authenticator: { verify: (...args: unknown[]) => totpVerify(...args) },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));
vi.mock('@/lib/totp-encryption', () => ({
  getTotpSecretWithMigration,
}));
vi.mock('@/lib/backup-codes', () => ({
  verifyAndConsumeBackupCode,
}));

import {
  getSessionIssuedAt,
  isRecentLogin,
  revokeOtherCredentials,
  sessionAuthDenied,
  verifySecondFactor,
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

  const passwordless2faUser = {
    id: 'oidc-2fa-1',
    password: null,
    is2FAEnabled: true,
    totpSecret: 'encrypted',
    backupCodes: null,
  };

  beforeEach(() => {
    bcryptCompare.mockReset();
    totpVerify.mockReset();
    getTotpSecretWithMigration.mockReset();
    verifyAndConsumeBackupCode.mockReset();
    prismaMock.user.update.mockReset();
  });

  it('rejects empty input when the account has a password', async () => {
    await expect(verifySensitiveReauth(passwordUser, {}, now)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Current password is required',
    });
  });

  it('rejects a password account with a valid TOTP but no password', async () => {
    await expect(verifySensitiveReauth(passwordUser, { totpCode: '123456' }, now)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Current password is required',
    });
  });

  it('rejects a wrong password even when a valid TOTP is supplied', async () => {
    bcryptCompare.mockResolvedValue(false);
    await expect(
      verifySensitiveReauth(passwordUser, { currentPassword: 'nope', totpCode: '123456' }, now)
    ).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Current password is incorrect',
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

  it('accepts a passwordless 2FA account with a valid TOTP', async () => {
    getTotpSecretWithMigration.mockResolvedValue('plaintext-secret');
    totpVerify.mockReturnValue(true);

    await expect(
      verifySensitiveReauth(passwordless2faUser, { totpCode: '123456' }, now - 601)
    ).resolves.toEqual({ ok: true });
    expect(totpVerify).toHaveBeenCalledWith({ token: '123456', secret: 'plaintext-secret' });
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

  it('rejects a code when 2FA is not enabled (passwordless variant)', async () => {
    await expect(verifySensitiveReauth(passwordlessUser, { totpCode: '123456' }, now)).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Invalid authenticator or backup code',
    });
  });

  it('treats a currentPassword on a passwordless account as no confirmation (recent login still applies)', async () => {
    await expect(verifySensitiveReauth(passwordlessUser, { currentPassword: 'x' }, now)).resolves.toEqual({
      ok: true,
    });
  });
});

describe('verifySecondFactor', () => {
  const twoFaUser = {
    id: 'user-2fa-1',
    password: null,
    is2FAEnabled: true,
    totpSecret: 'encrypted',
    backupCodes: JSON.stringify([{ code: 'AAAA-BBBB', used: false }]),
  };

  beforeEach(() => {
    totpVerify.mockReset();
    getTotpSecretWithMigration.mockReset();
    verifyAndConsumeBackupCode.mockReset();
    prismaMock.user.update.mockReset();
  });

  it('rejects a missing code with 400', async () => {
    await expect(verifySecondFactor(twoFaUser, {})).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Authenticator code is required',
    });
  });

  it('accepts a valid TOTP', async () => {
    getTotpSecretWithMigration.mockResolvedValue('plaintext-secret');
    totpVerify.mockReturnValue(true);

    await expect(verifySecondFactor(twoFaUser, { code: '123456' })).resolves.toEqual({ ok: true });
  });

  it('accepts a valid backup code and stores the consumed codes', async () => {
    const remaining = [{ code: 'AAAA-BBBB', used: true }];
    verifyAndConsumeBackupCode.mockResolvedValue({ isValid: true, updatedCodes: remaining });
    prismaMock.user.update.mockResolvedValue({});

    await expect(
      verifySecondFactor(twoFaUser, { backupCode: 'CCCC-DDDD', isBackupCode: true })
    ).resolves.toEqual({ ok: true });

    expect(verifyAndConsumeBackupCode).toHaveBeenCalledWith('user-2fa-1', 'CCCC-DDDD', twoFaUser.backupCodes);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2fa-1' },
      data: { backupCodes: JSON.stringify(remaining) },
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
