import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';

// API endpoints for managing specific group mappings
// PUT: Update a group mapping
// DELETE: Delete a group mapping

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ mappingId: string }> }
) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user) {
        return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
      }

      if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const { mappingId } = await params;
    const { ssoProvider, ssoGroupName, localGroupId } = await req.json();

    if (!ssoProvider || !ssoGroupName || !localGroupId) {
      return NextResponse.json({ message: 'SSO Provider, SSO Group Name, and Local Group ID are required' }, { status: 400 });
    }

    const existingMapping = await prisma.ssoGroupMapping.findUnique({
      where: { id: mappingId },
    });

    if (!existingMapping) {
      return NextResponse.json({ message: 'Group mapping not found' }, { status: 404 });
    }

    const localGroup = await prisma.group.findUnique({
      where: { id: localGroupId },
    });

    if (!localGroup) {
      return NextResponse.json({ message: 'Local group not found' }, { status: 404 });
    }

    const updatedMapping = await prisma.ssoGroupMapping.update({
      where: { id: mappingId },
      data: {
        ssoProvider,
        ssoGroupName,
        localGroupId,
      },
      include: {
        localGroup: true,
      },
    });

    return NextResponse.json(updatedMapping);
    } catch (error) {
      logger.error('Error updating group mapping:', error);
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ mappingId: string }> }
) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user) {
        return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
      }

      if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const { mappingId } = await params;

    const existingMapping = await prisma.ssoGroupMapping.findUnique({
      where: { id: mappingId },
    });

    if (!existingMapping) {
      return NextResponse.json({ message: 'Group mapping not found' }, { status: 404 });
    }

    await prisma.ssoGroupMapping.delete({
      where: { id: mappingId },
    });

    return NextResponse.json({ message: 'Group mapping deleted successfully' });
    } catch (error) {
      logger.error('Error deleting group mapping:', error);
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
  });
}