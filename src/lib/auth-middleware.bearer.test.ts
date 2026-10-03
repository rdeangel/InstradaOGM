import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const { getClientIp, logAuditEvent, prismaMock, checkRateLimit, incrementRequestCount } = vi.hoisted(() => ({
  getClientIp: vi.fn(() => '10.0.0.1'),
  logAuditEvent: vi.fn(() => Promise.resolve()),
  prismaMock: {
    apiKey: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
  checkRateLimit: vi.fn(),
  incrementRequestCount: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent }));
vi.mock('@/lib/network-utils', () => ({ getClientIp }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit,
  incrementRequestCount,
}));
vi.mock('@/lib/api-usage-tracker', () => ({ trackApiUsageEvent: vi.fn() }));
vi.mock('@/lib/session-usage-tracker', () => ({ trackSessionUsageEvent: vi.fn() }));
vi.mock('@/lib/analytics-settings', () => ({ isAdvancedAnalyticsEnabled: vi.fn() }));
vi.mock('@/lib/analytics-exclusions', () => ({ shouldExcludeFromAnalytics: vi.fn() }));

import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { generateApiKey } from '@/lib/api-key-format';
import { resetLegacyStateForTests } from '@/lib/api-key-legacy-limit';

const HASH_COST = 4;

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

beforeEach(() => {
  vi.clearAllMocks();
  resetLegacyStateForTests();
  getClientIp.mockReturnValue('10.0.0.1');
  prismaMock.apiKey.findUnique.mockResolvedValue(null);
  prismaMock.apiKey.findMany.mockResolvedValue([]);
  prismaMock.apiKey.update.mockResolvedValue({});
  prismaMock.user.findUnique.mockResolvedValue(null);
  checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 99,
    resetTime: new Date(Date.now() + 60_000),
    limit: 100,
    windowType: 'minute',
  });
  incrementRequestCount.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLegacyStateForTests();
});

async function statusFor(req: NextRequest): Promise<number> {
  const auth = await authenticateRequest(req);
  const res = handleAuthResponse(auth);
  return res ? res.status : 200;
}

describe('authenticateRequest Bearer API keys after next-auth 4.24.15', () => {
  it('maps a junk Bearer to HTTP 401 and does not throw', async () => {
    await expect(authenticateRequest(makeReq('not-a-jwt!!!'))).resolves.toMatchObject({
      user: null,
      method: 'apiKey',
    });
    await expect(statusFor(makeReq('not-a-jwt!!!'))).resolves.toBe(401);
    await expect(statusFor(makeReq('%%%%malformed'))).resolves.toBe(401);
    await expect(statusFor(makeReq('eyJhbGciOiJub25lIn0.not-a-token'))).resolves.toBe(401);
  });

  it('accepts a prefixed key as 200, not 500', async () => {
    const { prefix, plaintext } = generateApiKey();
    const keyHash = await bcrypt.hash(plaintext, HASH_COST);
    const user = {
      id: 'u-admin',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'SUPER_ADMIN',
    };
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: 'k-prefixed',
      name: 'deploy',
      keyHash,
      keyPrefix: prefix,
      userId: user.id,
      enabled: true,
      expiresAt: null,
      user,
    });
    prismaMock.user.findUnique.mockResolvedValue(user);
    await expect(statusFor(makeReq(plaintext))).resolves.toBe(200);
  });

  it('accepts a legacy 64-hex key as 200, not 500', async () => {
    const plaintext = randomLegacyKey();
    const keyHash = await bcrypt.hash(plaintext, HASH_COST);
    const user = {
      id: 'u-user',
      name: 'Lin',
      email: 'lin@example.com',
      role: 'USER',
    };
    prismaMock.apiKey.findMany.mockResolvedValue([
      {
        id: 'k-legacy',
        name: 'cron',
        keyHash,
        keyPrefix: null,
        userId: user.id,
        enabled: true,
        expiresAt: null,
        user,
      },
    ]);
    prismaMock.user.findUnique.mockResolvedValue(user);
    await expect(statusFor(makeReq(plaintext))).resolves.toBe(200);
  });
});
