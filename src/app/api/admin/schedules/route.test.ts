import { beforeEach, describe, expect, it, vi } from 'vitest';
// Typed arg so `findMany.mock.calls[0][0]` compiles under `tsc --noEmit` (tsconfig includes test files).
const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(async (_args: { include: Record<string, unknown> }) => [] as unknown[]),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { scheduledAssignment: { findMany } } }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/schedule-validation', () => ({ validateScheduleData: vi.fn() }));
vi.mock('@/lib/api-route-wrapper', () => ({ withAdminApiTracking: (h: unknown) => h }));
import { NextRequest } from 'next/server';
import { GET } from './route';

const call = (q = '') =>
  (GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest(`http://x/api/admin/schedules${q}`));

describe('GET /api/admin/schedules', () => {
  beforeEach(() => findMany.mockClear());
  it('default include unchanged', async () => {
    await call();
    expect(findMany.mock.calls[0][0].include).toEqual({ _count: { select: { executions: true } } });
  });
  it('withActions=1 adds ordered actions', async () => {
    await call('?withActions=1');
    const inc = findMany.mock.calls[0][0].include;
    expect(inc._count).toEqual({ select: { executions: true } });
    expect(inc.onceActions).toEqual({ orderBy: { sortOrder: 'asc' } });
    expect(inc.recurringActions).toEqual({ orderBy: { sortOrder: 'asc' } });
  });
});
