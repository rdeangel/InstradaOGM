import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { storeTotpSecret } from '@/lib/totp-encryption';
import { authenticator } from 'otplib';
import { generateBackupCodes, storeBackupCodes } from '@/lib/backup-codes';

// Generate a TOTP secret using proper TOTP secret generation
function generateTOTPSecret(): string {
  return authenticator.generateSecret();
}

// Note: generateBackupCodes is now imported from @/lib/backup-codes

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    const userId = auth.user?.id || null;

    if (!userId) {
      await logAuditEvent({
        userId,
        action: '2FA_ENABLE_FAILURE',
        reason: 'Unauthorized: User not logged in.',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  await logAuditEvent({
    userId,
    action: '2FA_ENABLE_ATTEMPT',
  });

  try {
    // Find the user to ensure they exist
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, is2FAEnabled: true, email: true },
    });

    if (!user) {
      await logAuditEvent({
        userId,
        action: '2FA_ENABLE_FAILURE',
        reason: 'User not found.',
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If 2FA is already enabled, return the existing secret
    if (user.is2FAEnabled) {
      await logAuditEvent({
        userId,
        action: '2FA_ENABLE_FAILURE',
        reason: '2FA is already enabled.',
      });
      return NextResponse.json({ error: '2FA is already enabled' }, { status: 400 });
    }

    // Generate new TOTP secret and backup codes
    const totpSecret = generateTOTPSecret();
    const backupCodes = generateBackupCodes();

    // Store encrypted TOTP secret
    const storeSecretSuccess = await storeTotpSecret(userId, totpSecret);
    if (!storeSecretSuccess) {
      await logAuditEvent({
        userId,
        action: '2FA_ENABLE_FAILURE',
        reason: 'Failed to encrypt and store TOTP secret.',
      });
      return NextResponse.json({ error: 'Failed to enable 2FA' }, { status: 500 });
    }

    // Store hashed backup codes
    const storeCodesSuccess = await storeBackupCodes(userId, backupCodes);
    if (!storeCodesSuccess) {
      await logAuditEvent({
        userId,
        action: '2FA_ENABLE_FAILURE',
        reason: 'Failed to hash and store backup codes.',
      });
      return NextResponse.json({ error: 'Failed to enable 2FA' }, { status: 500 });
    }

    // Update user: enable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: { is2FAEnabled: true },
    });

    await logAuditEvent({
      userId,
      action: '2FA_ENABLED_SUCCESS',
    });

    return NextResponse.json({ 
      success: true, 
      message: '2FA has been enabled successfully.',
      totpSecret,
      backupCodes,
      qrCodeUrl: `otpauth://totp/${encodeURIComponent(user.email || 'user')}?secret=${totpSecret}&issuer=OPNsense%20Group%20Manager`
    });
  } catch (error) {
    logger.error('Error enabling 2FA:', error);
    await logAuditEvent({
      userId,
      action: '2FA_ENABLE_FAILURE',
      reason: 'Database error during 2FA enable.',
    });
    return NextResponse.json({ error: 'Failed to enable 2FA' }, { status: 500 });
  }
  });
}