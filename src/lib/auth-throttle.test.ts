import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auditLog', () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('./logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  assertCredentialAllowed,
  clearCredentialFailures,
  noteCredentialFailure,
  noteResetRequest,
  resetAuthThrottleForTests,
} from './auth-throttle';

const T0 = 1_700_000_000_000;

afterEach(() => {
  resetAuthThrottleForTests();
  delete process.env.AUTH_THROTTLE_ENABLED;
  delete process.env.AUTH_LOGIN_MAX_FAILURES;
  delete process.env.AUTH_LOGIN_IP_MAX_FAILURES;
  delete process.env.AUTH_RESET_EMAIL_MAX;
  delete process.env.AUTH_RESET_IP_MAX;
  delete process.env.AUTH_LOGIN_LOCK_SEC;
  delete process.env.AUTH_LOGIN_WINDOW_SEC;
});

describe('credential throttle', () => {
  it('locks the account on the attempt after the 5th failure', () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '5';
    for (let i = 0; i < 5; i++) {
      const r = noteCredentialFailure('Admin@Example.com', '10.0.0.8', 'authorize', T0 + i * 10_000);
      expect(r.limited).toBe(false);
    }
    const sixth = noteCredentialFailure('admin@example.com', '10.0.0.9', 'authorize', T0 + 60_000);
    expect(sixth.limited).toBe(true);
    expect(sixth.retryAfterSeconds).toBe(900);
    const seventh = noteCredentialFailure('admin@example.com', '10.1.1.1', 'password-check', T0 + 70_000);
    expect(seventh.limited).toBe(true);
    expect(assertCredentialAllowed('admin@example.com', null, T0 + 70_000).limited).toBe(true);
  });

  it('coalesces authorize and password-check inside 2s into one failure', () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '2';
    expect(noteCredentialFailure('ada', '10.0.0.2', 'authorize', T0).limited).toBe(false);
    expect(noteCredentialFailure('ada', '10.0.0.2', 'password-check', T0 + 500).limited).toBe(false);
    expect(noteCredentialFailure('ada', '10.0.0.2', 'authorize', T0 + 5_000).limited).toBe(false);
    expect(noteCredentialFailure('ada', '10.0.0.2', 'authorize', T0 + 10_000).limited).toBe(true);
  });

  it('counts each rapid authorize/password-check pair once and locks on the sixth', () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '5';
    for (let i = 0; i < 12; i++) {
      const t = T0 + i * 300;
      const auth = noteCredentialFailure('ada', '10.0.0.2', 'authorize', t);
      noteCredentialFailure('ada', '10.0.0.2', 'password-check', t + 50);
      if (i < 5) {
        expect(auth.limited).toBe(false);
      } else {
        expect(auth.limited).toBe(true);
      }
    }
    expect(assertCredentialAllowed('ada', '10.0.0.2', T0 + 12 * 300).limited).toBe(true);
  });

  it('counts a second password-check after a coalesced pair', () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '2';
    expect(noteCredentialFailure('ada', '10.0.0.2', 'authorize', T0).limited).toBe(false);
    expect(noteCredentialFailure('ada', '10.0.0.2', 'password-check', T0 + 50).limited).toBe(false);
    expect(noteCredentialFailure('ada', '10.0.0.2', 'password-check', T0 + 100).limited).toBe(false);
    expect(noteCredentialFailure('ada', '10.0.0.2', 'authorize', T0 + 150).limited).toBe(true);
  });

  it('counts two authorize calls inside 2s separately', () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '2';
    expect(noteCredentialFailure('ada', '10.0.0.2', 'authorize', T0).limited).toBe(false);
    expect(noteCredentialFailure('ada', '10.0.0.2', 'authorize', T0 + 100).limited).toBe(false);
    expect(noteCredentialFailure('ada', '10.0.0.2', 'authorize', T0 + 200).limited).toBe(true);
  });

  it('null ip does not share an ip bucket across accounts', () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '5';
    process.env.AUTH_LOGIN_IP_MAX_FAILURES = '1';
    const a = noteCredentialFailure('ada', null, 'authorize', T0);
    const b = noteCredentialFailure('grace', null, 'authorize', T0 + 5_000);
    expect(a.limited).toBe(false);
    expect(b.limited).toBe(false);
  });

  it('locks the ip bucket without locking a different account on a different ip', () => {
    process.env.AUTH_LOGIN_IP_MAX_FAILURES = '2';
    noteCredentialFailure('ada', '10.0.0.5', 'authorize', T0);
    noteCredentialFailure('grace', '10.0.0.5', 'authorize', T0 + 5_000);
    expect(assertCredentialAllowed('hex', '10.0.0.5', T0 + 6_000).limited).toBe(true);
    expect(assertCredentialAllowed('hex', '10.0.0.6', T0 + 6_000).limited).toBe(false);
  });

  it('clearCredentialFailures resets the account and leaves the ip count', () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '2';
    process.env.AUTH_LOGIN_IP_MAX_FAILURES = '3';
    noteCredentialFailure('ada', '10.0.0.5', 'authorize', T0);
    clearCredentialFailures('ada');
    expect(noteCredentialFailure('ada', '10.0.0.5', 'authorize', T0 + 5_000).limited).toBe(false);
    noteCredentialFailure('grace', '10.0.0.5', 'authorize', T0 + 10_000);
    expect(assertCredentialAllowed('ada', '10.0.0.5', T0 + 11_000).limited).toBe(true);
    expect(assertCredentialAllowed('ada', '10.0.0.6', T0 + 11_000).limited).toBe(false);
  });

  it('allows again after the lock expires', () => {
    process.env.AUTH_LOGIN_MAX_FAILURES = '1';
    process.env.AUTH_LOGIN_LOCK_SEC = '900';
    expect(noteCredentialFailure('ada', null, 'authorize', T0).limited).toBe(false);
    const locked = noteCredentialFailure('ada', null, 'authorize', T0 + 1_000);
    expect(locked.limited).toBe(true);
    expect(assertCredentialAllowed('ada', null, T0 + 1_000 + 899_000).limited).toBe(true);
    expect(assertCredentialAllowed('ada', null, T0 + 1_000 + 900_000).limited).toBe(false);
  });
});

describe('reset throttle', () => {
  it('limits the email and still limits an unknown address with the same function', () => {
    process.env.AUTH_RESET_EMAIL_MAX = '2';
    expect(noteResetRequest('A@Example.com', '10.0.0.1', T0).limited).toBe(false);
    expect(noteResetRequest('a@example.com', '10.0.0.2', T0 + 1000).limited).toBe(false);
    const third = noteResetRequest('a@example.com', '10.0.0.3', T0 + 2000);
    expect(third.limited).toBe(true);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('limits the ip across different emails', () => {
    process.env.AUTH_RESET_IP_MAX = '2';
    noteResetRequest('a@example.com', '10.0.0.9', T0);
    noteResetRequest('b@example.com', '10.0.0.9', T0 + 1000);
    expect(noteResetRequest('c@example.com', '10.0.0.9', T0 + 2000).limited).toBe(true);
    expect(noteResetRequest('c@example.com', null, T0 + 3000).limited).toBe(false);
  });

  it('does not advance the email counter when the ip is already limited', () => {
    process.env.AUTH_RESET_EMAIL_MAX = '3';
    process.env.AUTH_RESET_IP_MAX = '1';
    expect(noteResetRequest('a@example.com', '10.0.0.1', T0).limited).toBe(false);
    expect(noteResetRequest('a@example.com', '10.0.0.1', T0 + 1000).limited).toBe(true);
    expect(noteResetRequest('a@example.com', '10.0.0.1', T0 + 2000).limited).toBe(true);
    expect(noteResetRequest('a@example.com', '10.0.0.2', T0 + 3000).limited).toBe(false);
    expect(noteResetRequest('a@example.com', '10.0.0.3', T0 + 4000).limited).toBe(false);
    expect(noteResetRequest('a@example.com', '10.0.0.4', T0 + 5000).limited).toBe(true);
  });
});
