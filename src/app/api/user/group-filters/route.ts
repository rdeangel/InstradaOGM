import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
// Removed unused import GroupSpecificFilterSetting
import type { Group } from '@prisma/client';

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // Check for rate limiting errors
  const authError = handleAuthResponse(auth);
  if (authError) return authError;

  if (!auth.user || !auth.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = auth.user.id;

  try {
    // Fetch user's direct group memberships
    const directGroups = await prisma.group.findMany({
      where: {
        users: {
          some: {
            id: userId
          }
        }
      }
    });

    // Fetch user's accounts to get external group memberships for SSO mapping
    const userAccounts = await prisma.account.findMany({
      where: { userId: userId },
      select: { externalGroups: true, provider: true },
    });

    // Collect all unique external group names from all accounts
    const externalGroups: { provider: string; groupName: string }[] = [];
    userAccounts.forEach(account => {
      if (account.externalGroups && Array.isArray(account.externalGroups)) {
        account.externalGroups.forEach(groupName => {
          // Ensure groupName is a string before pushing
          if (typeof groupName === 'string') {
            externalGroups.push({ provider: account.provider, groupName: groupName });
          }
        });
      }
    });

    // Find SSO group mappings for the user's external groups
    let mappedGroups: Group[] = [];
    if (externalGroups.length > 0) {
      const ssoMappings = await prisma.ssoGroupMapping.findMany({
        where: {
          OR: externalGroups.map(eg => ({
            ssoProvider: {
              equals: eg.provider,
              ...getCaseInsensitiveMode(),
            },
            ssoGroupName: eg.groupName,
          })),
        },
        include: {
          localGroup: true,
        },
      });
      mappedGroups = ssoMappings.map(mapping => mapping.localGroup);
    }

    // Combine direct and mapped groups, ensuring uniqueness
    const allUserGroups = [...directGroups];
    mappedGroups.forEach(mappedGroup => {
      if (!allUserGroups.find(group => group.id === mappedGroup.id)) {
        allUserGroups.push(mappedGroup);
      }
    });

    logger.debug(`User ${userId} has ${directGroups.length} direct groups and ${mappedGroups.length} SSO-mapped groups (${allUserGroups.length} total unique groups)`);

    if (allUserGroups.length === 0) {
      // If user has no groups (direct or mapped), return an empty array of specific filters
      return NextResponse.json([]);
    }

    const groupIds: string[] = allUserGroups.map((group: Group) => group.id);

    // Fetch group-specific filters for all the user's groups (direct + SSO-mapped)
    const groupSpecificFilters = await prisma.groupSpecificFilterSetting.findMany({
      where: {
        groupId: {
          in: groupIds,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    logger.debug(`Found ${groupSpecificFilters.length} group-specific filters for user ${userId} across ${groupIds.length} groups`);

    // Track usage for authenticated requests
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 200);
    }

    return NextResponse.json(groupSpecificFilters);
  } catch (error) {
    logger.error('Failed to fetch user-specific group filters:', error);

    // Track usage for authenticated requests (even failed ones)
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 500);
    }

    return NextResponse.json({ error: 'Failed to fetch user-specific filters' }, { status: 500 });
  }
}