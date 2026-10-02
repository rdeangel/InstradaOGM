import { describe, expect, it } from 'vitest';
import { canActorModifyTarget, shouldAutoLinkOidcByEmail } from './user-role-guards';

const admin = { id: 'admin-1', role: 'ADMIN' };
const superAdmin = { id: 'super-1', role: 'SUPER_ADMIN' };
const user = { id: 'user-1', role: 'USER' };

describe('canActorModifyTarget', () => {
  it('blocks ADMIN creating SUPER_ADMIN', () => {
    expect(canActorModifyTarget(admin, null, { role: 'SUPER_ADMIN' }).allowed).toBe(false);
  });

  it('allows ADMIN creating USER', () => {
    expect(canActorModifyTarget(admin, null, { role: 'USER' }).allowed).toBe(true);
  });

  it('blocks ADMIN promoting USER to SUPER_ADMIN', () => {
    expect(canActorModifyTarget(admin, user, { role: 'SUPER_ADMIN' }).allowed).toBe(false);
  });

  it('blocks ADMIN resetting a SUPER_ADMIN password', () => {
    expect(canActorModifyTarget(admin, superAdmin, { password: true }).allowed).toBe(false);
  });

  it('blocks ADMIN changing a SUPER_ADMIN email or 2FA', () => {
    expect(canActorModifyTarget(admin, superAdmin, { email: true }).allowed).toBe(false);
    expect(canActorModifyTarget(admin, superAdmin, { twoFactor: true }).allowed).toBe(false);
  });

  it('allows SUPER_ADMIN to reset another user password', () => {
    expect(canActorModifyTarget(superAdmin, user, { password: true }).allowed).toBe(true);
  });

  it('blocks SUPER_ADMIN changing their own role', () => {
    expect(canActorModifyTarget(superAdmin, superAdmin, { role: 'ADMIN' }).allowed).toBe(false);
  });
});

describe('shouldAutoLinkOidcByEmail', () => {
  it('auto-links regular users and refuses admin roles', () => {
    expect(shouldAutoLinkOidcByEmail('USER')).toBe(true);
    expect(shouldAutoLinkOidcByEmail('PENDING')).toBe(true);
    expect(shouldAutoLinkOidcByEmail('ADMIN')).toBe(false);
    expect(shouldAutoLinkOidcByEmail('SUPER_ADMIN')).toBe(false);
  });
});
