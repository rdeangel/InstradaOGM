import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addAliasItem, reconfigureAliases } = vi.hoisted(() => ({
  addAliasItem: vi.fn(),
  reconfigureAliases: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/opnsense-api', () => ({
  getHostAliases: vi.fn(),
  getHostAliasesByIp: vi.fn(),
  addAliasItem,
  reconfigureAliases,
  exportAliases: vi.fn(),
}));
vi.mock('@/lib/host-alias-filtering', () => ({
  getFilteredHostAliases: vi.fn(),
}));

import { createHostAliasServer } from '@/lib/server/aliases-utils';

describe('createHostAliasServer reconfigure vs save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the saved-but-reconfigure message when only reconfigure throws', async () => {
    addAliasItem.mockResolvedValue({ result: 'saved', uuid: 'alias-1' });
    reconfigureAliases.mockRejectedValue(new Error('alias reconfigure failed'));

    await expect(createHostAliasServer('HOST_1_2_3_4', '1.2.3.4')).resolves.toEqual({
      success: false,
      error: 'Host alias saved but firewall reconfigure failed; apply it in OPNsense (Firewall > Aliases).',
    });
  });

  it('keeps Failed to create host alias when the save throws', async () => {
    addAliasItem.mockRejectedValue(new Error('network down'));

    await expect(createHostAliasServer('HOST_1_2_3_4', '1.2.3.4')).resolves.toEqual({
      success: false,
      error: 'Failed to create host alias',
    });
    expect(reconfigureAliases).not.toHaveBeenCalled();
  });
});
