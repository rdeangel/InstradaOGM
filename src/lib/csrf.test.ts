import { describe, expect, it } from 'vitest';
import { csrfAllowed, type CsrfRequest } from './csrf';

const mutating: CsrfRequest = {
  method: 'POST',
  pathname: '/api/admin/users',
  hasSessionCookie: true,
  hasApiKeyHeader: false,
  secFetchSite: null,
  origin: null,
  host: 'app.example.com',
  forwardedHost: null,
  nextauthUrl: 'https://app.example.com',
};

function check(overrides: Partial<CsrfRequest>): boolean {
  return csrfAllowed({ ...mutating, ...overrides });
}

describe('csrfAllowed', () => {
  it('allows safe methods', () => {
    expect(check({ method: 'GET' })).toBe(true);
    expect(check({ method: 'HEAD', origin: 'https://evil.example' })).toBe(true);
    expect(check({ method: 'OPTIONS', secFetchSite: 'cross-site' })).toBe(true);
  });

  it('allows non-API paths', () => {
    expect(check({ pathname: '/admin/user-management', origin: 'https://evil.example' })).toBe(
      true,
    );
    expect(check({ pathname: '/login', method: 'POST' })).toBe(true);
  });

  it('allows requests with no session cookie', () => {
    expect(
      check({
        hasSessionCookie: false,
        origin: 'https://evil.example',
        secFetchSite: 'cross-site',
      }),
    ).toBe(true);
  });

  it('allows an API-key header even with a session cookie', () => {
    expect(
      check({
        hasApiKeyHeader: true,
        origin: 'https://evil.example',
        secFetchSite: 'cross-site',
      }),
    ).toBe(true);
  });

  it('allows Sec-Fetch-Site same-origin and none', () => {
    expect(check({ secFetchSite: 'same-origin', origin: 'https://evil.example' })).toBe(true);
    expect(check({ secFetchSite: 'none' })).toBe(true);
  });

  it('denies Sec-Fetch-Site cross-site and same-site', () => {
    expect(check({ secFetchSite: 'cross-site' })).toBe(false);
    expect(check({ secFetchSite: 'same-site' })).toBe(false);
  });

  it('allows no Sec-Fetch-Site and no Origin (server-action fetch)', () => {
    expect(check({ secFetchSite: null, origin: null })).toBe(true);
    expect(check({ secFetchSite: '', origin: '' })).toBe(true);
  });

  it('allows Origin equal to Host', () => {
    expect(
      check({
        origin: 'http://192.168.1.50:3000',
        host: '192.168.1.50:3000',
        nextauthUrl: 'https://app.example.com',
      }),
    ).toBe(true);
  });

  it('allows Origin equal to X-Forwarded-Host', () => {
    expect(
      check({
        origin: 'https://app.example.com',
        host: 'instrada-ogm:3000',
        forwardedHost: 'app.example.com',
        nextauthUrl: undefined,
      }),
    ).toBe(true);
  });

  it('allows Origin equal to the NEXTAUTH_URL host', () => {
    expect(
      check({
        origin: 'https://app.example.com',
        host: 'instrada-ogm:3000',
        forwardedHost: null,
        nextauthUrl: 'https://app.example.com',
      }),
    ).toBe(true);
  });

  it('allows Origin with an explicit default port vs a Host without one', () => {
    expect(
      check({
        origin: 'https://app.example.com:443',
        host: 'app.example.com',
        nextauthUrl: undefined,
      }),
    ).toBe(true);
  });

  it('uses the first comma-item of X-Forwarded-Host', () => {
    expect(
      check({
        origin: 'https://app.example.com',
        host: 'instrada-ogm:3000',
        forwardedHost: 'app.example.com, internal.local',
        nextauthUrl: undefined,
      }),
    ).toBe(true);
    expect(
      check({
        origin: 'https://evil.example',
        host: 'instrada-ogm:3000',
        forwardedHost: 'app.example.com, evil.example',
        nextauthUrl: undefined,
      }),
    ).toBe(false);
  });

  it('denies a foreign Origin when Sec-Fetch-Site is absent', () => {
    expect(
      check({
        origin: 'https://evil.example',
        host: 'app.example.com',
        forwardedHost: null,
        nextauthUrl: 'https://app.example.com',
      }),
    ).toBe(false);
  });

  it('denies Origin: null', () => {
    expect(check({ origin: 'null' })).toBe(false);
    expect(check({ origin: 'NULL' })).toBe(false);
  });

  it('denies a chunked __Secure- session cookie with a foreign Origin', () => {
    // Cookie-name matching lives in middleware; this pins the helper once
    // hasSessionCookie is true (as for `__Secure-next-auth.session-token.0`).
    expect(
      check({
        hasSessionCookie: true,
        origin: 'https://evil.example',
        host: 'app.example.com',
      }),
    ).toBe(false);
  });

  it('compares hosts case-insensitively', () => {
    expect(
      check({
        origin: 'https://App.Example.COM',
        host: 'app.example.com',
        nextauthUrl: undefined,
      }),
    ).toBe(true);
  });

  it('denies an unparseable Origin', () => {
    expect(check({ origin: '://not-a-url' })).toBe(false);
  });
});
