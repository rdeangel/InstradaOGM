/* eslint-disable security/detect-object-injection */
// This file uses bracket notation extensively with typed keys from database results,
// Object.entries/Object.keys iterations, and validated enum values. All uses are safe.
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface GroupChangeAnalytics {
  summary: {
    totalOperations: number;
    assignments: number;
    unassignments: number;
    moves: number;
    batchOperations: number;
    successRate: number;
    uniqueUsers: number;
    uniqueGroups: number;
    uniqueHostAliases: number;
  };
  dailyStats: Array<{
    date: string;
    assignments: number;
    unassignments: number;
    moves: number;
    batchOperations: number;
    successfulOperations: number;
    failedOperations: number;
    uniqueUsers: number;
    uniqueGroups: number;
  }>;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    operations: number;
    successRate: number;
  }>;
  topGroups: Array<{
    groupId: string;
    groupName: string;
    groupFriendlyName: string | null;
    operations: number; // Count of assignments TO this group (pure assignments + moves where this is destination)
    assignments: number; // Same as operations - assignments TO this group
    unassignments: number; // Count of unassignments FROM this group (tracked separately, not included in operations)
  }>;
  operationTypes: Record<string, number>;
  authMethods: Record<string, number>;
}

export interface HostAliasChangeAnalytics {
  summary: {
    totalOperations: number;
    creations: number;
    modifications: number;
    deletions: number;
    successRate: number;
    uniqueUsers: number;
    uniqueHostAliases: number;
  };
  dailyStats: Array<{
    date: string;
    creations: number;
    modifications: number;
    deletions: number;
    successfulOperations: number;
    failedOperations: number;
    uniqueUsers: number;
  }>;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    operations: number;
    successRate: number;
  }>;
  operationTypes: Record<string, number>;
  authMethods: Record<string, number>;
}

export interface NetworkAliasChangeAnalytics {
  summary: {
    totalOperations: number;
    creations: number;
    modifications: number;
    deletions: number;
    successRate: number;
    uniqueUsers: number;
    uniqueNetworkAliases: number;
  };
  dailyStats: Array<{
    date: string;
    creations: number;
    modifications: number;
    deletions: number;
    successfulOperations: number;
    failedOperations: number;
    uniqueUsers: number;
  }>;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    operations: number;
    successRate: number;
  }>;
  operationTypes: Record<string, number>;
  authMethods: Record<string, number>;
}

export interface DhcpReservationAnalytics {
  summary: {
    totalOperations: number;
    creations: number;
    deletions: number;
    successRate: number;
    uniqueUsers: number;
    uniqueIpAddresses: number;
    uniqueMacAddresses: number;
  };
  dailyStats: Array<{
    date: string;
    creations: number;
    deletions: number;
    successfulOperations: number;
    failedOperations: number;
    uniqueUsers: number;
  }>;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    operations: number;
    successRate: number;
  }>;
  operationTypes: Record<string, number>;
  authMethods: Record<string, number>;
}

/**
 * Get group change analytics from audit logs
 */
export async function getGroupChangeAnalytics(
  daysOrStartDate: number | Date = 30,
  endDate?: Date
): Promise<GroupChangeAnalytics> {
  try {
    let startDate: Date;
    let actualEndDate: Date;

    if (typeof daysOrStartDate === 'number') {
      // Legacy days parameter
      actualEndDate = new Date();
      startDate = new Date(actualEndDate.getTime() - daysOrStartDate * 24 * 60 * 60 * 1000);
    } else {
      // Date range parameters
      startDate = daysOrStartDate;
      actualEndDate = endDate || new Date();
      
      // If end date is at start of day (00:00:00), set it to end of day (23:59:59)
      if (actualEndDate.getHours() === 0 && actualEndDate.getMinutes() === 0 &&
          actualEndDate.getSeconds() === 0 && actualEndDate.getMilliseconds() === 0) {
        actualEndDate.setHours(23, 59, 59, 999);
      }
    }

    // Get group-related audit logs
    const groupLogs = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: actualEndDate,
        },
        action: {
          in: [
            // Only include SUCCESS actions for cleaner analytics
            'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS',
            'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS',
            'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS',
            'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS',
            'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS',
            'OPNSENSE_GROUP_IP_UNASSIGN_ALL_PARTIAL',
            'OPNSENSE_GROUP_IP_MOVE_SUCCESS',
            // Note: OPNSENSE_GROUP_IP_MOVE_REMOVE is excluded as it's part of move operation, not separate unassignment
            // Network alias group operations
            'NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS',
            'NETWORK_ALIAS_GROUP_ASSIGN_MOVE',
            'NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS',
            'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_ADD_SUCCESS',
            'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_REMOVE_SUCCESS',
          ],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Get all unique group IDs from the logs to fetch group display names
    const groupIds = new Set<string>();
    groupLogs.forEach(log => {
      const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};
      if (details.groupId) {
        groupIds.add(details.groupId);
      }
    });

    // Fetch group display information from the database
    const groupDisplays = await prisma.opnsenseGroupDisplay.findMany({
      where: {
        opnsenseUuid: {
          in: Array.from(groupIds),
        },
      },
      select: {
        opnsenseUuid: true,
        friendlyName: true,
      },
    });

    // Create a map for quick lookup
    const groupDisplayMap = new Map<string, string>();
    groupDisplays.forEach(display => {
      groupDisplayMap.set(display.opnsenseUuid.toLowerCase(), display.friendlyName);
    });

    // Analyze the logs with group display information
    const analytics = analyzeGroupChangeLogs(groupLogs, groupDisplayMap);

    const daysDiff = Math.ceil((actualEndDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    logger.debug(`Analyzed ${groupLogs.length} group change audit logs for ${daysDiff} days (${startDate.toISOString()} to ${actualEndDate.toISOString()})`);
    return analytics;
  } catch (error) {
    logger.error('Failed to get group change analytics:', error);
    throw error;
  }
}

/**
 * Get host alias change analytics from audit logs
 */
export async function getHostAliasChangeAnalytics(
  daysOrStartDate: number | Date = 30,
  endDate?: Date
): Promise<HostAliasChangeAnalytics> {
  try {
    let startDate: Date;
    let actualEndDate: Date;

    if (typeof daysOrStartDate === 'number') {
      // Legacy days parameter
      actualEndDate = new Date();
      startDate = new Date(actualEndDate.getTime() - daysOrStartDate * 24 * 60 * 60 * 1000);
    } else {
      // Date range parameters
      startDate = daysOrStartDate;
      actualEndDate = endDate || new Date();
      
      // If end date is at start of day (00:00:00), set it to end of day (23:59:59)
      if (actualEndDate.getHours() === 0 && actualEndDate.getMinutes() === 0 &&
          actualEndDate.getSeconds() === 0 && actualEndDate.getMilliseconds() === 0) {
        actualEndDate.setHours(23, 59, 59, 999);
      }
    }

    // Get host alias related audit logs
    const hostAliasLogs = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: actualEndDate,
        },
        action: {
          in: [
            // Only include SUCCESS actions for cleaner analytics
            'HOST_ALIAS_CREATE_SUCCESS',
            'HOST_ALIAS_UPDATE_SUCCESS',
            'HOST_ALIAS_DELETE_SUCCESS',
            // Also include admin aliases tab actions
            'OPNSENSE_ALIAS_UPDATE_SUCCESS',
          ],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Analyze the logs
    const analytics = analyzeHostAliasChangeLogs(hostAliasLogs);
    
    const daysDiff = Math.ceil((actualEndDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    logger.debug(`Analyzed ${hostAliasLogs.length} host alias change audit logs for ${daysDiff} days (${startDate.toISOString()} to ${actualEndDate.toISOString()})`);
    return analytics;
  } catch (error) {
    logger.error('Failed to get host alias change analytics:', error);
    throw error;
  }
}

/**
 * Get network alias change analytics from audit logs
 */
export async function getNetworkAliasChangeAnalytics(
  daysOrStartDate: number | Date = 30,
  endDate?: Date
): Promise<NetworkAliasChangeAnalytics> {
  try {
    let startDate: Date;
    let actualEndDate: Date;

    if (typeof daysOrStartDate === 'number') {
      actualEndDate = new Date();
      startDate = new Date(actualEndDate.getTime() - daysOrStartDate * 24 * 60 * 60 * 1000);
    } else {
      startDate = daysOrStartDate;
      actualEndDate = endDate || new Date();

      if (actualEndDate.getHours() === 0 && actualEndDate.getMinutes() === 0 &&
          actualEndDate.getSeconds() === 0 && actualEndDate.getMilliseconds() === 0) {
        actualEndDate.setHours(23, 59, 59, 999);
      }
    }

    const networkAliasLogs = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: actualEndDate,
        },
        action: {
          in: [
            'NETWORK_ALIAS_CREATE_SUCCESS',
            'NETWORK_ALIAS_UPDATE_SUCCESS',
            'NETWORK_ALIAS_DELETE_SUCCESS',
          ],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    const analytics = analyzeNetworkAliasChangeLogs(networkAliasLogs);

    const daysDiff = Math.ceil((actualEndDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    logger.debug(`Analyzed ${networkAliasLogs.length} network alias change audit logs for ${daysDiff} days (${startDate.toISOString()} to ${actualEndDate.toISOString()})`);
    return analytics;
  } catch (error) {
    logger.error('Failed to get network alias change analytics:', error);
    throw error;
  }
}

/**
 * Get DHCP reservation analytics from audit logs
 */
export async function getDhcpReservationAnalytics(
  daysOrStartDate: number | Date = 30,
  endDate?: Date
): Promise<DhcpReservationAnalytics> {
  try {
    let startDate: Date;
    let actualEndDate: Date;

    if (typeof daysOrStartDate === 'number') {
      // Legacy days parameter
      actualEndDate = new Date();
      startDate = new Date(actualEndDate.getTime() - daysOrStartDate * 24 * 60 * 60 * 1000);
    } else {
      // Date range parameters
      startDate = daysOrStartDate;
      actualEndDate = endDate || new Date();
      
      // If end date is at start of day (00:00:00), set it to end of day (23:59:59)
      if (actualEndDate.getHours() === 0 && actualEndDate.getMinutes() === 0 &&
          actualEndDate.getSeconds() === 0 && actualEndDate.getMilliseconds() === 0) {
        actualEndDate.setHours(23, 59, 59, 999);
      }
    }

    // Get DHCP reservation related audit logs
    const dhcpLogs = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: actualEndDate,
        },
        action: {
          in: [
            // Only include SUCCESS actions for cleaner analytics
            'DHCP_RESERVATION_ADD_SUCCESS',
            'DHCP_RESERVATION_DELETE_SUCCESS',
          ],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    logger.debug(`Found ${dhcpLogs.length} DHCP reservation logs for analytics`);

    return analyzeDhcpReservationLogs(dhcpLogs);
  } catch (error) {
    logger.error('Failed to get DHCP reservation analytics:', error);
    throw error;
  }
}

function analyzeDhcpReservationLogs(logs: AuditLogWithUser[]): DhcpReservationAnalytics {
  const summary = {
    totalOperations: 0, // Will be set to successful operations count
    creations: 0,
    deletions: 0,
    successRate: 0,
    uniqueUsers: new Set<string>(),
    uniqueIpAddresses: new Set<string>(),
    uniqueMacAddresses: new Set<string>(),
  };

  const dailyStatsMap = new Map<string, {
    creations: number;
    deletions: number;
    successfulOperations: number;
    failedOperations: number;
    uniqueUsers: Set<string>;
  }>();

  const userStatsMap = new Map<string, {
    user: {
      id: string;
      name: string | null;
      email: string | null;
    } | null;
    operations: number;
    successful: number;
  }>();

  const operationTypes: Record<string, number> = {};
  const authMethods: Record<string, number> = {};

  let successfulOperations = 0;

  logs.forEach(log => {
    const dateKey = log.timestamp.toISOString().split('T')[0];
    const isCreate = log.action.includes('_ADD_');
    const isDelete = log.action.includes('_DELETE_');

    // All logs are successful since we filtered to SUCCESS actions only
    successfulOperations++;

    // Track operation types
    operationTypes[log.action] = (operationTypes[log.action] || 0) + 1;

    // Track auth methods
    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};
    const authMethod = details.authMethod || 'unknown';
    authMethods[authMethod] = (authMethods[authMethod] || 0) + 1;

    // Track users
    if (log.userId) {
      summary.uniqueUsers.add(log.userId);

      const userStats = userStatsMap.get(log.userId);
      if (userStats) {
        userStats.operations++;
        userStats.successful++; // All operations are successful
      } else {
        userStatsMap.set(log.userId, {
          user: log.user,
          operations: 1,
          successful: 1, // All operations are successful
        });
      }
    }

    // Track IP addresses and MAC addresses from details
    if (details.ip_address) {
      summary.uniqueIpAddresses.add(details.ip_address);
    }
    if (details.hw_address) {
      summary.uniqueMacAddresses.add(details.hw_address);
    }

    // Update summary counts
    if (isCreate) summary.creations++;
    if (isDelete) summary.deletions++;

    // Update daily stats
    const dailyStats = dailyStatsMap.get(dateKey);
    if (dailyStats) {
      if (isCreate) dailyStats.creations++;
      if (isDelete) dailyStats.deletions++;
      dailyStats.successfulOperations++; // All operations are successful
      if (log.userId) dailyStats.uniqueUsers.add(log.userId);
    } else {
      dailyStatsMap.set(dateKey, {
        creations: isCreate ? 1 : 0,
        deletions: isDelete ? 1 : 0,
        successfulOperations: 1, // All operations are successful
        failedOperations: 0, // No failed operations since we filter to SUCCESS only
        uniqueUsers: new Set(log.userId ? [log.userId] : []),
      });
    }
  });

  // Set total operations to successful operations count (for consistency with breakdown)
  summary.totalOperations = successfulOperations;

  // Since we only query SUCCESS actions, success rate is 100% for the operations we analyze
  summary.successRate = 100;

  // Convert daily stats map to array
  const dailyStats = Array.from(dailyStatsMap.entries()).map(([date, stats]) => ({
    date,
    creations: stats.creations,
    deletions: stats.deletions,
    successfulOperations: stats.successfulOperations,
    failedOperations: stats.failedOperations,
    uniqueUsers: stats.uniqueUsers.size,
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Convert user stats map to array and sort by operations
  const topUsers = Array.from(userStatsMap.entries()).map(([userId, stats]) => ({
    userId,
    userName: stats.user?.name || null,
    userEmail: stats.user?.email || null,
    operations: stats.operations,
    successRate: stats.operations > 0 ? (stats.successful / stats.operations) * 100 : 0,
  })).sort((a, b) => b.operations - a.operations);

  return {
    summary: {
      totalOperations: summary.totalOperations,
      creations: summary.creations,
      deletions: summary.deletions,
      successRate: summary.successRate,
      uniqueUsers: summary.uniqueUsers.size,
      uniqueIpAddresses: summary.uniqueIpAddresses.size,
      uniqueMacAddresses: summary.uniqueMacAddresses.size,
    },
    dailyStats,
    topUsers,
    operationTypes,
    authMethods,
  };
}

interface AuditLogWithUser {
  id: string;
  timestamp: Date;
  userId: string | null;
  action: string;
  details: unknown;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

function analyzeGroupChangeLogs(logs: AuditLogWithUser[], groupDisplayMap?: Map<string, string>): GroupChangeAnalytics {
  const summary = {
    totalOperations: 0, // Will be set to successful operations count
    assignments: 0,
    unassignments: 0,
    moves: 0,
    batchOperations: 0,
    successRate: 0,
    uniqueUsers: new Set<string>(),
    uniqueGroups: new Set<string>(),
    uniqueHostAliases: new Set<string>(),
  };

  const dailyStatsMap = new Map<string, {
    assignments: number;
    unassignments: number;
    moves: number;
    batchOperations: number;
    successfulOperations: number;
    failedOperations: number;
    uniqueUsers: Set<string>;
    uniqueGroups: Set<string>;
  }>();

  const userStatsMap = new Map<string, {
    user: {
      id: string;
      name: string | null;
      email: string | null;
    } | null;
    operations: number;
    successful: number;
  }>();

  const groupStatsMap = new Map<string, {
    groupName: string;
    groupFriendlyName: string | null;
    operations: number;
    assignments: number;
    unassignments: number;
  }>();

  const operationTypes: Record<string, number> = {};
  const authMethods: Record<string, number> = {};

  let successfulOperations = 0;

  // Debug logging
  logger.debug(`Analyzing ${logs.length} group change logs`);
  if (logs.length > 0) {
    logger.debug(`Sample log actions: ${logs.slice(0, 5).map(l => l.action).join(', ')}`);
  }

  logs.forEach(log => {
    const dateKey = log.timestamp.toISOString().split('T')[0];
    const isAssign = log.action.includes('_ASSIGN_') || log.action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS' || log.action === 'NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS' || log.action === 'NETWORK_ALIAS_GROUP_ASSIGN_MOVE' || log.action === 'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_ADD_SUCCESS';
    const isUnassign = log.action.includes('_UNASSIGN_') || log.action === 'OPNSENSE_NETWORK_GROUP_NETWORK_ALIAS_REMOVE_SUCCESS';

    // Parse details to check for batch operations and moves
    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};

    // Redefine batch operations: only count as batch if multiple host aliases are involved
    const hostAliasCount = details.hostAliases?.length ||
                          (details.hostAliasName ? 1 : 0) ||
                          (details.hostAliases ? details.hostAliases.length : 0);
    const isBatch = log.action.includes('_BATCH_') && hostAliasCount > 1;

    // All logs are successful since we filtered to SUCCESS actions only
    successfulOperations++;

    // Track operation types
    operationTypes[log.action] = (operationTypes[log.action] || 0) + 1;

    // Track auth methods
    const authMethod = details.authMethod || 'unknown';
    authMethods[authMethod] = (authMethods[authMethod] || 0) + 1;

    // CORRECTED OPERATION CLASSIFICATION LOGIC:
    //
    // The previous logic incorrectly counted operations with wasMoved=true as moves
    // even when no source groups existed (i.e., assigning to an unassigned host alias).
    //
    // PROPER DEFINITIONS:
    // - MOVE: Source group(s) exist AND target group assigned (source → target)
    // - ASSIGNMENT: No source groups AND target group assigned (unassigned → target)
    // - UNASSIGNMENT: Source group(s) exist AND removed (source → unassigned)
    // - BATCH: Multiple host aliases processed in single API call

    // Check if groups were actually removed (indicating source groups existed)
    const removedGroups = details.removedFromGroups || [];
    const removedGroupsByHost = details.removedFromGroupsByHost || [];
    const hasRemovedGroups = removedGroups.length > 0 ||
                            (Array.isArray(removedGroupsByHost) && removedGroupsByHost.length > 0) ||
                            (typeof removedGroupsByHost === 'object' && Object.keys(removedGroupsByHost).length > 0);

    // MOVE: Assignment operation that also removed from source groups OR explicit move action
    const isMove = (isAssign && hasRemovedGroups) || log.action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS' || log.action === 'NETWORK_ALIAS_GROUP_ASSIGN_MOVE';

    // PURE ASSIGNMENT: Assignment operation with no source groups removed (and not a move action)
    const isPureAssignment = isAssign && !hasRemovedGroups && log.action !== 'OPNSENSE_GROUP_IP_MOVE_SUCCESS' && log.action !== 'NETWORK_ALIAS_GROUP_ASSIGN_MOVE';

    // Track users
    if (log.userId) {
      summary.uniqueUsers.add(log.userId);

      const userStats = userStatsMap.get(log.userId);
      if (userStats) {
        userStats.operations++;
        userStats.successful++; // All operations are successful
      } else {
        userStatsMap.set(log.userId, {
          user: log.user,
          operations: 1,
          successful: 1, // All operations are successful
        });
      }
    }

    // Track groups and host aliases from details
    if (details.groupId) summary.uniqueGroups.add(details.groupId);
    if (details.hostAliasName) summary.uniqueHostAliases.add(details.hostAliasName);

    // Track group stats (using proper classification)
    // IMPORTANT: For "Most Assigned Groups", we only count operations where devices are assigned TO the group
    // - Pure Assignments (unassigned → group): Count toward destination group
    // - Move Operations (group A → group B): Count ONLY toward destination group (group B)
    // - Unassignments (group → unassigned): Do NOT count in operations total
    if (details.groupId) {
      const groupStats = groupStatsMap.get(details.groupId);
      if (groupStats) {
        // Only increment operations for assignments and moves (where this group is the destination)
        // Do NOT increment for unassignments (where this group is the source being removed from)
        if (isPureAssignment || isMove) {
          groupStats.operations++;
          groupStats.assignments++;
        }
        // Track unassignments separately but don't add to operations count
        if (isUnassign) groupStats.unassignments++;
      } else {
        // Use display map to get friendly name, fall back to audit log data
        const displayName = groupDisplayMap?.get(details.groupId.toLowerCase()) ||
                           details.groupFriendlyName ||
                           details.groupName ||
                           details.groupId;

        groupStatsMap.set(details.groupId, {
          groupName: details.groupName || details.groupId,
          groupFriendlyName: displayName,
          // Only count as operation if it's an assignment or move to this group
          operations: (isPureAssignment || isMove) ? 1 : 0,
          assignments: (isPureAssignment || isMove) ? 1 : 0,
          unassignments: isUnassign ? 1 : 0,
        });
      }
    }

    // Update summary counts with proper classification
    // Note: Operations can be multiple types (e.g., a move is both an assignment and unassignment)
    if (isBatch) summary.batchOperations++;

    // Count moves (source → target)
    if (isMove) {
      summary.moves++;
    }

    // Count pure assignments (unassigned → target)
    if (isPureAssignment) {
      summary.assignments++;
    }

    // Count unassignments (includes both pure unassignments and the unassign part of moves)
    if (isUnassign) {
      summary.unassignments++;
    }

    // Debug log for first few operations
    if (successfulOperations <= 5) {
      logger.debug(`Operation ${successfulOperations}: action=${log.action}, isAssign=${isAssign}, isUnassign=${isUnassign}, isMove=${isMove}, isPureAssignment=${isPureAssignment}, hasRemovedGroups=${hasRemovedGroups}`);
      logger.debug(`  Details keys: ${Object.keys(details).join(', ')}`);
      if (details.removedFromGroups) {
        logger.debug(`  removedFromGroups: ${JSON.stringify(details.removedFromGroups)}`);
      }
    }

    // Update daily stats (all operations are successful since we filtered to SUCCESS actions only)
    const dailyStats = dailyStatsMap.get(dateKey);
    if (dailyStats) {
      if (isBatch) dailyStats.batchOperations++;
      if (isPureAssignment) dailyStats.assignments++;
      if (isUnassign) dailyStats.unassignments++;
      if (isMove) dailyStats.moves++;
      dailyStats.successfulOperations++;
      if (log.userId) dailyStats.uniqueUsers.add(log.userId);
      if (details.groupId) dailyStats.uniqueGroups.add(details.groupId);
    } else {
      dailyStatsMap.set(dateKey, {
        assignments: isPureAssignment ? 1 : 0,
        unassignments: isUnassign ? 1 : 0,
        moves: isMove ? 1 : 0,
        batchOperations: isBatch ? 1 : 0,
        successfulOperations: 1,
        failedOperations: 0, // No failed operations since we filter to SUCCESS only
        uniqueUsers: new Set(log.userId ? [log.userId] : []),
        uniqueGroups: new Set(details.groupId ? [details.groupId] : []),
      });
    }
  });

  // Set total operations to successful operations count (for consistency with breakdown)
  summary.totalOperations = successfulOperations;

  // Since we only query SUCCESS actions, success rate is 100% for the operations we analyze
  // This represents the success rate of the operations we're showing in the breakdown
  summary.successRate = 100;

  // Debug logging
  logger.debug(`Analytics summary: total=${summary.totalOperations}, assignments=${summary.assignments}, unassignments=${summary.unassignments}, moves=${summary.moves}, batch=${summary.batchOperations}, successRate=${summary.successRate}%`);
  logger.debug(`Raw counts: totalLogs=${logs.length}, successfulOps=${successfulOperations}`);

  // Convert daily stats
  const dailyStats = Array.from(dailyStatsMap.entries()).map(([date, stats]) => ({
    date,
    assignments: stats.assignments,
    unassignments: stats.unassignments,
    moves: stats.moves,
    batchOperations: stats.batchOperations,
    successfulOperations: stats.successfulOperations,
    failedOperations: stats.failedOperations,
    uniqueUsers: stats.uniqueUsers.size,
    uniqueGroups: stats.uniqueGroups.size,
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Convert user stats
  const topUsers = Array.from(userStatsMap.entries()).map(([userId, stats]) => ({
    userId,
    userName: stats.user?.name || null,
    userEmail: stats.user?.email || null,
    operations: stats.operations,
    successRate: stats.operations > 0 ? (stats.successful / stats.operations) * 100 : 0,
  })).sort((a, b) => b.operations - a.operations).slice(0, 10);

  // Convert group stats
  const topGroups = Array.from(groupStatsMap.entries()).map(([groupId, stats]) => ({
    groupId,
    groupName: stats.groupName,
    groupFriendlyName: stats.groupFriendlyName,
    operations: stats.operations,
    assignments: stats.assignments,
    unassignments: stats.unassignments,
  })).sort((a, b) => b.operations - a.operations).slice(0, 10);

  return {
    summary: {
      ...summary,
      uniqueUsers: summary.uniqueUsers.size,
      uniqueGroups: summary.uniqueGroups.size,
      uniqueHostAliases: summary.uniqueHostAliases.size,
    },
    dailyStats,
    topUsers,
    topGroups,
    operationTypes,
    authMethods,
  };
}

function analyzeHostAliasChangeLogs(logs: AuditLogWithUser[]): HostAliasChangeAnalytics {
  const summary = {
    totalOperations: 0, // Will be set to successful operations count
    creations: 0,
    modifications: 0,
    deletions: 0,
    successRate: 0,
    uniqueUsers: new Set<string>(),
    uniqueHostAliases: new Set<string>(),
  };

  const dailyStatsMap = new Map<string, {
    creations: number;
    modifications: number;
    deletions: number;
    successfulOperations: number;
    failedOperations: number;
    uniqueUsers: Set<string>;
  }>();

  const userStatsMap = new Map<string, {
    user: {
      id: string;
      name: string | null;
      email: string | null;
    } | null;
    operations: number;
    successful: number;
  }>();

  const operationTypes: Record<string, number> = {};
  const authMethods: Record<string, number> = {};

  let successfulOperations = 0;

  logs.forEach(log => {
    const dateKey = log.timestamp.toISOString().split('T')[0];
    const isCreate = log.action.includes('_CREATE_');
    const isUpdate = log.action.includes('_UPDATE_');
    const isDelete = log.action.includes('_DELETE_');

    // All logs are successful since we filtered to SUCCESS actions only
    successfulOperations++;

    // Track operation types
    operationTypes[log.action] = (operationTypes[log.action] || 0) + 1;

    // Track auth methods
    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};
    const authMethod = details.authMethod || 'unknown';
    authMethods[authMethod] = (authMethods[authMethod] || 0) + 1;

    // Track users
    if (log.userId) {
      summary.uniqueUsers.add(log.userId);

      const userStats = userStatsMap.get(log.userId);
      if (userStats) {
        userStats.operations++;
        userStats.successful++; // All operations are successful
      } else {
        userStatsMap.set(log.userId, {
          user: log.user,
          operations: 1,
          successful: 1, // All operations are successful
        });
      }
    }

    // Track host aliases from details
    if (details.aliasName || details.hostAliasName) {
      summary.uniqueHostAliases.add(details.aliasName || details.hostAliasName);
    }

    // Update summary counts
    if (isCreate) summary.creations++;
    if (isUpdate) summary.modifications++;
    if (isDelete) summary.deletions++;

    // Update daily stats
    const dailyStats = dailyStatsMap.get(dateKey);
    if (dailyStats) {
      if (isCreate) dailyStats.creations++;
      if (isUpdate) dailyStats.modifications++;
      if (isDelete) dailyStats.deletions++;
      dailyStats.successfulOperations++; // All operations are successful
      if (log.userId) dailyStats.uniqueUsers.add(log.userId);
    } else {
      dailyStatsMap.set(dateKey, {
        creations: isCreate ? 1 : 0,
        modifications: isUpdate ? 1 : 0,
        deletions: isDelete ? 1 : 0,
        successfulOperations: 1, // All operations are successful
        failedOperations: 0, // No failed operations since we filter to SUCCESS only
        uniqueUsers: new Set(log.userId ? [log.userId] : []),
      });
    }
  });

  // Set total operations to successful operations count (for consistency with breakdown)
  summary.totalOperations = successfulOperations;

  // Since we only query SUCCESS actions, success rate is 100% for the operations we analyze
  summary.successRate = 100;

  // Convert daily stats
  const dailyStats = Array.from(dailyStatsMap.entries()).map(([date, stats]) => ({
    date,
    creations: stats.creations,
    modifications: stats.modifications,
    deletions: stats.deletions,
    successfulOperations: stats.successfulOperations,
    failedOperations: stats.failedOperations,
    uniqueUsers: stats.uniqueUsers.size,
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Convert user stats
  const topUsers = Array.from(userStatsMap.entries()).map(([userId, stats]) => ({
    userId,
    userName: stats.user?.name || null,
    userEmail: stats.user?.email || null,
    operations: stats.operations,
    successRate: stats.operations > 0 ? (stats.successful / stats.operations) * 100 : 0,
  })).sort((a, b) => b.operations - a.operations).slice(0, 10);

  return {
    summary: {
      ...summary,
      uniqueUsers: summary.uniqueUsers.size,
      uniqueHostAliases: summary.uniqueHostAliases.size,
    },
    dailyStats,
    topUsers,
    operationTypes,
    authMethods,
  };
}

function analyzeNetworkAliasChangeLogs(logs: AuditLogWithUser[]): NetworkAliasChangeAnalytics {
  const summary = {
    totalOperations: 0,
    creations: 0,
    modifications: 0,
    deletions: 0,
    successRate: 0,
    uniqueUsers: new Set<string>(),
    uniqueNetworkAliases: new Set<string>(),
  };

  const dailyStatsMap = new Map<string, {
    creations: number;
    modifications: number;
    deletions: number;
    successfulOperations: number;
    failedOperations: number;
    uniqueUsers: Set<string>;
  }>();

  const userStatsMap = new Map<string, {
    user: {
      id: string;
      name: string | null;
      email: string | null;
    } | null;
    operations: number;
    successful: number;
  }>();

  const operationTypes: Record<string, number> = {};
  const authMethods: Record<string, number> = {};

  let successfulOperations = 0;

  logs.forEach(log => {
    const dateKey = log.timestamp.toISOString().split('T')[0];
    const isCreate = log.action.includes('_CREATE_');
    const isUpdate = log.action.includes('_UPDATE_');
    const isDelete = log.action.includes('_DELETE_');

    successfulOperations++;

    operationTypes[log.action] = (operationTypes[log.action] || 0) + 1;

    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};
    const authMethod = details.authMethod || 'unknown';
    authMethods[authMethod] = (authMethods[authMethod] || 0) + 1;

    if (log.userId) {
      summary.uniqueUsers.add(log.userId);

      const userStats = userStatsMap.get(log.userId);
      if (userStats) {
        userStats.operations++;
        userStats.successful++;
      } else {
        userStatsMap.set(log.userId, {
          user: log.user,
          operations: 1,
          successful: 1,
        });
      }
    }

    if (details.aliasName || details.networkAliasName) {
      summary.uniqueNetworkAliases.add(details.aliasName || details.networkAliasName);
    }

    if (isCreate) summary.creations++;
    if (isUpdate) summary.modifications++;
    if (isDelete) summary.deletions++;

    const dailyStats = dailyStatsMap.get(dateKey);
    if (dailyStats) {
      if (isCreate) dailyStats.creations++;
      if (isUpdate) dailyStats.modifications++;
      if (isDelete) dailyStats.deletions++;
      dailyStats.successfulOperations++;
      if (log.userId) dailyStats.uniqueUsers.add(log.userId);
    } else {
      dailyStatsMap.set(dateKey, {
        creations: isCreate ? 1 : 0,
        modifications: isUpdate ? 1 : 0,
        deletions: isDelete ? 1 : 0,
        successfulOperations: 1,
        failedOperations: 0,
        uniqueUsers: new Set(log.userId ? [log.userId] : []),
      });
    }
  });

  summary.totalOperations = successfulOperations;
  summary.successRate = 100;

  const dailyStats = Array.from(dailyStatsMap.entries()).map(([date, stats]) => ({
    date,
    creations: stats.creations,
    modifications: stats.modifications,
    deletions: stats.deletions,
    successfulOperations: stats.successfulOperations,
    failedOperations: stats.failedOperations,
    uniqueUsers: stats.uniqueUsers.size,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const topUsers = Array.from(userStatsMap.entries()).map(([userId, stats]) => ({
    userId,
    userName: stats.user?.name || null,
    userEmail: stats.user?.email || null,
    operations: stats.operations,
    successRate: stats.operations > 0 ? (stats.successful / stats.operations) * 100 : 0,
  })).sort((a, b) => b.operations - a.operations).slice(0, 10);

  return {
    summary: {
      ...summary,
      uniqueUsers: summary.uniqueUsers.size,
      uniqueNetworkAliases: summary.uniqueNetworkAliases.size,
    },
    dailyStats,
    topUsers,
    operationTypes,
    authMethods,
  };
}
