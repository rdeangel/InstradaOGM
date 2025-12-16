// src/app/api/auth/password-reset/request/route.ts
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/email'; // Assuming an email utility exists
import { generatePasswordResetToken, generatePasswordResetExpiry } from '@/lib/password-reset-tokens';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user with their accounts to determine if they're SSO or local
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        accounts: true,
      },
    });

    // Always return the same generic message for security (prevents user enumeration)
    const genericMessage = 'If an account with that email exists, a password reset link has been sent.';

    if (!user) {
      // For security, don't reveal if the email doesn't exist
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return NextResponse.json({ message: genericMessage }, { status: 200 });
    }

    // Check if user is SSO user (has non-credentials accounts)
    const isSSO = user.accounts.some(account => account.provider !== 'credentials');
    const hasLocalAccount = user.accounts.some(account => account.provider === 'credentials') || user.password;

    if (isSSO && !hasLocalAccount) {
      // SSO user without local password - don't send email but return same message
      logger.info(`Password reset requested for SSO-only user: ${user.email}`);
      return NextResponse.json({ message: genericMessage }, { status: 200 });
    }

    if (!user.password && !hasLocalAccount) {
      // User exists but has no password (shouldn't happen, but safety check)
      logger.info(`Password reset requested for user without password: ${user.email}`);
      return NextResponse.json({ message: genericMessage }, { status: 200 });
    }

    // User is local or has local account - proceed with password reset
    // Generate a secure password reset token using bcrypt
    const { plaintextToken, hashedToken } = await generatePasswordResetToken();
    const passwordResetExpires = generatePasswordResetExpiry(1); // Token valid for 1 hour

    // Save the hashed token and expiry to the user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken, // Store the bcrypt-hashed token
        passwordResetExpires,
      },
    });

    // Send the password reset email with the plaintext token in the URL
    const resetUrl = `${process.env.NEXTAUTH_URL}/auth/password-reset/confirm?token=${plaintextToken}`;
    await sendPasswordResetEmail(user.email!, resetUrl);

    logger.info(`Password reset token generated for local user: ${user.email}`);

    return NextResponse.json({ message: genericMessage }, { status: 200 });

  } catch (error) {
    logger.error('Password reset request error:', error);
    return NextResponse.json({ error: 'An error occurred while processing your request.' }, { status: 500 });
  }
}