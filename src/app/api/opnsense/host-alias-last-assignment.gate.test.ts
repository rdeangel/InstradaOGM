import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateRequest, prismaMock } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async (): Promise<{ user: { id: string; role: string } | null; method?: string }> => ({
    user: null,
  })),
  prismaMock: {
    globalSettings: { findFirst: vi.fn(), create: vi.fn() },
    opnsenseGroupDisplay: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest,
  handleAuthResponse: vi.fn(() => null),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/db-helpers', () => ({
  buildJsonFilter: vi.fn(),
  supportsArrayContains: vi.fn(() => false),
}));

import { GET } from '@/app/api/opnsense/host-alias-last-assignment/route';

const INSIDE_NETWORKS = [{ type: 'include', network: '192.168.1.0/24' }];

function stubSettings(overrides: Record<string, unknown> = {}) {
  prismaMock.globalSettings.findFirst.mockResolvedValue({
    allowedNetworks: INSIDE_NETWORKS,
    removeSelfServicePage: false,
    enableRenamingSelfServicePage: true,
    ...overrides,
  });
}

function getRequest(ip: string, xff = '192.168.1.10'): Request {
  return new Request(`http://localhost/api/opnsense/host-alias-last-assignment?ipAddress=${encodeURIComponent(ip)}`, {
    method: 'GET',
    headers: { 'x-forwarded-for': xff },
  });
}

describe('host-alias-last-assignment anonymous gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({ user: null });
    stubSettings();
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.opnsenseGroupDisplay.findMany.mockResolvedValue([]);
  });

  it('returns 200 for anonymous own IP inside Allowed Networks', async () => {
    const response = await GET(getRequest('192.168.1.10') as never);
    expect(response.status).toBe(200);
  });

  it('returns 403 when the client is outside Allowed Networks', async () => {
    const response = await GET(getRequest('10.9.9.9', '10.9.9.9') as never);
    expect(response.status).toBe(403);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when Allowed Networks is empty', async () => {
    stubSettings({ allowedNetworks: [] });
    const response = await GET(getRequest('192.168.1.10') as never);
    expect(response.status).toBe(403);
  });

  it('returns 403 for a foreign IP', async () => {
    const response = await GET(getRequest('192.168.1.99') as never);
    expect(response.status).toBe(403);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when self-service is disabled', async () => {
    stubSettings({ removeSelfServicePage: true });
    const response = await GET(getRequest('192.168.1.10') as never);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Forbidden: Self-service functionality is disabled',
    });
  });
});
