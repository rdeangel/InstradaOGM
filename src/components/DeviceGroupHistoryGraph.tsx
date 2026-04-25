'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {

    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,


    AreaChart,
    Area,
    ReferenceDot,
    BarChart,
    Bar,
    ReferenceLine,
    Cell,
    Legend
} from 'recharts';
import { format, subHours, subDays, subWeeks, subMonths, subYears, formatDistanceToNow } from 'date-fns';
import { AlertCircle, Activity, Layers, GitCommit, TrendingUp, Square, Grid2x2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { cn } from '@/lib/utils';
import { useGroupType } from '@/context/GroupTypeContext';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface HistoryEvent {
    id: string;
    timestamp: string;
    groupCount: number;
    action: string;
    change: number;
    currentGroupNames?: string[];
    time?: number;
    visualChange?: number;
    details: {
        groupName?: string;
        targetGroup?: string;
        groupType?: 'SingleSelect' | 'MultiSelect';
        user: string;
        removedGroups: number;
        batchOperation?: boolean;
        originalAction?: string;
        info?: string;
        moveOperation?: {
            isMove: boolean;
            sourceGroups: string[];
            targetGroup: string;
            sourceGroupTypes?: ('SingleSelect' | 'MultiSelect')[];
            targetGroupType?: 'SingleSelect' | 'MultiSelect';
        };
    };
}

type TimePeriod = '1h' | '3h' | '6h' | '12h' | '1d' | '1w' | '1m' | '3m' | '1y';
type ViewMode = 'total' | 'activity';
type CurveType = 'stepAfter' | 'monotone';

const getTimePeriodLabel = (period: TimePeriod): string => {
    switch (period) {
        case '1h': return '1 hour';
        case '3h': return '3 hours';
        case '6h': return '6 hours';
        case '12h': return '12 hours';
        case '1d': return '24 hours';
        case '1w': return '1 week';
        case '1m': return '1 month';
        case '3m': return '3 months';
        case '1y': return '1 year';
        default: return '1 week';
    }
};

interface DeviceGroupHistoryGraphProps {
    ipAddress?: string;
    hostAliasName?: string;
    networkAliasUuid?: string;
    networkAliasName?: string;
    currentGroups?: { id?: string; uuid?: string; name: string; friendlyName?: string; groupType?: 'SingleSelect' | 'MultiSelect' }[];
    className?: string;
    isSelfService?: boolean;
    hideTitle?: boolean;
}

export interface DeviceGroupHistoryGraphHandles {
    refresh: () => Promise<void>;
}

export const DeviceGroupHistoryGraph = React.forwardRef<DeviceGroupHistoryGraphHandles, DeviceGroupHistoryGraphProps>(({ ipAddress, hostAliasName, networkAliasUuid, networkAliasName, currentGroups, className, isSelfService = false, hideTitle = false }, ref) => {
    const [data, setData] = useState<HistoryEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [historyIncomplete, setHistoryIncomplete] = useState(false);
    const [incompleteReason, setIncompleteReason] = useState('');
    const [timePeriod, setTimePeriod] = useLocalStorage<TimePeriod>('device-group-history-time-period', '1w');
    const [viewMode, setViewMode] = useLocalStorage<ViewMode>('device-group-history-view-mode', 'total');
    const [curveType, setCurveType] = useLocalStorage<CurveType>('device-group-history-curve-type', 'stepAfter');
    const [allGroupsMap, setAllGroupsMap] = useState<Map<string, 'SingleSelect' | 'MultiSelect'>>(new Map());

    // Use the same hook as NetworkGroupsCard and SelfServiceCard
    const { enableGroupTypes, enableSelfServiceMultiSelect } = useGroupType();

    // Fetch all network groups to get types for historical groups
    useEffect(() => {
        const fetchData = async () => {
            try {
                const groupsResponse = await fetch('/api/opnsense/network-groups');
                if (groupsResponse.ok) {
                    const result = await groupsResponse.json();
                    if (result.networkGroups) {
                        const map = new Map<string, 'SingleSelect' | 'MultiSelect'>();
                        result.networkGroups.forEach((g: { name?: string; friendlyName?: string; groupType?: 'SingleSelect' | 'MultiSelect' }) => {
                            if (g.groupType) {
                                if (g.name) map.set(g.name, g.groupType);
                                if (g.friendlyName) map.set(g.friendlyName, g.groupType);
                            }
                        });
                        setAllGroupsMap(map);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch groups:', err);
            }
        };
        fetchData();
    }, []);



    // Create a stable reference for currentGroups to prevent unnecessary fetches
    const currentGroupsRef = React.useRef(currentGroups);
    React.useEffect(() => {
        currentGroupsRef.current = currentGroups;
    }, [currentGroups]);

    const isNetworkAliasMode = !!networkAliasUuid || !!networkAliasName;

    const fetchData = React.useCallback(async (isRefresh = false) => {
        if (!ipAddress && !hostAliasName && !networkAliasUuid && !networkAliasName) return;

        // Only show loading spinner on initial load, not on refresh
        if (!isRefresh) {
            setIsLoading(true);
        }
        setError(null);

        try {
            const params = new URLSearchParams();
            if (isNetworkAliasMode) {
                if (networkAliasUuid) params.append('aliasUuid', networkAliasUuid);
                if (networkAliasName) params.append('aliasName', networkAliasName);
            } else {
                if (ipAddress) params.append('ipAddress', ipAddress);
                if (hostAliasName) params.append('hostAliasName', hostAliasName);

                // Filter out MultiSelect group operations when in self-service mode with multi-select disabled
                if (isSelfService && enableGroupTypes && !enableSelfServiceMultiSelect) {
                    params.append('excludeMultiSelectGroups', 'true');
                }
            }

            // Use the ref to get the latest currentGroups value
            const currentGroupsJson = JSON.stringify(currentGroupsRef.current || []);
            if (currentGroupsJson) {
                params.append('currentGroups', currentGroupsJson);
            }

            const endpoint = isNetworkAliasMode
                ? '/api/analytics/network-alias-group-history'
                : '/api/analytics/device-group-history';

            const response = await fetch(`${endpoint}?${params.toString()}`);

            if (!response.ok) {
                throw new Error('Failed to fetch history data');
            }

            const result = await response.json();
            if (result.success) {
                setData(result.data);
                setHistoryIncomplete(result.historyIncomplete || false);
                setIncompleteReason(result.incompleteReason || '');
            } else {
                throw new Error(result.message || 'Failed to fetch history data');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            // Only hide loading spinner if we showed it
            if (!isRefresh) {
                setIsLoading(false);
            }
        }
    }, [ipAddress, hostAliasName, networkAliasUuid, networkAliasName, isSelfService, enableGroupTypes, enableSelfServiceMultiSelect, isNetworkAliasMode]);

    React.useImperativeHandle(ref, () => ({
        refresh: () => fetchData(true) // Silent refresh without loading spinner
    }), [fetchData]);

    // Only fetch on mount or when IP/hostname/alias changes
    // Parent will call refresh() when currentGroups changes
    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ipAddress, hostAliasName, networkAliasUuid, networkAliasName]);

    const filteredData = React.useMemo(() => {
        if (!data || data.length === 0) return [];

        const now = new Date();
        let cutoffDate: Date;

        switch (timePeriod) {
            case '1h': cutoffDate = subHours(now, 1); break;
            case '3h': cutoffDate = subHours(now, 3); break;
            case '6h': cutoffDate = subHours(now, 6); break;
            case '12h': cutoffDate = subHours(now, 12); break;
            case '1d': cutoffDate = subDays(now, 1); break;
            case '1w': cutoffDate = subWeeks(now, 1); break;
            case '1m': cutoffDate = subMonths(now, 1); break;
            case '3m': cutoffDate = subMonths(now, 3); break;
            case '1y': cutoffDate = subYears(now, 1); break;
            default: cutoffDate = subWeeks(now, 1);
        }

        const cutoffTime = cutoffDate.getTime();

        // Filter data within range
        const rangeData = data.filter(event => {
            const eventTime = new Date(event.timestamp).getTime();
            return eventTime >= cutoffTime;
        });

        if (rangeData.length === 0) {
            // If no data in range, try to find the last known state before cutoff
            const lastKnownEvent = [...data]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .find(event => new Date(event.timestamp).getTime() < cutoffTime);

            if (lastKnownEvent) {
                // Create a flat line from cutoff to now with the last known state
                return [
                    { ...lastKnownEvent, timestamp: cutoffDate.toISOString(), id: 'start-synthetic' },
                    { ...lastKnownEvent, timestamp: now.toISOString(), id: 'end-synthetic' }
                ];
            }
            return [];
        }

        // Add synthetic points to extend the line to the edges
        const processedData = [...rangeData];

        // Add start point if needed (using first event's state or previous state)
        const firstEvent = processedData[0];
        if (new Date(firstEvent.timestamp).getTime() > cutoffTime) {
            const lastKnownEvent = [...data]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .find(event => new Date(event.timestamp).getTime() < cutoffTime);

            if (lastKnownEvent) {
                processedData.unshift({ ...lastKnownEvent, timestamp: cutoffDate.toISOString(), id: 'start-synthetic' });
            } else {
                // If no previous state found (e.g. first ever event is in this window),
                // back-calculate the previous count from the change
                const previousCount = Math.max(0, firstEvent.groupCount - firstEvent.change);
                processedData.unshift({
                    ...firstEvent,
                    groupCount: previousCount,
                    currentGroupNames: [], // We don't know the previous groups names roughly, but count is enough for graph
                    timestamp: cutoffDate.toISOString(),
                    id: 'start-synthetic-calculated'
                });
            }
        }

        // Add visualChange to all data points
        return processedData.map(event => ({
            ...event,
            visualChange: (event.details.moveOperation?.isMove || event.action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS') ? 0.5 : event.change
        }));
    }, [data, timePeriod]);

    const getBarColor = (event: HistoryEvent) => {
        if (event.details.moveOperation?.isMove || event.action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS') {
            return "hsl(var(--info, 217 91% 60%))"; // Blue for moves
        }
        return event.change > 0 ? "hsl(142, 76%, 28%)" : "hsl(262, 83%, 58%)"; // Purple for unassignments
    };

    const containerRef = useRef<HTMLDivElement>(null);

    const CustomTooltip = ({ active, payload, coordinate }: { active?: boolean; payload?: { payload: HistoryEvent }[]; coordinate?: { x: number; y: number } }) => {
        if (!active || !payload || !payload.length) return null;

        // Ensure we are on client and have container
        if (typeof document === 'undefined' || !containerRef.current) return null;

        const event = payload[0].payload as HistoryEvent;

        // Hide tooltip for synthetic events (start/end of graph)
        if (event.id.includes('synthetic')) return null;

        const dateLabel = format(new Date(event.timestamp), 'PPpp');

        let actionText: string | JSX.Element = '';
        const userName = event.details.user;

        // Helper to look up group type from currentGroups as fallback
        const lookupGroupType = (groupName: string): 'SingleSelect' | 'MultiSelect' | undefined => {
            if (!groupName) return undefined;

            // 1. Try exact match in currentGroups
            if (currentGroups) {
                let group = currentGroups.find(g =>
                    g.name === groupName ||
                    g.friendlyName === groupName
                );

                if (group) return group.groupType;

                // Try partial match in currentGroups
                group = currentGroups.find(g =>
                    (g.name && groupName.includes(g.name)) ||
                    (g.friendlyName && groupName.includes(g.friendlyName)) ||
                    (g.name && g.name.includes(groupName)) ||
                    (g.friendlyName && g.friendlyName.includes(groupName))
                );

                if (group) return group.groupType;
            }

            // 2. If not found in currentGroups, try allGroupsMap (for historical groups)
            if (allGroupsMap.has(groupName)) {
                return allGroupsMap.get(groupName);
            }

            // Try partial match in allGroupsMap
            for (const [key, value] of allGroupsMap.entries()) {
                if (key.includes(groupName) || groupName.includes(key)) {
                    return value;
                }
            }

            return undefined;
        };



        // Calculate time ago
        const timeAgo = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true });

        // Check if this is a move operation
        if (event.details.moveOperation?.isMove) {
            const sourceGroups = event.details.moveOperation.sourceGroups || [];
            const targetGroup = event.details.moveOperation.targetGroup;

            if (sourceGroups.length === 1) {
                actionText = `Moved from "${sourceGroups[0]}" → "${targetGroup}" by ${userName} - ${timeAgo}`;
            } else if (sourceGroups.length > 1) {
                actionText = `Moved from ${sourceGroups.length} groups → "${targetGroup}" by ${userName} - ${timeAgo}`;
            } else {
                actionText = `Moved to "${targetGroup}" by ${userName} - ${timeAgo}`;
            }
        } else {
            // Handle non-move operations
            const isBatch = event.details.batchOperation || false;
            const displayAction = event.details.originalAction || event.action;

            switch (event.action) {
                case 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS':
                case 'OPNSENSE_GROUP_IP_ADD_SUCCESS':
                    if (isBatch) {
                        const batchGroupName = event.details.targetGroup || event.details.groupName || 'Group';
                        actionText = `Batch assigned to ${batchGroupName} by ${userName} - ${timeAgo}`;
                    } else {
                        const assignGroupName = event.details.targetGroup || event.details.groupName || 'Group';
                        actionText = `Assigned to ${assignGroupName} by ${userName} - ${timeAgo}`;
                    }
                    break;
                case 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS':
                case 'OPNSENSE_GROUP_IP_REMOVE_SUCCESS':
                    if (isBatch) {
                        const batchUnassignGroupName = event.details.groupName || 'Group';
                        actionText = `Batch unassigned from ${batchUnassignGroupName} by ${userName} - ${timeAgo}`;
                    } else {
                        const unassignGroupName = event.details.groupName || 'Group';
                        actionText = `Unassigned from ${unassignGroupName} by ${userName} - ${timeAgo}`;
                    }
                    break;
                case 'OPNSENSE_GROUP_IP_MOVE_SUCCESS':
                    const moveTargetGroup = event.details.targetGroup || 'Group';
                    actionText = `Moved to ${moveTargetGroup} (Removed from ${event.details.removedGroups} others) by ${userName} - ${timeAgo}`;
                    break;
                case 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS':
                case 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_PARTIAL':
                    actionText = `Unassigned from all groups (${event.details.removedGroups} groups) by ${userName} - ${timeAgo}`;
                    break;
                case 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS':
                    const batchAssignTargetGroup = event.details.targetGroup || event.details.groupName || 'multiple groups';
                    actionText = `Batch assigned to ${batchAssignTargetGroup} by ${userName} - ${timeAgo}`;
                    break;
                case 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS':
                    actionText = `Batch unassigned from ${event.details.removedGroups} groups by ${userName} - ${timeAgo}`;
                    break;
                default:
                    // Handle unknown actions by extracting meaningful info from the action name
                    if (displayAction.includes('BATCH')) {
                        if (displayAction.includes('ASSIGN')) {
                            actionText = `Batch assign operation by ${userName} - ${timeAgo}`;
                        } else if (displayAction.includes('UNASSIGN')) {
                            actionText = `Batch unassign operation by ${userName} - ${timeAgo}`;
                        } else {
                            actionText = `Batch operation by ${userName} - ${timeAgo}`;
                        }
                    } else if (displayAction.includes('ASSIGN') || displayAction.includes('ADD')) {
                        const defaultAssignGroup = event.details.targetGroup || event.details.groupName || 'Group';
                        actionText = `Assigned to ${defaultAssignGroup} by ${userName} - ${timeAgo}`;
                    } else if (displayAction.includes('UNASSIGN') || displayAction.includes('REMOVE')) {
                        const defaultUnassignGroup = event.details.groupName || 'Group';
                        actionText = `Unassigned from ${defaultUnassignGroup} by ${userName} - ${timeAgo}`;
                    } else {
                        actionText = `${displayAction} by ${userName} - ${timeAgo}`;
                    }
            }
        }

        // Calculate Position
        const rect = containerRef.current.getBoundingClientRect();
        // coordinate.x/y are relative to the chart container (rect)
        const x = rect.left + (coordinate?.x || 0);
        const y = rect.top + (coordinate?.y || 0);



        // Tooltip dimensions (approximate safe bounds for collision check)
        // We set max-w-[260px] in CSS, so width is <= 260.
        // We set max-h-[300px] in CSS.
        const TOOLTIP_MAX_WIDTH = 270; // 260 + padding/margin safety
        const TOOLTIP_MAX_HEIGHT = 320;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const style: React.CSSProperties = {
            position: 'fixed',
            pointerEvents: 'none', // Prevent interfering with graph hover
            zIndex: 9999
        };

        // Horizontal positioning
        if (x + 10 + TOOLTIP_MAX_WIDTH > viewportWidth) {
            // Flip left: position right edge at x - 10
            // style.right is distance from right edge of viewport
            style.right = `${viewportWidth - x + 10}px`;
        } else {
            // Default right: position left edge at x + 10
            style.left = `${x + 10}px`;
        }

        // Vertical positioning
        if (y + 10 + TOOLTIP_MAX_HEIGHT > viewportHeight) {
            // Flip up: position bottom edge at y - 10
            // style.bottom is distance from bottom of viewport
            // Distance from bottom to y-10 is: viewportHeight - (y - 10)
            style.bottom = `${viewportHeight - y + 10}px`;
        } else {
            // Default down: position top edge at y + 10
            style.top = `${y + 10}px`;
        }

        return createPortal(
            <div
                className="bg-popover border rounded-md shadow-md p-3 text-sm max-w-[260px] max-h-[300px] overflow-y-auto"
                style={style}
            >
                <p className="font-semibold mb-1">{dateLabel}</p>
                {viewMode === 'total' ? (
                    <p className="text-primary font-medium">Total Groups: {event.groupCount}</p>
                ) : (
                    (event.details.moveOperation?.isMove || event.action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS') ? (
                        <p className="font-medium text-blue-500">
                            Change: Move
                        </p>
                    ) : (
                        <p className={cn("font-medium", event.change > 0 ? "text-green-600" : "text-purple-500")}>
                            Change: {event.change > 0 ? '+' : ''}{event.change}
                        </p>
                    )
                )}

                {event.currentGroupNames && event.currentGroupNames.length > 0 && viewMode === 'total' && (
                    <div className="mt-2 mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Assigned Groups:</p>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                            {event.currentGroupNames.map((name, idx) => {
                                const groupType = lookupGroupType(name);
                                // Use same conditional logic as renderGroupName
                                const shouldShowIcon = enableGroupTypes && (!isSelfService || enableSelfServiceMultiSelect);
                                return (
                                    <li key={idx} className="truncate">
                                        {groupType && shouldShowIcon ? (
                                            <span className="inline-flex items-center gap-1">
                                                {name}
                                                {groupType === 'SingleSelect' ? (
                                                    <Square className="h-3 w-3 inline-block text-blue-500 opacity-60" />
                                                ) : (
                                                    <Grid2x2 className="h-3 w-3 inline-block text-blue-500 opacity-60" />
                                                )}
                                            </span>
                                        ) : (
                                            name
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                <div className="mt-2 pt-2 border-t text-muted-foreground text-xs">
                    <p>{actionText}</p>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <Card className={cn("flex flex-col border-0 shadow-none dark:shadow-none bg-transparent", className)}>
            <CardHeader className="flex flex-col gap-6 pb-2 shrink-0">
                {!hideTitle && <CardTitle className="text-sm font-medium">Group Assignment History</CardTitle>}

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="h-7">
                            <TabsList className="h-7 p-0 bg-muted/50">
                                <TabsTrigger value="total" className="h-full px-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                    <Layers className="w-3 h-3 mr-1" />
                                    Total
                                </TabsTrigger>
                                <TabsTrigger value="activity" className="h-full px-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                    <Activity className="w-3 h-3 mr-1" />
                                    Activity
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>

                        {viewMode === 'total' && (
                            <Tabs value={curveType} onValueChange={(v) => setCurveType(v as CurveType)} className="h-7">
                                <TabsList className="h-7 p-0 bg-muted/50">
                                    <TabsTrigger value="stepAfter" className="h-full px-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                        <GitCommit className="w-3 h-3 mr-1" />
                                        Step
                                    </TabsTrigger>
                                    <TabsTrigger value="monotone" className="h-full px-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                        <TrendingUp className="w-3 h-3 mr-1" />
                                        Smooth
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        )}
                    </div>
                    <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
                        <SelectTrigger className="w-[110px] h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1h">1 hour</SelectItem>
                            <SelectItem value="3h">3 hours</SelectItem>
                            <SelectItem value="6h">6 hours</SelectItem>
                            <SelectItem value="12h">12 hours</SelectItem>
                            <SelectItem value="1d">24 hours</SelectItem>
                            <SelectItem value="1w">1 week</SelectItem>
                            <SelectItem value="1m">1 month</SelectItem>
                            <SelectItem value="3m">3 months</SelectItem>
                            <SelectItem value="1y">1 year</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>

            {/* Error message */}
            {error && (
                <div className="px-6 pb-2">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>Error loading history: {error}</AlertDescription>
                    </Alert>
                </div>
            )}

            {/* Warning message for incomplete history */}
            {historyIncomplete && (
                <div className="px-6 pb-2">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            {incompleteReason || 'Group history may be incomplete due to batch operation failures. Some historical data may not be displayed.'}
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            <CardContent className="flex-1 min-h-0">
                {isLoading ? (
                    <div className="h-full w-full flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : !filteredData.some(d => !d.id.includes('synthetic')) ? (
                    <div className="flex justify-center items-center h-full text-muted-foreground text-sm">
                        {viewMode === 'activity'
                            ? `No activity found for the last ${getTimePeriodLabel(timePeriod)}.`
                            : `No group assignment history found for the last ${getTimePeriodLabel(timePeriod)}.`
                        }
                    </div>
                ) : (
                    <div className="h-full w-full" ref={containerRef}>
                        <ResponsiveContainer width="100%" height="100%">
                            {viewMode === 'total' ? (
                                <AreaChart
                                    data={filteredData}
                                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="colorGroupCount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                                    <XAxis
                                        dataKey="timestamp"
                                        tickFormatter={(str) => {
                                            const date = new Date(str);
                                            if (timePeriod === '1h' || timePeriod === '3h' || timePeriod === '6h' || timePeriod === '12h' || timePeriod === '1d') {
                                                return format(date, 'HH:mm');
                                            }
                                            return format(date, 'MMM d HH:mm');
                                        }}
                                        className="text-xs text-muted-foreground"
                                        minTickGap={50}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        className="text-xs text-muted-foreground"
                                        width={30}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        content={<CustomTooltip />}
                                        cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        wrapperStyle={{ zIndex: 50 }}
                                    />
                                    <Area
                                        type={curveType}
                                        dataKey="groupCount"
                                        name="Group Count"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorGroupCount)"
                                        animationDuration={500}
                                    />
                                    <Legend />
                                    {/* Add dots for events, excluding synthetic ones */}
                                    {filteredData.filter(e => !e.id.includes('synthetic')).map((entry) => (
                                        <ReferenceDot
                                            key={entry.id}
                                            x={entry.timestamp}
                                            y={entry.groupCount}
                                            r={4}
                                            fill="hsl(var(--background))"
                                            stroke="hsl(var(--primary))"
                                            strokeWidth={2}
                                        />
                                    ))}
                                </AreaChart>
                            ) : (
                                <BarChart
                                    data={filteredData.filter(d => !d.id.includes('synthetic'))} // Filter out synthetic points for bar chart
                                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                                    <XAxis
                                        dataKey="timestamp"
                                        tickFormatter={(str) => {
                                            const date = new Date(str);
                                            if (timePeriod === '1h' || timePeriod === '3h' || timePeriod === '6h' || timePeriod === '12h' || timePeriod === '1d') {
                                                return format(date, 'HH:mm');
                                            }
                                            return format(date, 'MMM d HH:mm');
                                        }}
                                        className="text-xs text-muted-foreground"
                                        minTickGap={50}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        className="text-xs text-muted-foreground"
                                        width={30}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        content={<CustomTooltip />}
                                        cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                                        wrapperStyle={{ zIndex: 50 }}
                                    />
                                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                                    <Bar
                                        dataKey="visualChange"
                                        fill="hsl(var(--primary))"
                                        radius={[2, 2, 0, 0]}
                                        maxBarSize={50}
                                    >
                                        {
                                            filteredData.filter(d => !d.id.includes('synthetic')).map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                                            ))
                                        }
                                    </Bar>
                                    <Legend
                                        content={() => (
                                            <div className="flex items-center justify-center gap-4 text-xs mt-2">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-3 h-3 rounded-sm bg-[hsl(142,76%,28%)]" />
                                                    <span className="text-muted-foreground">Assigned</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-3 h-3 rounded-sm bg-[hsl(262,83%,58%)]" />
                                                    <span className="text-muted-foreground">Unassigned</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-3 h-3 rounded-sm bg-[hsl(217,91%,60%)]" />
                                                    <span className="text-muted-foreground">Moved</span>
                                                </div>
                                            </div>
                                        )}
                                    />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
});

DeviceGroupHistoryGraph.displayName = 'DeviceGroupHistoryGraph';