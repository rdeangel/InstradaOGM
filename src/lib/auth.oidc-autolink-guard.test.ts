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

const untouchedUser = {
  id: 'u1',
  email: 'x@corp.test',
  role: 'USER',
  password: 'hash',
  is2FAEnabled: false,
  emailVerified: null,
  emailSelfChangedAt: null,
  username: 'u1',
  name: 'U',
};

function oidcArgs(profile: Record<string, unknown> = { email: 'x@corp.test', name: 'X' }) {
  return {
    user: { id: 'pending', email: 'x@corp.test' },
    account: {
      type: 'oauth',
      provider: 'authentik',
      providerAccountId: 'sub-x',
    },
    profile,
  } as never;
}

describe('OIDC signIn auto-link guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_ALLOW_OIDC_LOGIN = 'true';
    prismaMock.account.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ ...untouchedUser });
    prismaMock.account.create.mockResolvedValue({ id: 'acc-1' });
    prismaMock.user.update.mockResolvedValue({ ...untouchedUser });
  });

  it('refuses auto-link while a self-changed email is unverified', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...untouchedUser,
      emailSelfChangedAt: new Date(),
      emailVerified: null,
    });

    const result = await signIn(oidcArgs());
    expect(result).toBe('/auth/error?error=OidcLinkRequired');
    expect(prismaMock.account.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('refuses auto-link for a self-registered account (N4: registration sets emailSelfChangedAt)', async () => {
    // register/route.ts creates users with emailVerified: null and emailSelfChangedAt set,
    // so this guard is what blocks SSO linking until the address is proven.
    prismaMock.user.findUnique.mockResolvedValue({
      ...untouchedUser,
      emailSelfChangedAt: new Date(),
      emailVerified: null,
    });

    const result = await signIn(oidcArgs({ email: 'self-registered@corp.test', name: 'SR' }));
    expect(result).toBe('/auth/error?error=OidcLinkRequired');
    expect(prismaMock.account.create).not.toHaveBeenCalled();
  });

  it('auto-links once the self-changed email is verified', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...untouchedUser,
      emailSelfChangedAt: new Date(),
      emailVerified: new Date(),
    });

    const result = await signIn(oidcArgs());
    expect(result).toBe(true);
    expect(prismaMock.account.create).toHaveBeenCalledTimes(1);
  });

  it('refuses auto-link when 2FA is enabled', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...untouchedUser,
      is2FAEnabled: true,
    });

    const result = await signIn(oidcArgs());
    expect(result).toBe('/auth/error?error=OidcLinkRequired');
    expect(prismaMock.account.create).not.toHaveBeenCalled();
  });

  it('still auto-links an untouched USER', async () => {
    const result = await signIn(oidcArgs());
    expect(result).toBe(true);
    expect(prismaMock.account.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u1' }),
    }));
  });

  it('keeps the admin auto-link refusal ahead of the 2FA guard', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...untouchedUser,
      role: 'ADMIN',
      is2FAEnabled: true,
    });

    const result = await signIn(oidcArgs());
    expect(result).toBe('/auth/error?error=OidcAdminLinkRequired');
  });

  it('skips the guard for an already-linked SSO account', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ userId: 'u1' });
    prismaMock.user.findUnique.mockResolvedValue({
      ...untouchedUser,
      is2FAEnabled: true,
    });

    const result = await signIn(oidcArgs());
    expect(result).toBe(true);
    expect(prismaMock.account.create).not.toHaveBeenCalled();
  });

  it('does not require profile.email_verified (D1 unchanged)', async () => {
    // D1: OIDC does not require the IdP email_verified claim. This profile omits it.
    const result = await signIn(oidcArgs({ email: 'x@corp.test', name: 'X' }));
    expect(result).toBe(true);
    expect(prismaMock.account.create).toHaveBeenCalledTimes(1);
  });
});
