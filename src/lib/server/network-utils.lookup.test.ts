import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileMock, getArpTableMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  getArpTableMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('[]'),
}));
vi.mock('child_process', () => ({
  execFile: (
    cmd: string,
    argv: string[],
    _options: unknown,
    callback: (err: Error | null, stdout: string, stderr: string) => void
  ) => {
    Promise.resolve(execFileMock(cmd, argv)).then(
      (result: { stdout?: string; stderr?: string }) => callback(null, result?.stdout ?? '', result?.stderr ?? ''),
      (err: Error) => callback(err, '', '')
    );
  },
}));
vi.mock('@/lib/opnsense-api', () => ({
  get_arpTable: (...args: unknown[]) => getArpTableMock(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@/lib/server/data-paths', () => ({
  getDataPath: () => '/tmp/mac-vendors.json',
}));

import { lookupNetworkDetails } from '@/lib/server/network-utils';
import { InvalidIpAddressError } from '@/lib/network-utils';

describe('lookupNetworkDetails', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    getArpTableMock.mockReset();
  });

  it.each(['1.2.3.4;id', '192.168.1.1$(id)', '10.0.0.1 | id', '::1;id'])(
    'rejects %j and never calls execFile or OPNsense ARP',
    async (payload) => {
      await expect(lookupNetworkDetails(payload)).rejects.toBeInstanceOf(InvalidIpAddressError);
      expect(execFileMock).not.toHaveBeenCalled();
      expect(getArpTableMock).not.toHaveBeenCalled();
    }
  );

  it('calls execFile with argv (not a shell string) for a valid IP when ARP misses', async () => {
    getArpTableMock.mockResolvedValue([]);
    execFileMock.mockResolvedValue({
      stdout: '192.168.1.10 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE',
      stderr: '',
    });

    const result = await lookupNetworkDetails('192.168.1.10');

    expect(execFileMock).toHaveBeenCalledWith('ip', ['neigh', 'show', 'to', '192.168.1.10']);
    expect(result.source).toBe('local');
    expect(result.mac).toBe('aa:bb:cc:dd:ee:ff');
  });
});
