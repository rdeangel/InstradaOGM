import { describe, expect, it } from 'vitest';
import {
  applySignInAuthTime,
  isJwtInvalidatedByPasswordChange,
  stripInvalidatedJwt,
  type AuthTimeToken,
} from './jwt-auth-time';

describe('applySignInAuthTime', () => {
  it('stamps authTime only when this call is a sign-in', () => {
    const token: AuthTimeToken = { iat: 50 };
    applySignInAuthTime(token, true, 100);
    expect(token.authTime).toBe(100);

    applySignInAuthTime(token, false, 999);
    expect(token.authTime).toBe(100);
  });

  it('does not copy a refreshed iat into authTime on a session poll', () => {
    const token: AuthTimeToken = { iat: 500, authTime: 100 };
    applySignInAuthTime(token, false, 500);
    expect(token.authTime).toBe(100);
    expect(token.authTime).not.toBe(token.iat);
  });

  it('does not backfill authTime from iat on a token that predates the claim', () => {
    const token: AuthTimeToken = { iat: 500 };
    applySignInAuthTime(token, false, 500);
    expect(token.authTime).toBeUndefined();
  });
});

describe('isJwtInvalidatedByPasswordChange', () => {
  it('invalidates when passwordChangedAt is newer than authTime', () => {
    expect(isJwtInvalidatedByPasswordChange(new Date(2_000_000), 1_000)).toBe(true);
  });

  it('keeps a session whose authTime is at or after passwordChangedAt', () => {
    expect(isJwtInvalidatedByPasswordChange(new Date(1_000_000), 1_000)).toBe(false);
    expect(isJwtInvalidatedByPasswordChange(new Date(2_000_000), 3_000)).toBe(false);
  });

  it('uses authTime, not iat, so a refreshed session poll does not keep a stolen cookie alive', () => {
    const passwordChangedAt = new Date(2_000_000);
    const authTime = 1_000;
    const iat = 3_000;
    expect(isJwtInvalidatedByPasswordChange(passwordChangedAt, authTime)).toBe(true);
    expect(isJwtInvalidatedByPasswordChange(passwordChangedAt, iat)).toBe(false);
  });

  it('invalidates a legacy JWT that has passwordChangedAt but no authTime', () => {
    expect(isJwtInvalidatedByPasswordChange(new Date(1_000_000), undefined)).toBe(true);
    expect(isJwtInvalidatedByPasswordChange(new Date(1_000_000), null)).toBe(true);
  });

  it('leaves OIDC-only sessions without passwordChangedAt intact', () => {
    expect(isJwtInvalidatedByPasswordChange(null, 1_000)).toBe(false);
    expect(isJwtInvalidatedByPasswordChange(undefined, undefined)).toBe(false);
  });
});

describe('stripInvalidatedJwt', () => {
  it('removes identity claims so getServerSession cannot keep the user', () => {
    const stripped = stripInvalidatedJwt({
      id: 'user-1',
      sub: 'user-1',
      authTime: 100,
      iat: 500,
      role: 'ADMIN',
      username: 'admin',
      groups: [{ id: 'g1', name: 'ops' }],
    });
    expect(stripped.id).toBeUndefined();
    expect(stripped.sub).toBeUndefined();
    expect(stripped.authTime).toBeUndefined();
    expect(stripped.role).toBeUndefined();
    expect(stripped.invalidated).toBe(true);
    expect(stripped.iat).toBe(500);
  });
});
