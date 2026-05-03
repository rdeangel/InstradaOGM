'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MobileTabs, TabsContent } from '@/components/ui/mobile-tabs';
import { useToast } from '@/hooks/use-toast';
import { useLocalStorage } from '@/hooks/use-local-storage';
import {
  Users,
  Activity,
  Loader2,
  RefreshCw,
  Plus,
  Minus,
  Move,
  HardDriveUpload,
  Edit,
  Trash2,
  Globe,
} from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { LineChart } from '../analytics/charts/LineChart';
import { MultiAxisBarChart } from '../analytics/charts/MultiAxisBarChart';
import { PieChart } from '../analytics/charts/PieChart';
import { ExportButton } from '../analytics/ExportButton';
import { DateRangePicker } from '../analytics/DateRangePicker';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';
import { CardSkeleton } from '@/components/ui/card-skeleton';
import AllUsersActivityCard from './analytics/AllUsersActivityCard';

interface GroupChangeAnalytics {
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
    operations: number;
    assignments: number;
    unassignments: number;
  }>;
  operationTypes: Record<string, number>;
  authMethods: Record<string, number>;
}

interface HostAliasChangeAnalytics {
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

interface NetworkAliasChangeAnalytics {
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

import { useIsMobile } from '@/hooks/use-mobile';

export default function AuditLogAnalyticsDashboard() {
  const isMobile = useIsMobile();
  const [groupData, setGroupData] = useState<GroupChangeAnalytics | null>(null);
  const [hostAliasData, setHostAliasData] = useState<HostAliasChangeAnalytics | null>(null);
  const [networkAliasData, setNetworkAliasData] = useState<NetworkAliasChangeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    to: new Date(new Date().setHours(23, 59, 59, 999)), // End of day (23:59:59)
  });
  const [activeTab, setActiveTab] = useLocalStorage<string>('audit-analytics-active-tab', 'group-trends');
  const { toast } = useToast();

  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;

  const fetchAuditAnalytics = useCallback(async (isRefresh = false) => {
    const currentDateRange = dateRangeRef.current;

    if (!currentDateRange?.from || !currentDateRange?.to) {
      return;
    }

    try {
      // Only set loading to true for initial load, not for refresh
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      const params = new URLSearchParams({
        startDate: currentDateRange.from.toISOString(),
        endDate: currentDateRange.to.toISOString(),
      });

      // Add cache-busting timestamp for refresh
      const timestamp = isRefresh ? Date.now() : '';
      const [groupResponse, hostAliasResponse, networkAliasResponse] = await Promise.all([
        fetch(`/api/admin/audit-logs/analytics/group-changes?${params}${timestamp ? `&_t=${timestamp}` : ''}`),
        fetch(`/api/admin/audit-logs/analytics/host-aliases?${params}${timestamp ? `&_t=${timestamp}` : ''}`),
        fetch(`/api/admin/audit-logs/analytics/network-aliases?${params}${timestamp ? `&_t=${timestamp}` : ''}`)
      ]);

      if (!groupResponse.ok || !hostAliasResponse.ok || !networkAliasResponse.ok) {
        throw new Error('Failed to fetch audit analytics');
      }

      const [groupResult, hostAliasResult, networkAliasResult] = await Promise.all([
        groupResponse.json(),
        hostAliasResponse.json(),
        networkAliasResponse.json()
      ]);

      if (groupResult.success && hostAliasResult.success && networkAliasResult.success) {
        setGroupData(groupResult.data);
        setHostAliasData(hostAliasResult.data);
        setNetworkAliasData(networkAliasResult.data);

        // Force re-render by updating refresh key
        if (isRefresh) {
          setRefreshKey(prev => prev + 1);
        }
      } else {
        throw new Error('Failed to fetch audit analytics data');
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load audit analytics data',
        variant: 'destructive',
      });
    } finally {
      // Only set loading to false for initial load, not for refresh
      if (isRefresh) {
        setIsRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [toast]); // Remove dateRange from dependencies

  // Effect for initial load and date range changes
  useEffect(() => {
    dateRangeRef.current = dateRange;
    if (dateRange?.from && dateRange?.to) {
      fetchAuditAnalytics();
    }
  }, [dateRange, fetchAuditAnalytics]); // Include fetchAuditAnalytics in dependencies

  if (loading && !isRefreshing) {
    return (
      <CardSkeleton
        title={true}
        description={true}
        content={true}
        footer={true}
      />
    );
  }

  if (!groupData || !hostAliasData || !networkAliasData) {
    return (
      <Card className="flex flex-col flex-grow min-h-0">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-xl">Audit Log Analytics</CardTitle>
          {!isMobile && <CardDescription className="text-sm">Group changes and host alias management statistics</CardDescription>}
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p>No audit analytics data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col flex-grow min-h-0">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl">Audit Log Analytics</CardTitle>
            {!isMobile && <CardDescription className="text-sm">Group changes and host alias management statistics</CardDescription>}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 relative z-10">
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              className="w-full sm:w-auto text-sm"
            />
            <div className="flex items-center gap-2">
              <ExportButton
                data={[
                  ...groupData.topUsers,
                  ...groupData.topGroups,
                  ...hostAliasData.topUsers,
                  ...networkAliasData.topUsers,
                ]}
                filename="audit-analytics"
                title="Export"
                className="analytics-button"
              />
              <ResponsiveActionButton
                icon={isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                label="Refresh"
                onClick={async () => {
                  await fetchAuditAnalytics(true);
                }}
                className="analytics-button"
                disabled={isRefreshing}
                key={refreshKey} // Force re-render when refresh key changes
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-grow overflow-hidden p-4 flex flex-col">
        <ScrollArea className="flex-1 h-full w-full">
          {/* Activity Count Cards - Matching Activity Dashboard Structure */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {/* Group Operations */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Assignments</CardTitle>
                <Plus className="h-3 w-3 text-blue-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`assignments-${groupData.summary.assignments}`} className="text-xl font-bold">{groupData.summary.assignments.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Group assignments
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Unassignments</CardTitle>
                <Minus className="h-3 w-3 text-orange-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`unassignments-${groupData.summary.unassignments}`} className="text-xl font-bold">{groupData.summary.unassignments.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Group unassignments
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Moves</CardTitle>
                <Move className="h-3 w-3 text-green-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`moves-${groupData.summary.moves}`} className="text-xl font-bold">{groupData.summary.moves.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Between groups
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Total Operations</CardTitle>
                <Activity className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`total-${groupData.summary.totalOperations + hostAliasData.summary.totalOperations + networkAliasData.summary.totalOperations}`} className="text-xl font-bold">
                  {(groupData.summary.totalOperations + hostAliasData.summary.totalOperations + networkAliasData.summary.totalOperations).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  All activities
                </p>
              </CardContent>
            </Card>

            {/* Host Alias Operations */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Host Creations</CardTitle>
                <HardDriveUpload className="h-3 w-3 text-emerald-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`creations-${hostAliasData.summary.creations}`} className="text-xl font-bold">{hostAliasData.summary.creations.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  New host aliases
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Host Modifications</CardTitle>
                <Edit className="h-3 w-3 text-yellow-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`modifications-${hostAliasData.summary.modifications}`} className="text-xl font-bold">{hostAliasData.summary.modifications.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Actual host alias changes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Host Deletions</CardTitle>
                <Trash2 className="h-3 w-3 text-orange-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`deletions-${hostAliasData.summary.deletions}`} className="text-xl font-bold">{hostAliasData.summary.deletions.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Deleted host aliases
                </p>
              </CardContent>
            </Card>

            {/* Network Alias Operations */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Network Creations</CardTitle>
                <Globe className="h-3 w-3 text-cyan-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`na-creations-${networkAliasData.summary.creations}`} className="text-xl font-bold">{networkAliasData.summary.creations.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  New network aliases
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Network Modifications</CardTitle>
                <Edit className="h-3 w-3 text-yellow-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`na-modifications-${networkAliasData.summary.modifications}`} className="text-xl font-bold">{networkAliasData.summary.modifications.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Network alias changes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Network Deletions</CardTitle>
                <Trash2 className="h-3 w-3 text-red-600" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`na-deletions-${networkAliasData.summary.deletions}`} className="text-xl font-bold">{networkAliasData.summary.deletions.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Deleted network aliases
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Active Users</CardTitle>
                <Users className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div key={`users-${Math.max(groupData.summary.uniqueUsers, hostAliasData.summary.uniqueUsers, networkAliasData.summary.uniqueUsers)}`} className="text-xl font-bold">
                  {Math.max(groupData.summary.uniqueUsers, hostAliasData.summary.uniqueUsers, networkAliasData.summary.uniqueUsers)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Making changes
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Operation Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <PieChart
              data={[
                { name: 'Assignments', value: groupData.summary.assignments },
                { name: 'Unassignments', value: groupData.summary.unassignments },
                { name: 'Moves', value: groupData.summary.moves },
                { name: 'Batch Operations', value: groupData.summary.batchOperations },
              ]}
              title="Group Operations Breakdown"
              description="Types of group operations (batch = multiple hosts in one operation)"
              colors={['#10b981', '#ef4444', '#f59e0b', '#8b5cf6']}
              height={250}
            />

            <PieChart
              data={[
                { name: 'Creations', value: hostAliasData.summary.creations },
                { name: 'Modifications', value: hostAliasData.summary.modifications },
                { name: 'Deletions', value: hostAliasData.summary.deletions },
              ]}
              title="Host Alias Operations Breakdown"
              description="Types of host alias operations"
              colors={['#3b82f6', '#10b981', '#ef4444']}
              height={250}
            />

            <PieChart
              data={[
                { name: 'Creations', value: networkAliasData.summary.creations },
                { name: 'Modifications', value: networkAliasData.summary.modifications },
                { name: 'Deletions', value: networkAliasData.summary.deletions },
              ]}
              title="Network Alias Operations Breakdown"
              description="Types of network alias operations"
              colors={['#06b6d4', '#eab308', '#ef4444']}
              height={250}
            />
          </div>

          {/* Detailed Analytics Tabs */}
          <MobileTabs
            defaultValue="group-trends"
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-4"
            tabs={[
              { value: "group-trends", label: "Group Trends" },
              { value: "host-trends", label: "Host Alias Trends" },
              { value: "network-alias-trends", label: "Network Alias Trends" },
              { value: "top-users", label: "Top Users" },
              { value: "top-groups", label: "Top Groups" },
              { value: "all-activity", label: "All Activity" }
            ]}
          >

            <TabsContent value="group-trends" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LineChart
                  data={groupData.dailyStats.map(stat => ({
                    date: stat.date,
                    successful: stat.successfulOperations,
                    failed: stat.failedOperations,
                  }))}
                  title="Group Operation Success/Failure Trends"
                  description="Daily success and failure rates"
                  xAxisKey="date"
                  lines={[
                    { key: 'successful', name: 'Successful', color: '#10b981' },
                    { key: 'failed', name: 'Failed', color: '#ef4444' },
                  ]}
                  height={300}
                  formatXAxis={(value) => format(new Date(value), 'MMM dd')}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />

                <MultiAxisBarChart
                  data={groupData.dailyStats.slice(-7).map(stat => ({
                    date: format(new Date(stat.date), 'MMM dd'),
                    assignments: stat.assignments,
                    unassignments: stat.unassignments,
                    moves: stat.moves,
                  }))}
                  title="Group Operations (Last 7 Days)"
                  description="Types of group operations"
                  xAxisKey="date"
                  bars={[
                    { key: 'assignments', name: 'Assignments', color: '#10b981', yAxisId: 'left' },
                    { key: 'unassignments', name: 'Unassignments', color: '#ef4444', yAxisId: 'left' },
                    { key: 'moves', name: 'Moves', color: '#f59e0b', yAxisId: 'right' },
                  ]}
                  yAxes={[
                    { id: 'left', orientation: 'left', color: '#10b981' },
                    { id: 'right', orientation: 'right', color: '#f59e0b' },
                  ]}
                  height={300}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />
              </div>
            </TabsContent>

            <TabsContent value="host-trends" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LineChart
                  data={hostAliasData.dailyStats.map(stat => ({
                    date: stat.date,
                    successful: stat.successfulOperations,
                    failed: stat.failedOperations,
                  }))}
                  title="Host Alias Operation Success/Failure Trends"
                  description="Daily success and failure rates"
                  xAxisKey="date"
                  lines={[
                    { key: 'successful', name: 'Successful', color: '#10b981' },
                    { key: 'failed', name: 'Failed', color: '#ef4444' },
                  ]}
                  height={300}
                  formatXAxis={(value) => format(new Date(value), 'MMM dd')}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />

                <MultiAxisBarChart
                  data={hostAliasData.dailyStats.slice(-7).map(stat => ({
                    date: format(new Date(stat.date), 'MMM dd'),
                    creations: stat.creations,
                    modifications: stat.modifications,
                    deletions: stat.deletions,
                  }))}
                  title="Host Alias Operations (Last 7 Days)"
                  description="Types of host alias operations"
                  xAxisKey="date"
                  bars={[
                    { key: 'creations', name: 'Creations', color: '#3b82f6', yAxisId: 'left' },
                    { key: 'modifications', name: 'Modifications', color: '#10b981', yAxisId: 'right' },
                    { key: 'deletions', name: 'Deletions', color: '#ef4444', yAxisId: 'right' },
                  ]}
                  yAxes={[
                    { id: 'left', orientation: 'left', color: '#3b82f6' },
                    { id: 'right', orientation: 'right', color: '#ef4444' },
                  ]}
                  height={300}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />
              </div>
            </TabsContent>

            <TabsContent value="network-alias-trends" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LineChart
                  data={networkAliasData.dailyStats.map(stat => ({
                    date: stat.date,
                    successful: stat.successfulOperations,
                    failed: stat.failedOperations,
                  }))}
                  title="Network Alias Operation Success/Failure Trends"
                  description="Daily success and failure rates"
                  xAxisKey="date"
                  lines={[
                    { key: 'successful', name: 'Successful', color: '#10b981' },
                    { key: 'failed', name: 'Failed', color: '#ef4444' },
                  ]}
                  height={300}
                  formatXAxis={(value) => format(new Date(value), 'MMM dd')}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />

                <MultiAxisBarChart
                  data={networkAliasData.dailyStats.slice(-7).map(stat => ({
                    date: format(new Date(stat.date), 'MMM dd'),
                    creations: stat.creations,
                    modifications: stat.modifications,
                    deletions: stat.deletions,
                  }))}
                  title="Network Alias Operations (Last 7 Days)"
                  description="Types of network alias operations"
                  xAxisKey="date"
                  bars={[
                    { key: 'creations', name: 'Creations', color: '#06b6d4', yAxisId: 'left' },
                    { key: 'modifications', name: 'Modifications', color: '#eab308', yAxisId: 'right' },
                    { key: 'deletions', name: 'Deletions', color: '#ef4444', yAxisId: 'right' },
                  ]}
                  yAxes={[
                    { id: 'left', orientation: 'left', color: '#06b6d4' },
                    { id: 'right', orientation: 'right', color: '#ef4444' },
                  ]}
                  height={300}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />
              </div>
            </TabsContent>

            <TabsContent value="top-users" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Top Users - Group Operations</CardTitle>
                    <CardDescription className="text-xs">Most active users in group management</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    {groupData.topUsers.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">No user data available</div>
                    ) : (
                      <div className="space-y-2">
                        {groupData.topUsers.slice(0, 10).map((user, index) => (
                          <div key={user.userId} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                            <div className="flex-1">
                              <div className="text-sm font-medium">
                                {user.userName || user.userEmail || `User ${user.userId}`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {user.operations} operations • {Math.round(user.successRate)}% success
                              </div>
                            </div>
                            <div className="text-sm font-bold">#{index + 1}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Top Users - Host Alias Operations</CardTitle>
                    <CardDescription className="text-xs">Most active users in host alias management</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    {hostAliasData.topUsers.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">No user data available</div>
                    ) : (
                      <div className="space-y-2">
                        {hostAliasData.topUsers.slice(0, 10).map((user, index) => (
                          <div key={user.userId} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                            <div className="flex-1">
                              <div className="text-sm font-medium">
                                {user.userName || user.userEmail || `User ${user.userId}`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {user.operations} operations • {Math.round(user.successRate)}% success
                              </div>
                            </div>
                            <div className="text-sm font-bold">#{index + 1}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Top Users - Network Alias Operations</CardTitle>
                    <CardDescription className="text-xs">Most active users in network alias management</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    {networkAliasData.topUsers.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">No user data available</div>
                    ) : (
                      <div className="space-y-2">
                        {networkAliasData.topUsers.slice(0, 10).map((user, index) => (
                          <div key={user.userId} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                            <div className="flex-1">
                              <div className="text-sm font-medium">
                                {user.userName || user.userEmail || `User ${user.userId}`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {user.operations} operations • {Math.round(user.successRate)}% success
                              </div>
                            </div>
                            <div className="text-sm font-bold">#{index + 1}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="top-groups" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Most Assigned Groups</CardTitle>
                  <CardDescription className="text-xs">Groups with the most assignment/move operations</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  {groupData.topGroups.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">No group data available</div>
                  ) : (
                    <div className="space-y-2">
                      {groupData.topGroups.slice(0, 15).map((group) => (
                        <div key={group.groupId} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              {group.groupFriendlyName || group.groupName}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold">{group.operations}</div>
                            <div className="text-xs text-muted-foreground">assign type operations</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all-activity" className="space-y-4">
              <AllUsersActivityCard />
            </TabsContent>
          </MobileTabs>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
