import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authenticateRequest,
  exportAliases,
  getAliasTableSize,
  prismaMock,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async (): Promise<{ user: { id: string; role: string } | null }> => ({
    user: null,
  })),
  exportAliases: vi.fn(),
  getAliasTableSize: vi.fn(),
  prismaMock: {
    opnsenseGroupDisplay: { findMany: vi.fn() },
    globallyDisabledGroup: { findMany: vi.fn() },
    globalSettings: { findFirst: vi.fn() },
    groupFilterSetting: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest,
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/opnsense-api', () => ({
  exportAliases,
  getAliasTableSize,
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/app/api/user/group-filters/route', () => ({
  GET: vi.fn(async () => ({ ok: true, json: async () => [] })),
}));

import { GET } from '@/app/api/opnsense/network-groups/route';

const INSIDE_NETWORKS = [{ type: 'include', network: '192.168.1.0/24' }];

function requestWithQuery(query = '', xff = '192.168.1.10'): Request {
  return new Request(`http://localhost/api/opnsense/network-groups${query}`, {
    headers: { 'x-forwarded-for': xff },
  });
}

function uuidsOf(body: { networkGroups?: Array<{ uuid?: string; id?: string }> }): string[] {
  return (body.networkGroups ?? []).map((g) => (g.uuid || g.id || '').toLowerCase());
}

describe('network-groups includeDisabled is admin-only (NEW-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({ user: null });
    exportAliases.mockResolvedValue({
      aliases: {
        alias: {
          'g-on': {
            type: 'networkgroup',
            name: 'G_ON',
            enabled: '1',
            content: '',
            description: '',
          },
          'g-off': {
            type: 'networkgroup',
            name: 'G_OFF',
            enabled: '1',
            content: '',
            description: '',
          },
        },
      },
    });
    getAliasTableSize.mockResolvedValue({ details: {} });
    prismaMock.opnsenseGroupDisplay.findMany.mockResolvedValue([]);
    prismaMock.globallyDisabledGroup.findMany.mockResolvedValue([{ opnsenseUuid: 'g-off' }]);
    prismaMock.groupFilterSetting.findMany.mockResolvedValue([]);
    prismaMock.globalSettings.findFirst.mockResolvedValue({
      allowedNetworks: INSIDE_NETWORKS,
      removeSelfServicePage: false,
      customEmojis: [],
      customFlags: [],
    });
  });

  it('omits g-off for anonymous callers even with includeDisabled=true', async () => {
    const response = await GET(requestWithQuery('?includeDisabled=true'));
    expect(response.status).toBe(200);
    const body = await response.json() as { networkGroups: Array<{ uuid?: string }> };
    expect(uuidsOf(body)).toContain('g-on');
    expect(uuidsOf(body)).not.toContain('g-off');
  });

  it('omits g-off for USER callers even with includeDisabled=true', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'user-1', role: 'USER' } });

    const response = await GET(requestWithQuery('?includeDisabled=true'));
    expect(response.status).toBe(200);
    const body = await response.json() as { networkGroups: Array<{ uuid?: string }> };
    expect(uuidsOf(body)).toContain('g-on');
    expect(uuidsOf(body)).not.toContain('g-off');
  });

  it('includes g-off for ADMIN callers with includeDisabled=true', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });

    const response = await GET(requestWithQuery('?includeDisabled=true'));
    expect(response.status).toBe(200);
    const body = await response.json() as { networkGroups: Array<{ uuid?: string }> };
    expect(uuidsOf(body)).toContain('g-on');
    expect(uuidsOf(body)).toContain('g-off');
  });

  it('omits g-off for ADMIN callers when includeDisabled is omitted', async () => {
    authenticateRequest.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });

    const response = await GET(requestWithQuery());
    expect(response.status).toBe(200);
    const body = await response.json() as { networkGroups: Array<{ uuid?: string }> };
    expect(uuidsOf(body)).toContain('g-on');
    expect(uuidsOf(body)).not.toContain('g-off');
  });
});
