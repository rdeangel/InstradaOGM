import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { authenticator } from 'otplib';
import { logger } from '@/lib/logger';
import { getTotpSecretWithMigration } from '@/lib/totp-encryption';
import { generateBackupCodes, storeBackupCodes } from '@/lib/backup-codes';
import { getSessionIssuedAt, sessionAuthDenied, verifySensitiveReauth } from '@/lib/server/sensitive-reauth';

// Note: generateBackupCodes is now imported from @/lib/backup-codes

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    const userId = auth.user?.id || null;

    if (!userId) {
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: 'Unauthorized: User not logged in.',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionDenied = sessionAuthDenied(auth.method);
    if (sessionDenied) {
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: sessionDenied.message,
      });
      return NextResponse.json({ error: sessionDenied.message }, { status: sessionDenied.status });
    }

  try {
    const data = await req.json(); // Capture the full data object
    const { code: token } = data;

    if (!token) {
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: 'No token provided.',
      });
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Find the user and their 2FA settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        is2FAEnabled: true,
        totpSecret: true,
        backupCodes: true
      },
    });

    if (!user) {
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: 'User not found.',
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.is2FAEnabled) {
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: '2FA is already enabled.',
      });
      return NextResponse.json({ error: '2FA is already enabled. Disable it first.' }, { status: 400 });
    }

    // Re-authentication (current password) is required before the code is checked.
    // Only the password may satisfy it here: the body's `code` is the first
    // authenticator token being enrolled, not a second factor, and passwordless
    // accounts confirm with a recent sign-in instead.
    const sessionIat = await getSessionIssuedAt(req);
    const reauth = await verifySensitiveReauth(user, { currentPassword: data.currentPassword }, sessionIat);
    if (!reauth.ok) {
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: reauth.message,
      });
      return NextResponse.json({ error: reauth.message, message: reauth.message }, { status: reauth.status });
    }

    let isValid = false;

    // Verify TOTP token
    if (!user.totpSecret) {
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: 'No TOTP secret available.',
      });
      return NextResponse.json({ error: 'No TOTP secret available' }, { status: 400 });
    }

    try {
      // Decrypt TOTP secret (handles both encrypted and plaintext for migration)
      const plaintextSecret = await getTotpSecretWithMigration(userId, user.totpSecret);
      if (!plaintextSecret) {
        await logAuditEvent({
          userId,
          action: '2FA_VERIFY_FAILURE',
          reason: 'Failed to decrypt TOTP secret.',
        });
        return NextResponse.json({ error: 'TOTP secret unavailable' }, { status: 500 });
      }

      logger.debug(`Verifying TOTP: Token=${token}, Secret=***`); // Don't log secret
      isValid = authenticator.verify({
        token: token,
        secret: plaintextSecret
      });
      logger.debug(`TOTP verification result: ${isValid}`); // Log verification result
    } catch (error) {
      logger.error('TOTP verification error:', error);
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: 'TOTP verification error.',
      });
      return NextResponse.json({ error: 'Invalid TOTP token' }, { status: 400 });
    }

    if (isValid) {
      // Enrolment completes here: generate the backup codes (returned once) and enable 2FA
      const backupCodes = generateBackupCodes();

      // Store hashed backup codes
      const storeSuccess = await storeBackupCodes(userId, backupCodes);
      if (!storeSuccess) {
        await logAuditEvent({
          userId,
          action: '2FA_VERIFY_FAILURE',
          reason: 'Failed to store backup codes.',
        });
        return NextResponse.json({ error: 'Failed to complete 2FA setup' }, { status: 500 });
      }

      // Set 2FA to enabled
      await prisma.user.update({
        where: { id: userId },
        data: { is2FAEnabled: true },
      });

      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_SUCCESS',
      });

      return NextResponse.json({
        success: true,
        message: '2FA verification successful',
        backupCodes,
      });
    } else {
      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_FAILURE',
        reason: 'Invalid token provided.',
      });
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Error verifying 2FA:', error);
    await logAuditEvent({
      userId,
      action: '2FA_VERIFY_FAILURE',
      reason: 'Server error during 2FA verification.',
    });
    return NextResponse.json({ error: 'Failed to verify 2FA' }, { status: 500 });
  }
  });
}