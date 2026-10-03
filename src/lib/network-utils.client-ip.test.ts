import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logger } = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('./logger', () => ({ logger }));

import { getClientIp } from './network-utils';

function fakeRequest(headers: Record<string, string | null>) {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  };
}

describe('getClientIp', () => {
  const origEnv = process.env.NODE_ENV;
  const origFlag = (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
  });

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    if (origFlag) {
      (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard = origFlag;
    } else {
      delete (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard;
    }
  });

  it('returns x-ogm-client-ip when the guard flag is set and ignores XFF', () => {
    (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard = true;
    const ip = getClientIp(
      fakeRequest({
        'x-ogm-client-ip': '10.0.0.9',
        'x-forwarded-for': '1.1.1.1',
        'x-real-ip': '8.8.8.8',
      })
    );
    expect(ip).toBe('10.0.0.9');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns null when the guard flag is set and the header is missing', () => {
    (globalThis as { __ogmXffGuard?: boolean }).__ogmXffGuard = true;
    expect(getClientIp(fakeRequest({ 'x-forwarded-for': '1.1.1.1' }))).toBeNull();
  });

  it('fails closed in production when the guard is missing and logs once', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    const { getClientIp: freshGet } = await import('./network-utils');
    const { logger: freshLogger } = await import('./logger');

    expect(freshGet(fakeRequest({ 'x-forwarded-for': '10.0.0.9' }))).toBeNull();
    expect(freshGet(fakeRequest({ 'x-forwarded-for': '10.0.0.9' }))).toBeNull();
    expect(freshLogger.error).toHaveBeenCalledTimes(1);
    expect(String(freshLogger.error.mock.calls[0][0])).toContain('xff-guard is not loaded');
  });

  it('falls back to rightmost XFF in test env when the guard is missing', () => {
    process.env.NODE_ENV = 'test';
    expect(
      getClientIp(fakeRequest({ 'x-forwarded-for': '1.1.1.1, 10.0.0.9' }))
    ).toBe('10.0.0.9');
  });

  it('falls back to X-Real-IP in test env when XFF is absent', () => {
    process.env.NODE_ENV = 'test';
    expect(getClientIp(fakeRequest({ 'x-real-ip': '::ffff:10.0.0.9' }))).toBe('10.0.0.9');
  });
});
