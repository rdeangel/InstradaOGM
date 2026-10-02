import { describe, expect, it } from 'vitest';
import { isRecentLogin, sessionAuthDenied } from './sensitive-reauth';

describe('isRecentLogin', () => {
  it('accepts a session issued within 10 minutes', () => {
    expect(isRecentLogin(1_000, 1_000 + 599)).toBe(true);
  });

  it('rejects a session older than 10 minutes', () => {
    expect(isRecentLogin(1_000, 1_000 + 601)).toBe(false);
    expect(isRecentLogin(null, 1_000)).toBe(false);
  });
});

describe('sessionAuthDenied', () => {
  it('rejects API keys and allows sessions', () => {
    expect(sessionAuthDenied('session')).toBeNull();
    expect(sessionAuthDenied('apiKey')).toEqual({
      status: 403,
      message: 'This action requires an interactive session',
    });
  });
});
