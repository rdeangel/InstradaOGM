import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }));
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

import { handleAuthResponse } from '@/lib/auth-middleware';

describe('handleAuthResponse', () => {
  it('maps Legacy API key lookup limited to HTTP 429 when user is null', async () => {
    const res = handleAuthResponse({ user: null, authError: 'Legacy API key lookup limited' });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    await expect(res!.json()).resolves.toEqual({ message: 'Legacy API key lookup limited' });
  });

  it('returns 401 for other errors when user is null', async () => {
    const res = handleAuthResponse({ user: null, authError: 'Invalid API key' });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    await expect(res!.json()).resolves.toEqual({ message: 'Invalid API key' });
  });
});
