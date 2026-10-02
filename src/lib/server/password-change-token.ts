import crypto from 'crypto';

export const PASSWORD_CHANGE_COOKIE = 'password_change_token';
export const LEGACY_PASSWORD_CHANGE_COOKIE = 'password_change_email';
export const PASSWORD_CHANGE_TOKEN_TTL_SECONDS = 600;

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required to sign password-change tokens');
  }
  return secret;
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signPasswordChangeToken(
  userId: string,
  email: string,
  nowMs: number = Date.now(),
): string {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    email,
    exp: Math.floor(nowMs / 1000) + PASSWORD_CHANGE_TOKEN_TTL_SECONDS,
  })).toString('base64url');
  return `${payload}.${signPayload(payload, getSecret())}`;
}

export function verifyPasswordChangeToken(
  token: string | undefined,
  nowMs: number = Date.now(),
): { userId: string; email: string } | null {
  if (!token || !token.includes('.')) {
    return null;
  }
  const dot = token.lastIndexOf('.');
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = signPayload(payload, getSecret());
  } catch {
    return null;
  }
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
      email?: unknown;
      exp?: unknown;
    };
    if (typeof data.exp !== 'number' || data.exp < Math.floor(nowMs / 1000)) {
      return null;
    }
    if (typeof data.sub !== 'string' || typeof data.email !== 'string') {
      return null;
    }
    return { userId: data.sub, email: data.email };
  } catch {
    return null;
  }
}

export function passwordChangeCookieOptions(): {
  path: string;
  maxAge: number;
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
} {
  const allowHttp = process.env.ALLOW_HTTP === 'true';
  return {
    path: '/',
    maxAge: PASSWORD_CHANGE_TOKEN_TTL_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: !allowHttp,
  };
}
