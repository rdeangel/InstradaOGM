import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticator } from 'otplib';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getTotpSecretWithMigration } from '@/lib/totp-encryption';
import { generateBackupCodes, storeBackupCodes } from '@/lib/backup-codes';

const NUM_BACKUP_CODES = 10;
const BACKUP_CODE_LENGTH = 8;

// Note: generateBackupCodes is now imported from @/lib/backup-codes

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    const userId = auth.user?.id || null;

    if (!userId) {
      await logAuditEvent({
        userId,
        action: '2FA_SETUP_FAILURE',
        reason: 'Unauthorized: User not logged in.',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  try {
    const { code } = await req.json();

    if (!code) {
      await logAuditEvent({
        userId,
        action: '2FA_SETUP_FAILURE',
        reason: 'Verification code is required.',
      });
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 });
    }

    // Find the user and their 2FA settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, is2FAEnabled: true },
    });

    if (!user || !user.totpSecret) {
      await logAuditEvent({
        userId,
        action: '2FA_SETUP_FAILURE',
        reason: '2FA not initiated or secret not found.',
      });
      return NextResponse.json({ error: '2FA not initiated or secret not found' }, { status: 400 });
    }

    // If 2FA is already enabled, return an error
    if (user.is2FAEnabled) {
      await logAuditEvent({
        userId,
        action: '2FA_SETUP_FAILURE',
        reason: '2FA is already enabled.',
      });
      return NextResponse.json({ error: '2FA is already enabled' }, { status: 400 });
    }

    // Verify the TOTP code (decrypt secret if needed)
    const plaintextSecret = await getTotpSecretWithMigration(userId, user.totpSecret);
    if (!plaintextSecret) {
      await logAuditEvent({
        userId,
        action: '2FA_SETUP_FAILURE',
        reason: 'Failed to decrypt TOTP secret.',
      });
      return NextResponse.json({ error: 'TOTP secret unavailable' }, { status: 500 });
    }

    const isValid = authenticator.verify({ token: code, secret: plaintextSecret });

    if (!isValid) {
      await logAuditEvent({
        userId,
        action: '2FA_SETUP_FAILURE',
        reason: 'Invalid verification code.',
      });
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes(NUM_BACKUP_CODES, BACKUP_CODE_LENGTH);

    // Store hashed backup codes
    const storeSuccess = await storeBackupCodes(userId, backupCodes);
    if (!storeSuccess) {
      await logAuditEvent({
        userId,
        action: '2FA_SETUP_FAILURE',
        reason: 'Failed to store backup codes.',
      });
      return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 });
    }

    // Update user: enable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: { is2FAEnabled: true },
    });

    await logAuditEvent({
      userId,
      action: '2FA_SETUP_SUCCESS',
    });

    // Return success and the backup codes for the user to save
    return NextResponse.json({
      success: true,
      message: '2FA enabled successfully.',
      backupCodes: backupCodes,
    });

  } catch (error) {
    logger.error('Error setting up 2FA:', error);
    await logAuditEvent({
      userId,
      action: '2FA_SETUP_FAILURE',
      reason: 'Server error during 2FA setup.',
    });
    return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 });
  }
  });
}