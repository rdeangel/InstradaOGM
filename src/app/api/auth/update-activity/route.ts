import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';

// POST /api/auth/update-activity
// Updates the lastActive timestamp for the currently authenticated user.
export async function POST(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user?.id) {
      // No session or user ID found, cannot update
      // Return 200 OK anyway, as this might be called non-critically
      return NextResponse.json({ message: 'No active session found.' }, { status: 200 });
    }

  const userId = auth.user.id;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActive: new Date() },
    });
    // Log success using the audit log
    await logAuditEvent({
        action: 'USER_ACTIVITY_UPDATED',
        userId: userId,
        method: 'API',
        details: {
            apiRoute: '/api/auth/update-activity',
        },
    });
    return NextResponse.json({ message: 'Activity updated successfully.' }, { status: 200 });
  } catch (error) {
    // Log the error using the audit log
    await logAuditEvent({
        action: 'API_ERROR',
        userId: userId,
        method: 'API',
        details: {
            apiRoute: '/api/auth/update-activity',
            error: error instanceof Error ? error.message : 'Unknown error',
        },
    });
    // Return 500 but don't block the user flow if middleware calls this
    return NextResponse.json({ error: 'Failed to update activity.' }, { status: 500 });
  }
  });
}