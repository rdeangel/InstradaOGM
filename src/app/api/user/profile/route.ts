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

  try {
    const { name, email } = await request.json();

    // Validate input
    if (name && typeof name !== 'string') {
      return NextResponse.json({ message: 'Name must be a string' }, { status: 400 });
    }

    if (email && typeof email !== 'string') {
      return NextResponse.json({ message: 'Email must be a string' }, { status: 400 });
    }

    // Check if email is already taken by another user
    if (email && email !== auth.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser && existingUser.id !== auth.user.id) {
        return NextResponse.json({ message: 'Email is already taken' }, { status: 409 });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        name: name || undefined,
        email: email || undefined,
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
      details: { updatedFields: { name, email } },
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