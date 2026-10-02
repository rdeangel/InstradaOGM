import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import bcrypt from 'bcryptjs';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import {
  getSessionIssuedAt,
  revokeOtherCredentials,
  sessionAuthDenied,
  verifySensitiveReauth,
} from '@/lib/server/sensitive-reauth';

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

    const sessionDenied = sessionAuthDenied(auth.method);
    if (sessionDenied) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'SET_PASSWORD_FAILURE',
        reason: sessionDenied.message,
      });
      return NextResponse.json({ message: sessionDenied.message }, { status: sessionDenied.status });
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
    const currentUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        password: true,
        is2FAEnabled: true,
        totpSecret: true,
        backupCodes: true,
      },
    });

    if (!currentUser) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'SET_PASSWORD_FAILURE',
        reason: 'User not found',
      });
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const sessionIat = await getSessionIssuedAt(req);
    const reauth = await verifySensitiveReauth(currentUser, data, sessionIat);
    if (!reauth.ok) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'SET_PASSWORD_FAILURE',
        reason: reauth.message,
      });
      return NextResponse.json({ message: reauth.message }, { status: reauth.status });
    }

    if (currentUser.password) {
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
      data: { password: hashedPassword, passwordChangedAt: new Date() },
    });
    await revokeOtherCredentials(auth.user.id);
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
