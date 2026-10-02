import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prismaMock } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prismaMock: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/api-key-auth', () => ({ validateApiKey: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  incrementRequestCount: vi.fn(),
}));
vi.mock('@/lib/api-usage-tracker', () => ({ trackApiUsageEvent: vi.fn() }));
vi.mock('@/lib/session-usage-tracker', () => ({ trackSessionUsageEvent: vi.fn() }));
vi.mock('@/lib/analytics-settings', () => ({ isAdvancedAnalyticsEnabled: vi.fn() }));
vi.mock('@/lib/analytics-exclusions', () => ({ shouldExcludeFromAnalytics: vi.fn() }));

import { authenticateRequest } from '@/lib/auth-middleware';

describe('authenticateRequest session fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats a session user with no id as unauthenticated and skips Prisma', async () => {
    getServerSession.mockResolvedValue({ user: {} });
    const result = await authenticateRequest(new Request('http://localhost/api/account'));
    expect(result.user).toBeNull();
    expect(result.authError).toBe('Not authenticated');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('looks up the user by session.user.id when present', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' } });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'USER' });
    const result = await authenticateRequest(new Request('http://localhost/api/account'));
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(result.user).toEqual({ id: 'u1', role: 'USER' });
    expect(result.method).toBe('session');
  });
});
