import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    account: { findFirst: vi.fn(), update: vi.fn() },
    ssoGroupMapping: { findMany: vi.fn() },
    globalSettings: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/auth-config', () => ({
  loadOidcProviders: () => [],
  mapConfigToProvider: vi.fn(),
}));
vi.mock('@next-auth/prisma-adapter', () => ({
  PrismaAdapter: () => ({}),
}));

import { authOptions } from '@/lib/auth';

const jwtCallback = authOptions.callbacks!.jwt!;

describe('authOptions.callbacks.jwt wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      role: 'USER',
      username: 'u',
      passwordChangedAt: null,
      groups: [],
    });
    prismaMock.account.findFirst.mockResolvedValue(null);
    prismaMock.account.update.mockResolvedValue(null);
    prismaMock.ssoGroupMapping.findMany.mockResolvedValue([]);
  });

  it('stamps authTime on sign-in', async () => {
    const result = await jwtCallback({
      token: {},
      user: { id: 'u1' },
    } as never);
    expect(typeof (result as { authTime?: unknown }).authTime).toBe('number');
    expect((result as { id?: string }).id).toBe('u1');
  });

  it('does not restamp authTime on a session refresh', async () => {
    const result = await jwtCallback({
      token: { id: 'u1', sub: 'u1', authTime: 100 },
    } as never);
    expect((result as { authTime?: number }).authTime).toBe(100);
  });

  it('strips id/sub and sets invalidated when passwordChangedAt is newer than authTime', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      role: 'USER',
      username: 'u',
      passwordChangedAt: new Date(200_000),
      groups: [],
    });
    const result = await jwtCallback({
      token: { id: 'u1', sub: 'u1', authTime: 100 },
    } as never) as {
      id?: unknown;
      sub?: unknown;
      invalidated?: unknown;
    };
    expect(result.id).toBeUndefined();
    expect(result.sub).toBeUndefined();
    expect(result.invalidated).toBe(true);
  });
});
