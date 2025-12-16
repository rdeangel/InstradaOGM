import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Must be authenticated
    if (!auth.user) {
      return NextResponse.json({
        success: false,
        message: 'Authentication required'
      }, { status: 401 });
    }

    try {
      const userId = auth.user.id;
      const userRole = auth.user.role;
      const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Parse period parameter from query string
      const url = new URL(request.url);
      const periodParam = url.searchParams.get('period') || 'all';

      // Calculate cutoff date based on period
      let cutoffDate: Date;
      switch (periodParam) {
        case '1h':
          cutoffDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '6h':
          cutoffDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
          break;
        case '12h':
          cutoffDate = new Date(now.getTime() - 12 * 60 * 60 * 1000);
          break;
        case '1d':
          cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
        case '7':
          cutoffDate = sevenDaysAgo;
          break;
        case '30d':
        case '30':
          cutoffDate = thirtyDaysAgo;
          break;
        case 'all':
        default:
          cutoffDate = new Date(0); // Beginning of time
          break;
      }

      // Get all user activities, excluding ATTEMPT operations, filtered by period
      const allActivities = await prisma.auditLog.findMany({
        where: {
          userId: userId,
          action: {
            not: {
              contains: 'ATTEMPT'
            }
          },
          timestamp: {
            gte: cutoffDate
          }
        },
        select: {
          action: true,
          details: true,
          timestamp: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      // Initialize statistics
      const stats = {
        assignments: { total: 0, last7Days: 0, last30Days: 0 },
        moves: { total: 0, last7Days: 0, last30Days: 0 },
        unassignments: { total: 0, last7Days: 0, last30Days: 0 },
        hostOperations: { total: 0, last7Days: 0, last30Days: 0 },
        hostCreations: { total: 0, last7Days: 0, last30Days: 0 },
        hostDeletions: { total: 0, last7Days: 0, last30Days: 0 },
        hostModifications: { total: 0, last7Days: 0, last30Days: 0 },
        totalActivities: 0, // Will be calculated as sum of categorized activities
        mostActiveDay: null as string | null,
        topGroups: [] as Array<{ groupName: string; count: number }>,
      };

      // Track group activity counts
      const groupCounts = new Map<string, number>();

      // Track daily activity counts for most active day
      const dailyCounts = new Map<string, number>();

      // Track daily breakdown by activity type for charts
      const dailyBreakdown = new Map<string, {
        assignments: number;
        moves: number;
        unassignments: number;
        hostOperations: number;
        total: number;
      }>();

      // Process each activity
      allActivities.forEach((activity) => {
        const timestamp = new Date(activity.timestamp);
        const isLast7Days = timestamp >= sevenDaysAgo;
        const isLast30Days = timestamp >= thirtyDaysAgo;

        // Extract group name from activity details
        let groupName: string | null = null;
        let targetGroupName: string | null = null; // For moves, this is the destination group
        const details = (activity.details && typeof activity.details === 'object')
          ? activity.details as Record<string, unknown>
          : {};

        groupName = (details.groupFriendlyName as string) ||
                  (details.groupName as string) ||
                  null;

        // For batch operations, try to get group from groups array
        if (!groupName && Array.isArray(details.groups) && details.groups.length > 0) {
          const firstGroup = details.groups[0] as Record<string, unknown>;
          groupName = (firstGroup.groupFriendlyName as string) ||
                     (firstGroup.groupName as string) ||
                     null;
        }

        // Extract group name from nested objects based on operation type
        if (!groupName) {
          const action = activity.action;

          // For assignment operations, check targetGroup
          if (action === 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS' ||
              action === 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS' ||
              action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS') {
            const targetGroup = details.targetGroup as Record<string, unknown>;
            if (targetGroup) {
              groupName = (targetGroup.friendlyName as string) ||
                         (targetGroup.name as string) ||
                         null;
            }
          }

          // For unassignment operations, check unassignedGroup
          else if (action === 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS' ||
                   action === 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS') {
            const unassignedGroup = details.unassignedGroup as Record<string, unknown>;
            if (unassignedGroup) {
              groupName = (unassignedGroup.friendlyName as string) ||
                         (unassignedGroup.name as string) ||
                         null;
            }
          }
        }

        // For moves, the groupName is the target group
        targetGroupName = groupName;

        // Categorize activities (order matters to prevent double-counting)
        const action = activity.action;
        let activityCounted = false;
        let isGroupOperation = false;

        // Use the same logic as audit-analytics.ts for proper classification
        // Check if groups were actually removed (indicating source groups existed)
        const removedGroups = (details.removedFromGroups as unknown[] || []) as unknown[];
        const removedGroupsByHost = details.removedFromGroupsByHost || {};
        const hasRemovedGroups = removedGroups.length > 0 ||
                                (Array.isArray(removedGroupsByHost) && removedGroupsByHost.length > 0) ||
                                (typeof removedGroupsByHost === 'object' && Object.keys(removedGroupsByHost).length > 0);

        // MOVE: Assignment operation that also removed from source groups OR explicit move action
        const isMove = (action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS' ||
            (action === 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS' && hasRemovedGroups) ||
            (action === 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS' && hasRemovedGroups));

        // PURE ASSIGNMENT: Assignment operation with no source groups removed (and not a move action)
        const isPureAssignment = (action === 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS' ||
                               action === 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS') &&
                               !hasRemovedGroups;
        
        if (isMove) {
          stats.moves.total++;
          if (isLast7Days) stats.moves.last7Days++;
          if (isLast30Days) stats.moves.last30Days++;
          activityCounted = true;
          isGroupOperation = true;
        }
        // 2. ASSIGNMENTS (only if not already counted as move)
        else if (isPureAssignment) {
          stats.assignments.total++;
          if (isLast7Days) stats.assignments.last7Days++;
          if (isLast30Days) stats.assignments.last30Days++;
          activityCounted = true;
          isGroupOperation = true;
        }
        // 3. UNASSIGNMENTS
        else if (action === 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS' ||
                 action === 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS' ||
                 action === 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS') {
          stats.unassignments.total++;
          if (isLast7Days) stats.unassignments.last7Days++;
          if (isLast30Days) stats.unassignments.last30Days++;
          activityCounted = true;
          // Note: Unassignments do NOT count toward group activity (removing from group shouldn't increase group's activity)
        }

        // HOST OPERATIONS - Check specific host operations first, then general host operations
        // These are separate checks (not else if) to allow proper individual counting

        // HOST CREATIONS (for admin users, but also count for all users in host operations)
        if (action === 'HOST_ALIAS_CREATE_SUCCESS') {
          if (isAdmin) {
            stats.hostCreations.total++;
            if (isLast7Days) stats.hostCreations.last7Days++;
            if (isLast30Days) stats.hostCreations.last30Days++;
          }
          // Count toward host operations for admins, toward total activities for all users
          stats.hostOperations.total++;
          if (isLast7Days) stats.hostOperations.last7Days++;
          if (isLast30Days) stats.hostOperations.last30Days++;
          if (!activityCounted) {
            activityCounted = true;
          }
        }
        // HOST DELETIONS (for admin users, but also count for all users in host operations)
        else if (action === 'HOST_ALIAS_DELETE_SUCCESS') {
          if (isAdmin) {
            stats.hostDeletions.total++;
            if (isLast7Days) stats.hostDeletions.last7Days++;
            if (isLast30Days) stats.hostDeletions.last30Days++;
          }
          // Count toward host operations for admins, toward total activities for all users
          stats.hostOperations.total++;
          if (isLast7Days) stats.hostOperations.last7Days++;
          if (isLast30Days) stats.hostOperations.last30Days++;
          if (!activityCounted) {
            activityCounted = true;
          }
        }
        // HOST MODIFICATIONS (for all users - users can modify hosts they manage)
        // Check for both action names: HOST_ALIAS_UPDATE_SUCCESS (from host-alias-management) and OPNSENSE_ALIAS_UPDATE_SUCCESS (from admin aliases tab)
        else if (action === 'HOST_ALIAS_UPDATE_SUCCESS' || action === 'OPNSENSE_ALIAS_UPDATE_SUCCESS') {
          stats.hostModifications.total++;
          if (isLast7Days) stats.hostModifications.last7Days++;
          if (isLast30Days) stats.hostModifications.last30Days++;
          // Count toward host operations for admins, toward total activities for all users
          if (isAdmin) {
            stats.hostOperations.total++;
            if (isLast7Days) stats.hostOperations.last7Days++;
            if (isLast30Days) stats.hostOperations.last30Days++;
          }
          if (!activityCounted) {
            activityCounted = true;
          }
        }
        // OTHER HOST OPERATIONS (only for admin users)
        else if (isAdmin && (action.includes('HOST_ALIAS_') || action.includes('DHCP_RESERVATION_'))) {
          stats.hostOperations.total++;
          if (isLast7Days) stats.hostOperations.last7Days++;
          if (isLast30Days) stats.hostOperations.last30Days++;
          if (!activityCounted) {
            activityCounted = true;
          }
        }

        // Count towards total activities only if it was categorized
        if (activityCounted) {
          stats.totalActivities++;

          // Track daily activity for most active day calculation
          const dayKey = timestamp.toISOString().split('T')[0];
          dailyCounts.set(dayKey, (dailyCounts.get(dayKey) || 0) + 1);

          // Track daily breakdown by activity type
          const dayBreakdown = dailyBreakdown.get(dayKey) || {
            assignments: 0,
            moves: 0,
            unassignments: 0,
            hostOperations: 0,
            total: 0,
          };

          // Increment the appropriate counter based on activity type
          if (isMove) {
            dayBreakdown.moves++;
          } else if (isPureAssignment) {
            dayBreakdown.assignments++;
          } else if (action === 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS' ||
                     action === 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS' ||
                     action === 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS') {
            dayBreakdown.unassignments++;
          } else if (action.includes('HOST_ALIAS_') || action.includes('DHCP_RESERVATION_') ||
                     action === 'OPNSENSE_ALIAS_UPDATE_SUCCESS') {
            dayBreakdown.hostOperations++;
          }

          dayBreakdown.total++;
          dailyBreakdown.set(dayKey, dayBreakdown);
        }

        // Count group activities ONLY for assignments and moves (destination group)
        // Unassignments do NOT count toward group activity (removing from group shouldn't increase group's activity)
        if (targetGroupName && isGroupOperation) {
          groupCounts.set(targetGroupName, (groupCounts.get(targetGroupName) || 0) + 1);
        }
      });

      // Find most active day
      let maxCount = 0;
      let mostActiveDay = null;
      for (const [day, count] of dailyCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          mostActiveDay = day;
        }
      }

      // Format most active day
      if (mostActiveDay) {
        const date = new Date(mostActiveDay);
        stats.mostActiveDay = date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }

      // Get top groups
      const sortedGroups = Array.from(groupCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([groupName, count]) => ({ groupName, count }));

      stats.topGroups = sortedGroups;

      // Convert daily breakdown to array and sort by date
      const dailyBreakdownArray = Array.from(dailyBreakdown.entries())
        .map(([date, breakdown]) => ({
          date,
          ...breakdown,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return NextResponse.json({
        success: true,
        statistics: {
          ...stats,
          dailyBreakdown: dailyBreakdownArray,
        },
      });

    } catch (error) {
      logger.error('Error fetching user activity statistics:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch activity statistics'
      }, { status: 500 });
    }
  });
}
