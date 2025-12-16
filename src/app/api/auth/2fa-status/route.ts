import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  const userId = auth.user.id;

  try {
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
        action: '2FA_STATUS_CHECK_FAILURE',
        reason: 'User not found.',
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await logAuditEvent({
      userId,
      action: '2FA_STATUS_CHECK_SUCCESS',
    });

    return NextResponse.json({
      is2FAEnabled: user.is2FAEnabled,
      hasSecret: !!user.totpSecret,
      hasBackupCodes: !!user.backupCodes,
      backupCodesCount: user.backupCodes ? JSON.parse(user.backupCodes).length : 0,
    });
  } catch (error) {
    logger.error('Error checking 2FA status:', error);
    await logAuditEvent({
      userId,
      action: '2FA_STATUS_CHECK_FAILURE',
      reason: 'Server error during 2FA status check.',
    });
    return NextResponse.json({ error: 'Failed to check 2FA status' }, { status: 500 });
  }
  });
}