import { NextResponse } from 'next/server';
import { User } from '@prisma/client'; // Added for explicit typing
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/auditLog'; // Use the module's audit log
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';

export async function GET(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ status: 'UNAUTHENTICATED', error: auth.authError }, { status: 401 });
    }

  try {
    const dbUser: User | null = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });
    if (!dbUser) {
      // User associated with session not found in DB
      return NextResponse.json({ status: 'INVALID_USER' }, { status: 404 });
    }

    // Return the user's current status
    return NextResponse.json({ status: dbUser.role });

  } catch (error) {
    // Log the error using the audit log
    await logAuditEvent({
        action: 'API_ERROR',
        userId: auth.user.id,
        method: 'API',
        details: {
            apiRoute: '/api/auth/check-status',
            error: error instanceof Error ? error.message : 'Unknown error',
        },
    });
    return NextResponse.json({ status: 'ERROR', message: 'Failed to fetch status' }, { status: 500 });
  }
  });
}