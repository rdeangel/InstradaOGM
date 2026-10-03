// API endpoint to check if a user needs to change their password
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import {
  LEGACY_PASSWORD_CHANGE_COOKIE,
  PASSWORD_CHANGE_COOKIE,
  passwordChangeCookieOptions,
  signPasswordChangeToken,
} from '@/lib/server/password-change-token';
import {
  assertCredentialAllowed,
  clearCredentialFailures,
  noteCredentialFailure,
} from '@/lib/auth-throttle';
import { getClientIp } from '@/lib/network-utils';

const THROTTLED_MESSAGE = 'Too many attempts. Try again later.';

function throttledResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { message: THROTTLED_MESSAGE, retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email ||
      !password ||
      email.length > 320 ||
      password.length > 1024
    ) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const ip = getClientIp(request);
    const allowed = assertCredentialAllowed(email, ip);
    if (allowed.limited) {
      return throttledResponse(allowed.retryAfterSeconds);
    }

    // Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { username: email },
        ],
      },
      select: {
        id: true,
        email: true,
        password: true,
        mustChangePassword: true,
        is2FAEnabled: true,
      },
    });

    if (!user || !user.password) {
      noteCredentialFailure(email, ip, 'password-check');
      return NextResponse.json(
        { mustChangePassword: false },
        { status: 200 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      noteCredentialFailure(email, ip, 'password-check');
      return NextResponse.json(
        { mustChangePassword: false },
        { status: 200 }
      );
    }

    if (!user.is2FAEnabled) {
      clearCredentialFailures(email);
    }

    const response = NextResponse.json(
      {
        mustChangePassword: user.mustChangePassword,
        requires2FA: !!(user.mustChangePassword && user.is2FAEnabled),
      },
      { status: 200 }
    );

    if (user.mustChangePassword) {
      const token = signPasswordChangeToken(user.id, user.email || email);
      const cookieOptions = passwordChangeCookieOptions();
      response.cookies.set(PASSWORD_CHANGE_COOKIE, token, cookieOptions);
      response.cookies.set(LEGACY_PASSWORD_CHANGE_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    }

    return response;
  } catch (error) {
    logger.error('Error checking password change requirement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

