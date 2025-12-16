import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import bcrypt from 'bcryptjs';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

  // Only allow local users to set password
  // Type guard to check if user has password property (local user)
  const hasPassword = 'password' in auth.user;
  if (!hasPassword) {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'SET_PASSWORD_FAILURE',
      reason: 'Forbidden: Only local users can set password.',
    });
    return NextResponse.json({ message: 'Only local users can set password.' }, { status: 403 });
  }

  let data;
  try {
    data = await req.json();
  } catch (error) {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'SET_PASSWORD_FAILURE',
      reason: `Invalid JSON body: ${error instanceof Error ? error.message : String(error)}`,
    });
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const { password } = data;
  const minLength = parseInt(process.env.AUTH_PASSWORD_MIN_LENGTH || '8');
  if (!password || typeof password !== 'string' || password.length < minLength) {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'SET_PASSWORD_FAILURE',
      reason: `Password must be at least ${minLength} characters`,
    });
    return NextResponse.json({ message: `Password must be at least ${minLength} characters` }, { status: 400 });
  }

  try {
    // Check if new password is the same as current password
    const currentUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { password: true },
    });

    if (currentUser?.password) {
      const isSamePassword = await bcrypt.compare(password, currentUser.password);
      if (isSamePassword) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'SET_PASSWORD_FAILURE',
          reason: 'New password is the same as current password',
        });
        return NextResponse.json({ message: 'New password must be different from your current password' }, { status: 400 });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { password: hashedPassword },
    });
    await logAuditEvent({
      userId: auth.user.id,
      action: 'SET_PASSWORD_SUCCESS',
    });
    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    await logAuditEvent({
      userId: auth.user.id,
      action: 'SET_PASSWORD_FAILURE',
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
  });
}