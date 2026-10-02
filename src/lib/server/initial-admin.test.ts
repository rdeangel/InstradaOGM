import { describe, expect, it } from 'vitest';
import { resolveInitialAdminPassword, shouldCreateSeedAdmin } from './initial-admin';

describe('shouldCreateSeedAdmin', () => {
  it('creates the seed admin only when the user table is empty', () => {
    expect(shouldCreateSeedAdmin(0)).toBe(true);
    expect(shouldCreateSeedAdmin(1)).toBe(false);
    expect(shouldCreateSeedAdmin(3)).toBe(false);
  });
});

describe('resolveInitialAdminPassword', () => {
  it('uses INITIAL_ADMIN_PASSWORD when set', () => {
    expect(resolveInitialAdminPassword('  env-secret  ')).toEqual({
      password: 'env-secret',
      generated: false,
    });
  });

  it('generates a random password when the env value is missing', () => {
    expect(resolveInitialAdminPassword(undefined, () => 'generated-once')).toEqual({
      password: 'generated-once',
      generated: true,
    });
  });

  it('does not fall back to the word admin', () => {
    const { password, generated } = resolveInitialAdminPassword(undefined, () => 'not-admin');
    expect(generated).toBe(true);
    expect(password).not.toBe('admin');
  });
});
