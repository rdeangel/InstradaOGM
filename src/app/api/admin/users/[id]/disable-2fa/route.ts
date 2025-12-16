import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { Role } from '@/types/opnsense';

// POST /api/admin/users/[id]/disable-2fa - Disable 2FA for a specific user (SUPER_ADMIN only)
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  if (!auth.user) {
    return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
  }

  // Only SUPER_ADMIN can disable 2FA for other users
  if (auth.user.role !== Role.SUPER_ADMIN) {
    const { id } = await context.params;
    await logAuditEvent({
      userId: auth.user.id,
      action: 'ADMIN_2FA_DISABLE_FAILURE',
      details: { targetUserId: id },
      reason: 'Unauthorized: Only SUPER_ADMIN can disable 2FA for other users.',
    });
    return NextResponse.json({ message: 'Unauthorized: Only SUPER_ADMIN can disable 2FA for other users' }, { status: 403 });
  }

  const { id: targetUserId } = await context.params;

  // Prevent SUPER_ADMIN from disabling their own 2FA through this endpoint
  if (auth.user.id === targetUserId) {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'ADMIN_2FA_DISABLE_FAILURE',
      details: { targetUserId },
      reason: 'Cannot disable own 2FA through admin endpoint.',
    });
    return NextResponse.json({ message: 'Cannot disable your own 2FA through this endpoint. Use the account settings instead.' }, { status: 400 });
  }

  await logAuditEvent({
    userId: auth.user.id,
    action: 'ADMIN_2FA_DISABLE_ATTEMPT',
    details: { targetUserId },
  });

  try {
    // Find the target user
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        username: true,
        is2FAEnabled: true
      },
    });

    if (!targetUser) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'ADMIN_2FA_DISABLE_FAILURE',
        details: { targetUserId },
        reason: 'Target user not found.',
      });
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // If 2FA is already disabled, just return success
    if (!targetUser.is2FAEnabled) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'ADMIN_2FA_DISABLE_SUCCESS',
        details: {
          targetUserId,
          targetUserEmail: targetUser.email,
          targetUsername: targetUser.username
        },
        reason: '2FA was already disabled for target user.',
      });
      return NextResponse.json({
        success: true,
        message: '2FA is already disabled for this user.'
      });
    }

    // Disable 2FA for the target user
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        is2FAEnabled: false,
        totpSecret: null,
        backupCodes: null,
      },
    });

    await logAuditEvent({
      userId: auth.user.id,
      action: 'ADMIN_2FA_DISABLED_SUCCESS',
      details: {
        targetUserId,
        targetUserEmail: targetUser.email,
        targetUsername: targetUser.username
      },
    });

    return NextResponse.json({
      success: true,
      message: `2FA has been disabled for user ${targetUser.username || targetUser.email}.`
    });
  } catch (error) {
    logger.error('Error disabling 2FA for user:', error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'ADMIN_2FA_DISABLE_FAILURE',
      details: { targetUserId },
      reason: 'Database error during 2FA disable.',
    });
    return NextResponse.json({ message: 'Failed to disable 2FA' }, { status: 500 });
  }
}

