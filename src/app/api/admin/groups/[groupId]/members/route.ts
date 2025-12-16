import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { logAuditEvent } from '@/lib/auditLog';
import { Prisma } from '@prisma/client'; // Import Prisma for JsonValue type

type UserWithAccounts = Prisma.UserGetPayload<{
  select: {
    id: true;
    email: true;
    accounts: {
      select: {
        provider: true;
        externalGroups: true;
      };
    };
  };
}>;

export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const awaitedParams = await params;
    const { groupId } = awaitedParams;

    // Fetch local users directly associated with the group
    const localUsers = await prisma.user.findMany({
      where: {
        groups: {
          some: {
            id: groupId,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        email: true,
      },
    });

    // Fetch SSO group mappings for the current local group
    const ssoGroupMappings = await prisma.ssoGroupMapping.findMany({
      where: {
        localGroupId: groupId,
      },
      orderBy: {
        ssoGroupName: 'asc',
      },
      select: {
        ssoProvider: true,
        ssoGroupName: true,
      },
    });

    let ssoUsers: { id: string; email: string; isSso: boolean }[] = [];

    if (ssoGroupMappings.length > 0) {
      // Extract unique SSO group names and providers
      const ssoCriteria = ssoGroupMappings.map(mapping => ({
        ssoProvider: mapping.ssoProvider,
        ssoGroupName: mapping.ssoGroupName,
      }));

      // Fetch users whose accounts have externalGroups (will filter in memory)
      const usersWithSsoAccounts: UserWithAccounts[] = await prisma.user.findMany({
        where: {
          accounts: {
            some: {
              OR: ssoCriteria.map(criteria => ({
                provider: criteria.ssoProvider.toUpperCase(),
                // We will filter externalGroups in memory due to SQLite JSON query limitations
                externalGroups: {
                  not: Prisma.JsonNull, // Ensure externalGroups is not null
                },
              })),
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
        select: {
          id: true,
          email: true,
          accounts: {
            select: {
              provider: true,
              externalGroups: true,
            },
          },
        },
      });

      // Filter and map SSO users in memory
      const uniqueSsoUserIds = new Set<string>();
      ssoUsers = usersWithSsoAccounts.flatMap((user) => {
        const userEmail = user.email || 'N/A';

        const isSsoMember = user.accounts.some((account) => {
          if (account.externalGroups) {
            const externalGroups = account.externalGroups as Prisma.JsonArray;
            return ssoGroupMappings.some(mapping =>
              account.provider.toLowerCase() === mapping.ssoProvider.toLowerCase() &&
              externalGroups.includes(mapping.ssoGroupName)
            );
          }
          return false;
        });

        if (isSsoMember && !uniqueSsoUserIds.has(user.id)) {
          uniqueSsoUserIds.add(user.id);
          return [{ id: user.id, email: userEmail, isSso: true }];
        }
        return [];
      });
    }

    // Combine local and SSO users, ensuring uniqueness by ID
    const combinedUsersMap = new Map<string, { id: string; email: string; isSso?: boolean }>();

    localUsers.forEach(user => {
      combinedUsersMap.set(user.id, { id: user.id, email: user.email || 'N/A', isSso: false });
    });

    ssoUsers.forEach(user => {
      // If a user is both local and SSO, prioritize the SSO status for display
      // Or, if they are only SSO, add them.
      if (!combinedUsersMap.has(user.id)) {
        combinedUsersMap.set(user.id, user);
      } else {
        // If the user is already in the map (as a local user), and is also an SSO user,
        // we might want to indicate both or prioritize SSO.
        const existingUser = combinedUsersMap.get(user.id);
        if (existingUser) {
          combinedUsersMap.set(user.id, { ...existingUser, isSso: true }); // Mark as SSO if they are also an SSO user
        }
      }
    });

    const allMembers = Array.from(combinedUsersMap.values());

    return NextResponse.json(allMembers);
  } catch (error) {
    logger.error('Error listing group members:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const awaitedParams = await params;
    const { groupId } = awaitedParams;
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ message: 'User ID is required' }, { status: 400 });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return NextResponse.json({ message: 'Group not found' }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Add user to the group
    await prisma.group.update({
      where: { id: groupId },
      data: {
        users: {
          connect: { id: userId },
        },
      },
    });

    // Log the audit event for adding a user to a group
    await logAuditEvent({
      action: 'GROUP_MEMBERSHIP_ADD',
      userId: auth.user.id, // Admin user performing the action
      details: {
        groupId: group.id,
        groupName: group.name,
        targetUserId: user.id,
        targetUserName: user.name,
        adminEmail: auth.user.email,
      },
    });

    return NextResponse.json({ message: 'User added to group successfully' }, { status: 200 });
  } catch (error) {
    logger.error('Error adding user to group:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

    const awaitedParams = await params;
    const { groupId } = awaitedParams;
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ message: 'User ID is required' }, { status: 400 });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return NextResponse.json({ message: 'Group not found' }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Remove user from the group
    await prisma.group.update({
      where: { id: groupId },
      data: {
        users: {
          disconnect: { id: userId },
        },
      },
    });

    // Log the audit event for removing a user from a group
    await logAuditEvent({
      action: 'GROUP_MEMBERSHIP_REMOVE',
      userId: auth.user.id, // Admin user performing the action
      details: {
        groupId: group.id,
        groupName: group.name,
        targetUserId: user.id,
        targetUserName: user.name,
        adminEmail: auth.user.email,
      },
    });

    return NextResponse.json({ message: 'User removed from group successfully' }, { status: 200 });
  } catch (error) {
    logger.error('Error removing user from group:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
  });
}