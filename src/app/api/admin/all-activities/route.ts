import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);

    // Check for authentication and rate limiting
    if (auth.user) {
      const authError = handleAuthResponse(auth);
      if (authError) return authError;
    }

    if (!auth.user?.id) {
      return NextResponse.json({
        success: false,
        message: 'Authentication required'
      }, { status: 401 });
    }

    // Check if user has admin privileges
    if (auth.user.role !== 'ADMIN' && auth.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({
        success: false,
        message: 'Admin privileges required'
      }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search') || '';

    // Define actions to exclude from activities (automatic/system actions)
    const excludedActions = [
      'API_KEYS_LISTED',
      'Api Keys Listed',
      '2FA_STATUS_CHECK_SUCCESS',
      '2fa Status Check Success',
      'SETTINGS_FETCH_SUCCESS',
      'USER_PROFILE_FETCH_SUCCESS',
      'SESSION_REFRESH_SUCCESS',
      'TOKEN_REFRESH_SUCCESS',
    ];

    // Build where clause with search functionality
    const whereClause: Record<string, unknown> = {
      action: {
        notIn: excludedActions,
      },
    };

    // Add search functionality if search term is provided
    if (search.trim()) {
      // Parse search terms - handle quoted phrases and individual words
      const parseSearchTerms = (searchString: string): string[] => {
        const terms: string[] = [];
        const regex = /"([^"]+)"|(\S+)/g;
        let match;

        while ((match = regex.exec(searchString)) !== null) {
          // match[1] is quoted phrase, match[2] is individual word
          terms.push(match[1] || match[2]);
        }

        return terms;
      };

      const searchTerms = parseSearchTerms(search.trim());

      // Create conditions for each search term
      const searchConditions = searchTerms.map(term => {
        // Check if this is a quoted phrase (exact match) or individual words (word boundary match)
        const isQuotedPhrase = search.includes(`"${term}"`);

        if (isQuotedPhrase) {
          // Exact phrase matching for quoted terms
          return {
            OR: [
              {
                action: {
                  contains: term,
                  ...getCaseInsensitiveMode(),
                },
              },
              {
                user: {
                  OR: [
                    {
                      name: {
                        contains: term,
                        ...getCaseInsensitiveMode(),
                      },
                    },
                    {
                      email: {
                        contains: term,
                        ...getCaseInsensitiveMode(),
                      },
                    },
                    {
                      username: {
                        contains: term,
                        ...getCaseInsensitiveMode(),
                      },
                    },
                  ],
                },
              },
              {
                details: {
                  path: ['$'],
                  string_contains: term,
                },
              },
            ],
          };
        } else {
          // For individual words, we'll do broad matching in DB and filter precisely in app
          return {
            OR: [
              {
                action: {
                  contains: term,
                  ...getCaseInsensitiveMode(),
                },
              },
              {
                user: {
                  OR: [
                    {
                      name: {
                        contains: term,
                        ...getCaseInsensitiveMode(),
                      },
                    },
                    {
                      email: {
                        contains: term,
                        ...getCaseInsensitiveMode(),
                      },
                    },
                    {
                      username: {
                        contains: term,
                        ...getCaseInsensitiveMode(),
                      },
                    },
                  ],
                },
              },
              {
                details: {
                  path: ['$'],
                  string_contains: term,
                },
              },
            ],
          };
        }
      });

      // All search terms must match (AND logic)
      whereClause.AND = searchConditions;
    }

    // Fetch recent audit log entries for all users, excluding automatic actions
    let activities = await prisma.auditLog.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      skip: offset,
      take: Math.min(limit * 2, 200), // Fetch more to account for filtering
    });

    // Apply word boundary filtering if we have individual word searches
    if (search.trim() && !search.includes('"')) {
      const searchTerms = search.trim().split(/\s+/);

      activities = activities.filter(activity => {
        return searchTerms.every(term => {
          // Check if term appears as a whole word in action
          const actionWords = activity.action.toLowerCase().split(/[_\s]+/);
          const termLower = term.toLowerCase();

          const matchesAction = actionWords.includes(termLower);

          // Additional safety check: if searching for "assign", make sure we don't match "unassign"
          if (termLower === 'assign' && activity.action.toLowerCase().includes('unassign')) {
            // This should not match - "assign" should not match "unassign" actions
            return false;
          }

          // Check user fields
          const userName = activity.user?.name?.toLowerCase() || '';
          const userEmail = activity.user?.email?.toLowerCase() || '';
          const userUsername = activity.user?.username?.toLowerCase() || '';

          const matchesUser = userName.includes(termLower) ||
            userEmail.includes(termLower) ||
            userUsername.includes(termLower);

          // Check details JSON more carefully - avoid matching action-like terms in details
          let matchesDetails = false;
          if (activity.details && typeof activity.details === 'object') {
            const details = activity.details as Record<string, unknown>;
            // Only check specific fields that are safe for word matching
            const safeFields = ['groupName', 'groupFriendlyName', 'hostAliasName', 'description', 'reason'];
            matchesDetails = safeFields.some(field => {
              // Field is from controlled safeFields array
              // eslint-disable-next-line security/detect-object-injection
              const value = details[field];
              if (typeof value === 'string') {
                return value.toLowerCase().includes(termLower);
              }
              return false;
            });
          }

          return matchesAction || matchesUser || matchesDetails;
        });
      });
    }

    // Get all unique group IDs from activities to resolve names
    const groupIds = new Set<string>();
    activities.forEach(activity => {
      const details = typeof activity.details === 'string' ? JSON.parse(activity.details) : activity.details || {};
      if (details.groupId) {
        groupIds.add(details.groupId);
      }
      // Also check for batch operations
      if (details.groups && Array.isArray(details.groups)) {
        details.groups.forEach((group: Record<string, unknown>) => {
          if (group.groupId && typeof group.groupId === 'string') {
            groupIds.add(group.groupId);
          }
        });
      }
      // Check for move operations
      if (details.sourceGroups && Array.isArray(details.sourceGroups)) {
        details.sourceGroups.forEach((group: Record<string, unknown>) => {
          if (group.id && typeof group.id === 'string') {
            groupIds.add(group.id);
          }
        });
      }
      if (details.targetGroup && typeof details.targetGroup === 'object' && details.targetGroup !== null) {
        const targetGroup = details.targetGroup as Record<string, unknown>;
        if (targetGroup.id && typeof targetGroup.id === 'string') {
          groupIds.add(targetGroup.id);
        }
      }
    });

    // Check if Group Types are enabled
    const globalSettings = await prisma.globalSettings.findFirst({
      select: {
        enableGroupTypes: true
      }
    });
    const groupTypesEnabled = globalSettings?.enableGroupTypes || false;

    // Fetch group names for all group IDs (these are OPNsense UUIDs)
    const groupNameMap = new Map<string, { name: string; friendlyName?: string; groupType?: string }>();
    if (groupIds.size > 0) {
      // Look up friendly names and group types from OpnsenseGroupDisplay table
      const opnsenseGroups = await prisma.opnsenseGroupDisplay.findMany({
        where: {
          opnsenseUuid: {
            in: Array.from(groupIds)
          }
        },
        select: {
          opnsenseUuid: true,
          friendlyName: true,
          groupType: true
        }
      });

      // Also try to get names from OpnsenseNetworkGroup table as fallback
      const networkGroups = await prisma.opnsenseNetworkGroup.findMany({
        where: {
          id: {
            in: Array.from(groupIds)
          }
        },
        select: {
          id: true,
          name: true
        }
      });

      // Build the map with friendly names and group types
      opnsenseGroups.forEach(group => {
        groupNameMap.set(group.opnsenseUuid, {
          name: group.friendlyName, // Use friendly name as the primary name
          friendlyName: group.friendlyName,
          groupType: group.groupType
        });
      });

      // Add network group names as fallback for any missing entries
      networkGroups.forEach(group => {
        if (!groupNameMap.has(group.id)) {
          groupNameMap.set(group.id, {
            name: group.name,
            friendlyName: undefined,
            groupType: undefined
          });
        }
      });
    }

    // Helper function to enrich details with group names
    const enrichDetailsWithGroupNames = (details: Record<string, unknown>) => {
      const enrichedDetails = { ...details };

      // Single group operations
      if (details.groupId && typeof details.groupId === 'string' && groupNameMap.has(details.groupId)) {
        const groupInfo = groupNameMap.get(details.groupId)!;
        enrichedDetails.groupName = groupInfo.name;
        enrichedDetails.groupFriendlyName = groupInfo.friendlyName;
        enrichedDetails.groupType = groupInfo.groupType;
      }

      // Batch operations - enrich groups array
      if (details.groups && Array.isArray(details.groups)) {
        enrichedDetails.groups = details.groups.map((group: Record<string, unknown>) => {
          if (group.groupId && typeof group.groupId === 'string' && groupNameMap.has(group.groupId)) {
            const groupInfo = groupNameMap.get(group.groupId)!;
            return {
              ...group,
              groupName: groupInfo.name,
              groupFriendlyName: groupInfo.friendlyName,
              groupType: groupInfo.groupType
            };
          }
          return group;
        });
      }

      // Move operations - enrich source and target groups
      if (details.sourceGroups && Array.isArray(details.sourceGroups)) {
        enrichedDetails.sourceGroups = details.sourceGroups.map((group: Record<string, unknown>) => {
          if (group.id && typeof group.id === 'string' && groupNameMap.has(group.id)) {
            const groupInfo = groupNameMap.get(group.id)!;
            return {
              ...group,
              name: groupInfo.name,
              friendlyName: groupInfo.friendlyName,
              groupType: groupInfo.groupType
            };
          }
          return group;
        });
      }

      if (details.targetGroup && typeof details.targetGroup === 'object' && details.targetGroup !== null) {
        const targetGroup = details.targetGroup as Record<string, unknown>;
        if (targetGroup.id && typeof targetGroup.id === 'string' && groupNameMap.has(targetGroup.id)) {
          const groupInfo = groupNameMap.get(targetGroup.id)!;
          enrichedDetails.targetGroup = {
            ...targetGroup,
            name: groupInfo.name,
            friendlyName: groupInfo.friendlyName,
            groupType: groupInfo.groupType
          };
        }
      }

      return enrichedDetails;
    };

    // Take only the requested number of results
    activities = activities.slice(0, Math.min(limit, 100));

    // Get total count for pagination info (approximate for filtered results)
    let totalCount;
    if (search.trim() && !search.includes('"')) {
      // For filtered results, we can't easily get exact count, so estimate
      totalCount = activities.length < limit ? offset + activities.length : offset + activities.length + 1;
    } else {
      totalCount = await prisma.auditLog.count({
        where: whereClause,
      });
    }

    return NextResponse.json({
      success: true,
      activities: activities.map(activity => {
        const details = typeof activity.details === 'string' ? JSON.parse(activity.details) : activity.details || {};
        const enrichedDetails = enrichDetailsWithGroupNames(details);

        return {
          ...activity,
          details: enrichedDetails,
          timestamp: activity.timestamp.toISOString(),
        };
      }),
      groupTypesEnabled,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + activities.length < totalCount,
      },
    });
  } catch (error) {
    logger.error('Error fetching all activities:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch activities',
    }, { status: 500 });
  }
}
