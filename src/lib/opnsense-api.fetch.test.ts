import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.OPNSENSE_URL = 'https://opnsense.test';
  process.env.OPNSENSE_API_KEY = 'test-key';
  process.env.OPNSENSE_API_SECRET = 'test-secret';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    globallyDisabledGroup: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createHostAliasFromHostname, deleteAliasItem, fetchFromOpnsense, getBestHostAliasName, setAliasItem } from '@/lib/opnsense-api';
import { InvalidOpnsenseIdError, InvalidOpnsensePathError } from '@/lib/opnsense-id';
import { InvalidIpAddressError } from '@/lib/network-utils';

describe('fetchFromOpnsense path guard', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    '/api/firewall/alias/delItem/../export',
    '/api/openvpn/service/restartService/%2e%2e',
    '/api/ipsec/sessions/connect/foo#bar',
    '/api/wireguard/client/toggleClient/foo\\bar',
    '/api/kea/dhcpv4/del_reservation/abc?x=1',
    '/api/x/.\t./export',
    '/api/x/.\n./y',
    '@evil.com/api',
  ])('rejects %j without fetching', async (endpoint) => {
    await expect(fetchFromOpnsense(endpoint, 'POST', {})).rejects.toBeInstanceOf(InvalidOpnsensePathError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a safe endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ result: 'ok' }),
    });

    await expect(fetchFromOpnsense('/api/firewall/alias/export')).resolves.toEqual({ result: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getBestHostAliasName', () => {
  it('rejects an invalid IP before hostname lookup', async () => {
    await expect(getBestHostAliasName('1.2.3.4;id')).rejects.toBeInstanceOf(InvalidIpAddressError);
  });
});

describe('createHostAliasFromHostname', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['1.2.3.4;id'],
    [['1.2.3.4;id']],
    [{ a: 'x' }],
    [12345],
  ])('rejects provided ipAddress %j before alias lookup', async (ipAddress) => {
    await expect(createHostAliasFromHostname('evil', ipAddress as string)).rejects.toBeInstanceOf(
      InvalidIpAddressError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const aliasPayload = {
  alias: {
    enabled: '1',
    name: 'HOST_X',
    type: 'host',
    content: '10.0.0.1',
  },
};

describe('setAliasItem / deleteAliasItem id guards', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setAliasItem rejects an id with slashes without fetching', async () => {
    const result = await setAliasItem('1/stopService/2', aliasPayload);
    expect(result.result).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deleteAliasItem throws InvalidOpnsenseIdError for an id with slashes without fetching', async () => {
    await expect(deleteAliasItem('1/stopService/2')).rejects.toBeInstanceOf(InvalidOpnsenseIdError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
