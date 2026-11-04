import { beforeEach, describe, expect, it, vi } from 'vitest';
const { prismaMock } = vi.hoisted(() => ({ prismaMock: { globalSettings: { findFirst: vi.fn(), create: vi.fn() } } }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
import { getGlobalSettings } from '@/lib/server/global-settings';

describe('getGlobalSettings cardSchedulesEnabled', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns true when stored true', async () => {
    prismaMock.globalSettings.findFirst.mockResolvedValue({ id: 'g', allowedNetworks: [], cardSchedulesEnabled: true });
    expect((await getGlobalSettings()).cardSchedulesEnabled).toBe(true);
  });
  it('defaults to false when column absent', async () => {
    prismaMock.globalSettings.findFirst.mockResolvedValue({ id: 'g', allowedNetworks: [] });
    expect((await getGlobalSettings()).cardSchedulesEnabled).toBe(false);
  });
});
