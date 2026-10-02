import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  signPasswordChangeToken,
  verifyPasswordChangeToken,
} from './password-change-token';

describe('password-change token', () => {
  const previousSecret = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-nextauth-secret';
  });

  afterEach(() => {
    process.env.NEXTAUTH_SECRET = previousSecret;
  });

  it('round-trips a signed token', () => {
    const token = signPasswordChangeToken('user-1', 'admin@example.com', 1_700_000_000_000);
    expect(verifyPasswordChangeToken(token, 1_700_000_000_000)).toEqual({
      userId: 'user-1',
      email: 'admin@example.com',
    });
  });

  it('rejects a forged email cookie value', () => {
    expect(verifyPasswordChangeToken('admin@example.com')).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signPasswordChangeToken('user-1', 'admin@example.com', 1_700_000_000_000);
    expect(verifyPasswordChangeToken(token, 1_700_000_000_000 + 601_000)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signPasswordChangeToken('user-1', 'admin@example.com');
    const [payload, sig] = token.split('.');
    const tampered = Buffer.from(JSON.stringify({
      sub: 'user-2',
      email: 'attacker@example.com',
      exp: Math.floor(Date.now() / 1000) + 600,
    })).toString('base64url');
    expect(verifyPasswordChangeToken(`${tampered}.${sig}`)).toBeNull();
    expect(payload).toBeTruthy();
  });
});
