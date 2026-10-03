import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const require = createRequire(import.meta.url);
const guardPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../xff-guard.cjs');
const realOrigEmit = http.Server.prototype.emit;

type TrustFn = (ip: string) => boolean;

type Guard = {
  parseTrustedCidrs: (raw?: string | null) => { mode: 'auto' | 'none' | 'explicit'; cidrs: string[] };
  autoDetectTrusted: (
    ifaces: NodeJS.Dict<Array<{ family: string | number; address: string; cidr?: string; internal?: boolean; netmask?: string }>>,
    routeText: string | null,
    inContainer: boolean
  ) => { allow: string[]; deny: string[]; isTrusted: TrustFn };
  resolveClientIp: (peer: string, xff: string, xRealIp: string, isTrusted: TrustFn) => string;
  sanitize: (
    req: { socket?: { remoteAddress?: string }; headers: Record<string, string | undefined> },
    options?: { isTrusted?: TrustFn; log?: (msg: string) => void }
  ) => void;
  normalize: (ip: unknown) => string;
  createTrustChecker: (allow: string[], deny: string[]) => TrustFn;
  resetWarnedPeers: () => void;
};

const guard = require(guardPath) as Guard;

afterAll(() => {
  http.Server.prototype.emit = realOrigEmit;
  delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
});

function dockerNetTrust(): TrustFn {
  return guard.createTrustChecker(['172.18.0.0/16'], ['172.18.0.1']);
}

function fakeReq(peer: string, headers: Record<string, string | undefined> = {}) {
  return {
    socket: { remoteAddress: peer },
    headers: { ...headers },
  };
}

describe('parseTrustedCidrs', () => {
  it('treats empty as auto', () => {
    expect(guard.parseTrustedCidrs('')).toEqual({ mode: 'auto', cidrs: [] });
    expect(guard.parseTrustedCidrs(null)).toEqual({ mode: 'auto', cidrs: [] });
    expect(guard.parseTrustedCidrs(undefined)).toEqual({ mode: 'auto', cidrs: [] });
    expect(guard.parseTrustedCidrs('   ')).toEqual({ mode: 'auto', cidrs: [] });
  });

  it('treats none as empty', () => {
    expect(guard.parseTrustedCidrs('none')).toEqual({ mode: 'none', cidrs: [] });
    expect(guard.parseTrustedCidrs('NONE')).toEqual({ mode: 'none', cidrs: [] });
  });

  it('treats a bare address as /32', () => {
    expect(guard.parseTrustedCidrs('172.18.0.1')).toEqual({
      mode: 'explicit',
      cidrs: ['172.18.0.1/32'],
    });
  });

  it('accepts space-separated mixed families', () => {
    expect(guard.parseTrustedCidrs('10.0.0.0/8 fd00::/8')).toEqual({
      mode: 'explicit',
      cidrs: ['10.0.0.0/8', 'fd00::/8'],
    });
  });

  it('drops invalid entries and keeps the rest', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(guard.parseTrustedCidrs('foo,10.0.0.0/8')).toEqual({
      mode: 'explicit',
      cidrs: ['10.0.0.0/8'],
    });
    expect(err).toHaveBeenCalledWith('[xff-guard] ignoring invalid TRUSTED_PROXY_CIDRS entry "foo"');
    err.mockRestore();
  });

  it('returns nobody when every entry is invalid', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(guard.parseTrustedCidrs('foo,bar')).toEqual({ mode: 'explicit', cidrs: [] });
    err.mockRestore();
  });
});

describe('autoDetectTrusted', () => {
  it('trusts loopback only outside a container', () => {
    const result = guard.autoDetectTrusted(
      {
        eth0: [{ family: 'IPv4', address: '192.168.1.50', cidr: '192.168.1.50/24', internal: false }],
      },
      'eth0\t00000000\t0101A8C0\t0003\t0\t0\t0\t00000000\t0\t0\t0\n',
      false
    );
    expect(result.isTrusted('127.0.0.1')).toBe(true);
    expect(result.isTrusted('::1')).toBe(true);
    expect(result.isTrusted('192.168.1.50')).toBe(false);
    expect(result.isTrusted('192.168.1.1')).toBe(false);
  });

  it('trusts the docker subnet minus the default gateway', () => {
    const result = guard.autoDetectTrusted(
      {
        eth0: [{ family: 'IPv4', address: '172.18.0.5', cidr: '172.18.0.5/16', internal: false }],
      },
      'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\neth0\t00000000\t010012AC\t0003\t0\t0\t0\t00000000\t0\t0\t0\n',
      true
    );
    expect(result.isTrusted('172.18.0.7')).toBe(true);
    expect(result.isTrusted('172.18.0.1')).toBe(false);
    expect(result.isTrusted('127.0.0.1')).toBe(true);
  });

  it('excludes .1 on a second network even without a default route', () => {
    const result = guard.autoDetectTrusted(
      {
        eth0: [{ family: 'IPv4', address: '172.18.0.5', cidr: '172.18.0.5/16', internal: false }],
        eth1: [{ family: 'IPv4', address: '172.19.0.5', cidr: '172.19.0.5/16', internal: false }],
      },
      'Iface\tDestination\tGateway\tFlags\neth0\t00000000\t010012AC\t0003\n',
      true
    );
    expect(result.isTrusted('172.19.0.7')).toBe(true);
    expect(result.isTrusted('172.19.0.1')).toBe(false);
  });

  it('excludes network+1 when the route file is missing', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = guard.autoDetectTrusted(
      {
        eth0: [{ family: 'IPv4', address: '172.18.0.5', cidr: '172.18.0.5/16', internal: false }],
      },
      null,
      true
    );
    expect(result.isTrusted('172.18.0.7')).toBe(true);
    expect(result.isTrusted('172.18.0.1')).toBe(false);
    expect(err).toHaveBeenCalledWith(
      '[xff-guard] /proc/net/route unreadable, excluding only network+1'
    );
    err.mockRestore();
  });
});

describe('normalize', () => {
  it('strips IPv4-mapped prefixes and lowercases v6', () => {
    expect(guard.normalize('  ::ffff:10.0.0.9  ')).toBe('10.0.0.9');
    expect(guard.normalize('2001:DB8::5')).toBe('2001:db8::5');
  });
});

describe('resolveClientIp + sanitize matrix', () => {
  const trusted = dockerNetTrust();
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
  };

  beforeEach(() => {
    logs.length = 0;
    guard.resetWarnedPeers();
  });

  it('1. untrusted peer with spoofed XFF/XRI uses the peer and warns once', () => {
    const req = fakeReq('192.168.1.50', {
      'x-forwarded-for': '1.2.3.4',
      'x-real-ip': '1.2.3.4',
    });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('192.168.1.50');
    expect(req.headers['x-forwarded-for']).toBe('192.168.1.50');
    expect(req.headers['x-real-ip']).toBeUndefined();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('untrusted peer 192.168.1.50');
    expect(logs[0]).toContain('TRUSTED_PROXY_CIDRS=192.168.1.50/32');

    const req2 = fakeReq('192.168.1.50', {
      'x-forwarded-for': '1.2.3.4',
      'x-real-ip': '1.2.3.4',
    });
    guard.sanitize(req2, { isTrusted: trusted, log });
    expect(logs).toHaveLength(1);
  });

  it('2. untrusted peer with no headers does not warn', () => {
    const req = fakeReq('192.168.1.50');
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('192.168.1.50');
    expect(logs).toHaveLength(0);
  });

  it('3. public untrusted peer sending XFF does not warn', () => {
    const req = fakeReq('8.8.4.4', { 'x-forwarded-for': '10.0.0.9' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('8.8.4.4');
    expect(logs).toHaveLength(0);
  });

  it('4. trusted peer appends itself to XFF and takes the client from XFF', () => {
    const req = fakeReq('172.18.0.5', { 'x-forwarded-for': '10.0.0.9' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('10.0.0.9');
    expect(req.headers['x-forwarded-for']).toBe('10.0.0.9, 172.18.0.5');
  });

  it('5. spoofed leftmost XFF is ignored', () => {
    const req = fakeReq('172.18.0.5', { 'x-forwarded-for': '6.6.6.6, 10.0.0.9' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('10.0.0.9');
  });

  it('6. two trusted hops still resolve to the client', () => {
    const req = fakeReq('172.18.0.5', { 'x-forwarded-for': '10.0.0.9, 172.18.0.7' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('10.0.0.9');
  });

  it('7. trusted peer with only X-Real-IP uses it', () => {
    const req = fakeReq('172.18.0.5', { 'x-real-ip': '10.0.0.9' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('10.0.0.9');
  });

  it('8. trusted peer with no headers uses the peer', () => {
    const req = fakeReq('172.18.0.5');
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('172.18.0.5');
  });

  it('9. gateway peer is untrusted and the warning names /32', () => {
    const req = fakeReq('172.18.0.1', { 'x-forwarded-for': '10.0.0.9' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('172.18.0.1');
    expect(logs[0]).toContain('TRUSTED_PROXY_CIDRS=172.18.0.1/32');
  });

  it('10. IPv4-mapped peer normalizes', () => {
    const req = fakeReq('::ffff:192.168.1.50');
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('192.168.1.50');
  });

  it('11. IPv4-mapped XFF hop normalizes', () => {
    const req = fakeReq('172.18.0.5', { 'x-forwarded-for': '::ffff:10.0.0.9' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('10.0.0.9');
  });

  it('12. IPv6 client in XFF is kept', () => {
    const req = fakeReq('172.18.0.5', { 'x-forwarded-for': '2001:db8::5' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('2001:db8::5');
  });

  it('13. invalid XFF stops the walk and falls back to X-Real-IP', () => {
    const req = fakeReq('172.18.0.5', {
      'x-forwarded-for': 'unknown',
      'x-real-ip': '10.0.0.9',
    });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('10.0.0.9');
  });

  it('14. never steps past an invalid hop', () => {
    const req = fakeReq('172.18.0.5', { 'x-forwarded-for': '10.0.0.9, garbage' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('172.18.0.5');
  });

  it('15. client-supplied x-ogm-client-ip is never kept', () => {
    const req = fakeReq('192.168.1.50', { 'x-ogm-client-ip': '1.1.1.1' });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-ogm-client-ip']).toBe('192.168.1.50');
    expect(req.headers['x-ogm-client-ip']).not.toBe('1.1.1.1');

    const trustedReq = fakeReq('172.18.0.5', {
      'x-ogm-client-ip': '1.1.1.1',
      'x-forwarded-for': '10.0.0.9',
    });
    guard.sanitize(trustedReq, { isTrusted: trusted, log });
    expect(trustedReq.headers['x-ogm-client-ip']).toBe('10.0.0.9');
  });

  it('16. untrusted peer drops X-Forwarded-Host and keeps X-Forwarded-Proto', () => {
    const req = fakeReq('192.168.1.50', {
      'x-forwarded-host': 'evil',
      'x-forwarded-proto': 'https',
    });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-forwarded-host']).toBeUndefined();
    expect(req.headers['x-forwarded-proto']).toBe('https');
  });

  it('17. trusted peer keeps X-Forwarded-Host', () => {
    const req = fakeReq('172.18.0.5', {
      'x-forwarded-host': 'app.example.com',
      'x-forwarded-proto': 'https',
    });
    guard.sanitize(req, { isTrusted: trusted, log });
    expect(req.headers['x-forwarded-host']).toBe('app.example.com');
    expect(req.headers['x-forwarded-proto']).toBe('https');
  });
});

describe('http.Server hook integration', () => {
  const origCidrs = process.env.TRUSTED_PROXY_CIDRS;

  afterEach(() => {
    http.Server.prototype.emit = realOrigEmit;
    delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
    if (origCidrs === undefined) {
      delete process.env.TRUSTED_PROXY_CIDRS;
    } else {
      process.env.TRUSTED_PROXY_CIDRS = origCidrs;
    }
    vi.resetModules();
  });

  async function withGuard(
    cidrs: string,
    run: (port: number) => Promise<void>
  ): Promise<void> {
    http.Server.prototype.emit = realOrigEmit;
    delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
    process.env.TRUSTED_PROXY_CIDRS = cidrs;
    delete require.cache[require.resolve(guardPath)];
    vi.resetModules();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    require(guardPath);

    const server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(req.headers));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    try {
      await run(port);
    } finally {
      log.mockRestore();
      err.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
      });
    }
  }

  function requestHeaders(port: number, headers: Record<string, string>): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/', headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, string>);
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  it('TRUSTED_PROXY_CIDRS=none overwrites spoofed XFF with the peer', async () => {
    await withGuard('none', async (port) => {
      const headers = await requestHeaders(port, { 'x-forwarded-for': '1.2.3.4' });
      expect(headers['x-ogm-client-ip']).toBe('127.0.0.1');
      expect(headers['x-forwarded-for']).toBe('127.0.0.1');
    });
  });

  it('TRUSTED_PROXY_CIDRS=127.0.0.1/32 resolves spoofed-left XFF to the rightmost', async () => {
    await withGuard('127.0.0.1/32', async (port) => {
      const headers = await requestHeaders(port, {
        'x-forwarded-for': '1.2.3.4, 10.0.0.9',
      });
      expect(headers['x-ogm-client-ip']).toBe('10.0.0.9');
    });
  });
});
