import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAuditEvent } from '@/lib/auditLog';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { currentPassword, newPassword } = await request.json();

    // Validate input
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Get user email from the last login attempt stored in cookies
    // This is set by the login page when password change is required
    const cookieStore = await cookies();
    const userEmail = cookieStore.get('password_change_email')?.value;

    logger.debug('[CHANGE-PASSWORD-REQUIRED] Cookie value:', userEmail);
    logger.debug('[CHANGE-PASSWORD-REQUIRED] All cookies:', cookieStore.getAll());

    if (!userEmail) {
      logger.warn('[CHANGE-PASSWORD-REQUIRED] No password_change_email cookie found');
      return NextResponse.json({
        message: 'Session expired. Please try logging in again.'
      }, { status: 400 });
    }

    // Validate new password length
    const minLength = parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8');
    if (newPassword.length < minLength) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'New password too short',
        details: { email: userEmail },
      });
      return NextResponse.json({ 
        message: `Password must be at least ${minLength} characters` 
      }, { status: 400 });
    }

    // Find the user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userEmail },
          { username: userEmail },
        ],
      },
    });

    if (!user) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'User not found',
        details: { email: userEmail },
      });
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Check if user actually needs to change password
    if (!user.mustChangePassword) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'Password change not required for this user',
        details: { email: userEmail },
        userId: user.id,
      });
      return NextResponse.json({ message: 'Password change not required' }, { status: 400 });
    }

    // Verify the current password
    if (!user.password) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'User has no password set',
        details: { email: userEmail },
        userId: user.id,
      });
      return NextResponse.json({ message: 'User has no password set' }, { status: 400 });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'Current password verification failed',
        details: { email: userEmail },
        userId: user.id,
      });
      return NextResponse.json({ message: 'Current password is incorrect' }, { status: 400 });
    }

    // Check if new password is the same as current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILURE',
        reason: 'New password is the same as current password',
        details: { email: userEmail },
        userId: user.id,
      });
      return NextResponse.json({ message: 'New password must be different from your current password' }, { status: 400 });
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password and clear the mustChangePassword flag
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedNewPassword,
        mustChangePassword: false, // Clear the flag
        passwordChangedAt: new Date(), // Update timestamp
      },
    });

    await logAuditEvent({
      action: 'PASSWORD_CHANGE_SUCCESS',
      userId: user.id,
      details: { email: userEmail },
    });

    logger.info(`Password changed successfully for user: ${user.email}`);

    // Clear the cookie
    const response = NextResponse.json({ 
      message: 'Password changed successfully' 
    }, { status: 200 });
    
    response.cookies.delete('password_change_email');
    
    return response;

  } catch (error) {
    logger.error('Error changing password:', error);
    await logAuditEvent({
      action: 'PASSWORD_CHANGE_FAILURE',
      reason: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    return NextResponse.json({
      message: 'Internal server error'
    }, { status: 500 });
  }
}

