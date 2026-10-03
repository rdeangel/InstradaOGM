import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { $queryRaw: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_VERSION = '9.9.9';
  });

  it('returns 200 without a version field', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body).not.toHaveProperty('version');
  });

  it('returns a generic 503 error when the database is down', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('P1001: Can\'t reach database server at db.internal:5432'));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('unhealthy');
    expect(body.error).toBe('database unavailable');
    expect(JSON.stringify(body)).not.toMatch(/db\.internal|P1001|5432/);
  });
});
