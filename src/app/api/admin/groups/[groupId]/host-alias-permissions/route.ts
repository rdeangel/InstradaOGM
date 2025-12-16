import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { getFilteredHostAliases } from '@/lib/host-alias-filtering'; // Import the new utility function
import type { OpnsenseAliasDetailFromExport } from '@/lib/opnsense-api'; // Import OpnsenseAliasDetailFromExport
import { touchGroupPermissions } from '@/lib/group-permissions-cache';

// API routes for managing Group Host Alias Permissions
// GET /api/admin/groups/[groupId]/host-alias-permissions
// Get the list of OPNsense Host Aliases associated with a specific group
export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const routeParams = await Promise.resolve(params);
    const groupId = routeParams.groupId;

    // Verify the group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return NextResponse.json({ message: 'Group not found' }, { status: 404 });
    }

    // Fetch the associated host alias permissions for this group
    const groupPermissions = await prisma.groupHostAliasPermission.findMany({
      where: { groupId },
      orderBy: {
        opnsenseAliasUuid: 'asc',
      },
      select: {
        opnsenseAliasUuid: true,
      },
    });

    // Extract just the UUIDs
    const associatedAliasUuids = groupPermissions.map((p: { opnsenseAliasUuid: string }) => p.opnsenseAliasUuid);

    const { displayableHostAliases, filteredCount } = await getFilteredHostAliases();

    // If the wildcard is present, return a special entry for the frontend with the count of filtered host aliases
    if (associatedAliasUuids.includes('*')) {
      return NextResponse.json([{ uuid: '*', name: 'All Hosts (Wildcard)', description: 'Permits access to all current and future hosts.', count: filteredCount }]);
    }

    // Filter OPNsense aliases to include only those associated with the group
    const associatedAliases = displayableHostAliases.filter((alias: OpnsenseAliasDetailFromExport) => alias.uuid && associatedAliasUuids.includes(alias.uuid));

    // Map to the desired format for the frontend tooltip
    const aliasesForTooltip = associatedAliases.map((alias: OpnsenseAliasDetailFromExport) => ({
      uuid: alias.uuid,
      name: alias.name,
      description: alias.description,
      content: alias.content, // Include content for tooltip
    }));

    return NextResponse.json(aliasesForTooltip);
  } catch (error) {
    logger.error('Error fetching group host alias permissions:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
  });
}

// PUT /api/admin/groups/[groupId]/host-alias-permissions
// Update the list of OPNsense Host Aliases associated with a specific group
export async function PUT(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const routeParams = await Promise.resolve(params);
    const groupId = routeParams.groupId;
    const { aliasUuids } = await req.json(); // Expecting an array of OPNsense alias UUIDs

    if (!Array.isArray(aliasUuids)) {
        return NextResponse.json({ message: 'Invalid input: aliasUuids must be an array.' }, { status: 400 });
    }

    // Verify the group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return NextResponse.json({ message: 'Group not found' }, { status: 404 });
    }

    // Validation could be added to ensure aliasUuids are valid OPNsense Host Alias UUIDs
    // This might involve fetching all host aliases from OPNsense and checking if the provided UUIDs exist.
    // This could be resource-intensive if done on every PUT request.
    // Consider alternative validation strategies or rely on OPNsense API errors during alias operations.

    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Delete existing permissions for this group
      await tx.groupHostAliasPermission.deleteMany({
        where: { groupId },
      });

      // If the wildcard alias is sent, only store the wildcard
      if (aliasUuids.includes('*')) {
        await tx.groupHostAliasPermission.create({
          data: {
            groupId: groupId,
            opnsenseAliasUuid: '*',
          },
        });
      } else {
        // Otherwise, create new permissions based on the provided aliasUuids
        await tx.groupHostAliasPermission.createMany({
          data: aliasUuids.map((uuid: string) => ({
            groupId: groupId,
            opnsenseAliasUuid: uuid,
          })),
        });
      }
    });

    // Fetch the updated permissions to return in the response
    const updatedGroupPermissions = await prisma.groupHostAliasPermission.findMany({
      where: { groupId },
      orderBy: {
        opnsenseAliasUuid: 'asc',
      },
      select: {
        opnsenseAliasUuid: true,
      },
    });

    const updatedAssociatedAliasUuids = updatedGroupPermissions.map((p: { opnsenseAliasUuid: string }) => p.opnsenseAliasUuid);

    // Update the group's permissionsLastModified timestamp for cache invalidation
    await touchGroupPermissions(groupId);

    return NextResponse.json(updatedAssociatedAliasUuids);
  } catch (error) {
    logger.error('Error updating group host alias permissions:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
  });
}