import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const { getClientIp, logAuditEvent, prismaMock } = vi.hoisted(() => ({
  getClientIp: vi.fn(() => '10.0.0.1'),
  logAuditEvent: vi.fn(() => Promise.resolve()),
  prismaMock: {
    apiKey: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent }));
vi.mock('@/lib/network-utils', () => ({ getClientIp }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { validateApiKey } from './api-key-auth';
import { generateApiKey } from './api-key-format';
import { legacyMemo, resetLegacyStateForTests } from './api-key-legacy-limit';

const HASH_COST = 4;

type UserFields = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

function makeReq(apiKey: string): NextRequest {
  return new NextRequest('http://localhost/api/opnsense/host-group-management', {
    headers: {
      authorization: `Bearer ${apiKey}`,
      'user-agent': 'vitest',
    },
  });
}

function randomLegacyKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function memoId(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

async function prefixedRow(overrides: Record<string, unknown> = {}) {
  const { prefix, plaintext } = generateApiKey();
  const keyHash = await bcrypt.hash(plaintext, HASH_COST);
  const user: UserFields = {
    id: 'u-admin',
    name: 'Ada',
    email: 'ada@example.com',
    role: 'SUPER_ADMIN',
  };
  return {
    prefix,
    plaintext,
    row: {
      id: 'k-prefixed',
      name: 'deploy',
      keyHash,
      keyPrefix: prefix,
      userId: user.id,
      enabled: true,
      expiresAt: null,
      user,
      ...overrides,
    },
  };
}

async function legacyRow(overrides: Record<string, unknown> = {}) {
  const plaintext = randomLegacyKey();
  const keyHash = await bcrypt.hash(plaintext, HASH_COST);
  const user: UserFields = {
    id: 'u-user',
    name: 'Lin',
    email: 'lin@example.com',
    role: 'USER',
  };
  return {
    plaintext,
    row: {
      id: 'k-legacy',
      name: 'cron',
      keyHash,
      keyPrefix: null,
      userId: user.id,
      enabled: true,
      expiresAt: null,
      user,
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLegacyStateForTests();
  getClientIp.mockReturnValue('10.0.0.1');
  prismaMock.apiKey.findUnique.mockResolvedValue(null);
  prismaMock.apiKey.findMany.mockResolvedValue([]);
  prismaMock.apiKey.update.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLegacyStateForTests();
});

describe('validateApiKey', () => {
  it('rejects a short key before any lookup', async () => {
    const result = await validateApiKey(makeReq('short-key'));
    expect(result).toEqual({ isValid: false, error: 'Invalid API key format' });
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.apiKey.findMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed key with an underscore without touching the database', async () => {
    const malformed = `${'A'.repeat(12)}_${'g'.repeat(56)}`;
    const result = await validateApiKey(makeReq(malformed));
    expect(result).toEqual({ isValid: false, error: 'Invalid API key format' });
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.apiKey.findMany).not.toHaveBeenCalled();
  });

  it('does not scan every key when the prefix is unknown', async () => {
    const { plaintext } = generateApiKey();
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    const result = await validateApiKey(makeReq(plaintext));
    expect(result).toMatchObject({ isValid: false, error: 'Invalid API key' });
    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.apiKey.findMany).not.toHaveBeenCalled();
    expect(compareSpy).not.toHaveBeenCalled();
  });

  it('accepts a prefixed key with one compare', async () => {
    const { plaintext, prefix, row } = await prefixedRow();
    prismaMock.apiKey.findUnique.mockResolvedValue(row);
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    const result = await validateApiKey(makeReq(plaintext));
    expect(result.isValid).toBe(true);
    expect(result.apiKeyId).toBe('k-prefixed');
    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyPrefix: prefix } }),
    );
    expect(prismaMock.apiKey.findMany).not.toHaveBeenCalled();
    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(compareSpy).toHaveBeenCalledWith(plaintext, row.keyHash);
  });

  it('returns the user role for a prefixed key', async () => {
    const { plaintext, row } = await prefixedRow();
    prismaMock.apiKey.findUnique.mockResolvedValue(row);
    const result = await validateApiKey(makeReq(plaintext));
    expect(result.isValid).toBe(true);
    expect(result.user?.role).toBe('SUPER_ADMIN');
  });

  it('reports disabled and expired for a prefixed key', async () => {
    const disabled = await prefixedRow({ enabled: false });
    prismaMock.apiKey.findUnique.mockResolvedValue(disabled.row);
    const disabledResult = await validateApiKey(makeReq(disabled.plaintext));
    expect(disabledResult).toMatchObject({ isValid: false, error: 'API key is disabled' });

    const expired = await prefixedRow({ expiresAt: new Date('2000-01-01T00:00:00Z') });
    prismaMock.apiKey.findUnique.mockResolvedValue(expired.row);
    const expiredResult = await validateApiKey(makeReq(expired.plaintext));
    expect(expiredResult).toMatchObject({ isValid: false, error: 'API key has expired' });
  });

  it('accepts a legacy key with one rate-limited scan', async () => {
    const { plaintext, row } = await legacyRow();
    prismaMock.apiKey.findMany.mockResolvedValue([row]);
    const result = await validateApiKey(makeReq(plaintext));
    expect(result.isValid).toBe(true);
    expect(result.apiKeyId).toBe('k-legacy');
    expect(prismaMock.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          keyPrefix: null,
          enabled: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });

  it('serves repeat legacy calls from the memo without using the cap', async () => {
    const { plaintext, row } = await legacyRow();
    prismaMock.apiKey.findMany.mockResolvedValue([row]);
    prismaMock.apiKey.findUnique.mockResolvedValue(row);

    for (let i = 0; i < 10; i++) {
      const result = await validateApiKey(makeReq(plaintext));
      expect(result.isValid).toBe(true);
    }

    expect(prismaMock.apiKey.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledTimes(9);
    expect(legacyMemo.get(memoId(plaintext))).toBe(row.id);
  });

  it('stops the legacy scan after the per-IP cap', async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([]);
    for (let i = 0; i < 5; i++) {
      const result = await validateApiKey(makeReq(randomLegacyKey()));
      expect(result.error).toBe('Invalid API key');
    }
    const manyCalls = prismaMock.apiKey.findMany.mock.calls.length;
    const uniqueCalls = prismaMock.apiKey.findUnique.mock.calls.length;
    const sixth = await validateApiKey(makeReq(randomLegacyKey()));
    expect(sixth).toEqual({ isValid: false, error: 'Legacy API key lookup limited' });
    expect(prismaMock.apiKey.findMany).toHaveBeenCalledTimes(manyCalls);
    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledTimes(uniqueCalls);
  });

  it('drops the memo entry when the key is deleted', async () => {
    const { plaintext, row } = await legacyRow();
    prismaMock.apiKey.findMany.mockResolvedValue([row]);
    const first = await validateApiKey(makeReq(plaintext));
    expect(first.isValid).toBe(true);
    expect(legacyMemo.get(memoId(plaintext))).toBe(row.id);

    prismaMock.apiKey.findUnique.mockResolvedValue(null);
    prismaMock.apiKey.findMany.mockResolvedValue([]);
    const second = await validateApiKey(makeReq(plaintext));
    expect(second).toMatchObject({ isValid: false, error: 'Invalid API key' });
    expect(legacyMemo.get(memoId(plaintext))).toBeUndefined();
  });

  it('never compares a prefixed key against legacy rows', async () => {
    const { plaintext, row } = await prefixedRow();
    prismaMock.apiKey.findUnique.mockResolvedValue(row);
    const leftover = await legacyRow();
    prismaMock.apiKey.findMany.mockResolvedValue([leftover.row]);
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    const result = await validateApiKey(makeReq(plaintext));
    expect(result.isValid).toBe(true);
    expect(prismaMock.apiKey.findMany).not.toHaveBeenCalled();
    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(compareSpy).toHaveBeenCalledWith(plaintext, row.keyHash);
    expect(compareSpy).not.toHaveBeenCalledWith(plaintext, leftover.row.keyHash);
  });
});
