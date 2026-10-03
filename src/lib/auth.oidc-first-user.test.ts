import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
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

const signIn = authOptions.callbacks!.signIn!;

describe('OIDC signIn first-user role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_ALLOW_OIDC_LOGIN = 'true';
    prismaMock.account.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.user.create.mockImplementation(async ({ data }: { data: { role: string; email: string } }) => ({
      id: 'oidc-new',
      email: data.email,
      role: data.role,
    }));
  });

  it('creates a USER, never SUPER_ADMIN, when the table is empty', async () => {
    const result = await signIn({
      user: { id: 'pending', email: 'sso@example.com' },
      account: {
        type: 'oauth',
        provider: 'authentik',
        providerAccountId: 'sub-1',
      },
      profile: { email: 'sso@example.com', name: 'SSO User' },
    } as never);

    expect(result).toBe(true);
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'USER' }),
    }));
    const created = prismaMock.user.create.mock.calls[0][0] as { data: { role: string } };
    expect(created.data.role).not.toBe('SUPER_ADMIN');
  });
});
