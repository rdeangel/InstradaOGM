import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';

// DELETE /api/admin/groups/[groupId]
// Delete a local group by ID
export async function DELETE(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user) {
        return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
      }
      if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const { groupId } = await params;

    if (!groupId) {
      return NextResponse.json({ message: 'Group ID is required' }, { status: 400 });
    }

    // Check if the group exists
    const existingGroup = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        users: true,
        hostAliasPermissions: true,
      },
    });

    if (!existingGroup) {
      return NextResponse.json({ message: 'Group not found' }, { status: 404 });
    }

    // Check for associated users or host alias permissions
    if (existingGroup.users.length > 0 || existingGroup.hostAliasPermissions.length > 0) {
      return NextResponse.json({ message: 'Group has associated users or host alias permissions and cannot be deleted' }, { status: 409 });
    }

    // Check and delete associated SSO group mappings
    const ssoMappings = await prisma.ssoGroupMapping.findMany({
      where: { localGroupId: groupId },
    });

    if (ssoMappings.length > 0) {
      await prisma.ssoGroupMapping.deleteMany({
        where: { localGroupId: groupId },
      });
    }

    // Delete the group
    await prisma.group.delete({
      where: { id: groupId },
    });

    return NextResponse.json({ message: 'Group deleted successfully' }, { status: 200 });
  } catch (error) {
    logger.error('Error deleting group:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
  });
}
// PUT /api/admin/groups/[groupId] - Update a local group by ID
export async function PUT(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user) {
        return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
      }
      if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const { groupId } = await params;
    const { name, description } = await req.json();

    if (!groupId) {
      return NextResponse.json({ message: 'Group ID is required' }, { status: 400 });
    }

    // Check if the group exists
    const existingGroup = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!existingGroup) {
      return NextResponse.json({ message: 'Group not found' }, { status: 404 });
    }

    // Check if a group with the new name already exists (if name is being updated)
    if (name && name !== existingGroup.name) {
      const groupWithNewName = await prisma.group.findUnique({
        where: { name },
      });
      if (groupWithNewName) {
        return NextResponse.json({ message: 'Group with this name already exists' }, { status: 409 });
      }
    }

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        name: name || existingGroup.name,
        description: description !== undefined ? description : existingGroup.description,
      },
    });

    return NextResponse.json(updatedGroup, { status: 200 });
  } catch (error) {
    logger.error('Error updating group:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
  });
}