import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { Prisma } from '@prisma/client';

type UserWithAccounts = Prisma.UserGetPayload<{
  select: {
    id: true;
    email: true;
    name: true; // Include name for display in the dialog
    username: true; // Include username for display in the dialog
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
    
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }
    if (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const awaitedParams = await params;
    const { groupId } = awaitedParams;

    // Fetch SSO group mappings for the current local group
    const ssoGroupMappings = await prisma.ssoGroupMapping.findMany({
      orderBy: {
        ssoGroupName: 'asc',
      },
      where: {
        localGroupId: groupId,
      },
      select: {
        ssoProvider: true,
        ssoGroupName: true,
      },
    });

    let ssoUsers: { id: string; email: string; name?: string; isSso: boolean }[] = [];

    if (ssoGroupMappings.length > 0) {
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
          name: true, // Select name
          username: true, // Select username
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
        const userName = user.name || undefined;
        const userUsername = user.username || undefined;

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
          return [{ id: user.id, email: userEmail, name: userName, username: userUsername, isSso: true }];
        }
        return [];
      });
    }

    return NextResponse.json(ssoUsers);
  } catch (error) {
    logger.error('Error listing SSO group members:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
  });
}