import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import {
  verifyPasswordResetTokenWithMigration,
  isValidPasswordResetTokenFormat,
  isPasswordResetTokenExpired
} from '@/lib/password-reset-tokens';

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }

    // Validate token format
    if (!isValidPasswordResetTokenFormat(token)) {
      logger.warn('Invalid password reset token format received');
      return NextResponse.json({ error: 'Invalid token format' }, { status: 400 });
    }

    // Find user with a password reset token (we'll verify the token separately)
    const user = await prisma.user.findFirst({
      orderBy: {
        id: 'asc',
      },
      where: {
        passwordResetToken: {
          not: null,
        },
        passwordResetExpires: {
          not: null,
        },
      },
    });

    if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
      return NextResponse.json({ error: 'Invalid or expired password reset token' }, { status: 400 });
    }

    // Check if token has expired
    if (isPasswordResetTokenExpired(user.passwordResetExpires)) {
      logger.warn(`Expired password reset token used for user: ${user.email}`);
      return NextResponse.json({ error: 'Token has expired' }, { status: 400 });
    }

    // Verify the token with migration support
    const verification = await verifyPasswordResetTokenWithMigration(token, user.passwordResetToken);

    if (!verification.isValid) {
      logger.warn(`Invalid password reset token used for user: ${user.email}`);
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare update data
    const updateData: {
      password: string;
      passwordResetToken: null;
      passwordResetExpires: null;
    } = {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    };

    // If token needed migration, update with new bcrypt hash for future use
    if (verification.needsMigration && verification.newHash) {
      logger.info(`Migrated password reset token from SHA256 to bcrypt for user: ${user.email}`);
      // Note: We're clearing the token anyway, so no need to store the new hash
    }

    // Update user's password and clear reset token fields
    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    logger.info(`Password reset completed successfully for user: ${user.email}`);
    return NextResponse.json({ message: 'Password has been reset successfully' }, { status: 200 });

  } catch (error) {
    logger.error('Password reset confirmation error:', error);
    return NextResponse.json({ error: 'An error occurred while resetting your password.' }, { status: 500 });
  }
}