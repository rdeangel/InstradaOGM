import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * R23-4: server actions in user.actions.ts call fetch() with Cookie +
 * Content-Type only. Node/undici must not attach Origin or Sec-Fetch-Site,
 * because the CSRF helper allows "both absent".
 */
describe('server-action fetch headers (R23-4)', () => {
  it('user.actions.ts POST fetch only forwards Content-Type and Cookie', () => {
    const src = readFileSync(
      path.resolve(__dirname, 'actions/user.actions.ts'),
      'utf8',
    );
    const post = src.slice(src.indexOf('export async function createUser'));
    const headersBlock = post.slice(post.indexOf('headers: {'), post.indexOf('body:'));
    expect(headersBlock).toMatch(/Content-Type/);
    expect(headersBlock).toMatch(/Cookie/);
    expect(headersBlock).not.toMatch(/[Oo]rigin/);
    expect(headersBlock).not.toMatch(/[Ss]ec-[Ff]etch-[Ss]ite/);
  });

  it('undici fetch with those headers sends neither Origin nor Sec-Fetch-Site', async () => {
    const seen: IncomingMessage['headers'][] = [];
    const server = createServer((req, res) => {
      seen.push(req.headers);
      res.statusCode = 200;
      res.end('{}');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    try {
      const cookieHeader = 'next-auth.session-token=abc';
      await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader && { Cookie: cookieHeader }),
        },
        body: JSON.stringify({ name: 'x' }),
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }

    expect(seen).toHaveLength(1);
    const headers = seen[0];
    expect(headers['content-type']).toMatch(/application\/json/);
    expect(headers.cookie).toBe('next-auth.session-token=abc');
    expect(headers.origin).toBeUndefined();
    expect(headers['sec-fetch-site']).toBeUndefined();
  });
});
