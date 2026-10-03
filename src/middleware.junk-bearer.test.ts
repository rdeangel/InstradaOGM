import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { middleware } from '@/middleware';

describe('middleware getToken junk Bearer (next-auth 4.24.15)', () => {
  const origAllowHttp = process.env.ALLOW_HTTP;
  const origSecret = process.env.NEXTAUTH_SECRET;
  const secret = 'phase12-test-secret-at-least-32-chars';

  beforeEach(() => {
    process.env.ALLOW_HTTP = 'true';
    process.env.NEXTAUTH_SECRET = secret;
  });

  afterEach(() => {
    if (origAllowHttp === undefined) {
      delete process.env.ALLOW_HTTP;
    } else {
      process.env.ALLOW_HTTP = origAllowHttp;
    }
    if (origSecret === undefined) {
      delete process.env.NEXTAUTH_SECRET;
    } else {
      process.env.NEXTAUTH_SECRET = origSecret;
    }
  });

  it('getToken returns null for a malformed Bearer instead of throwing', async () => {
    const req = new NextRequest('http://localhost/settings', {
      headers: { authorization: 'Bearer not-a-jwt!!!' },
    });
    await expect(getToken({ req, secret, secureCookie: false })).resolves.toBeNull();
  });

  it('redirects /settings with junk Bearer to login and does not return 500', async () => {
    const req = new NextRequest('http://localhost/settings', {
      headers: { authorization: 'Bearer %%%%not-a-jwt' },
    });
    const res = await middleware(req);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.get('location')).toBe('http://localhost/login?callbackUrl=%2Fsettings');
  });
});
