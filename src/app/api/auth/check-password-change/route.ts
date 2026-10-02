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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { mustChangePassword: false },
        { status: 200 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { mustChangePassword: false },
        { status: 200 }
      );
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

