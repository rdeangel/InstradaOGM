// API endpoint to check if a user needs to change their password
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

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

    // Return whether password change is required
    const response = NextResponse.json(
      { mustChangePassword: user.mustChangePassword },
      { status: 200 }
    );

    // If password change is required, set a cookie with the user's email
    // This cookie will be used by the password change page to identify the user
    if (user.mustChangePassword) {
      logger.debug('[CHECK-PASSWORD-CHANGE] Setting password_change_email cookie for:', email);

      // Set cookie with appropriate security settings
      // Respect ALLOW_HTTP setting - if HTTP is allowed, don't require secure cookies
      const allowHttp = process.env.ALLOW_HTTP === 'true';
      response.cookies.set('password_change_email', email, {
        path: '/',
        maxAge: 600, // 10 minutes
        httpOnly: false, // Allow client-side access for debugging
        sameSite: 'lax',
        secure: !allowHttp, // Only require HTTPS if HTTP is not explicitly allowed
      });
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

