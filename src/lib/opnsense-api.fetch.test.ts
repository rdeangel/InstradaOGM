import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

vi.hoisted(() => {
  process.env.OPNSENSE_URL = 'https://opnsense.test';
  process.env.OPNSENSE_API_KEY = 'test-key';
  process.env.OPNSENSE_API_SECRET = 'test-secret';
});

const opnsenseHttpsRequest = vi.hoisted(() => vi.fn());

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
vi.mock('@/lib/opnsense-https', () => ({
  opnsenseHttpsRequest,
}));

import {
  addAliasItem,
  assertReconfigureOk,
  createHostAliasFromHostname,
  deleteAliasItem,
  fetchFromOpnsense,
  getBestHostAliasName,
  reconfigureAliases,
  reconfigureKea,
  reconfigureWireguard,
  getIpsecConnections,
  restartWireguardClient,
  sanitizeOpnsenseDescription,
  setAliasItem,
} from '@/lib/opnsense-api';
import { InvalidOpnsenseIdError, InvalidOpnsensePathError } from '@/lib/opnsense-id';
import { InvalidIpAddressError } from '@/lib/network-utils';

describe('fetchFromOpnsense path guard', () => {
  beforeEach(() => {
    opnsenseHttpsRequest.mockReset();
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
    expect(opnsenseHttpsRequest).not.toHaveBeenCalled();
  });

  it('fetches a safe endpoint', async () => {
    opnsenseHttpsRequest.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ result: 'ok' }),
      text: async () => '{"result":"ok"}',
    });

    await expect(fetchFromOpnsense('/api/firewall/alias/export')).resolves.toEqual({ result: 'ok' });
    expect(opnsenseHttpsRequest).toHaveBeenCalledTimes(1);
  });

  it('does not reference NODE_TLS_REJECT_UNAUTHORIZED', () => {
    const src = fs.readFileSync(new URL('./opnsense-api.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED');
  });
});

describe('fetchFromOpnsense response parsing', () => {
  beforeEach(() => {
    opnsenseHttpsRequest.mockReset();
  });

  it('rejects non-JSON 2xx body', async () => {
    opnsenseHttpsRequest.mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      headers: { get: () => 'text/html' },
      json: async () => { throw new Error('no'); },
      text: async () => '<html>Login</html>',
    });
    await expect(fetchFromOpnsense('/api/firewall/alias/export'))
      .rejects.toThrow(/non-JSON response/);
  });

  it('still parses JSON served with a wrong content-type', async () => {
    opnsenseHttpsRequest.mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      headers: { get: () => 'text/plain' },
      json: async () => ({}), text: async () => '{"status":"ok"}',
    });
    await expect(fetchFromOpnsense('/api/firewall/alias/export')).resolves.toEqual({ status: 'ok' });
  });
});

describe('getBestHostAliasName', () => {
  it('rejects an invalid IP before hostname lookup', async () => {
    await expect(getBestHostAliasName('1.2.3.4;id')).rejects.toBeInstanceOf(InvalidIpAddressError);
  });
});

describe('createHostAliasFromHostname', () => {
  beforeEach(() => {
    opnsenseHttpsRequest.mockReset();
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
    expect(opnsenseHttpsRequest).not.toHaveBeenCalled();
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
  beforeEach(() => {
    opnsenseHttpsRequest.mockReset();
  });

  it('setAliasItem rejects an id with slashes without fetching', async () => {
    const result = await setAliasItem('1/stopService/2', aliasPayload);
    expect(result.result).toBe('failed');
    expect(opnsenseHttpsRequest).not.toHaveBeenCalled();
  });

  it('deleteAliasItem throws InvalidOpnsenseIdError for an id with slashes without fetching', async () => {
    await expect(deleteAliasItem('1/stopService/2')).rejects.toBeInstanceOf(InvalidOpnsenseIdError);
    expect(opnsenseHttpsRequest).not.toHaveBeenCalled();
  });
});

function mockOpnsenseJson(body: unknown) {
  opnsenseHttpsRequest.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockOpnsenseJsonOnce(body: unknown) {
  opnsenseHttpsRequest.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe('sanitizeOpnsenseDescription', () => {
  it.each([
    ['a\nb', 'a b'],
    ['a\r\nb', 'a b'],
    ['a\vb\fc', 'a b c'],
    ['a\0b', 'ab'],
    ['  x  ', 'x'],
    [undefined, ''],
  ])('%j -> %j', (input, out) => expect(sanitizeOpnsenseDescription(input)).toBe(out));

  it('truncates to 255', () => expect(sanitizeOpnsenseDescription('x'.repeat(300))).toHaveLength(255));
});

describe('reconfigure helpers', () => {
  beforeEach(() => {
    opnsenseHttpsRequest.mockReset();
  });

  it('reconfigureKea posts to /api/kea/service/reconfigure', async () => {
    mockOpnsenseJson({ status: 'ok' });
    await reconfigureKea();
    expect(opnsenseHttpsRequest).toHaveBeenCalledWith(
      'https://opnsense.test/api/kea/service/reconfigure',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reconfigureKea throws on {"status":"failed"}', async () => {
    mockOpnsenseJson({ status: 'failed' });
    await expect(reconfigureKea()).rejects.toThrow(/kea reconfigure failed/);
  });

  it('reconfigureKea throws when result is failed', async () => {
    mockOpnsenseJson({ result: ' Failed ' });
    await expect(reconfigureKea()).rejects.toThrow(/kea reconfigure failed/);
  });

  it('reconfigureAliases throws on {"status":"failed"}', async () => {
    mockOpnsenseJson({ status: 'failed' });
    await expect(reconfigureAliases()).rejects.toThrow(/alias reconfigure failed/);
  });

  it('reconfigureAliases resolves when status is not failed', async () => {
    mockOpnsenseJson({ status: 'done' });
    await expect(reconfigureAliases()).resolves.toEqual({ status: 'done' });
  });

  it('reconfigureAliases accepts an empty 2xx body', async () => {
    opnsenseHttpsRequest.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'text/plain' },
      json: async () => { throw new Error('no'); },
      text: async () => '',
    });
    await expect(reconfigureAliases()).resolves.toEqual({ result: 'ok', status: 200 });
  });

  it('reconfigureWireguard resolves on {"status":"ok"}', async () => {
    mockOpnsenseJson({ status: 'ok' });
    await expect(reconfigureWireguard()).resolves.toEqual({ status: 'ok' });
    expect(opnsenseHttpsRequest).toHaveBeenCalledWith(
      'https://opnsense.test/api/wireguard/service/reconfigure',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('assertReconfigureOk ignores non-failed shapes', () => {
    expect(() => assertReconfigureOk('alias', { status: 'ok' })).not.toThrow();
    expect(() => assertReconfigureOk('alias', { status: 'done' })).not.toThrow();
    expect(() => assertReconfigureOk('alias', {})).not.toThrow();
    expect(() => assertReconfigureOk('alias', null)).not.toThrow();
    expect(() => assertReconfigureOk('alias', { result: 'ok', status: 200 })).not.toThrow();
  });
});

describe('alias description sanitizing', () => {
  beforeEach(() => {
    opnsenseHttpsRequest.mockReset();
  });

  it('addAliasItem sends a sanitized description', async () => {
    mockOpnsenseJson({ result: 'saved', uuid: 'u' });
    await addAliasItem({
      alias: { enabled: '1', name: 'H', type: 'host', content: '1.2.3.4', description: 'a\nb' },
    });
    expect(JSON.parse(opnsenseHttpsRequest.mock.calls[0][1].body).alias.description).toBe('a b');
  });

  it('addAliasItem omits description when it was not provided', async () => {
    mockOpnsenseJson({ result: 'saved', uuid: 'u' });
    await addAliasItem({
      alias: { enabled: '1', name: 'H', type: 'host', content: '1.2.3.4' },
    });
    expect(JSON.parse(opnsenseHttpsRequest.mock.calls[0][1].body).alias).not.toHaveProperty('description');
  });

  it('setAliasItem sends a sanitized description', async () => {
    mockOpnsenseJson({ result: 'saved' });
    await setAliasItem('abc', {
      alias: { enabled: '1', name: 'H', type: 'host', content: '1.2.3.4', description: 'a\nb' },
    });
    expect(JSON.parse(opnsenseHttpsRequest.mock.calls[0][1].body).alias.description).toBe('a b');
  });

  it('setAliasItem flat payload sends a sanitized description', async () => {
    mockOpnsenseJson({ result: 'saved' });
    await setAliasItem('abc', {
      enabled: '1',
      name: 'H',
      type: 'host',
      content: '1.2.3.4',
      description: 'a\r\nb',
    });
    expect(JSON.parse(opnsenseHttpsRequest.mock.calls[0][1].body).alias.description).toBe('a b');
  });
});

const WG_CLIENT_ID = '5a52d24a-4d2b-4955-b8ad-1f49efa08f76';

describe('restartWireguardClient', () => {
  beforeEach(() => {
    opnsenseHttpsRequest.mockReset();
  });

  it('restartWireguardClient restores once and skips reconfigure when the first toggle is not Disabled', async () => {
    mockOpnsenseJsonOnce({ result: 'Enabled', changed: true });
    mockOpnsenseJsonOnce({ result: 'Disabled', changed: true });

    await expect(restartWireguardClient(WG_CLIENT_ID)).resolves.toEqual({ ok: false, result: 'Enabled' });
    expect(opnsenseHttpsRequest.mock.calls.map(c => c[0])).toEqual([
      `https://opnsense.test/api/wireguard/client/toggle_client/${WG_CLIENT_ID}`,
      `https://opnsense.test/api/wireguard/client/toggle_client/${WG_CLIENT_ID}`,
    ]);
    expect(opnsenseHttpsRequest.mock.calls.map(c => c[0]).some(url => String(url).includes('reconfigure'))).toBe(false);
  });

  it('restartWireguardClient toggles twice with reconfigure between, ok when re-enabled', async () => {
    mockOpnsenseJsonOnce({ result: 'Disabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'ok' });
    mockOpnsenseJsonOnce({ result: 'Enabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'ok' });

    await expect(restartWireguardClient(WG_CLIENT_ID)).resolves.toEqual({ ok: true, result: 'Enabled' });
    expect(opnsenseHttpsRequest.mock.calls.map(c => c[0])).toEqual([
      `https://opnsense.test/api/wireguard/client/toggle_client/${WG_CLIENT_ID}`,
      'https://opnsense.test/api/wireguard/service/reconfigure',
      `https://opnsense.test/api/wireguard/client/toggle_client/${WG_CLIENT_ID}`,
      'https://opnsense.test/api/wireguard/service/reconfigure',
    ]);
  });

  it('restartWireguardClient is not ok when second toggle leaves it Disabled', async () => {
    mockOpnsenseJsonOnce({ result: 'Disabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'ok' });
    mockOpnsenseJsonOnce({ result: 'Disabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'ok' });

    await expect(restartWireguardClient(WG_CLIENT_ID)).resolves.toEqual({ ok: false, result: 'Disabled' });
  });

  it('restartWireguardClient re-toggles and still rejects when the first reconfigure fails', async () => {
    mockOpnsenseJsonOnce({ result: 'Disabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'failed' });
    mockOpnsenseJsonOnce({ result: 'Enabled', changed: true });

    await expect(restartWireguardClient(WG_CLIENT_ID)).rejects.toThrow(/wireguard reconfigure failed/);
    expect(opnsenseHttpsRequest.mock.calls.map(c => c[0])).toEqual([
      `https://opnsense.test/api/wireguard/client/toggle_client/${WG_CLIENT_ID}`,
      'https://opnsense.test/api/wireguard/service/reconfigure',
      `https://opnsense.test/api/wireguard/client/toggle_client/${WG_CLIENT_ID}`,
    ]);
  });

  it('restartWireguardClient still rejects with the reconfigure error when the recovery toggle fails', async () => {
    mockOpnsenseJsonOnce({ result: 'Disabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'failed' });
    opnsenseHttpsRequest.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'toggle failed' }),
      text: async () => '{"message":"toggle failed"}',
    });

    await expect(restartWireguardClient(WG_CLIENT_ID)).rejects.toThrow(/wireguard reconfigure failed/);
    expect(opnsenseHttpsRequest).toHaveBeenCalledTimes(3);
  });

  it('restartWireguardClient returns ok false when the second toggle has no result', async () => {
    mockOpnsenseJsonOnce({ result: 'Disabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'ok' });
    mockOpnsenseJsonOnce({ changed: true });
    mockOpnsenseJsonOnce({ status: 'ok' });

    await expect(restartWireguardClient(WG_CLIENT_ID)).resolves.toEqual({ ok: false, result: '' });
  });

  it('restartWireguardClient does not re-toggle when the second reconfigure fails', async () => {
    mockOpnsenseJsonOnce({ result: 'Disabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'ok' });
    mockOpnsenseJsonOnce({ result: 'Enabled', changed: true });
    mockOpnsenseJsonOnce({ status: 'failed' });

    await expect(restartWireguardClient(WG_CLIENT_ID)).rejects.toThrow(/wireguard reconfigure failed/);
    expect(opnsenseHttpsRequest.mock.calls.map(c => c[0])).toEqual([
      `https://opnsense.test/api/wireguard/client/toggle_client/${WG_CLIENT_ID}`,
      'https://opnsense.test/api/wireguard/service/reconfigure',
      `https://opnsense.test/api/wireguard/client/toggle_client/${WG_CLIENT_ID}`,
      'https://opnsense.test/api/wireguard/service/reconfigure',
    ]);
  });
});

describe('getIpsecConnections', () => {
  beforeEach(() => {
    opnsenseHttpsRequest.mockReset();
  });

  it('getIpsecConnections uses ikeid, falls back to name when ikeid missing', async () => {
    mockOpnsenseJson({
      rows: [
        { ikeid: 'b157c526-7fd7-40c4-b5a6-d90db7230192', name: 'b157c526-7fd7-40c4-b5a6-d90db7230192', phase1desc: 'angdea.duckdns.org', connected: true },
        { name: 'con2', phase1desc: 'legacy', connected: false },
        // ikeid and name differ so id precedence is proven, not coincident with name.
        { ikeid: 'uuid-abc', name: 'legacy-name', phase1desc: 'Desc', connected: false },
      ],
    });

    const rows = await getIpsecConnections();
    expect(rows.map(r => r.id)).toEqual(['b157c526-7fd7-40c4-b5a6-d90db7230192', 'con2', 'uuid-abc']);
    expect(rows.map(r => r.name)).toEqual(['angdea.duckdns.org', 'legacy', 'Desc']);
  });
});
