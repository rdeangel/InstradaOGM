'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { BarChart3, RefreshCw, Loader2, Activity, Shield, User, Settings, Clock, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { PieChart } from '@/components/analytics/charts/PieChart';
import { LineChart } from '@/components/analytics/charts/LineChart';
import { useIsMobile } from '@/hooks/use-mobile';

interface UserSessionAnalyticsData {
  summary: {
    totalDays: number;
    totalRequests: number;
    totalApiCalls: number;
    totalPageViews: number;
    totalUiActions: number;
    avgResponseTime: number;
    recentEventsCount: number;
    uniqueSessions: number;
  };
  dailyStats: Array<{
    date: Date;
    totalRequests: number;
    apiCalls: number;
    pageViews: number;
    uiActions: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number | null;
  }>;
  recentEvents: Array<{
    timestamp: Date;
    endpoint: string;
    method: string;
    actionType: string;
    statusCode?: number;
    responseTime?: number;
    pageUrl?: string;
    errorType?: string;
  }>;
}

interface RecentActivity {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  timestamp: Date;
}



interface UserSessionAnalyticsProps {
  className?: string;
  recentActivities?: RecentActivity[];
  isLoadingActivities?: boolean;
  fetchRecentActivities?: (reset?: boolean, search?: string) => Promise<void>;
  groupTypesEnabled?: boolean;
  hasMore?: boolean;
  totalCount?: number;
  isLoadingMore?: boolean;
}

export default function UserSessionAnalytics({
  className,
  recentActivities = [],
  isLoadingActivities = false,
  fetchRecentActivities,
  groupTypesEnabled: propGroupTypesEnabled = false,
  hasMore = false,
  isLoadingMore = false
}: UserSessionAnalyticsProps) {
  const [data, setData] = useState<UserSessionAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days] = useState(30);
  const [groupTypesEnabled, setGroupTypesEnabled] = useState(propGroupTypesEnabled);
  const [searchTerm, setSearchTerm] = useState('');
  const [allActivities, setAllActivities] = useState<RecentActivity[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<RecentActivity[]>([]);
  const [isLocalLoadingMore, setIsLocalLoadingMore] = useState(false);
  const isMobile = useIsMobile();

  // Update groupTypesEnabled when prop changes
  useEffect(() => {
    setGroupTypesEnabled(propGroupTypesEnabled);
  }, [propGroupTypesEnabled]);

  // Update allActivities when recentActivities prop changes
  useEffect(() => {
    // Remove duplicates based on activity ID
    const uniqueActivities = recentActivities.filter((activity, index, self) =>
      index === self.findIndex(a => a.id === activity.id)
    );

    setAllActivities(uniqueActivities);
    if (!searchTerm.trim()) {
      setFilteredActivities(uniqueActivities);
    }
  }, [recentActivities, searchTerm]);



  // Helper functions for activity display
  const getActionIcon = (action: string) => {
    if (action.includes('LOGIN') || action.includes('LOGOUT')) {
      return <User className="h-4 w-4 text-blue-500" />;
    }
    if (action.includes('GROUP') || action.includes('ASSIGN')) {
      return <Shield className="h-4 w-4 text-green-500" />;
    }
    if (action.includes('SETTINGS') || action.includes('UPDATE')) {
      return <Settings className="h-4 w-4 text-orange-500" />;
    }
    if (action.includes('Viewed') || action.includes('Dashboard') || action.includes('Account')) {
      return <Activity className="h-4 w-4 text-blue-500" />;
    }
    if (action.includes('Admin') || action.includes('Management')) {
      return <Shield className="h-4 w-4 text-purple-500" />;
    }
    return <Activity className="h-4 w-4 text-gray-500" />;
  };

  // Helper function to format group names with types when enabled
  const formatGroupName = useCallback((groupName: string, groupType?: string) => {
    if (!groupTypesEnabled || !groupType) {
      return `"${groupName}"`;
    }

    const typeLabel = groupType === 'SingleSelect' ? 'Single' : 'Multi';
    return `"${groupName}" (${typeLabel})`;
  }, [groupTypesEnabled]);

  const getActionDescription = useCallback((activity: RecentActivity) => {
    const action = activity.action;
    const details = activity.details;

    // Group assignment operations - check if it's actually a move
    if (action === 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS') {
      const hostAlias = details?.hostAliasName || details?.ipAddress;
      const ip = details?.ipAddress;
      const group = (details?.groupFriendlyName || details?.groupName || 'Unknown Group') as string;
      const groupType = details?.groupType as string | undefined;
      const hostDisplay = (hostAlias && ip && hostAlias !== ip) ? `${hostAlias} (${ip})` : hostAlias;

      // Check if this is actually a move operation
      const wasMoved = details?.wasMoved || details?.moveOperation;
      const removedFromGroups = Array.isArray(details?.removedFromGroups) ? details.removedFromGroups : [];
      const sourceGroups = Array.isArray(details?.sourceGroups) ? details.sourceGroups : [];

      if (wasMoved && (removedFromGroups.length > 0 || sourceGroups.length > 0)) {
        // This is a move operation disguised as an assignment
        const fromGroups = removedFromGroups.length > 0 ? removedFromGroups : sourceGroups;
        if (fromGroups.length === 1) {
          const fromGroup = fromGroups[0]?.friendlyName || fromGroups[0]?.name;
          const fromGroupType = fromGroups[0]?.groupType;
          return `Moved ${hostDisplay} from ${formatGroupName(fromGroup, fromGroupType)} to ${formatGroupName(group, groupType)}`;
        } else if (fromGroups.length > 1) {
          const fromGroupNames = fromGroups.map((g: Record<string, unknown>) => formatGroupName(g.friendlyName as string || g.name as string, g.groupType as string)).join(', ');
          return `Moved ${hostDisplay} from [${fromGroupNames}] to ${formatGroupName(group, groupType)}`;
        }
      }

      // Regular assignment
      return `Assigned ${hostDisplay} to group ${formatGroupName(group, groupType)}`;
    }

    if (action === 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS') {
      const hostAlias = details?.hostAliasName || details?.ipAddress;
      const ip = details?.ipAddress;
      const group = (details?.groupFriendlyName || details?.groupName || 'Unknown Group') as string;
      const groupType = details?.groupType as string | undefined;
      const hostDisplay = (hostAlias && ip && hostAlias !== ip) ? `${hostAlias} (${ip})` : hostAlias;

      return `Removed ${hostDisplay} from group ${formatGroupName(group, groupType)}`;
    }

    if (action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS') {
      const hostAlias = details?.hostAliasName || details?.ipAddress;
      const ip = details?.ipAddress;
      const sourceGroups = Array.isArray(details?.sourceGroups) ? details.sourceGroups : [];
      const targetGroup = details?.targetGroup as Record<string, unknown>;
      const fromGroup = sourceGroups[0]?.friendlyName || sourceGroups[0]?.name;
      const fromGroupType = sourceGroups[0]?.groupType;
      const toGroup = (targetGroup?.friendlyName as string) || (targetGroup?.name as string) || (details?.groupFriendlyName as string) || (details?.groupName as string);
      const toGroupType = (targetGroup?.groupType as string) || (details?.groupType as string);

      const hostDisplay = (hostAlias && ip && hostAlias !== ip) ? `${hostAlias} (${ip})` : hostAlias;

      if (fromGroup && toGroup) {
        return `Moved ${hostDisplay} from ${formatGroupName(fromGroup, fromGroupType)} to ${formatGroupName(toGroup, toGroupType)}`;
      }
      return `Moved ${hostDisplay} to group ${formatGroupName(toGroup || 'Unknown Group', toGroupType)}`;
    }

    // Batch operations - check if they're actually moves
    if (action === 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS') {
      const hostAliases = Array.isArray(details?.hostAliases) ? details.hostAliases : [];
      const groups = Array.isArray(details?.groups) ? details.groups : [];
      const count = hostAliases.length || (details?.successfulOperations as number) || 1;
      const group = groups[0]?.groupFriendlyName || groups[0]?.groupName || 'Unknown Group';
      const groupType = groups[0]?.groupType;
      const removedFromGroups = Array.isArray(details?.removedFromGroups) ? details.removedFromGroups : [];

      // Check if this is a move operation (has removedFromGroups)
      const isMove = removedFromGroups.length > 0;

      // Show first few host names if available
      if (hostAliases.length > 0 && hostAliases.length <= 3) {
        const hostNames = hostAliases.map((ha: Record<string, unknown>) => ha.hostAliasName || ha.ipAddress).join(', ');

        if (isMove && removedFromGroups.length === 1) {
          const fromGroup = removedFromGroups[0]?.friendlyName || removedFromGroups[0]?.name;
          const fromGroupType = removedFromGroups[0]?.groupType;
          return `Moved ${hostNames} from ${formatGroupName(fromGroup, fromGroupType)} to ${formatGroupName(group, groupType)}`;
        } else if (isMove && removedFromGroups.length > 1) {
          const fromGroupNames = removedFromGroups.map((g: Record<string, unknown>) => formatGroupName(g.friendlyName as string || g.name as string, g.groupType as string)).join(', ');
          return `Moved ${hostNames} from [${fromGroupNames}] to ${formatGroupName(group, groupType)}`;
        }

        return `Assigned ${hostNames} to group ${formatGroupName(group, groupType)}`;
      }

      // For larger batches
      if (isMove) {
        if (removedFromGroups.length === 1) {
          const fromGroup = removedFromGroups[0]?.friendlyName || removedFromGroups[0]?.name;
          const fromGroupType = removedFromGroups[0]?.groupType;
          return `Moved ${count} host${count > 1 ? 's' : ''} from ${formatGroupName(fromGroup, fromGroupType)} to ${formatGroupName(group, groupType)}`;
        } else if (removedFromGroups.length > 1) {
          return `Moved ${count} host${count > 1 ? 's' : ''} from multiple groups to ${formatGroupName(group, groupType)}`;
        }
      }

      return `Assigned ${count} host${count > 1 ? 's' : ''} to group ${formatGroupName(group, groupType)}`;
    }

    if (action === 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS') {
      const hostAliases = Array.isArray(details?.hostAliases) ? details.hostAliases : [];
      const groups = Array.isArray(details?.groups) ? details.groups : [];
      const count = hostAliases.length || (details?.successfulOperations as number) || 1;
      const group = groups[0]?.groupFriendlyName || groups[0]?.groupName || 'Unknown Group';
      const groupType = groups[0]?.groupType;

      // Show first few host names if available
      if (hostAliases.length > 0 && hostAliases.length <= 3) {
        const hostNames = hostAliases.map((ha: Record<string, unknown>) => ha.hostAliasName || ha.ipAddress).join(', ');
        return `Removed ${hostNames} from group ${formatGroupName(group, groupType)}`;
      }
      return `Removed ${count} host${count > 1 ? 's' : ''} from group ${formatGroupName(group, groupType)}`;
    }

    // DHCP reservations
    if (action === 'DHCP_RESERVATION_ADD_SUCCESS') {
      const ip = details?.ip_address || details?.ipAddress;
      const hostname = details?.hostname;
      const mac = details?.hw_address;
      const description = details?.description;

      let result = 'Added DHCP reservation';
      if (hostname && ip) {
        result = `Added DHCP reservation: ${hostname} → ${ip}`;
      } else if (ip) {
        result = `Added DHCP reservation for IP ${ip}`;
      }

      // Add MAC address if available
      if (mac) {
        result += ` (MAC: ${mac})`;
      }

      // Add description if available and different from hostname
      if (description && description !== hostname) {
        result += ` - ${description}`;
      }

      return result;
    }

    if (action === 'DHCP_RESERVATION_DELETE_SUCCESS') {
      const ip = details?.ip_address || details?.ipAddress;
      const hostname = details?.hostname;
      const mac = details?.hw_address;

      let result = 'Removed DHCP reservation';
      if (hostname && ip) {
        result = `Removed DHCP reservation: ${hostname} → ${ip}`;
      } else if (ip) {
        result = `Removed DHCP reservation for IP ${ip}`;
      }

      // Add MAC address if available
      if (mac) {
        result += ` (MAC: ${mac})`;
      }

      return result;
    }

    // Host alias operations
    if (action === 'HOST_ALIAS_CREATE_SUCCESS') {
      const aliasName = details?.aliasName;
      const content = details?.content;
      if (aliasName && content) {
        return `Created host alias: ${aliasName} (${content})`;
      } else if (aliasName) {
        return `Created host alias: ${aliasName}`;
      }
      return 'Created host alias';
    }

    // Authentication
    if (action === 'LOGIN_SUCCESS') return 'Logged in successfully';
    if (action === 'LOGOUT_SUCCESS') return 'Logged out';
    if (action === 'SETTINGS_UPDATE_SUCCESS') return 'Updated settings';
    if (action === 'PASSWORD_CHANGE_SUCCESS') return 'Changed password';

    // Fallback: format action name
    return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase());
  }, [formatGroupName]);

  // Handle client-side search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!searchTerm.trim()) {
        setFilteredActivities(allActivities);
        return;
      }

      const searchTerms = searchTerm.trim().toLowerCase().split(/\s+/);

      const filtered = allActivities.filter(activity => {
        // Generate the same description that's displayed to the user
        const displayedDescription = getActionDescription(activity).toLowerCase();

        // All search terms must match somewhere in the displayed description
        return searchTerms.every(term => {
          // Split the description into words using various delimiters
          const words = displayedDescription.split(/[\s\-_.,()[\]"']+/).filter(word => word.length > 0);

          // Check if any word matches the search term exactly or as substring
          return words.some(word => word === term) || displayedDescription.includes(term);
        });
      });

      setFilteredActivities(filtered);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, allActivities, getActionDescription]);

  const { toast } = useToast();

  const fetchUserSessionAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/account/sessions/analytics?days=${days}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Parse dates and sanitize data
        const processedData = {
          ...result.data,
          summary: {
            ...result.data.summary,
            totalRequests: Number.isFinite(result.data.summary?.totalRequests) ? result.data.summary.totalRequests : 0,
            totalApiCalls: Number.isFinite(result.data.summary?.totalApiCalls) ? result.data.summary.totalApiCalls : 0,
            totalPageViews: Number.isFinite(result.data.summary?.totalPageViews) ? result.data.summary.totalPageViews : 0,
            totalUiActions: Number.isFinite(result.data.summary?.totalUiActions) ? result.data.summary.totalUiActions : 0,
            avgResponseTime: Number.isFinite(result.data.summary?.avgResponseTime) ? result.data.summary.avgResponseTime : 0,
            recentEventsCount: Number.isFinite(result.data.summary?.recentEventsCount) ? result.data.summary.recentEventsCount : 0,
            uniqueSessions: Number.isFinite(result.data.summary?.uniqueSessions) ? result.data.summary.uniqueSessions : 0,
          },
          dailyStats: result.data.dailyStats?.map((stat: {
            date: string | Date;
            totalRequests: number;
            apiCalls: number;
            pageViews: number;
            uiActions: number;
            successfulRequests: number;
            failedRequests: number;
            avgResponseTime: number | null;
          }) => ({
            ...stat,
            date: stat.date ? new Date(stat.date) : new Date(),
            totalRequests: Number.isFinite(stat.totalRequests) ? stat.totalRequests : 0,
            apiCalls: Number.isFinite(stat.apiCalls) ? stat.apiCalls : 0,
            pageViews: Number.isFinite(stat.pageViews) ? stat.pageViews : 0,
            uiActions: Number.isFinite(stat.uiActions) ? stat.uiActions : 0,
            successfulRequests: Number.isFinite(stat.successfulRequests) ? stat.successfulRequests : 0,
            failedRequests: Number.isFinite(stat.failedRequests) ? stat.failedRequests : 0,
            avgResponseTime: Number.isFinite(stat.avgResponseTime) ? stat.avgResponseTime : null,
          })) || [],
          recentEvents: result.data.recentEvents?.map((event: { timestamp: string | Date;[key: string]: unknown }) => ({
            ...event,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
          })) || [],
        };

        setData(processedData);
      } else {
        throw new Error(result.message || 'Failed to fetch session analytics');
      }
    } catch (error) {
      console.error('Failed to fetch user session analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load session analytics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  useEffect(() => {
    fetchUserSessionAnalytics();
  }, [fetchUserSessionAnalytics]);

  if (!data || !data.summary || !Array.isArray(data.dailyStats)) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className={`flex items-center gap-2 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                <BarChart3 className="h-5 w-5" />
                My Activity
              </CardTitle>
              <CardDescription>Your session usage and activity patterns (last {days} days)</CardDescription>
            </div>
            <Button
              onClick={fetchUserSessionAnalytics}
              size="sm"
              variant="outline"
              disabled={loading}
              className="shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-center py-8">
          {loading ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-muted-foreground">No activity data available yet</p>
              <p className="text-sm text-muted-foreground mt-2">Start using the application to see your analytics</p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className={`flex items-center gap-2 ${isMobile ? 'text-lg' : 'text-xl'}`}>
              <BarChart3 className="h-5 w-5" />
              My Activity
            </CardTitle>
            <CardDescription>Your session usage and activity patterns (last {days} days)</CardDescription>
          </div>
          <Button
            onClick={fetchUserSessionAnalytics}
            size="sm"
            variant="outline"
            disabled={loading}
            className="shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Summary Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {Number.isFinite(data.summary.totalRequests) ? data.summary.totalRequests.toLocaleString() : '0'}
                </div>
                <div className="text-sm text-blue-600/80">Total Requests</div>
              </div>

              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {Number.isFinite(data.summary.totalPageViews) ? data.summary.totalPageViews.toLocaleString() : '0'}
                </div>
                <div className="text-sm text-green-600/80">Page Views</div>
              </div>

              <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {Number.isFinite(data.summary.totalApiCalls) ? data.summary.totalApiCalls.toLocaleString() : '0'}
                </div>
                <div className="text-sm text-purple-600/80">API Calls</div>
              </div>

              <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {Number.isFinite(data.summary.totalUiActions) ? data.summary.totalUiActions.toLocaleString() : '0'}
                </div>
                <div className="text-sm text-orange-600/80">UI Actions</div>
              </div>
            </div>

            {/* Charts and Analytics */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="trends">Trends</TabsTrigger>
                <TabsTrigger value="activity">Recent Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Activity Distribution</h3>
                    <PieChart
                      data={[
                        { name: 'Page Views', value: Number.isFinite(data.summary.totalPageViews) ? data.summary.totalPageViews : 0 },
                        { name: 'API Calls', value: Number.isFinite(data.summary.totalApiCalls) ? data.summary.totalApiCalls : 0 },
                        { name: 'UI Actions', value: Number.isFinite(data.summary.totalUiActions) ? data.summary.totalUiActions : 0 },
                      ]}
                      height={300}
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Session Summary</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="text-sm font-medium">Total Sessions:</span>
                        <span className="font-semibold">{data.summary.uniqueSessions}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="text-sm font-medium">Days Active:</span>
                        <span className="font-semibold">{data.summary.totalDays}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="text-sm font-medium">Avg Response Time:</span>
                        <span className="font-medium">
                          {Number.isFinite(data.summary.avgResponseTime) && data.summary.avgResponseTime > 0
                            ? `${Math.round(data.summary.avgResponseTime)}ms`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="trends" className="space-y-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Request Trends</h3>
                    <LineChart
                      data={data.dailyStats
                        .filter(stat => stat && typeof stat === 'object')
                        .map((stat, index) => ({
                          date: stat.date && stat.date instanceof Date ? format(stat.date, 'MMM dd') : `Day ${index + 1}`,
                          requests: Number.isFinite(stat.totalRequests) ? stat.totalRequests : 0,
                        }))}
                      xAxisKey="date"
                      lines={[{ key: 'requests', color: '#3b82f6', name: 'Requests' }]}
                      height={300}
                      formatTooltip={(value, name) => [
                        Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '0',
                        name
                      ]}
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4">Activity Breakdown (Last 7 Days)</h3>
                    {(() => {
                      const chartData = data.dailyStats
                        .filter(stat => stat && typeof stat === 'object')
                        .slice(-7)
                        .map((stat, index) => ({
                          date: stat.date && stat.date instanceof Date ? format(stat.date, 'MMM dd') : `Day ${index + 1}`,
                          pageViews: Number.isFinite(stat.pageViews) ? stat.pageViews : 0,
                          apiCalls: Number.isFinite(stat.apiCalls) ? stat.apiCalls : 0,
                          uiActions: Number.isFinite(stat.uiActions) ? stat.uiActions : 0,
                        }));

                      const hasAnyData = chartData.some(item =>
                        item.pageViews > 0 || item.apiCalls > 0 || item.uiActions > 0
                      );

                      if (!hasAnyData) {
                        return (
                          <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                              No activity data to display in chart
                            </p>
                          </div>
                        );
                      }

                      return (
                        <LineChart
                          data={chartData}
                          xAxisKey="date"
                          lines={[
                            { key: 'pageViews', name: 'Page Views', color: '#10b981' },
                            { key: 'apiCalls', name: 'API Calls', color: '#8b5cf6' },
                            { key: 'uiActions', name: 'UI Actions', color: '#f59e0b' },
                          ]}
                          height={300}
                          formatTooltip={(value, name) => [
                            Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '0',
                            name
                          ]}
                        />
                      );
                    })()}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Recent Activity</h3>
                  {fetchRecentActivities && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchTerm('');
                        fetchRecentActivities?.(true, ''); // This will fetch all activities without search
                      }}
                      disabled={isLoadingActivities}
                    >
                      {isLoadingActivities ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search activities... (e.g., 'assigned italy', 'unassign server', 'dhcp reservation')"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 h-4 w-4"
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {isLoadingActivities ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredActivities && filteredActivities.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredActivities.map((activity) => {
                      const ipAddress = activity.details?.ipAddress;
                      const displayIpAddress = typeof ipAddress === 'string' ? ipAddress : null;

                      return (
                        <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg border">
                          <div className="flex-shrink-0 mt-0.5">
                            {getActionIcon(activity.action)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {getActionDescription(activity)}
                            </p>
                            <div className="flex items-center space-x-2 mt-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>{format(new Date(activity.timestamp), 'MMM d, yyyy h:mm a')}</span>
                              {displayIpAddress && (
                                <>
                                  <span>•</span>
                                  <span>{displayIpAddress}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No recent activity to display</p>
                    <p className="text-xs mt-2">
                      Activities will appear here when you perform actions like group assignments,
                      host alias operations, or profile updates.
                    </p>
                  </div>
                )}

                {/* Load More Button - show if there are more results */}
                {hasMore && recentActivities.length > 0 && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setIsLocalLoadingMore(true);
                        try {
                          if (fetchRecentActivities) {
                            await Promise.all([
                              fetchRecentActivities(false, ''),
                              new Promise(resolve => setTimeout(resolve, 500))
                            ]);
                          }
                        } finally {
                          setIsLocalLoadingMore(false);
                        }
                      }}
                      disabled={isLoadingMore || isLocalLoadingMore}
                      className="w-full"
                    >
                      {isLoadingMore || isLocalLoadingMore ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading more...
                        </>
                      ) : (
                        'Load More'
                      )}
                    </Button>
                  </div>
                )}

                {/* Search Results Info */}
                {searchTerm.trim() && (
                  <div className="text-center py-2 text-sm text-muted-foreground">
                    {filteredActivities.length === 0 ? (
                      <p>No activities found matching &quot;{searchTerm}&quot;</p>
                    ) : (
                      <p>Showing {filteredActivities.length} of {allActivities.length} activities matching &quot;{searchTerm}&quot;</p>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
