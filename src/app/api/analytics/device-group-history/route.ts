import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { isIpAllowedForSelfService } from '@/lib/network-utils';
import type { ValidLocalNetwork } from '@/types/settings';
import { toJsonArrayOrUndefined } from '@/lib/utils';

export async function GET(request: Request) {
    const auth = await authenticateRequest(request);

    // Check for rate limiting errors for authenticated users
    if (auth.user) {
        const authError = handleAuthResponse(auth);
        if (authError) return authError;
    }

    const { searchParams } = new URL(request.url);
    const ipAddress = searchParams.get('ipAddress');
    const hostAliasName = searchParams.get('hostAliasName');
    const currentGroupsParam = searchParams.get('currentGroups'); // JSON string of current groups
    const excludeMultiSelectGroups = searchParams.get('excludeMultiSelectGroups') === 'true'; // Filter out MultiSelect group operations

    if (!ipAddress && !hostAliasName) {
        return NextResponse.json({
            success: false,
            message: 'Either ipAddress or hostAliasName is required'
        }, { status: 400 });
    }

    // Get global settings for self-service access control
    const globalSettings = await prisma.globalSettings.findFirst({
        orderBy: { id: 'asc' },
    });

    // For unauthenticated users, check if self-service is globally disabled
    if (!auth.user) {
        if (globalSettings?.removeSelfServicePage) {
            logger.info('Unauthenticated device group history lookup blocked - self-service functionality is disabled');
            return NextResponse.json({
                error: 'Forbidden: Self-service functionality is disabled'
            }, { status: 403 });
        }
    }

    // For self-service context (unauthenticated or authenticated), validate IP access
    // Extract client IP from request headers
    // Extract client IP from request  // Extract user IP using centralized helper
    const { getClientIp } = await import('@/lib/network-utils');
    let clientIp = getClientIp(request);

    // Normalize IPs for comparison (remove IPv4-mapped IPv6 prefix)
    if (clientIp && clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7);
    }

    const normalizedRequestedIp = ipAddress ? ipAddress.trim().replace(/^::ffff:/, '') : undefined;
    const normalizedClientIp = clientIp ? clientIp.trim().replace(/^::ffff:/, '') : undefined;

    // For unauthenticated users, enforce strict IP matching
    if (!auth.user && ipAddress) {
        const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

        // Check if the requested IP is allowed for self-service operations
        const ipValidation = isIpAllowedForSelfService(
            clientIp || null,
            ipAddress,
            allowedNetworks,
            false // unauthenticated
        );

        if (!ipValidation.isAllowed) {
            logger.info(`Self-service device history access denied for IP ${ipAddress} from client IP ${clientIp}: ${ipValidation.reason}`);
            return NextResponse.json({
                error: `Forbidden: ${ipValidation.reason}`
            }, { status: 403 });
        }
    } else if (auth.user && ipAddress) {
        // For authenticated users, allow access to their own IP or permitted devices
        // If querying a different IP, validate it's allowed
        if (normalizedRequestedIp !== normalizedClientIp) {
            const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

            const ipValidation = isIpAllowedForSelfService(
                clientIp || null,
                ipAddress,
                allowedNetworks,
                true // authenticated
            );

            if (!ipValidation.isAllowed) {
                logger.info(`Device history access denied for IP ${ipAddress} from client IP ${clientIp}: ${ipValidation.reason}`);
                return NextResponse.json({
                    error: `Unauthorized: ${ipValidation.reason}`
                }, { status: 403 });
            }
        } else {
            logger.debug(`Authenticated user ${auth.user.email} querying their own IP ${ipAddress} (self-service)`);
        }
    }

    interface GroupInfo {
        id?: string;
        uuid?: string;
        groupId?: string;
        name?: string;
        groupName?: string;
        friendlyName?: string;
        groupFriendlyName?: string;
        groupType?: string;
        success?: boolean;
    }

    interface HostAlias {
        ipAddress?: string;
        hostAliasName?: string;
    }

    interface LogDetails {
        ipAddress?: string;
        hostAliasName?: string;
        hostAliases?: HostAlias[];
        targetGroup?: GroupInfo | string;
        unassignedGroup?: GroupInfo | string;
        groups?: GroupInfo[];
        removedFromGroups?: GroupInfo[];
        sourceGroups?: GroupInfo[];
        groupFriendlyName?: string;
        groupName?: string;
        unassignedGroups?: GroupInfo[];
        successfulUnassignments?: number;
        [key: string]: unknown;
    }


    // Parse current groups if provided
    // We prioritize ID/UUID for tracking, but keep names for display
    let currentGroups: { id?: string; uuid?: string; name: string; friendlyName?: string; groupType?: 'SingleSelect' | 'MultiSelect' }[] = [];
    if (currentGroupsParam) {
        try {
            currentGroups = JSON.parse(currentGroupsParam);
        } catch {
            currentGroups = [];
        }
    }

    try {
        // Fetch group display information including group types
        const opnsenseGroupDisplays = await prisma.opnsenseGroupDisplay.findMany({
            select: {
                opnsenseUuid: true,
                friendlyName: true,
                groupType: true
            }
        });

        // Create a map for quick lookup of group types by UUID
        const groupTypeMap = new Map<string, 'SingleSelect' | 'MultiSelect'>();
        opnsenseGroupDisplays.forEach(display => {
            const normalizedUuid = display.opnsenseUuid.toLowerCase();
            groupTypeMap.set(normalizedUuid, display.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect');
        });

        // Fetch relevant audit logs
        const logs = await prisma.auditLog.findMany({
            where: {
                action: {
                    in: [
                        // Individual operations
                        'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS',
                        'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS',
                        'OPNSENSE_GROUP_IP_MOVE_SUCCESS',
                        'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS',
                        'OPNSENSE_GROUP_IP_UNASSIGN_ALL_PARTIAL',

                        // Batch operations
                        'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS',
                        'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS',
                        'OPNSENSE_GROUP_IP_BATCH_ASSIGN_FAILURE',
                        'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_FAILURE',

                        // Additional operation types
                        'OPNSENSE_GROUP_IP_ADD_SUCCESS',
                        'OPNSENSE_GROUP_IP_REMOVE_SUCCESS'
                    ]
                }
            },
            orderBy: [
                { timestamp: 'asc' },
                { id: 'asc' }
            ],
            select: {
                id: true,
                timestamp: true,
                action: true,
                details: true,
                user: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            }
        });

        // Filter logs for the specific device
        const deviceLogs = logs.filter(log => {
            const details = log.details as unknown as LogDetails;
            if (!details) return false;

            // Check IP match
            if (ipAddress && details.ipAddress === ipAddress) return true;

            // Check Host Alias Name match
            if (hostAliasName && details.hostAliasName === hostAliasName) return true;

            // For batch operations, check if this device was part of the batch
            if (log.action.startsWith('OPNSENSE_GROUP_IP_BATCH_')) {
                return details.hostAliases?.some((h: HostAlias) =>
                    (ipAddress && h.ipAddress === ipAddress) ||
                    (hostAliasName && h.hostAliasName === hostAliasName)
                );
            }

            return false;
        });

        // Process logs to build history by working BACKWARDS from current state

        // Initialize with current groups from the UI (the END state)
        // We use IDs for tracking state to avoid name mismatches
        const currentGroupIds = new Set<string>();
        const groupNameMap = new Map<string, string>(); // ID -> Display Name
        const groupTypeMapFromUI = new Map<string, 'SingleSelect' | 'MultiSelect'>(); // ID -> GroupType

        // Robust lookup map: Key (Normalized String) -> ID
        const groupLookup = new Map<string, string>();

        const normalize = (s: string) => {
            if (!s) return '';
            let norm = s.trim().toLowerCase();
            // Strip common suffixes that might appear in UI but not logs (or vice versa)
            norm = norm.replace(/\s*\(single select\)/g, '');
            norm = norm.replace(/\s*\(multi select\)/g, '');
            return norm.trim();
        };

        currentGroups.forEach(g => {
            // Use uuid or id, fallback to name if neither exists (though they should)
            const id = g.uuid || g.id || g.name;
            const displayName = g.friendlyName || g.name;

            if (id) {
                // Store group type from UI
                if (g.groupType) {
                    groupTypeMapFromUI.set(id.toLowerCase(), g.groupType);
                }

                // When filtering MultiSelect groups, skip them from the initial state
                if (excludeMultiSelectGroups && g.groupType === 'MultiSelect') {
                    // Still add to groupTypeMap for lookup purposes, but don't add to currentGroupIds
                    // This ensures we can identify them in history but they won't appear in the graph
                    groupLookup.set(normalize(id), id);
                    if (g.name) groupLookup.set(normalize(g.name), id);
                    if (g.friendlyName) groupLookup.set(normalize(g.friendlyName), id);
                    return; // Skip adding to currentGroupIds
                }

                currentGroupIds.add(id);
                groupNameMap.set(id, displayName);

                // Index by ID
                groupLookup.set(normalize(id), id);
                // Index by Name
                if (g.name) groupLookup.set(normalize(g.name), id);
                // Index by FriendlyName
                if (g.friendlyName) groupLookup.set(normalize(g.friendlyName), id);
            }
        });

        // Helper to get ID and Name from group object in logs
        const getGroupInfo = (group: unknown): { id: string; name: string } | null => {
            if (!group) return null;
            if (typeof group === 'string') {
                return { id: group, name: group };
            }
            const g = group as GroupInfo;
            // Logs have two formats:
            // - groups array: groupId, groupName, groupFriendlyName
            // - removedFromGroups array: id, name, friendlyName
            const id = g.groupId || g.id || g.uuid || g.groupName || g.name;
            const name = g.groupFriendlyName || g.friendlyName || g.groupName || g.name || id;
            return id ? { id: id as string, name: (name || id) as string } : null;
        };

        // Helper to find a group ID in currentGroupIds, handling ID vs Name mismatches
        const findGroupId = (info: { id: string; name: string }): string | null => {
            if (currentGroupIds.has(info.id)) return info.id;

            const normId = normalize(info.id);
            const normName = normalize(info.name);

            // Try direct lookup
            if (groupLookup.has(normId)) return groupLookup.get(normId) || null;
            if (groupLookup.has(normName)) return groupLookup.get(normName) || null;

            // Fallback: iterate and check names in map
            for (const id of currentGroupIds) {
                const name = groupNameMap.get(id);
                if (name) {
                    const normMapName = normalize(name);
                    // Exact match after normalization
                    if (normMapName === normName || normMapName === normId) {
                        return id;
                    }
                    // Containment check (risky but needed if names are very different)
                    // Only if lengths are sufficient to avoid matching "A" with "AB" too easily
                    if (normName.length > 5 && normMapName.length > 5) {
                        if (normMapName.includes(normName) || normName.includes(normMapName)) {
                            return id;
                        }
                    }
                }
            }
            return null;
        };

        // Cache for group types to avoid repeated lookups
        const groupTypeCache = new Map<string, 'SingleSelect' | 'MultiSelect'>();

        // Helper to get group type from multiple sources
        const getGroupType = (groupId: string, auditDetails?: Record<string, unknown>): 'SingleSelect' | 'MultiSelect' | undefined => {
            const normalizedId = groupId.toLowerCase();

            // Check cache first
            if (groupTypeCache.has(normalizedId)) {
                return groupTypeCache.get(normalizedId);
            }

            // First try the groupTypeMap (from opnsenseGroupDisplay database)
            const typeFromMap = groupTypeMap.get(normalizedId);
            if (typeFromMap) {
                groupTypeCache.set(normalizedId, typeFromMap);
                return typeFromMap;
            }

            // Second try: check groupTypeMapFromUI (from currentGroups passed from frontend)
            const typeFromUI = groupTypeMapFromUI.get(normalizedId);
            if (typeFromUI) {
                groupTypeCache.set(normalizedId, typeFromUI);
                return typeFromUI;
            }

            // Third try: check audit details for group type information
            if (auditDetails) {
                // Check targetGroup
                if (auditDetails.targetGroup && typeof auditDetails.targetGroup === 'object') {
                    const tg = auditDetails.targetGroup as Record<string, unknown>;
                    if (tg.groupType && typeof tg.groupType === 'string') {
                        const type = tg.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect';
                        groupTypeCache.set(normalizedId, type);
                        return type;
                    }
                }
                // Check unassignedGroup
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

        // Helper to check if an operation should be excluded when filtering MultiSelect groups
        const shouldExcludeOperation = (
            action: string,
            targetGroupInfo: { id: string; name: string } | null,
            unassignedGroupInfo: { id: string; name: string } | null,
            sourceGroups: unknown[],
            details: LogDetails
        ): boolean => {
            if (!excludeMultiSelectGroups) return false;

            // For ASSIGN/ADD operations: exclude if target group is MultiSelect
            if (action === 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS') {
                if (targetGroupInfo) {
                    const targetId = findGroupId(targetGroupInfo) || targetGroupInfo.id;
                    const targetType = getGroupType(targetId, details);
                    if (targetType === 'MultiSelect') return true;
                }
            }

            // For UNASSIGN/REMOVE operations: exclude if source group is MultiSelect
            if (action === 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS') {
                if (unassignedGroupInfo) {
                    const sourceId = findGroupId(unassignedGroupInfo) || unassignedGroupInfo.id;
                    const sourceType = getGroupType(sourceId, details);
                    if (sourceType === 'MultiSelect') return true;
                }
            }

            // For MOVE operations: exclude if target group is MultiSelect
            if (action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS') {
                if (targetGroupInfo) {
                    const targetId = findGroupId(targetGroupInfo) || targetGroupInfo.id;
                    const targetType = getGroupType(targetId, details);
                    if (targetType === 'MultiSelect') return true;
                }
            }

            // For BATCH_ASSIGN operations: exclude if target group is MultiSelect
            if (action === 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS') {
                if (details.groups && Array.isArray(details.groups) && details.groups.length > 0) {
                    const firstGroup = getGroupInfo(details.groups[0]);
                    if (firstGroup) {
                        const groupId = findGroupId(firstGroup) || firstGroup.id;
                        const groupType = getGroupType(groupId, details);
                        if (groupType === 'MultiSelect') return true;
                    }
                }
            }

            // For BATCH_UNASSIGN operations: exclude if all groups are MultiSelect
            if (action === 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS') {
                if (details.groups && Array.isArray(details.groups) && details.groups.length > 0) {
                    const allMultiSelect = details.groups.every((g: unknown) => {
                        const groupInfo = getGroupInfo(g);
                        if (!groupInfo) return false;
                        const groupId = findGroupId(groupInfo) || groupInfo.id;
                        const groupType = getGroupType(groupId, details);
                        return groupType === 'MultiSelect';
                    });
                    if (allMultiSelect) return true;
                }
            }

            return false;
        };

        // Track if history is incomplete due to batch failures
        let historyIncomplete = false;
        let incompleteReason = '';

        // Process logs in REVERSE chronological order
        const reversedLogs = [...deviceLogs].reverse();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const history: any[] = [];

        for (const log of reversedLogs) {
            const details = log.details as unknown as LogDetails;

            // Check for batch failures
            if (log.action === 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_FAILURE' ||
                log.action === 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_FAILURE') {
                historyIncomplete = true;
                incompleteReason = 'Batch operation failure detected in history';
                break;
            }

            let effectiveAction = log.action;
            if (log.action === 'OPNSENSE_GROUP_IP_ADD_SUCCESS') {
                effectiveAction = 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS';
            } else if (log.action === 'OPNSENSE_GROUP_IP_REMOVE_SUCCESS') {
                effectiveAction = 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS';
            }

            // Resolve group info
            const targetGroupInfo = getGroupInfo(details.targetGroup);
            const unassignedGroupInfo = getGroupInfo(details.unassignedGroup);

            // For legacy logs or simple structures where group info might be top-level strings
            const fallbackGroupName = details.groupFriendlyName || details.groupName;

            // Helper to get current group names for the history event
            const getCurrentGroupNames = () => {
                return Array.from(currentGroupIds).map(id => groupNameMap.get(id) || id);
            };

            // Check if this operation should be excluded
            if (shouldExcludeOperation(effectiveAction, targetGroupInfo, unassignedGroupInfo, [], details)) {
                // Skip this operation but still need to reverse the state for accurate history reconstruction
                // We'll handle state reversal without adding to history
                switch (effectiveAction) {
                    case 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS': {
                        const groupInfo = targetGroupInfo || (fallbackGroupName ? { id: fallbackGroupName, name: fallbackGroupName } : null);
                        if (groupInfo) {
                            const idToUse = findGroupId(groupInfo) || groupInfo.id;
                            // Only reverse state if the group is NOT MultiSelect (since we're filtering it out)
                            const groupType = getGroupType(idToUse, details);
                            if (groupType !== 'MultiSelect') {
                                currentGroupIds.delete(idToUse);
                            }
                        }
                        break;
                    }
                    case 'OPNSENSE_GROUP_IP_MOVE_SUCCESS': {
                        const sourceGroupsData = details.sourceGroups || details.removedFromGroups || [];
                        const sourceGroups = sourceGroupsData.map((g: unknown) => getGroupInfo(g)).filter((g): g is { id: string; name: string } => g !== null);
                        if (targetGroupInfo) {
                            const targetId = findGroupId(targetGroupInfo) || targetGroupInfo.id;
                            // Only reverse state if the target group is NOT MultiSelect
                            const targetType = getGroupType(targetId, details);
                            if (targetType !== 'MultiSelect') {
                                currentGroupIds.delete(targetId);
                            }
                            sourceGroups.forEach((g: { id: string; name: string }) => {
                                const sourceId = findGroupId(g) || g.id;
                                // Only reverse state if the source group is NOT MultiSelect
                                const sourceType = getGroupType(sourceId, details);
                                if (sourceType !== 'MultiSelect') {
                                    currentGroupIds.add(sourceId);
                                    groupNameMap.set(sourceId, g.name);
                                    groupLookup.set(normalize(sourceId), sourceId);
                                    groupLookup.set(normalize(g.name), sourceId);
                                }
                            });
                        }
                        break;
                    }
                    case 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS': {
                        const groupInfo = unassignedGroupInfo || (fallbackGroupName ? { id: fallbackGroupName, name: fallbackGroupName } : null);
                        if (groupInfo) {
                            const idToUse = findGroupId(groupInfo) || groupInfo.id;
                            // Only reverse state if the group is NOT MultiSelect (since we're filtering it out)
                            const groupType = getGroupType(idToUse, details);
                            if (groupType !== 'MultiSelect') {
                                currentGroupIds.add(idToUse);
                                groupNameMap.set(idToUse, groupInfo.name);
                                groupLookup.set(normalize(idToUse), idToUse);
                                groupLookup.set(normalize(groupInfo.name), idToUse);
                            }
                        }
                        break;
                    }
                    case 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS': {
                        // Check if this device was part of the batch
                        const isInBatch = details.hostAliases?.some((h: HostAlias) =>
                            h.ipAddress === ipAddress || h.hostAliasName === hostAliasName
                        );
                        if (isInBatch && details.groups && Array.isArray(details.groups)) {
                            const targetGroups = details.groups.map((g: unknown) => getGroupInfo(g)).filter((g): g is { id: string; name: string } => g !== null);
                            targetGroups.forEach((g: { id: string; name: string }) => {
                                const idToDelete = findGroupId(g) || g.id;
                                // Only reverse state if the group is NOT MultiSelect
                                const groupType = getGroupType(idToDelete, details);
                                if (groupType !== 'MultiSelect') {
                                    currentGroupIds.delete(idToDelete);
                                }
                            });
                            // If it's a move, add back source groups
                            if (details.removedFromGroups && Array.isArray(details.removedFromGroups)) {
                                const sourceGroups = details.removedFromGroups.map((g: unknown) => getGroupInfo(g)).filter((g): g is { id: string; name: string } => g !== null);
                                sourceGroups.forEach((g: { id: string; name: string }) => {
                                    const idToAdd = findGroupId(g) || g.id;
                                    // Only reverse state if the source group is NOT MultiSelect
                                    const sourceType = getGroupType(idToAdd, details);
                                    if (sourceType !== 'MultiSelect') {
                                        currentGroupIds.add(idToAdd);
                                        groupNameMap.set(idToAdd, g.name);
                                        groupLookup.set(normalize(idToAdd), idToAdd);
                                        groupLookup.set(normalize(g.name), idToAdd);
                                    }
                                });
                            }
                        }
                        break;
                    }
                    case 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS': {
                        // Check if this device was part of the batch
                        const isInBatch = details.hostAliases?.some((h: HostAlias) =>
                            h.ipAddress === ipAddress || h.hostAliasName === hostAliasName
                        );
                        if (isInBatch && details.groups && Array.isArray(details.groups)) {
                            const unassignedGroups = details.groups.map((g: unknown) => getGroupInfo(g)).filter((g): g is { id: string; name: string } => g !== null);
                            unassignedGroups.forEach((g: { id: string; name: string }) => {
                                const idToAdd = findGroupId(g) || g.id;
                                // Only reverse state if the group is NOT MultiSelect
                                const groupType = getGroupType(idToAdd, details);
                                if (groupType !== 'MultiSelect') {
                                    currentGroupIds.add(idToAdd);
                                    groupNameMap.set(idToAdd, g.name);
                                    groupLookup.set(normalize(idToAdd), idToAdd);
                                    groupLookup.set(normalize(g.name), idToAdd);
                                }
                            });
                        }
                        break;
                    }
                }
                continue; // Skip to next log entry
            }

            switch (effectiveAction) {
                case 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS': {
                    // Forward: group added
                    // Backward: remove group

                    // Identify the group
                    const groupInfo = targetGroupInfo || (fallbackGroupName ? { id: fallbackGroupName, name: fallbackGroupName } : null);

                    if (groupInfo) {
                        const idToUse = findGroupId(groupInfo) || groupInfo.id;

                        // Record state BEFORE reverse (state AFTER assign)
                        history.push({
                            id: log.id,
                            timestamp: log.timestamp,
                            groupCount: currentGroupIds.size,
                            currentGroupNames: getCurrentGroupNames(),
                            action: log.action,
                            change: 1,
                            details: {
                                groupName: groupInfo.name,
                                targetGroup: groupInfo.name,
                                groupType: getGroupType(idToUse),
                                user: log.user?.name || 'System',
                                removedGroups: 0,
                                originalAction: log.action
                            }
                        });

                        // Reverse: remove group
                        currentGroupIds.delete(idToUse);
                        // We don't remove from groupNameMap as we might need it for older logs
                    }
                    break;
                }

                case 'OPNSENSE_GROUP_IP_MOVE_SUCCESS': {
                    // Forward: removed from source, added to target
                    // Backward: remove target, add source

                    const sourceGroupsData = details.sourceGroups || details.removedFromGroups || [];
                    const sourceGroups = sourceGroupsData.map((g: unknown) => getGroupInfo(g)).filter((g): g is { id: string; name: string } => g !== null);

                    if (targetGroupInfo) {
                        const targetId = findGroupId(targetGroupInfo) || targetGroupInfo.id;

                        // Record state BEFORE reverse (state AFTER move)
                        history.push({
                            id: log.id,
                            timestamp: log.timestamp,
                            groupCount: currentGroupIds.size,
                            currentGroupNames: getCurrentGroupNames(),
                            action: effectiveAction,
                            change: 1 - sourceGroups.length,
                            details: {
                                groupName: targetGroupInfo.name,
                                targetGroup: targetGroupInfo.name,
                                groupType: getGroupType(targetId),
                                user: log.user?.name || 'System',
                                removedGroups: sourceGroups.length,
                                originalAction: log.action,
                                moveOperation: {
                                    isMove: true,
                                    sourceGroups: sourceGroups.map((g: { name: string }) => g.name),
                                    targetGroup: targetGroupInfo.name,
                                    sourceGroupTypes: sourceGroups.map((g: { id: string; name: string }) => getGroupType(findGroupId(g) || g.id)),
                                    targetGroupType: getGroupType(targetId)
                                }
                            }
                        });

                        // Reverse: remove target
                        currentGroupIds.delete(targetId);

                        // Reverse: add sources
                        sourceGroups.forEach((g: { id: string; name: string }) => {
                            const sourceId = findGroupId(g) || g.id;
                            currentGroupIds.add(sourceId);
                            groupNameMap.set(sourceId, g.name);
                            // Dynamically update lookup to ensure we can find this group again
                            groupLookup.set(normalize(sourceId), sourceId);
                            groupLookup.set(normalize(g.name), sourceId);
                        });
                    }
                    break;
                }

                case 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS': {
                    // Forward: group removed
                    // Backward: add group

                    const groupInfo = unassignedGroupInfo || (fallbackGroupName ? { id: fallbackGroupName, name: fallbackGroupName } : null);

                    if (groupInfo) {
                        const idToUse = findGroupId(groupInfo) || groupInfo.id;

                        // Record state BEFORE reverse (state AFTER unassign)
                        history.push({
                            id: log.id,
                            timestamp: log.timestamp,
                            groupCount: currentGroupIds.size,
                            currentGroupNames: getCurrentGroupNames(),
                            action: effectiveAction,
                            change: -1,
                            details: {
                                groupName: groupInfo.name,
                                targetGroup: null,
                                groupType: getGroupType(idToUse),
                                user: log.user?.name || 'System',
                                removedGroups: 0,
                                originalAction: log.action
                            }
                        });

                        // Reverse: add group
                        currentGroupIds.add(idToUse);
                        groupNameMap.set(idToUse, groupInfo.name);
                        groupLookup.set(normalize(idToUse), idToUse);
                        groupLookup.set(normalize(groupInfo.name), idToUse);
                    }
                    break;
                }

                case 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS':
                case 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_PARTIAL': {
                    // Forward: all groups removed
                    // Backward: add back successful unassigned groups

                    // When filtering MultiSelect groups, we need to adjust the count and only show SingleSelect groups
                    let filteredUnassignedGroups = details.unassignedGroups || [];
                    let filteredSuccessfulUnassignments = details.successfulUnassignments || 0;

                    if (excludeMultiSelectGroups && Array.isArray(filteredUnassignedGroups)) {
                        // Filter out MultiSelect groups
                        const singleSelectGroups = filteredUnassignedGroups.filter((g: unknown) => {
                            const info = getGroupInfo(g);
                            if (!info) return false;
                            const idToUse = findGroupId(info) || info.id;
                            const groupType = getGroupType(idToUse);
                            return groupType !== 'MultiSelect';
                        });

                        // If no SingleSelect groups were unassigned, skip this operation entirely
                        if (singleSelectGroups.length === 0) {
                            // Still need to reverse state for all groups
                            if (details.unassignedGroups && Array.isArray(details.unassignedGroups)) {
                                details.unassignedGroups.forEach((g: unknown) => {
                                    const gInfo = g as GroupInfo;
                                    if (gInfo.success) {
                                        const info = getGroupInfo(g);
                                        if (info) {
                                            const idToUse = findGroupId(info) || info.id;
                                            currentGroupIds.add(idToUse);
                                            groupNameMap.set(idToUse, info.name);
                                            groupLookup.set(normalize(idToUse), idToUse);
                                            groupLookup.set(normalize(info.name), idToUse);
                                        }
                                    }
                                });
                            }
                            break; // Skip adding to history
                        }

                        filteredUnassignedGroups = singleSelectGroups;
                        filteredSuccessfulUnassignments = singleSelectGroups.filter((g: GroupInfo) => g.success).length;
                    }

                    history.push({
                        id: log.id,
                        timestamp: log.timestamp,
                        groupCount: currentGroupIds.size,
                        currentGroupNames: getCurrentGroupNames(),
                        action: effectiveAction,
                        change: -filteredSuccessfulUnassignments,
                        details: {
                            groupName: null,
                            targetGroup: null,
                            user: log.user?.name || 'System',
                            removedGroups: filteredSuccessfulUnassignments,
                            originalAction: log.action
                        }
                    });

                    // Reverse: add back groups (all groups, not just filtered ones, for accurate state reconstruction)
                    if (details.unassignedGroups && Array.isArray(details.unassignedGroups)) {
                        details.unassignedGroups.forEach((g: unknown) => {
                            const gInfo = g as GroupInfo;
                            if (gInfo.success) {
                                const info = getGroupInfo(g);
                                if (info) {
                                    const idToUse = findGroupId(info) || info.id;
                                    currentGroupIds.add(idToUse);
                                    groupNameMap.set(idToUse, info.name);
                                    groupLookup.set(normalize(idToUse), idToUse);
                                    groupLookup.set(normalize(info.name), idToUse);
                                }
                            }
                        });
                    }
                    break;
                }

                case 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS': {
                    // Check if this device was part of the batch
                    const isInBatch = details.hostAliases?.some((h: HostAlias) =>
                        h.ipAddress === ipAddress || h.hostAliasName === hostAliasName
                    );

                    if (isInBatch && details.groups && Array.isArray(details.groups)) {
                        const targetGroups = details.groups.map((g: unknown) => getGroupInfo(g)).filter((g): g is { id: string; name: string } => g !== null);
                        const sourceGroupsData = details.removedFromGroups || [];
                        const sourceGroups = sourceGroupsData.map((g: unknown) => getGroupInfo(g)).filter((g): g is { id: string; name: string } => g !== null);
                        const isMove = sourceGroups.length > 0;

                        // Forward: added to target groups, (if move) removed from source groups
                        // Backward: remove from target groups, (if move) add to source groups

                        // DEBUG LOGGING - History Replay Tracing
                        logger.debug(`[HISTORY TRACE] Batch Assign Backward: Log ID: ${log.id}`);
                        logger.debug(`  [HISTORY TRACE] Current state BEFORE reverse: ${currentGroupIds.size} groups: ${getCurrentGroupNames().join(', ')}`);
                        logger.debug(`  [HISTORY TRACE] Target groups to REMOVE: ${targetGroups.map((g: { id: string; name: string }) => `${g.name} (id: ${g.id})`).join(', ')}`);
                        logger.debug(`  [HISTORY TRACE] Source groups to ADD: ${sourceGroups.map((g: { id: string; name: string }) => `${g.name} (id: ${g.id})`).join(', ')}`);

                        // Record state BEFORE reverse (state AFTER batch assign/move)
                        history.push({
                            id: log.id,
                            timestamp: log.timestamp,
                            groupCount: currentGroupIds.size,
                            currentGroupNames: getCurrentGroupNames(),
                            action: isMove ? 'OPNSENSE_GROUP_IP_MOVE_SUCCESS' : effectiveAction,
                            change: targetGroups.length - sourceGroups.length,
                            details: {
                                groupName: targetGroups.map((g: { name: string }) => g.name).join(', '),
                                targetGroup: targetGroups.map((g: { name: string }) => g.name).join(', '),
                                groupType: targetGroups.length > 0 ? getGroupType(findGroupId(targetGroups[0]) || targetGroups[0].id) : undefined,
                                user: log.user?.name || 'System',
                                removedGroups: sourceGroups.length,
                                originalAction: log.action,
                                batchOperation: {
                                    targetGroups: targetGroups.map((g: { name: string }) => g.name),
                                    sourceGroups: sourceGroups.map((g: { name: string }) => g.name)
                                }
                            }
                        });

                        // Reverse: remove from target groups
                        targetGroups.forEach((g: { id: string; name: string }) => {
                            const idToDelete = findGroupId(g) || g.id;
                            logger.debug(`  [HISTORY TRACE] Attempting to delete target: ${g.name}, foundId: ${findGroupId(g)}, fallback: ${g.id}, exists in set: ${currentGroupIds.has(idToDelete)}`);
                            currentGroupIds.delete(idToDelete);
                        });

                        // Reverse: add back to source groups
                        sourceGroups.forEach((g: { id: string; name: string }) => {
                            const idToAdd = findGroupId(g) || g.id;
                            logger.debug(`  [HISTORY TRACE] Adding source: ${g.name}, foundId: ${findGroupId(g)}, using: ${idToAdd}`);
                            currentGroupIds.add(idToAdd);
                            groupNameMap.set(idToAdd, g.name);
                            groupLookup.set(normalize(idToAdd), idToAdd);
                            groupLookup.set(normalize(g.name), idToAdd);
                        });

                        logger.debug(`  [HISTORY TRACE] State AFTER reverse: ${currentGroupIds.size} groups: ${getCurrentGroupNames().join(', ')}`);
                    }
                    break;
                }

                case 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS': {
                    // Check if this device was part of the batch
                    const isInBatch = details.hostAliases?.some((h: HostAlias) =>
                        h.ipAddress === ipAddress || h.hostAliasName === hostAliasName
                    );

                    if (isInBatch && details.groups && Array.isArray(details.groups)) {
                        const unassignedGroups = details.groups.map((g: unknown) => getGroupInfo(g)).filter((g): g is { id: string; name: string } => g !== null);

                        // Forward: removed from groups
                        // Backward: add back to groups

                        // Record state BEFORE reverse
                        history.push({
                            id: log.id,
                            timestamp: log.timestamp,
                            groupCount: currentGroupIds.size,
                            currentGroupNames: getCurrentGroupNames(),
                            action: effectiveAction,
                            change: -unassignedGroups.length,
                            details: {
                                groupName: unassignedGroups.map((g: { name: string }) => g.name).join(', '),
                                targetGroup: null,
                                user: log.user?.name || 'System',
                                removedGroups: unassignedGroups.length,
                                originalAction: log.action,
                                batchOperation: {
                                    unassignedGroups: unassignedGroups.map((g: { name: string }) => g.name)
                                }
                            }
                        });

                        // Reverse: add back to groups
                        unassignedGroups.forEach((g: { id: string; name: string }) => {
                            const idToAdd = findGroupId(g) || g.id;
                            currentGroupIds.add(idToAdd);
                            groupNameMap.set(idToAdd, g.name);
                            groupLookup.set(normalize(idToAdd), idToAdd);
                            groupLookup.set(normalize(g.name), idToAdd);
                        });
                    }
                    break;
                }
            }
        }

        // Reverse the history to get chronological order (oldest to newest)
        history.reverse();

        // Ensure timestamps are strictly increasing to avoid overlapping points on the graph
        for (let i = 1; i < history.length; i++) {

            const prevTime = new Date(history[i - 1].timestamp).getTime();
            // eslint-disable-next-line security/detect-object-injection
            const currTime = new Date(history[i].timestamp).getTime();

            if (currTime <= prevTime) {
                // Add 1s offset to make it distinct and hoverable
                const newTime = new Date(prevTime + 1000);
                // eslint-disable-next-line security/detect-object-injection
                history[i].timestamp = newTime.toISOString();
            }
        }

        return NextResponse.json({
            success: true,
            data: history,
            historyIncomplete,
            incompleteReason
        });

    } catch (error) {
        logger.error('Error fetching device group history:', error);
        return NextResponse.json({
            success: false,
            message: 'Failed to fetch device group history'
        }, { status: 500 });
    }
}
