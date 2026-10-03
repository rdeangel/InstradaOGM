import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import type { Server } from 'https';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

import { resolveOpnsenseCaPem, resetOpnsenseHttpsAgentForTests } from '@/lib/opnsense-ssl-config';
import { opnsenseHttpsRequest } from '@/lib/opnsense-https';

function makeCert(dir: string, name: string, san: string): { key: string; cert: string } {
  const key = path.join(dir, `${name}.key`);
  const cert = path.join(dir, `${name}.crt`);
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert,
    '-days', '1', '-nodes', '-subj', `/CN=${name}`, '-addext', `subjectAltName=${san}`,
  ]);
  return { key, cert };
}

function listen(cert: { key: string; cert: string }, body: string, delayMs = 0): Promise<{ server: Server; port: number }> {
  const server = https.createServer(
    { key: fs.readFileSync(cert.key), cert: fs.readFileSync(cert.cert) },
    (_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
      }, delayMs);
    },
  );
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') throw new Error('no port');
      resolve({ server, port: addr.port });
    });
  });
}

describe('OPNsense TLS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-tls-'));
  let pinned: { key: string; cert: string };
  let other: { key: string; cert: string };
  let named: { key: string; cert: string };

  beforeAll(() => {
    pinned = makeCert(dir, 'pinned', 'IP:127.0.0.1');
    other = makeCert(dir, 'other', 'IP:127.0.0.1');
    named = makeCert(dir, 'opnsense.lab', 'DNS:opnsense.lab');
  });

  afterEach(() => {
    delete process.env.SKIP_SSL_VERIFICATION;
    delete process.env.OPNSENSE_CA_CERT;
    resetOpnsenseHttpsAgentForTests();
  });

  it('fails closed when the peer is self-signed and no CA is set', async () => {
    const started = await listen(pinned, '{"result":"ok"}');
    const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    await expect(
      opnsenseHttpsRequest(`https://127.0.0.1:${started.port}/api/firewall/alias/export`, { method: 'GET' }),
    ).rejects.toThrow(/OPNSENSE_CA_CERT/);
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(before);
    started.server.close();
  });

  it('accepts the peer that matches the pinned CA', async () => {
    process.env.OPNSENSE_CA_CERT = pinned.cert;
    const started = await listen(pinned, '{"result":"ok"}');
    const res = await opnsenseHttpsRequest(`https://127.0.0.1:${started.port}/api/firewall/alias/export`, { method: 'GET' });
    expect(res.ok).toBe(true);
    await expect(res.json()).resolves.toEqual({ result: 'ok' });
    started.server.close();
  });

  it('rejects a peer that does not chain to the pinned CA', async () => {
    process.env.OPNSENSE_CA_CERT = pinned.cert;
    const started = await listen(other, '{"result":"ok"}');
    await expect(
      opnsenseHttpsRequest(`https://127.0.0.1:${started.port}/api/firewall/alias/export`, { method: 'GET' }),
    ).rejects.toThrow(/OPNSENSE_CA_CERT|certificate/i);
    started.server.close();
  });

  it('still checks the hostname when the CA is pinned', async () => {
    process.env.OPNSENSE_CA_CERT = named.cert;
    const started = await listen(named, '{"result":"ok"}');
    await expect(
      opnsenseHttpsRequest(`https://127.0.0.1:${started.port}/api/firewall/alias/export`, { method: 'GET' }),
    ).rejects.toThrow(/hostname|ALTNAME|OPNSENSE_CA_CERT/i);
    started.server.close();
  });

  it('does not disable TLS for any other host', async () => {
    process.env.SKIP_SSL_VERIFICATION = 'true';
    const slow = await listen(pinned, '{"result":"ok"}', 300);
    const outsider = await listen(other, '{"no":"pe"}', 0);
    const call = opnsenseHttpsRequest(`https://127.0.0.1:${slow.port}/api/firewall/alias/export`, { method: 'GET' });
    const foreign = new Promise((resolve, reject) => {
      const req = https.get(
        { hostname: '127.0.0.1', port: outsider.port, rejectUnauthorized: true, ca: fs.readFileSync(pinned.cert) },
        () => resolve('accepted'),
      );
      req.on('error', reject);
    });
    await expect(foreign).rejects.toThrow();
    await expect(call).resolves.toMatchObject({ ok: true });
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    slow.server.close();
    outsider.server.close();
  });

  it('refuses to run when skip and a CA pin are both set', async () => {
    process.env.SKIP_SSL_VERIFICATION = 'true';
    process.env.OPNSENSE_CA_CERT = pinned.cert;
    await expect(
      opnsenseHttpsRequest('https://127.0.0.1:9/api/firewall/alias/export', { method: 'GET' }),
    ).rejects.toThrow(/SKIP_SSL_VERIFICATION/);
    await expect(
      opnsenseHttpsRequest('https://127.0.0.1:9/api/firewall/alias/export', { method: 'GET' }),
    ).rejects.toThrow(/OPNSENSE_CA_CERT/);
  });

  it('reads a PEM value and a path', () => {
    const pem = fs.readFileSync(pinned.cert, 'utf8');
    expect(resolveOpnsenseCaPem(pem)).toContain('BEGIN CERTIFICATE');
    expect(resolveOpnsenseCaPem(pinned.cert)).toContain('BEGIN CERTIFICATE');
    expect(() => resolveOpnsenseCaPem('/no/such/opnsense-ca.pem')).toThrow(/not readable/);
  });
});
