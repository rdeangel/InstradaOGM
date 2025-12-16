import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { buildJsonFilter, supportsArrayContains } from '@/lib/db-helpers';

/**
 * GET /api/opnsense/host-alias-last-assignment?ipAddress=<ip>
 *
 * Fetches the most recent group assignment/unassignment operation for a given IP address
 * from the AuditLog table.
 *
 * Mixed Authentication Endpoint:
 * - Authenticated users: Can query any IP address within their device management scope
 * - Unauthenticated users: Can only query their own detected IP address
 *
 * Returns:
 * - timestamp: Date of the last operation
 * - operationType: 'assign', 'unassign', 'move', 'batch_assign', 'batch_unassign', 'unassign_all'
 * - action: The full audit action name
 * - groupName: The group friendly name or name (if available) - DEPRECATED, use targetGroup or sourceGroups
 * - userName: The user who performed the operation (if available)
 * - sourceGroups: Array of groups removed from (for move operations)
 * - targetGroup: Group assigned to (for assign/move operations)
 * - allGroups: Array of all groups involved (for batch/unassign_all operations)
 * - operationCount: Total number of operations (for batch operations)
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  // Extract client IP using standardized helper
  const { getClientIp } = await import('@/lib/network-utils');
  const rawClientIp = getClientIp(request);

  // Normalize client IP for comparison (remove IPv4-mapped IPv6 prefix)
  const clientIp = rawClientIp?.startsWith('::ffff:') ? rawClientIp.substring(7) : (rawClientIp || 'unknown');

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // Check if self-service is globally disabled for unauthenticated users only
  const globalSettings = await prisma.globalSettings.findFirst({
    orderBy: { id: 'asc' },
  });

  if (!auth.user && globalSettings?.removeSelfServicePage) {
    logger.info(`Unauthenticated last assignment query blocked - self-service functionality is globally disabled`);
    return NextResponse.json({
      error: 'Forbidden: Self-service functionality is disabled'
    }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const ipAddress = searchParams.get('ipAddress');
  const excludeMultiSelectGroups = searchParams.get('excludeMultiSelectGroups') === 'true'; // Filter out MultiSelect group operations
  const normalizedRequestedIp = ipAddress?.startsWith('::ffff:') ? ipAddress.substring(7) : ipAddress;

  if (!ipAddress) {
    return NextResponse.json({ error: 'ipAddress parameter is required' }, { status: 400 });
  }

  // If not authenticated, verify the request is for the client's own IP
  if (!auth.user) {
    if (normalizedRequestedIp !== clientIp) {
      logger.warn(`Unauthorized attempt to query last assignment for IP ${ipAddress} from client IP ${clientIp}.`);
      return new NextResponse(JSON.stringify({ error: 'Forbidden: You can only query for your own device.' }), { status: 403 });
    }
  }

  try {
    // Fetch group type information if filtering is enabled
    const groupTypeMap = new Map<string, 'SingleSelect' | 'MultiSelect'>();
    if (excludeMultiSelectGroups) {
      const opnsenseGroupDisplays = await prisma.opnsenseGroupDisplay.findMany({
        select: {
          opnsenseUuid: true,
          friendlyName: true,
          groupType: true
        }
      });

      opnsenseGroupDisplays.forEach(display => {
        const normalizedUuid = display.opnsenseUuid.toLowerCase();
        groupTypeMap.set(normalizedUuid, display.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect');
      });
    }

    // Cache for group types to avoid repeated lookups
    const groupTypeCache = new Map<string, 'SingleSelect' | 'MultiSelect'>();

    // Helper to get group type from the map or audit log details
    const getGroupType = (groupId: string, auditDetails?: Record<string, unknown>): 'SingleSelect' | 'MultiSelect' | undefined => {
      if (!excludeMultiSelectGroups) return undefined;
      const normalizedId = groupId.toLowerCase();

      // Check cache first
      if (groupTypeCache.has(normalizedId)) {
        return groupTypeCache.get(normalizedId);
      }

      // First try the groupTypeMap (from opnsenseGroupDisplay)
      const typeFromMap = groupTypeMap.get(normalizedId);
      if (typeFromMap) {
        groupTypeCache.set(normalizedId, typeFromMap);
        return typeFromMap;
      }

      // Fallback: check if the audit details contain group type information
      if (auditDetails) {
        // Check targetGroup for group type
        if (auditDetails.targetGroup && typeof auditDetails.targetGroup === 'object') {
          const tg = auditDetails.targetGroup as Record<string, unknown>;
          if (tg.groupType && typeof tg.groupType === 'string') {
            const type = tg.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect';
            groupTypeCache.set(normalizedId, type);
            return type;
          }
        }
        // Check unassignedGroup for group type
        if (auditDetails.unassignedGroup && typeof auditDetails.unassignedGroup === 'object') {
          const ug = auditDetails.unassignedGroup as Record<string, unknown>;
          if (ug.groupType && typeof ug.groupType === 'string') {
            const type = ug.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect';
            groupTypeCache.set(normalizedId, type);
            return type;
          }
        }
        // Check groups array (for batch operations)
        if (auditDetails.groups && Array.isArray(auditDetails.groups)) {
          for (const group of auditDetails.groups) {
            if (typeof group === 'object' && group !== null) {
              const g = group as Record<string, unknown>;
              const gId = (typeof g.groupId === 'string' ? g.groupId : '') || (typeof g.id === 'string' ? g.id : '');
              if (gId.toLowerCase() === normalizedId && g.groupType && typeof g.groupType === 'string') {
                const type = g.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect';
                groupTypeCache.set(normalizedId, type);
                return type;
              }
            }
          }
        }
        // Check removedFromGroups (for move operations)
        if (auditDetails.removedFromGroups && Array.isArray(auditDetails.removedFromGroups)) {
          for (const group of auditDetails.removedFromGroups) {
            if (typeof group === 'object' && group !== null) {
              const g = group as Record<string, unknown>;
              const gId = (typeof g.id === 'string' ? g.id : '') || (typeof g.groupId === 'string' ? g.groupId : '');
              if (gId.toLowerCase() === normalizedId && g.groupType && typeof g.groupType === 'string') {
                const type = g.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect';
                groupTypeCache.set(normalizedId, type);
                return type;
              }
            }
          }
        }
      }

      return undefined;
    };

    // Helper to check if an operation involves MultiSelect groups
    const isMultiSelectOperation = (assignment: { action: string; details: unknown }): boolean => {
      if (!excludeMultiSelectGroups) return false;

      const details = assignment.details as Record<string, unknown>;
      if (!details) return false;

      const action = assignment.action;

      // Helper to extract group info
      const extractGroupInfo = (group: Record<string, unknown>) => ({
        id: (typeof group.id === 'string' ? group.id : '') || (typeof group.groupId === 'string' ? group.groupId : ''),
        name: (typeof group.name === 'string' ? group.name : '') || (typeof group.groupName === 'string' ? group.groupName : ''),
      });

      // For ASSIGN operations - check target group
      if (action.includes('ASSIGN') && !action.includes('UNASSIGN') && !action.includes('BATCH')) {
        if (details.targetGroup && typeof details.targetGroup === 'object') {
          const tg = extractGroupInfo(details.targetGroup as Record<string, unknown>);
          const groupType = getGroupType(tg.id, details);
          if (groupType === 'MultiSelect') return true;
        }
      }

      // For UNASSIGN operations (not UNASSIGN_ALL) - check source group
      if (action.includes('UNASSIGN') && !action.includes('UNASSIGN_ALL') && !action.includes('BATCH')) {
        if (details.unassignedGroup && typeof details.unassignedGroup === 'object') {
          const ug = extractGroupInfo(details.unassignedGroup as Record<string, unknown>);
          const groupType = getGroupType(ug.id, details);
          if (groupType === 'MultiSelect') return true;
        }
        // Fallback to direct properties
        else if (details.groupId && typeof details.groupId === 'string') {
          const groupType = getGroupType(details.groupId, details);
          if (groupType === 'MultiSelect') return true;
        }
      }

      // For MOVE operations - check target group
      if (action.includes('MOVE')) {
        if (details.targetGroup && typeof details.targetGroup === 'object') {
          const tg = extractGroupInfo(details.targetGroup as Record<string, unknown>);
          const groupType = getGroupType(tg.id, details);
          if (groupType === 'MultiSelect') return true;
        }
      }

      // For BATCH operations - check if target groups are MultiSelect
      if (action.includes('BATCH_ASSIGN')) {
        if (details.groups && Array.isArray(details.groups) && details.groups.length > 0) {
          const firstGroup = details.groups[0];
          if (typeof firstGroup === 'object' && firstGroup !== null) {
            const fg = extractGroupInfo(firstGroup as Record<string, unknown>);
            const groupType = getGroupType(fg.id, details);
            if (groupType === 'MultiSelect') return true;
          }
        }
      }

      if (action.includes('BATCH_UNASSIGN')) {
        if (details.groups && Array.isArray(details.groups) && details.groups.length > 0) {
          // Check if all groups are MultiSelect
          const allMultiSelect = details.groups.every((g: unknown) => {
            if (typeof g === 'object' && g !== null) {
              const groupInfo = extractGroupInfo(g as Record<string, unknown>);
              const groupType = getGroupType(groupInfo.id, details);
              return groupType === 'MultiSelect';
            }
            return false;
          });
          if (allMultiSelect) return true;
        }
      }

      // For UNASSIGN_ALL - check if any SingleSelect groups were involved
      // If only MultiSelect groups were unassigned, exclude it
      if (action.includes('UNASSIGN_ALL')) {
        const groupsData = details.unassignedGroups || details.groupsUnassigned;
        if (groupsData && Array.isArray(groupsData) && groupsData.length > 0) {
          const hasSingleSelect = groupsData.some((g: unknown) => {
            if (typeof g === 'object' && g !== null) {
              const groupInfo = extractGroupInfo(g as Record<string, unknown>);
              const groupType = getGroupType(groupInfo.id, details);
              return groupType !== 'MultiSelect';
            }
            return false;
          });
          if (!hasSingleSelect) return true; // All were MultiSelect, so exclude
        }
      }

      return false;
    };

    // Query the most recent assignment-related audit log for this IP address
    // Note: We need to handle two different structures:
    // 1. Single operations: details.ipAddress = "192.168.1.100"
    // 2. Batch operations: details.hostAliases[].ipAddress = "192.168.1.100"
    // When filtering MultiSelect groups, we may need to fetch multiple records to find the first non-MultiSelect operation
    const takeCount = excludeMultiSelectGroups ? 50 : 1; // Fetch more records when filtering

    let assignments: Array<{
      id: string;
      userId: string | null;
      timestamp: Date;
      action: string;
      details: unknown;
      user: { id: string; name: string | null; email: string | null } | null;
    }>;

    if (supportsArrayContains()) {
      // PostgreSQL: Use array_contains for batch operations
      assignments = await prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS',
              'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS',
              'OPNSENSE_GROUP_IP_MOVE_SUCCESS',
              'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS',
              'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS',
              'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS',
              'OPNSENSE_GROUP_IP_UNASSIGN_ALL_PARTIAL',
            ],
          },
          OR: [
            // Single operations: details.ipAddress
            {
              details: buildJsonFilter(['ipAddress'], ipAddress),
            },
            // Batch operations: details.hostAliases[].ipAddress
            {
              details: {
                path: ['hostAliases'],
                array_contains: [{ ipAddress }],
              } as never,
            },
          ],
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
        take: takeCount,
      }) as typeof assignments;
    } else {
      // SQLite: Fetch all matching actions and filter in-memory
      const allAssignments = await prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS',
              'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS',
              'OPNSENSE_GROUP_IP_MOVE_SUCCESS',
              'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS',
              'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS',
              'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS',
              'OPNSENSE_GROUP_IP_UNASSIGN_ALL_PARTIAL',
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
      }) as typeof assignments;

      // Filter in-memory for SQLite
      assignments = allAssignments.filter(assignment => {
        const details = assignment.details as Record<string, unknown>;
        if (!details) return false;

        // Check single operations: details.ipAddress
        if (details.ipAddress === ipAddress) return true;

        // Check batch operations: details.hostAliases[].ipAddress
        if (Array.isArray(details.hostAliases)) {
          return details.hostAliases.some((alias: unknown) => {
            if (typeof alias === 'object' && alias !== null) {
              const aliasObj = alias as Record<string, unknown>;
              return aliasObj.ipAddress === ipAddress;
            }
            return false;
          });
        }

        return false;
      }).slice(0, takeCount);
    }

    // Filter out MultiSelect operations if needed
    let lastAssignment = null;
    if (excludeMultiSelectGroups) {
      // Find the first operation that doesn't involve MultiSelect groups
      lastAssignment = assignments.find(assignment => !isMultiSelectOperation(assignment)) || null;
    } else {
      lastAssignment = assignments[0] || null;
    }

    if (!lastAssignment) {
      // For unauthenticated users, exclude userName from response
      if (!auth.user) {
        return NextResponse.json({
          timestamp: null,
          operationType: null,
          action: null,
          groupName: null
        });
      }

      return NextResponse.json({
        timestamp: null,
        operationType: null,
        action: null,
        groupName: null,
        userName: null
      });
    }

    // Extract operation type from action
    let operationType: string;
    if (lastAssignment.action.includes('ASSIGN_SUCCESS') && !lastAssignment.action.includes('BATCH') && !lastAssignment.action.includes('UNASSIGN')) {
      operationType = 'assign';
    } else if (lastAssignment.action.includes('UNASSIGN_ALL')) {
      operationType = 'unassign_all';
    } else if (lastAssignment.action.includes('UNASSIGN') && !lastAssignment.action.includes('BATCH')) {
      operationType = 'unassign';
    } else if (lastAssignment.action.includes('MOVE')) {
      operationType = 'move';
    } else if (lastAssignment.action.includes('BATCH_ASSIGN')) {
      operationType = 'batch_assign';
    } else if (lastAssignment.action.includes('BATCH_UNASSIGN')) {
      operationType = 'batch_unassign';
    } else {
      operationType = 'unknown';
    }

    // Extract group information from details
    const details = lastAssignment.details as Record<string, unknown>;
    let groupName: string | null = null;
    let sourceGroups: Array<{ id: string; name: string; friendlyName: string | null }> | undefined;
    let targetGroup: { id: string; name: string; friendlyName: string | null } | undefined;
    let allGroups: Array<{ id: string; name: string; friendlyName: string | null }> | undefined;
    let operationCount: number | undefined;

    if (details) {
      // Helper function to extract group info
      const extractGroupInfo = (group: Record<string, unknown>) => ({
        id: (typeof group.id === 'string' ? group.id : '') || (typeof group.groupId === 'string' ? group.groupId : ''),
        name: (typeof group.name === 'string' ? group.name : '') || (typeof group.groupName === 'string' ? group.groupName : ''),
        friendlyName: (typeof group.friendlyName === 'string' ? group.friendlyName : null) || (typeof group.groupFriendlyName === 'string' ? group.groupFriendlyName : null),
      });

      // Try to get friendly name first, then fall back to name (for backward compatibility)
      groupName = (typeof details.groupFriendlyName === 'string' ? details.groupFriendlyName : null) ||
        (typeof details.groupName === 'string' ? details.groupName : null) ||
        null;

      // For ASSIGN operations - extract target group
      if (operationType === 'assign' && details.targetGroup && typeof details.targetGroup === 'object') {
        const tg = details.targetGroup as Record<string, unknown>;
        targetGroup = extractGroupInfo(tg);
        groupName = targetGroup.friendlyName || targetGroup.name;
      }

      // For MOVE operations - extract source groups and target group
      if (operationType === 'move') {
        // Extract target group
        if (details.targetGroup && typeof details.targetGroup === 'object') {
          const tg = details.targetGroup as Record<string, unknown>;
          targetGroup = extractGroupInfo(tg);
          groupName = targetGroup.friendlyName || targetGroup.name;
        }

        // Extract source groups (can be from sourceGroups or removedFromGroups)
        const sourceGroupsData = details.sourceGroups || details.removedFromGroups;
        if (sourceGroupsData && Array.isArray(sourceGroupsData) && sourceGroupsData.length > 0) {
          sourceGroups = sourceGroupsData.map((sg: unknown) => {
            if (typeof sg === 'object' && sg !== null) {
              return extractGroupInfo(sg as Record<string, unknown>);
            }
            return { id: '', name: '', friendlyName: null };
          }).filter(sg => sg.id || sg.name);
        }
      }

      // For UNASSIGN operations - extract source group
      if (operationType === 'unassign') {
        // Check for unassignedGroup object first (new format)
        if (details.unassignedGroup && typeof details.unassignedGroup === 'object') {
          const ug = details.unassignedGroup as Record<string, unknown>;
          const sourceGroup = extractGroupInfo(ug);
          sourceGroups = [sourceGroup];
          groupName = sourceGroup.friendlyName || sourceGroup.name;
        }
        // Fallback to direct properties (legacy format)
        else if (details.groupId || details.groupName) {
          const sourceGroup = {
            id: (typeof details.groupId === 'string' ? details.groupId : ''),
            name: (typeof details.groupName === 'string' ? details.groupName : ''),
            friendlyName: (typeof details.groupFriendlyName === 'string' ? details.groupFriendlyName : null),
          };
          sourceGroups = [sourceGroup];
          groupName = sourceGroup.friendlyName || sourceGroup.name;
        }
      }

      // For BATCH operations - extract all groups and operation count
      if (operationType === 'batch_assign' || operationType === 'batch_unassign') {
        // Check if this is actually a move operation (batch with removedFromGroups)
        const hasRemovedGroups = details.removedFromGroups && Array.isArray(details.removedFromGroups) && details.removedFromGroups.length > 0;

        if (hasRemovedGroups && operationType === 'batch_assign') {
          // This is a batch move operation - treat it as a move
          operationType = 'move';

          // Extract source groups (removed from)
          const removedGroupsArray = details.removedFromGroups as unknown[];
          sourceGroups = removedGroupsArray.map((g: unknown) => {
            if (typeof g === 'object' && g !== null) {
              return extractGroupInfo(g as Record<string, unknown>);
            }
            return { id: '', name: '', friendlyName: null };
          }).filter((g: { id: string; name: string; friendlyName: string | null }) => g.id || g.name);

          // Extract target group (assigned to)
          if (details.groups && Array.isArray(details.groups) && details.groups.length > 0) {
            const tg = details.groups[0];
            if (typeof tg === 'object' && tg !== null) {
              targetGroup = extractGroupInfo(tg as Record<string, unknown>);
              groupName = targetGroup.friendlyName || targetGroup.name;
            }
          }
        } else {
          // Regular batch operation (not a move)
          if (details.groups && Array.isArray(details.groups) && details.groups.length > 0) {
            allGroups = details.groups.map((g: unknown) => {
              if (typeof g === 'object' && g !== null) {
                return extractGroupInfo(g as Record<string, unknown>);
              }
              return { id: '', name: '', friendlyName: null };
            }).filter(g => g.id || g.name || g.friendlyName); // Also accept groups with only friendlyName

            // Set groupName for backward compatibility (first group with count)
            if (allGroups.length > 0) {
              const firstGroup = allGroups[0];
              groupName = firstGroup.friendlyName || firstGroup.name;
              if (allGroups.length > 1) {
                groupName = groupName ? `${groupName} (+${allGroups.length - 1} more)` : null;
              }
            }
          }

          // Extract operation count
          if (typeof details.totalOperations === 'number') {
            operationCount = details.totalOperations;
          } else if (typeof details.successfulOperations === 'number') {
            operationCount = details.successfulOperations;
          }
        }
      }

      // For UNASSIGN_ALL operations - extract all groups that were unassigned
      if (operationType === 'unassign_all') {
        // Check for unassignedGroups (correct field name)
        const groupsData = details.unassignedGroups || details.groupsUnassigned;
        if (groupsData && Array.isArray(groupsData) && groupsData.length > 0) {
          allGroups = groupsData.map((g: unknown) => {
            if (typeof g === 'object' && g !== null) {
              return extractGroupInfo(g as Record<string, unknown>);
            }
            return { id: '', name: '', friendlyName: null };
          }).filter(g => g.id || g.name);

          operationCount = allGroups.length;
        } else if (typeof details.totalGroupsUnassigned === 'number') {
          operationCount = details.totalGroupsUnassigned;
        }

        // Set groupName for backward compatibility
        if (operationCount) {
          groupName = `${operationCount} group${operationCount > 1 ? 's' : ''}`;
        }
      }
    }

    // Build response object
    const baseResponse = {
      timestamp: lastAssignment.timestamp.toISOString(),
      operationType,
      action: lastAssignment.action,
      groupName, // Keep for backward compatibility
    };

    // Add enhanced fields if available
    const enhancedFields: Record<string, unknown> = {};
    if (sourceGroups && sourceGroups.length > 0) {
      enhancedFields.sourceGroups = sourceGroups;
    }
    if (targetGroup) {
      enhancedFields.targetGroup = targetGroup;
    }
    if (allGroups && allGroups.length > 0) {
      enhancedFields.allGroups = allGroups;
    }
    if (operationCount !== undefined) {
      enhancedFields.operationCount = operationCount;
    }

    // For unauthenticated users, exclude userName from response
    if (!auth.user) {
      return NextResponse.json({
        ...baseResponse,
        ...enhancedFields,
      });
    }

    return NextResponse.json({
      ...baseResponse,
      ...enhancedFields,
      userName: lastAssignment.user?.name || lastAssignment.user?.email || null,
    });

  } catch (error) {
    logger.error('Error fetching last assignment operation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

