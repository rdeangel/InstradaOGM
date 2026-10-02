import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAuditEvent } from '@/lib/auditLog';
import { logger } from '@/lib/logger';
import {
  LEGACY_PASSWORD_CHANGE_COOKIE,
  PASSWORD_CHANGE_COOKIE,
  passwordChangeCookieOptions,
  verifyPasswordChangeToken,
} from '@/lib/server/password-change-token';
import { verifySensitiveReauth } from '@/lib/server/sensitive-reauth';

function clearPasswordChangeCookies(response: NextResponse): void {
  const expired = { ...passwordChangeCookieOptions(), maxAge: 0 };
  response.cookies.set(PASSWORD_CHANGE_COOKIE, '', expired);
  response.cookies.set(LEGACY_PASSWORD_CHANGE_COOKIE, '', expired);
}

export async function POST(request: NextRequest) {
  try {
    const { currentPassword, newPassword, totpCode, code, backupCode, isBackupCode } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const headerToken = request.headers.get('cookie')?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${PASSWORD_CHANGE_COOKIE}=`))
      ?.slice(PASSWORD_CHANGE_COOKIE.length + 1);
    const cookieToken = typeof request.cookies?.get === 'function'
      ? request.cookies.get(PASSWORD_CHANGE_COOKIE)?.value
      : undefined;
    const claims = verifyPasswordChangeToken(cookieToken ?? headerToken);

    if (!claims) {
      logger.warn('[CHANGE-PASSWORD-REQUIRED] Missing or invalid password-change token');
      return NextResponse.json({
        message: 'Session expired. Please try logging in again.',
      }, { status: 400 });
    }

    const minLength = parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8');
    if (newPassword.length < minLength) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'New password too short',
        details: { email: claims.email },
        userId: claims.userId,
      });
      return NextResponse.json({
        message: `Password must be at least ${minLength} characters`,
      }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        email: true,
        password: true,
        mustChangePassword: true,
        is2FAEnabled: true,
        totpSecret: true,
        backupCodes: true,
      },
    });

    if (!user) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'User not found',
        details: { email: claims.email },
      });
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    if (!user.mustChangePassword) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'Password change not required for this user',
        details: { email: claims.email },
        userId: user.id,
      });
      return NextResponse.json({ message: 'Password change not required' }, { status: 400 });
    }

    if (!user.password) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'User has no password set',
        details: { email: claims.email },
        userId: user.id,
      });
      return NextResponse.json({ message: 'User has no password set' }, { status: 400 });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'Current password verification failed',
        details: { email: claims.email },
        userId: user.id,
      });
      return NextResponse.json({ message: 'Current password is incorrect' }, { status: 400 });
    }

    if (user.is2FAEnabled) {
      const totp = await verifySensitiveReauth(user, { totpCode, code, backupCode, isBackupCode }, null);
      if (!totp.ok) {
        await logAuditEvent({
          action: 'PASSWORD_CHANGE_FAILURE',
          reason: totp.message,
          details: { email: claims.email },
          userId: user.id,
        });
        return NextResponse.json({
          message: totp.message === 'Current password or authenticator code is required'
            ? 'Authenticator code is required'
            : totp.message,
        }, { status: totp.status });
      }
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'New password is the same as current password',
        details: { email: claims.email },
        userId: user.id,
      });
      return NextResponse.json({ message: 'New password must be different from your current password' }, { status: 400 });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedNewPassword,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    await logAuditEvent({
      action: 'PASSWORD_CHANGE_SUCCESS',
      userId: user.id,
      details: { email: claims.email },
    });

    logger.info(`Password changed successfully for user: ${user.email}`);

    const response = NextResponse.json({
      message: 'Password changed successfully',
    }, { status: 200 });
    clearPasswordChangeCookies(response);
    return response;

  } catch (error) {
    logger.error('Error changing password:', error);
    await logAuditEvent({
      action: 'PASSWORD_CHANGE_FAILURE',
      reason: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    return NextResponse.json({
      message: 'Internal server error',
    }, { status: 500 });
  }
}
