import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import {
  hashPasswordResetToken,
  isValidPasswordResetTokenFormat,
  isPasswordResetTokenExpired,
  PASSWORD_RESET_INVALID_MESSAGE,
} from '@/lib/password-reset-tokens';

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();

    if (
      typeof token !== 'string' ||
      typeof password !== 'string' ||
      !token ||
      !password ||
      password.length > 1024
    ) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }

    const minLength = parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8', 10);
    if (password.length < minLength) {
      return NextResponse.json(
        { error: `Password must be at least ${minLength} characters` },
        { status: 400 },
      );
    }

    if (!isValidPasswordResetTokenFormat(token)) {
      logger.warn('Password reset confirm failed: invalid token');
      return NextResponse.json({ error: PASSWORD_RESET_INVALID_MESSAGE }, { status: 400 });
    }

    const tokenHash = hashPasswordResetToken(token.toLowerCase());
    const user = await prisma.user.findUnique({
      where: { passwordResetTokenHash: tokenHash },
      select: { id: true, email: true, passwordResetExpires: true },
    });
    if (!user || isPasswordResetTokenExpired(user.passwordResetExpires)) {
      logger.warn('Password reset confirm failed: invalid token');
      return NextResponse.json({ error: PASSWORD_RESET_INVALID_MESSAGE }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // Single-use: the conditional update consumes the token atomically; a concurrent second confirm matches 0 rows.
    const { count } = await prisma.user.updateMany({
      where: { id: user.id, passwordResetTokenHash: tokenHash },
      data: {
        password: hashedPassword,
        passwordResetTokenHash: null,
        passwordResetExpires: null,
        passwordChangedAt: new Date(),
      },
    });
    if (count !== 1) {
      logger.warn('Password reset confirm failed: invalid token');
      return NextResponse.json({ error: PASSWORD_RESET_INVALID_MESSAGE }, { status: 400 });
    }

    await prisma.session.deleteMany({ where: { userId: user.id } });

    logger.info(`Password reset completed successfully for user: ${user.id}`);
    return NextResponse.json({ message: 'Password has been reset successfully' }, { status: 200 });

  } catch (error) {
    logger.error('Password reset confirmation error:', error);
    return NextResponse.json({ error: 'An error occurred while resetting your password.' }, { status: 500 });
  }
}
