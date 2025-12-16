import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { generateBackupCodes, storeBackupCodes, getBackupCodesWithMigration } from '@/lib/backup-codes';

// Note: generateBackupCodes is now imported from @/lib/backup-codes

// GET - Get backup codes status
export async function GET(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    const userId = auth.user?.id || null;

    if (!userId) {
      await logAuditEvent({
        userId,
        action: 'BACKUP_CODES_STATUS_FAILURE',
        reason: 'Unauthorized: User not logged in.',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          is2FAEnabled: true,
          backupCodes: true
        },
      });

      if (!user) {
        await logAuditEvent({
          userId,
          action: 'BACKUP_CODES_STATUS_FAILURE',
          reason: 'User not found.',
        });
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!user.is2FAEnabled) {
        await logAuditEvent({
          userId,
          action: 'BACKUP_CODES_STATUS_FAILURE',
          reason: '2FA not enabled.',
        });
        return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
      }

      // Get backup codes count (handles both hashed and plaintext for migration)
      let backupCodesCount = 0;
      if (user.backupCodes) {
        try {
          const { codes } = await getBackupCodesWithMigration(userId, user.backupCodes);
          backupCodesCount = codes ? codes.length : 0;
        } catch (error) {
          logger.error('Error getting backup codes count:', error);
          backupCodesCount = 0;
        }
      }

      await logAuditEvent({
        userId,
        action: 'BACKUP_CODES_STATUS_SUCCESS',
      });

      return NextResponse.json({
        hasBackupCodes: !!user.backupCodes,
        backupCodesCount,
        isLowOnCodes: backupCodesCount <= 2,
      });

    } catch (error) {
      logger.error('Error getting backup codes status:', error);
      await logAuditEvent({
        userId,
        action: 'BACKUP_CODES_STATUS_FAILURE',
        reason: 'Server error getting backup codes status.',
      });
      return NextResponse.json({ error: 'Failed to get backup codes status' }, { status: 500 });
    }
  });
}

// POST - Regenerate backup codes
export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    const userId = auth.user?.id || null;

    if (!userId) {
      await logAuditEvent({
        userId,
        action: 'BACKUP_CODES_REGENERATE_FAILURE',
        reason: 'Unauthorized: User not logged in.',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          is2FAEnabled: true,
          email: true
        },
      });

      if (!user) {
        await logAuditEvent({
          userId,
          action: 'BACKUP_CODES_REGENERATE_FAILURE',
          reason: 'User not found.',
        });
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!user.is2FAEnabled) {
        await logAuditEvent({
          userId,
          action: 'BACKUP_CODES_REGENERATE_FAILURE',
          reason: '2FA not enabled.',
        });
        return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
      }

      // Generate new backup codes
      const newBackupCodes = generateBackupCodes();

      // Store hashed backup codes
      const storeSuccess = await storeBackupCodes(userId, newBackupCodes);
      if (!storeSuccess) {
        await logAuditEvent({
          userId,
          action: 'BACKUP_CODES_REGENERATE_FAILURE',
          reason: 'Failed to store new backup codes.',
        });
        return NextResponse.json({ error: 'Failed to regenerate backup codes' }, { status: 500 });
      }

      await logAuditEvent({
        userId,
        action: 'BACKUP_CODES_REGENERATED',
        reason: 'User regenerated backup codes.',
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Backup codes regenerated successfully.',
        backupCodes: newBackupCodes,
      });

    } catch (error) {
      logger.error('Error regenerating backup codes:', error);
      await logAuditEvent({
        userId,
        action: 'BACKUP_CODES_REGENERATE_FAILURE',
        reason: 'Server error regenerating backup codes.',
      });
      return NextResponse.json({ error: 'Failed to regenerate backup codes' }, { status: 500 });
    }
  });
}
