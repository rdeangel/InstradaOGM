import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    groupFilterSetting: { findMany: vi.fn() },
    globallyDisabledGroup: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    groupSpecificFilterSetting: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/group-filter-utils', () => ({ filterNetworkGroups: vi.fn() }));

import { fetchUnmanagedGroupFilterData } from '@/lib/unmanaged-group-utils';

describe('fetchUnmanagedGroupFilterData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when groupFilterSetting.findMany rejects instead of returning empty filters', async () => {
    prismaMock.groupFilterSetting.findMany.mockRejectedValue(new Error('db down'));

    await expect(fetchUnmanagedGroupFilterData()).rejects.toThrow('db down');
  });
});
