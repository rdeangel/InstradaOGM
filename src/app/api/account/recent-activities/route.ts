import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';

// Define types for better type safety
interface SessionActivity {
  endpoint: string;
  method: string;
  actionType: string;
}

// Helper function to format session actions into readable descriptions
function formatSessionAction(activity: SessionActivity): string {
  const { endpoint, method, actionType } = activity;

  if (actionType === 'page_view') {
    // Specific page mappings
    if (endpoint === '/') return 'Viewed Dashboard';
    if (endpoint === '/dashboard') return 'Viewed Dashboard';
    if (endpoint === '/account') return 'Viewed Account Settings';
    if (endpoint === '/devices') return 'Viewed Device Management';
    if (endpoint === '/login') return 'Accessed Login Page';
    if (endpoint === '/logout') return 'Accessed Logout Page';

    // Admin section mappings
    if (endpoint.startsWith('/admin/')) {
      const section = endpoint.replace('/admin/', '').replace(/[-_]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      if (section.includes('Users')) return 'Viewed User Management';
      if (section.includes('Groups')) return 'Viewed Group Management';
      if (section.includes('Audit')) return 'Viewed Audit Logs';
      if (section.includes('Settings')) return 'Viewed System Settings';
      if (section.includes('Analytics')) return 'Viewed Analytics Dashboard';
      if (section.includes('Monitoring')) return 'Viewed System Monitoring';
      return `Viewed Admin: ${section}`;
    }

    // Monitoring section mappings
    if (endpoint.startsWith('/monitoring/')) {
      const section = endpoint.replace('/monitoring/', '').replace(/[-_]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      return `Viewed Monitoring: ${section}`;
    }

    // Device-related pages
    if (endpoint.startsWith('/devices/')) {
      const section = endpoint.replace('/devices/', '').replace(/[-_]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      return `Viewed Device: ${section}`;
    }

    // Generic fallback with better formatting
    const pageName = endpoint.replace(/^\//, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    if (pageName) {
      return `Viewed ${pageName} Page`;
    }

    return 'Viewed Page';
  }

  if (actionType === 'api_call') {
    if (endpoint.includes('/admin/')) {
      // Admin API calls
      if (endpoint.includes('/users/')) {
        if (method === 'POST') return 'Created User';
        if (method === 'PUT' || method === 'PATCH') return 'Updated User';
        if (method === 'DELETE') return 'Deleted User';
        return 'User Management Operation';
      }
      if (endpoint.includes('/groups/')) {
        if (method === 'POST') return 'Created Group';
        if (method === 'PUT' || method === 'PATCH') return 'Updated Group';
        if (method === 'DELETE') return 'Deleted Group';
        return 'Group Management Operation';
      }
      if (endpoint.includes('/audit-logs/')) return 'Accessed Audit Logs';
      if (endpoint.includes('/settings/')) return 'Modified System Settings';
      if (endpoint.includes('/analytics/')) return 'Accessed Analytics Data';
      return 'Admin Operation';
    }

    // Account-related API calls
    if (endpoint.includes('/account/')) {
      if (endpoint.includes('/api-keys/')) return 'API Key Management';
      if (endpoint.includes('/profile/')) return 'Profile Update';
      if (endpoint.includes('/password/')) return 'Password Change';
      if (endpoint.includes('/2fa/')) return '2FA Configuration';
      return 'Account Management';
    }

    // Authentication API calls
    if (endpoint.includes('/auth/')) {
      if (endpoint.includes('/signin')) return 'User Login';
      if (endpoint.includes('/signout')) return 'User Logout';
      if (endpoint.includes('/2fa/')) return '2FA Authentication';
      return 'Authentication';
    }

    return `API Operation: ${method} ${endpoint.split('/').pop() || 'Unknown'}`;
  }

  if (actionType === 'form_submit') {
    if (endpoint.includes('/account/')) return 'Updated Account Settings';
    if (endpoint.includes('/admin/')) return 'Admin Form Submission';
    if (endpoint.includes('/login')) return 'Login Attempt';
    if (endpoint.includes('/devices/')) return 'Device Configuration Update';
    return 'Form Submission';
  }

  return `${actionType}: ${endpoint}`;
}



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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search') || '';

    // Define actions to exclude from recent activities (automatic/system actions)
    const excludedActions = [
      'API_KEYS_LISTED',
      'Api Keys Listed', // Handle both formats
      '2FA_STATUS_CHECK_SUCCESS',
      '2fa Status Check Success', // Handle both formats
      'SETTINGS_FETCH_SUCCESS',
      'USER_PROFILE_FETCH_SUCCESS',
      'SESSION_REFRESH_SUCCESS',
      'TOKEN_REFRESH_SUCCESS',
      // OPNsense API calls (low-level technical details)
      'OPNSENSE_API_CALL',
      'OPNsense API Call',
      'OPNSENSE_API_SUCCESS',
      'OPNSENSE_API_ERROR',
    ];

    // Build where clause with search functionality
    const whereClause: Record<string, unknown> = {
      AND: [
        {
          userId: auth.user.id,
          action: {
            notIn: excludedActions,
          },
        },
      ],
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

    // For proper pagination across combined datasets, we need to fetch more data and paginate after combining
    // Calculate how much data to fetch to ensure we have enough for pagination
    const fetchLimit = Math.max(limit * 3, 50); // Fetch more to account for combining and sorting

    // Get both audit log entries and session events, then combine them
    const [auditActivities, sessionActivities] = await Promise.all([
      // Get audit log entries (meaningful actions) - fetch more than needed for proper pagination
      prisma.auditLog.findMany({
        where: whereClause,
        orderBy: {
          timestamp: 'desc',
        },
        skip: 0, // Don't skip here, we'll paginate after combining
        take: fetchLimit, // Fetch more to ensure proper pagination
        select: {
          id: true,
          action: true,
          details: true,
          timestamp: true,
        },
      }),

      // Get recent session events for this user (excluding automatic/frequent actions)
      prisma.sessionUsageEvent.findMany({
        where: {
          userId: auth.user.id,
          endpoint: {
            notIn: [
              '/api/auth/session',
              '/api/auth/csrf',
              '/api/settings/analytics-enabled',
              '/api/account/recent-activities',
              '/api/admin/analytics/realtime',
              '/api/admin/audit-logs/stats',
              '/api/admin/audit-logs/preview-trim'
            ]
          },
          // Exclude account page views (self-logging)
          NOT: {
            AND: [
              { actionType: 'page_view' },
              { endpoint: '/account' }
            ]
          },
          // Only include meaningful actions (exclude OPNsense API calls and admin operations)
          OR: [
            { actionType: 'form_submit' },
            { actionType: 'page_view', endpoint: { not: { startsWith: '/api/' } } }
          ]
        },
        orderBy: {
          timestamp: 'desc',
        },
        skip: 0, // Don't skip here, we'll paginate after combining
        take: fetchLimit, // Fetch more to ensure proper pagination
        select: {
          id: true,
          endpoint: true,
          method: true,
          actionType: true,
          timestamp: true,
          statusCode: true,
          pageUrl: true,
        },
      })
    ]);

    // Get all unique group IDs from audit activities to resolve names
    const groupIds = new Set<string>();
    auditActivities.forEach(activity => {
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

      // Log group mapping statistics for debugging
      logger.debug('Group name mapping statistics:', {
        totalGroupIds: groupIds.size,
        opnsenseGroupsFound: opnsenseGroups.length,
        networkGroupsFound: networkGroups.length,
        mappedGroups: groupNameMap.size,
        sampleMappings: Array.from(groupNameMap.entries()).slice(0, 5).map(([uuid, info]) => ({
          uuid,
          name: info.friendlyName || info.name,
          type: info.groupType || 'no type'
        }))
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

    // Combine and format activities
    const allActivities = [
      ...auditActivities.map(activity => {
        const details = typeof activity.details === 'string' ? JSON.parse(activity.details) : activity.details || {};

        // Log sample raw details for debugging
        if (auditActivities.indexOf(activity) < 2) {
          logger.debug('Raw activity details sample:', {
            action: activity.action,
            groupId: details.groupId,
            groupName: details.groupName,
            groupFriendlyName: details.groupFriendlyName
          });
        }

        const enrichedDetails = enrichDetailsWithGroupNames(details);

        // Log sample enriched details for debugging
        if (auditActivities.indexOf(activity) < 2) {
          logger.debug('Enriched activity details sample:', {
            action: activity.action,
            enrichedGroupName: enrichedDetails.groupName,
            enrichedGroupFriendlyName: enrichedDetails.groupFriendlyName
          });
        }

        return {
          id: activity.id,
          action: activity.action,
          details: enrichedDetails,
          timestamp: activity.timestamp,
          type: 'audit' as const
        };
      }),
      ...sessionActivities.map(activity => ({
        id: activity.id,
        action: formatSessionAction(activity),
        details: {
          endpoint: activity.endpoint,
          method: activity.method,
          actionType: activity.actionType,
          statusCode: activity.statusCode,
          pageUrl: activity.pageUrl
        },
        timestamp: activity.timestamp,
        type: 'session' as const
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // REMOVE API-SIDE SEARCH - Let frontend handle it with proper descriptions
    // The API will return all activities and let the frontend filter them
    // This is because the frontend has the proper getActionDescription function

    // Search is handled client-side with proper descriptions

    // Apply proper pagination after combining and sorting
    const activities = allActivities.slice(offset, offset + limit);

    // Get total count for pagination info (always get full count since search is client-side)
    const auditCount = await prisma.auditLog.count({
      where: whereClause,
    });

    const sessionCount = await prisma.sessionUsageEvent.count({
      where: {
        userId: auth.user.id,
        endpoint: {
          notIn: [
            '/api/auth/session',
            '/api/auth/csrf',
            '/api/settings/analytics-enabled',
            '/api/account/recent-activities',
            '/api/admin/analytics/realtime',
            '/api/admin/audit-logs/stats',
            '/api/admin/audit-logs/preview-trim'
          ]
        },
        // Exclude account page views (self-logging)
        NOT: {
          AND: [
            { actionType: 'page_view' },
            { endpoint: '/account' }
          ]
        },
        OR: [
          { actionType: 'form_submit' },
          { actionType: 'page_view', endpoint: { not: { startsWith: '/api/' } } }
        ]
      }
    });

    const totalCount = auditCount + sessionCount;

    // Log pagination info for debugging
    logger.debug('Recent activities pagination:', {
      requestParams: { limit, offset, search: search.trim() },
      responseInfo: {
        activitiesReturned: activities.length,
        totalCount,
        hasMore: offset + activities.length < totalCount,
        auditActivitiesCount: auditActivities.length,
        sessionActivitiesCount: sessionActivities.length,
      }
    });

    return NextResponse.json({
      success: true,
      activities: activities.map(activity => ({
        ...activity,
        timestamp: activity.timestamp.toISOString(),
      })),
      groupTypesEnabled,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + activities.length < totalCount,
      },
    });
  } catch (error) {
    logger.error('Error fetching recent activities:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch recent activities',
    }, { status: 500 });
  }
}
