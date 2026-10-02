import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lookupNetworkDetails, authenticateRequest } = vi.hoisted(() => ({
  lookupNetworkDetails: vi.fn(),
  authenticateRequest: vi.fn(async () => ({ user: null })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/server/network-utils', () => ({
  isPrivateIP: vi.fn(),
  lookupNetworkDetails,
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest,
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    globalSettings: { findFirst: vi.fn() },
    account: { findMany: vi.fn() },
    ssoGroupMapping: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    groupHostAliasPermission: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/prisma-utils', () => ({ getCaseInsensitiveMode: () => ({}) }));
vi.mock('@/lib/opnsense-api', () => ({ exportAliases: vi.fn() }));

import { GET } from '@/app/api/ip/route';

describe('/api/ip IP guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['1.2.3.4;id', '127.1', '1', 'fe80::1%eth0'])(
    'returns 400 for lookup IP %j before auth or ARP',
    async (ip) => {
      const response = await GET(
        new Request(`http://localhost/api/ip?ip=${encodeURIComponent(ip)}`) as never
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: 'Invalid IP address' });
      expect(lookupNetworkDetails).not.toHaveBeenCalled();
      expect(authenticateRequest).not.toHaveBeenCalled();
    }
  );
});
