/**
 * JWT authTime is the Unix-second instant of the actual sign-in.
 * NextAuth 4.24.x re-stamps `iat` on every GET /api/auth/session, so iat
 * must not be used for "recent login" or session invalidation.
 */

export type AuthTimeToken = {
  authTime?: unknown;
  iat?: unknown;
  id?: unknown;
  sub?: unknown;
  [key: string]: unknown;
};

export function applySignInAuthTime(
  token: AuthTimeToken,
  isSignIn: boolean,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): void {
  if (isSignIn) {
    token.authTime = nowSeconds;
  }
}

export function isJwtInvalidatedByPasswordChange(
  passwordChangedAt: Date | string | number | null | undefined,
  authTime: unknown,
): boolean {
  if (passwordChangedAt == null || passwordChangedAt === '') {
    return false;
  }

  const changedAtMs = passwordChangedAt instanceof Date
    ? passwordChangedAt.getTime()
    : new Date(passwordChangedAt).getTime();
  if (Number.isNaN(changedAtMs)) {
    return false;
  }

  const changedAtSeconds = Math.floor(changedAtMs / 1000);
  if (typeof authTime !== 'number') {
    return true;
  }
  return changedAtSeconds > authTime;
}

export function stripInvalidatedJwt(token: AuthTimeToken): AuthTimeToken {
  const next: AuthTimeToken = { ...token };
  delete next.id;
  delete next.sub;
  delete next.authTime;
  delete next.role;
  delete next.username;
  delete next.groups;
  next.invalidated = true;
  return next;
}
