import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getToken } = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({ getToken }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { middleware } from '@/middleware';

describe('middleware HTTPS redirect uses Host, never X-Forwarded-For', () => {
  const origAllowHttp = process.env.ALLOW_HTTP;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ALLOW_HTTP;
    getToken.mockResolvedValue(null);
  });

  afterEach(() => {
    if (origAllowHttp === undefined) {
      delete process.env.ALLOW_HTTP;
    } else {
      process.env.ALLOW_HTTP = origAllowHttp;
    }
  });

  it('redirects to the Host header and ignores a spoofed X-Forwarded-For hostname', async () => {
    const req = new NextRequest('http://localhost:3000/login', {
      headers: {
        host: 'ogm.lan:3000',
        'x-forwarded-for': 'evil.example',
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    const loc = new URL(location!);
    expect(loc.protocol).toBe('https:');
    expect(loc.host).toBe('ogm.lan:3000');
    expect(loc.hostname).not.toBe('evil.example');
    expect(location).not.toContain('evil.example');
  });
});
