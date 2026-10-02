import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getToken } = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({ getToken }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

process.env.ALLOW_HTTP = 'true';

import { middleware } from '@/middleware';

describe('middleware revoked JWT filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets a valid session through /settings', async () => {
    getToken.mockResolvedValue({ sub: 'u1' });
    const res = await middleware(new NextRequest('http://localhost/settings'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('treats an invalidated JWT on /settings as signed out', async () => {
    getToken.mockResolvedValue({ sub: 'u1', invalidated: true });
    const res = await middleware(new NextRequest('http://localhost/settings'));
    expect(res.headers.get('location')).toBe('http://localhost/login?callbackUrl=%2Fsettings');
  });

  it('redirects a cookie without sub from /settings to login', async () => {
    getToken.mockResolvedValue({});
    const res = await middleware(new NextRequest('http://localhost/settings'));
    expect(res.headers.get('location')).toBe('http://localhost/login?callbackUrl=%2Fsettings');
  });

  it('does not bounce an invalidated JWT on /login back to /', async () => {
    getToken.mockResolvedValue({ invalidated: true, sub: 'u1' });
    const res = await middleware(new NextRequest('http://localhost/login'));
    const location = res.headers.get('location');
    expect(location).toBeNull();
  });
});
