import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { authenticator } from 'otplib';
import { logger } from '@/lib/logger';
import { getTotpSecretWithMigration } from '@/lib/totp-encryption';
import { generateBackupCodes, storeBackupCodes, verifyAndConsumeBackupCode } from '@/lib/backup-codes';

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

  try {
    const data = await req.json(); // Capture the full data object
    const { code: token, isBackupCode = false } = data; // Destructure 'code' as 'token'
    // logger.debug(`2FA Verify: Received data: ${JSON.stringify(data)}`); // Removed debug log

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

    let isValid = false;

    if (isBackupCode) {
      // Verify backup code
      if (!user.backupCodes) {
        await logAuditEvent({
          userId,
          action: '2FA_VERIFY_FAILURE',
          reason: 'No backup codes available.',
        });
        return NextResponse.json({ error: 'No backup codes available' }, { status: 400 });
      }

      try {
        // Verify and consume backup code (handles both hashed and plaintext for migration)
        const verification = await verifyAndConsumeBackupCode(userId, token, user.backupCodes);

        if (verification.isValid && verification.updatedCodes !== null) {
          // Update the database with remaining codes
          await prisma.user.update({
            where: { id: userId },
            data: { backupCodes: JSON.stringify(verification.updatedCodes) },
          });

          isValid = true;
        }
      } catch (error) {
        logger.error('Backup code verification error:', error);
        await logAuditEvent({
          userId,
          action: '2FA_VERIFY_FAILURE',
          reason: 'Backup code verification error.',
        });
        return NextResponse.json({ error: 'Invalid backup code' }, { status: 400 });
      }
    } else {
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
    }

    if (isValid) {
      // Generate backup codes for initial 2FA setup (only if 2FA is not already enabled)
      let backupCodes: string[] = [];
      if (!user.is2FAEnabled) {
        backupCodes = generateBackupCodes();

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
      } else {
        // If 2FA is already enabled, just update the flag (shouldn't happen in normal flow)
        await prisma.user.update({
          where: { id: userId },
          data: { is2FAEnabled: true },
        });
      }

      await logAuditEvent({
        userId,
        action: '2FA_VERIFY_SUCCESS',
      });

      // Return backup codes only if this is initial setup
      return NextResponse.json({
        success: true,
        message: '2FA verification successful',
        backupCodes: !user.is2FAEnabled ? backupCodes : undefined
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