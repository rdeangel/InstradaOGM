import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        groups: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    logger.error(`Error fetching profile for user ${auth.user.id}:`, error);
    return NextResponse.json({ message: 'Failed to fetch profile' }, { status: 500 });
  }
  });
}

export async function PUT(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ message: 'Request body must be a JSON object' }, { status: 400 });
    }

    try {
      const { name, email } = body;

      // Security (R4-1): Email cannot be changed via this endpoint as it lacks re-auth,
      // verification reset, and credential revocation. Direct caller to /api/account/update-profile.
      if (email !== undefined) {
        return NextResponse.json(
          { message: 'Email cannot be updated via this endpoint. Please use /api/account/update-profile with verification.' },
          { status: 400 }
        );
      }

      if (name === undefined) {
        return NextResponse.json({ message: 'No update data provided' }, { status: 400 });
      }

      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ message: 'Name must be a non-empty string' }, { status: 400 });
      }

      if (name.length > 100) {
        return NextResponse.json({ message: 'Name must not exceed 100 characters' }, { status: 400 });
      }

      const updatedUser = await prisma.user.update({
        where: { id: auth.user.id },
        data: {
          name: name.trim(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await logAuditEvent({
        userId: auth.user.id,
        action: 'PROFILE_UPDATED',
        details: { updatedFields: { name: name.trim() } },
      });

      return NextResponse.json(updatedUser);
    } catch (error) {
      logger.error(`Error updating profile for user ${auth.user.id}:`, error);
      await logAuditEvent({
        userId: auth.user.id,
        action: 'PROFILE_UPDATE_FAILURE',
        reason: 'Database error',
      });
      return NextResponse.json({ message: 'Failed to update profile' }, { status: 500 });
    }
  });
}
