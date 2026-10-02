import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import {
  getSessionIssuedAt,
  revokeOtherCredentials,
  sessionAuthDenied,
  verifySensitiveReauth,
} from '@/lib/server/sensitive-reauth';

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

    const sessionDenied = sessionAuthDenied(auth.method);
    if (sessionDenied) {
      await logAuditEvent({
        userId,
        action: '2FA_DISABLE_FAILURE',
        reason: sessionDenied.message,
      });
      return NextResponse.json({ error: sessionDenied.message }, { status: sessionDenied.status });
    }

  await logAuditEvent({
    userId,
    action: '2FA_DISABLE_ATTEMPT',
  });

  try {
    let data: Record<string, unknown> = {};
    try {
      data = await req.json();
    } catch {
      data = {};
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        is2FAEnabled: true,
        password: true,
        totpSecret: true,
        backupCodes: true,
      },
    });

    if (!user) {
      await logAuditEvent({
        userId,
        action: '2FA_DISABLE_FAILURE',
        reason: 'User not found.',
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.is2FAEnabled) {
        await logAuditEvent({
          userId,
          action: '2FA_DISABLE_SUCCESS',
          reason: '2FA was already disabled.',
        });
        return NextResponse.json({ success: true, message: '2FA is already disabled.' });
    }

    const sessionIat = await getSessionIssuedAt(req);
    const reauth = await verifySensitiveReauth(user, data, sessionIat);
    if (!reauth.ok) {
      await logAuditEvent({
        userId,
        action: '2FA_DISABLE_FAILURE',
        reason: reauth.message,
      });
      return NextResponse.json({ error: reauth.message }, { status: reauth.status });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        is2FAEnabled: false,
        totpSecret: null,
        backupCodes: null,
      },
    });

    await revokeOtherCredentials(userId);

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
