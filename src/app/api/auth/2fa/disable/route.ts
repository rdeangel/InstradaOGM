import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    const userId = auth.user?.id || null;

    if (!userId) {
      await logAuditEvent({
        userId,
        action: '2FA_DISABLE_FAILURE',
        reason: 'Unauthorized: User not logged in.',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  await logAuditEvent({
    userId,
    action: '2FA_DISABLE_ATTEMPT',
  });

  try {
    // Find the user to ensure they exist
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, is2FAEnabled: true }, // Select minimal fields
    });

    if (!user) {
      await logAuditEvent({
        userId,
        action: '2FA_DISABLE_FAILURE',
        reason: 'User not found.',
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If 2FA is already disabled, just return success
    if (!user.is2FAEnabled) {
        await logAuditEvent({
          userId,
          action: '2FA_DISABLE_SUCCESS',
          reason: '2FA was already disabled.',
        });
        return NextResponse.json({ success: true, message: '2FA is already disabled.' });
    }

    // Update user: disable 2FA and clear related fields
    await prisma.user.update({
      where: { id: userId },
      data: {
        is2FAEnabled: false,
        totpSecret: null,
        backupCodes: null,
      },
    });

    // Session invalidation could be implemented here for enhanced security

    await logAuditEvent({
      userId,
      action: '2FA_DISABLED_SUCCESS',
    });

    return NextResponse.json({ success: true, message: '2FA has been disabled successfully.' });
  } catch (error) {
    logger.error('Error disabling 2FA:', error);
    await logAuditEvent({
      userId,
      action: '2FA_DISABLE_FAILURE',
      reason: 'Database error during 2FA disable.',
    });
    return NextResponse.json({ error: 'Failed to disable 2FA' }, { status: 500 });
  }
  });
}