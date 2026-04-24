import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Prisma } from '@prisma/client'; // Import Prisma for JsonValue type
import { getFilteredHostAliases } from '@/lib/host-alias-filtering'; // Import the new utility function
import { Role } from '@/types/opnsense';

type GroupWithCountsAndRelations = Prisma.GroupGetPayload<{
  include: {
    users: {
      select: {
        id: true;
      };
    };
    hostAliasPermissions: {
      select: {
        opnsenseAliasUuid: true;
      };
    };
    groupSpecificFilters: {
      select: {
        id: true;
      };
    };
    _count: {
      select: {
        users: true;
        hostAliasPermissions: true;
        groupSpecificFilters: true;
      };
    };
  };
}>;

// GET /api/admin/groups
// List all local groups with combined local and SSO user counts
export async function GET(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const { filteredCount: filteredHostAliasesCount } = await getFilteredHostAliases();
    logger.debug(`[GET /api/admin/groups] Total filterable host aliases: ${filteredHostAliasesCount}`);

    // Fetch all local groups with their direct user counts and actual users for local user check
    const groups: GroupWithCountsAndRelations[] = await prisma.group.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        users: { // Include actual users to check for local membership
          select: {
            id: true,
          },
        },
        hostAliasPermissions: { // Include host alias permissions to check for wildcard
          select: {
            opnsenseAliasUuid: true,
          },
        },
        groupSpecificFilters: { // Include group-specific filters to get their count
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            users: true,
            hostAliasPermissions: true,
            groupSpecificFilters: true,
          },
        },
      },
    });

    // Fetch all SSO group mappings
    const ssoGroupMappings = await prisma.ssoGroupMapping.findMany({
      orderBy: {
        ssoGroupName: 'asc',
      },
      select: {
        ssoProvider: true,
        ssoGroupName: true,
        localGroupId: true,
      },
    });

    // Fetch all users with their accounts and external groups
    const usersWithAccounts = await prisma.user.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        accounts: {
          select: {
            provider: true,
            externalGroups: true,
          },
        },
      },
    });

    // Create a map for quick lookup of SSO users by their external group memberships
    const ssoUserMembershipMap = new Map<string, Set<string>>(); // Map: ssoGroupName -> Set of user IDs

    usersWithAccounts.forEach(user => {
      user.accounts.forEach(account => {
        if (account.externalGroups) {
          const externalGroups = account.externalGroups as Prisma.JsonArray;
          externalGroups.forEach(extGroup => {
            if (typeof extGroup === 'string') {
              const key = `${account.provider}:${extGroup}`;
              if (!ssoUserMembershipMap.has(key)) {
                ssoUserMembershipMap.set(key, new Set());
              }
              ssoUserMembershipMap.get(key)?.add(user.id);
            }
          });
        }
      });
    });

    // Calculate combined user counts for each group
    const groupsWithCombinedCounts = groups.map((group: GroupWithCountsAndRelations) => {
      // Use a Set to collect unique SSO user IDs for this group
      const ssoUsersInGroup = new Set<string>();

      // Find SSO users mapped to this local group
      ssoGroupMappings.filter(mapping => mapping.localGroupId === group.id)
        .forEach(mapping => {
          const key = `${mapping.ssoProvider}:${mapping.ssoGroupName}`;
          if (ssoUserMembershipMap.has(key)) {
            ssoUserMembershipMap.get(key)?.forEach(userId => {
              // Ensure the SSO user is not already counted as a local user
              if (!group.users.some(localUser => localUser.id === userId)) {
                ssoUsersInGroup.add(userId);
              }
            });
          }
        });

      const totalUsers = (group._count?.users || 0) + ssoUsersInGroup.size;

      // Check if the group has the wildcard host alias permission
      const hasWildcardHostAlias = group.hostAliasPermissions.some(
        (permission) => permission.opnsenseAliasUuid === '*'
      );
      logger.debug(`[GET /api/admin/groups] Group: ${group.name}, hasWildcardHostAlias: ${hasWildcardHostAlias}, raw hostAliasPermissions: ${JSON.stringify(group.hostAliasPermissions)}`);


      return {
        ...group,
        _count: {
          ...group._count,
          users: totalUsers, // Update the users count to include SSO users
          // If wildcard is present, set hostAliasPermissions count to the filtered count
          hostAliasPermissions: hasWildcardHostAlias
            ? filteredHostAliasesCount
            : group._count?.hostAliasPermissions || 0,
          networkFilters: group._count?.groupSpecificFilters || 0, // Add the actual count of network filters
        },
        // Remove the explicit hostAliasPermissions and groupSpecificFilters arrays from the returned object
        // as they are only needed for internal logic, not for the frontend display.
        hostAliasPermissions: undefined,
        groupSpecificFilters: undefined,
      };
    });

    return NextResponse.json(groupsWithCombinedCounts);
  } catch (error) {
    logger.error('Error listing groups:', error);
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
  });
}

// POST /api/admin/groups
// Create a new local group
export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const { name, description } = await req.json();

    if (!name) {
      return NextResponse.json({ message: 'Group name is required' }, { status: 400 });
    }

    const existingGroup = await prisma.group.findUnique({
      where: { name },
    });

    if (existingGroup) {
      return NextResponse.json({ message: 'Group with this name already exists' }, { status: 409 });
    }

    const newGroup = await prisma.group.create({
      data: {
        name,
        description,
      },
    });

    return NextResponse.json(newGroup, { status: 201 });
    } catch (error) {
      logger.error('Error creating group:', error);
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
  });
}