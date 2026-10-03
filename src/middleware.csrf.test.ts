import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getToken, logger } = vi.hoisted(() => ({
  getToken: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next-auth/jwt', () => ({ getToken }));
vi.mock('@/lib/logger', () => ({ logger }));

import { middleware } from '@/middleware';

function postApi(
  headers: Record<string, string>,
  path = '/api/admin/users',
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers,
  });
}

describe('middleware CSRF check', () => {
  const origAllowHttp = process.env.ALLOW_HTTP;
  const origCsrf = process.env.CSRF_PROTECTION;
  const origNextauth = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALLOW_HTTP = 'true';
    delete process.env.CSRF_PROTECTION;
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    getToken.mockResolvedValue(null);
  });

  afterEach(() => {
    if (origAllowHttp === undefined) delete process.env.ALLOW_HTTP;
    else process.env.ALLOW_HTTP = origAllowHttp;
    if (origCsrf === undefined) delete process.env.CSRF_PROTECTION;
    else process.env.CSRF_PROTECTION = origCsrf;
    if (origNextauth === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = origNextauth;
  });

  it('returns 403 JSON for a cookie-session API write from a foreign Origin', async () => {
    const req = postApi({
      cookie: 'next-auth.session-token=abc',
      origin: 'https://evil.example',
      host: 'localhost:3000',
    });
    const res = await middleware(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      success: false,
      message: 'Cross-site request blocked',
    });
    expect(getToken).not.toHaveBeenCalled();
  });

  it('blocks a chunked __Secure- session cookie with a foreign Origin', async () => {
    const req = postApi({
      cookie: '__Secure-next-auth.session-token.0=chunk',
      origin: 'https://evil.example',
      host: 'localhost:3000',
    });
    const res = await middleware(req);
    expect(res.status).toBe(403);
    expect(getToken).not.toHaveBeenCalled();
  });

  it('logs the block without cookies or body', async () => {
    const req = postApi({
      cookie: 'next-auth.session-token=super-secret-session',
      origin: 'https://evil.example',
      host: 'localhost:3000',
    });
    await middleware(req);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [msg, meta] = logger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(msg).toBe('[CSRF] blocked');
    expect(meta).toMatchObject({
      pathname: '/api/admin/users',
      method: 'POST',
      originHost: 'evil.example',
      host: 'localhost:3000',
    });
    const serialized = JSON.stringify(logger.warn.mock.calls);
    expect(serialized).not.toContain('super-secret-session');
    expect(serialized).not.toMatch(/cookie/i);
    expect(meta).not.toHaveProperty('body');
    expect(meta).not.toHaveProperty('cookies');
  });

  it('allows a server-action fetch with a session cookie and neither SFS nor Origin', async () => {
    const req = postApi({
      cookie: 'next-auth.session-token=abc',
      host: 'localhost:3000',
      'content-type': 'application/json',
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
    expect(getToken).toHaveBeenCalled();
  });

  it('allows same-origin Sec-Fetch-Site', async () => {
    const req = postApi({
      cookie: 'next-auth.session-token=abc',
      'sec-fetch-site': 'same-origin',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it('skips the check when CSRF_PROTECTION=false', async () => {
    process.env.CSRF_PROTECTION = 'false';
    const req = postApi({
      cookie: 'next-auth.session-token=abc',
      origin: 'https://evil.example',
      host: 'localhost:3000',
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
    expect(getToken).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('runs HTTPS redirect before the CSRF check', async () => {
    delete process.env.ALLOW_HTTP;
    const req = postApi({
      cookie: 'next-auth.session-token=abc',
      origin: 'https://evil.example',
      host: 'ogm.lan:3000',
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/^https:\/\/ogm\.lan:3000\//);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
  });
});
