import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_INVALID_MESSAGE,
} from '@/lib/password-reset-tokens';

const { prismaMock, sendPasswordResetEmail } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/email', () => ({ sendPasswordResetEmail }));
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async () => 'hashed-password'),
    compare: vi.fn(),
  },
}));

import { POST as requestReset } from '@/app/api/auth/password-reset/request/route';
import { POST as confirmReset } from '@/app/api/auth/password-reset/confirm/route';

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const HASH_A = hashPasswordResetToken(TOKEN_A);
const HASH_B = hashPasswordResetToken(TOKEN_B);
const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000);
const PAST = () => new Date(Date.now() - 60 * 1000);

describe('password-reset-tokens helpers', () => {
  it('hashes with SHA-256 hex matching the known vector for "abc"', () => {
    expect(hashPasswordResetToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashPasswordResetToken('abc')).toBe(
      crypto.createHash('sha256').update('abc', 'utf8').digest('hex'),
    );
  });

  it('generatePasswordResetToken returns 64 lowercase hex whose hash matches tokenHash', () => {
    const { plaintextToken, tokenHash } = generatePasswordResetToken();
    expect(plaintextToken).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).toBe(hashPasswordResetToken(plaintextToken));
  });
});

describe('POST /api/auth/password-reset/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost';
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      password: 'existing-hash',
      accounts: [{ provider: 'credentials' }],
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-a' });
    sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  it('stores passwordResetTokenHash equal to sha256 of the emailed token', async () => {
    const response = await requestReset(jsonRequest(
      'http://localhost/api/auth/password-reset/request',
      { email: 'a@example.com' },
    ));
    expect(response.status).toBe(200);

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const resetUrl = sendPasswordResetEmail.mock.calls[0][1] as string;
    const emailedToken = new URL(resetUrl).searchParams.get('token');
    expect(emailedToken).toMatch(/^[a-f0-9]{64}$/);

    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.user.update.mock.calls[0][0];
    expect(updateArg.data.passwordResetTokenHash).toBe(hashPasswordResetToken(emailedToken!));
    expect(Object.keys(updateArg.data).sort()).toEqual(
      ['passwordResetExpires', 'passwordResetTokenHash'].sort(),
    );
  });
});

describe('POST /api/auth/password-reset/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('confirms the second of two pending users (M2 regression)', async () => {
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { passwordResetTokenHash?: string } }) => {
      if (where.passwordResetTokenHash === HASH_B) {
        return { id: 'b', email: 'b@example.com', passwordResetExpires: FUTURE() };
      }
      if (where.passwordResetTokenHash === HASH_A) {
        return { id: 'a', email: 'a@example.com', passwordResetExpires: FUTURE() };
      }
      return null;
    });

    const response = await confirmReset(jsonRequest(
      'http://localhost/api/auth/password-reset/confirm',
      { token: TOKEN_B, password: 'new-pass-12' },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Password has been reset successfully');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { passwordResetTokenHash: HASH_B },
      select: { id: true, email: true, passwordResetExpires: true },
    });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'b', passwordResetTokenHash: HASH_B },
      data: {
        password: 'hashed-password',
        passwordResetTokenHash: null,
        passwordResetExpires: null,
        passwordChangedAt: expect.any(Date),
      },
    });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany.mock.calls).toHaveLength(1);
    expect(prismaMock.user.updateMany.mock.calls[0][0].where.id).toBe('b');
  });

  it('returns the shared invalid message for an unknown or legacy token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const response = await confirmReset(jsonRequest(
      'http://localhost/api/auth/password-reset/confirm',
      { token: TOKEN_A, password: 'new-pass-12' },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: PASSWORD_RESET_INVALID_MESSAGE });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns the shared invalid message for an expired token and does not update', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'b',
      email: 'b@example.com',
      passwordResetExpires: PAST(),
    });
    const response = await confirmReset(jsonRequest(
      'http://localhost/api/auth/password-reset/confirm',
      { token: TOKEN_B, password: 'new-pass-12' },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: PASSWORD_RESET_INVALID_MESSAGE });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns the shared invalid message for a malformed token without calling Prisma', async () => {
    const response = await confirmReset(jsonRequest(
      'http://localhost/api/auth/password-reset/confirm',
      { token: 'a'.repeat(63), password: 'new-pass-12' },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: PASSWORD_RESET_INVALID_MESSAGE });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('accepts an uppercase version of a valid token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'b',
      email: 'b@example.com',
      passwordResetExpires: FUTURE(),
    });
    const response = await confirmReset(jsonRequest(
      'http://localhost/api/auth/password-reset/confirm',
      { token: TOKEN_B.toUpperCase(), password: 'new-pass-12' },
    ));
    expect(response.status).toBe(200);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { passwordResetTokenHash: HASH_B },
      select: { id: true, email: true, passwordResetExpires: true },
    });
  });

  it('returns the shared invalid message when updateMany consumes 0 rows', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'b',
      email: 'b@example.com',
      passwordResetExpires: FUTURE(),
    });
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
    const response = await confirmReset(jsonRequest(
      'http://localhost/api/auth/password-reset/confirm',
      { token: TOKEN_B, password: 'new-pass-12' },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: PASSWORD_RESET_INVALID_MESSAGE });
  });

  it('clears the hash and expiry and stamps passwordChangedAt on success', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'b',
      email: 'b@example.com',
      passwordResetExpires: FUTURE(),
    });
    const response = await confirmReset(jsonRequest(
      'http://localhost/api/auth/password-reset/confirm',
      { token: TOKEN_B, password: 'new-pass-12' },
    ));
    expect(response.status).toBe(200);
    const data = prismaMock.user.updateMany.mock.calls[0][0].data;
    expect(data.password).toBe('hashed-password');
    expect(data.passwordResetTokenHash).toBeNull();
    expect(data.passwordResetExpires).toBeNull();
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
  });
});
