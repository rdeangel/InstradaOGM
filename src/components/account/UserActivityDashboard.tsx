'use client';

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity,
  RefreshCw,
  Plus,
  Move,
  Minus,
  Server,
  Loader2,
  TrendingUp,
  Calendar,
  Search,
  Clock,
  Shield,
  User,
  Settings,
  BarChart3,
  PieChart,
  LineChart,
  HardDriveUpload,
  Trash2,
  Wrench,
  Edit,
  Globe,
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types/opnsense';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { LineChart as LineChartComponent } from '@/components/analytics/charts/LineChart';
import { AreaChart as AreaChartComponent } from '@/components/analytics/charts/AreaChart';

interface UserActivityStats {
  assignments: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  moves: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  unassignments: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  hostOperations: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  hostCreations: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  hostDeletions: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  hostModifications: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  networkAliasOperations: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  networkAliasCreations: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  networkAliasModifications: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  networkAliasDeletions: {
    total: number;
    last7Days: number;
    last30Days: number;
  };
  totalActivities: number;
  mostActiveDay: string | null;
  topGroups: Array<{
    groupName: string;
    count: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    assignments: number;
    moves: number;
    unassignments: number;
    hostOperations: number;
    total: number;
  }>;
}

interface RecentActivity {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  timestamp: Date;
}

interface UserActivityDashboardProps {
  userId?: string;
}

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  bgColorScheme: string;
  textColorScheme: string;
}

// Memoized StatCard component to prevent unnecessary re-renders
const StatCard = memo(({ icon, value, label, bgColorScheme, textColorScheme }: StatCardProps) => (
  <div className={`flex flex-col items-center p-4 rounded-lg border ${bgColorScheme}`}>
    {icon}
    <div className={`text-2xl font-bold ${textColorScheme}`}>
      {value}
    </div>
    <div className="text-sm text-center">
      {label}
    </div>
  </div>
));
StatCard.displayName = 'StatCard';

const UserActivityDashboard = memo(function UserActivityDashboard({ }: UserActivityDashboardProps) {
  // Authentication and mobile detection
  const { data: session } = useAuth();
  const isMobile = useIsMobile();

  // State management
  const [activeTab, setActiveTab] = useLocalStorage<string>('user-activity-dashboard-active-tab', 'overview');
  const [stats, setStats] = useState<UserActivityStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useLocalStorage<'1h' | '6h' | '12h' | '1d' | '7d' | '30d' | 'all'>('activity-dashboard-time-range', '30d');

  // Pagination state for Time Analysis tab
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Role-based visibility
  const isAdmin = session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN;
  const showHostCards = isAdmin;

  // Tab configuration for responsive navigation
  const tabConfig = [
    { value: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { value: 'trends', label: 'Activity Trends', icon: <LineChart className="h-4 w-4" /> },
    { value: 'groups', label: 'Group Activity', icon: <PieChart className="h-4 w-4" /> },
    { value: 'timeline', label: 'User Activities', icon: <Clock className="h-4 w-4" /> },
  ];

  const currentTab = tabConfig.find(tab => tab.value === activeTab);

  // Fetch user activity data with support for in-place refresh
  const fetchData = useCallback(async (reset = false, inPlace = false) => {
    if (reset) {
      if (inPlace) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setRecentActivities([]);
    }
    setError(null);

    try {
      const offset = reset ? 0 : recentActivities.length;
      const [statsResponse, activitiesResponse] = await Promise.all([
        fetch(`/api/account/activity-statistics?period=${selectedPeriod}`),
        fetch(`/api/account/recent-activities?limit=20&offset=${offset}`)
      ]);

      if (!statsResponse.ok || !activitiesResponse.ok) {
        throw new Error('Failed to fetch activity data');
      }

      const statsData = await statsResponse.json();
      const activitiesData = await activitiesResponse.json();

      setStats(statsData.statistics);

      if (reset) {
        setRecentActivities(activitiesData.activities || []);
      } else {
        setRecentActivities(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const newActivities = (activitiesData.activities || []).filter((a: RecentActivity) => !existingIds.has(a.id));
          return [...prev, ...newActivities];
        });
      }

      // Update pagination state
      setHasMore(activitiesData.pagination?.hasMore || false);
      setTotalCount(activitiesData.pagination?.total || 0);
    } catch (err) {
      console.error('Error fetching activity data:', err);
      setError('Failed to load activity data');
    } finally {
      if (inPlace) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [recentActivities.length, selectedPeriod]);

  // Load more activities for pagination
  const loadMoreActivities = async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const offset = recentActivities.length;
      const [response] = await Promise.all([
        fetch(`/api/account/recent-activities?limit=20&offset=${offset}`),
        new Promise(resolve => setTimeout(resolve, 500))
      ]);

      if (!response.ok) {
        throw new Error('Failed to fetch more activities');
      }

      const data = await response.json();

      setRecentActivities(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const newActivities = (data.activities || []).filter((a: RecentActivity) => !existingIds.has(a.id));
        return [...prev, ...newActivities];
      });

      setHasMore(data.pagination?.hasMore || false);
      setTotalCount(data.pagination?.total || 0);
    } catch (err) {
      console.error('Error loading more activities:', err);
      setError('Failed to load more activities');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Initialize data on mount
  useEffect(() => {
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch data when period changes
  useEffect(() => {
    fetchData(true, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  // Memoized helper functions
  // Backend now filters stats by period, so we just use the 'total' value which represents the filtered period
  const getStatForPeriod = useCallback((stat: { total: number; last7Days: number; last30Days: number }) => {
    return stat.total;
  }, []);

  const getPeriodLabel = useCallback(() => {
    switch (selectedPeriod) {
      case '1h':
        return 'Last Hour';
      case '6h':
        return 'Last 6 Hours';
      case '12h':
        return 'Last 12 Hours';
      case '1d':
        return 'Last Day';
      case '7d':
        return 'Last 7 Days';
      case '30d':
        return 'Last 30 Days';
      case 'all':
      default:
        return 'All Time';
    }
  }, [selectedPeriod]);

  // Helper function to get the cutoff time for the selected period
  const getPeriodCutoffTime = useCallback(() => {
    const now = new Date();
    switch (selectedPeriod) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '6h':
        return new Date(now.getTime() - 6 * 60 * 60 * 1000);
      case '12h':
        return new Date(now.getTime() - 12 * 60 * 60 * 1000);
      case '1d':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'all':
      default:
        return new Date(0); // Beginning of time
    }
  }, [selectedPeriod]);

  // Filter activities based on selected period
  const filterActivitiesByPeriod = useCallback((activities: RecentActivity[]) => {
    const cutoffTime = getPeriodCutoffTime();
    return activities.filter(activity => new Date(activity.timestamp) >= cutoffTime);
  }, [getPeriodCutoffTime]);

  // Get adjusted stats - backend now handles all filtering based on period parameter
  // We just need to hide "Most Active Day" for periods <= 1 day
  const getAdjustedStats = useCallback(() => {
    if (!stats) return null;

    // Hide most active day for periods <= 1 day (not enough data for meaningful "most active day")
    if (selectedPeriod === '1h' || selectedPeriod === '6h' || selectedPeriod === '12h' || selectedPeriod === '1d') {
      return {
        ...stats,
        mostActiveDay: null,
      };
    }

    // For all other periods, use backend stats as-is (already filtered by period)
    return stats;
  }, [stats, selectedPeriod]);

  const getActionIcon = useCallback((action: string) => {
    if (action.includes('LOGIN') || action.includes('LOGOUT')) {
      return <User className="h-4 w-4 text-blue-500" />;
    }
    if (action.includes('GROUP') || action.includes('ASSIGN')) {
      return <Shield className="h-4 w-4 text-green-500" />;
    }
    if (action.includes('SETTINGS') || action.includes('UPDATE')) {
      return <Settings className="h-4 w-4 text-orange-500" />;
    }
    if (action.includes('HOST_ALIAS_') || action.includes('DHCP_RESERVATION_')) {
      return <Server className="h-4 w-4 text-purple-500" />;
    }
    return <Activity className="h-4 w-4 text-muted-foreground" />;
  }, []);

  // Memoized helper function to format group names with types when enabled
  const formatGroupName = useCallback((groupName: string, groupType?: string) => {
    if (!groupType) {
      return `"${groupName}"`;
    }

    const typeLabel = groupType === 'SingleSelect' ? 'Single' : 'Multi';
    return `"${groupName}" (${typeLabel})`;
  }, []);

  // Helper function to format host names for display
  const formatHostName = useCallback((hostAliasName: string, ipAddress?: string) => {
    // Convert HOST_192_168_1_61 to a more readable format
    if (hostAliasName.startsWith('HOST_')) {
      const ip = hostAliasName.replace('HOST_', '').replace(/_/g, '.');
      return ip;
    }
    return ipAddress || hostAliasName;
  }, []);

  // Helper function to format multiple hosts for display
  const formatHostList = useCallback((hostAliases: Array<{ hostAliasName: string; ipAddress?: string }>) => {
    if (hostAliases.length === 1) {
      return formatHostName(hostAliases[0].hostAliasName, hostAliases[0].ipAddress);
    } else if (hostAliases.length === 2) {
      return `${formatHostName(hostAliases[0].hostAliasName, hostAliases[0].ipAddress)} and ${formatHostName(hostAliases[1].hostAliasName, hostAliases[1].ipAddress)}`;
    } else if (hostAliases.length <= 3) {
      const formatted = hostAliases.map(h => formatHostName(h.hostAliasName, h.ipAddress));
      return `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
    } else {
      const first = formatHostName(hostAliases[0].hostAliasName, hostAliases[0].ipAddress);
      return `${first} and ${hostAliases.length - 1} other host${hostAliases.length - 1 > 1 ? 's' : ''}`;
    }
  }, [formatHostName]);

  // Memoized function to get action description - format activity details properly
  const getActionDescription = useCallback((activity: RecentActivity) => {
    const action = activity.action;
    const details = activity.details as Record<string, unknown> | null;

    // Group assignment operations
    if (action === 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS') {
      const groupName = details?.groupFriendlyName || details?.groupName;
      const hostAliasName = details?.hostAliasName as string | undefined;
      const ipAddress = details?.ipAddress as string | undefined;
      const wasMoved = details?.wasMoved;

      if (wasMoved) {
        const fromGroups = details?.removedFromGroups as Array<{ groupFriendlyName: string }> | undefined;
        const fromGroupName = fromGroups?.[0]?.groupFriendlyName;
        if (fromGroupName && groupName && hostAliasName) {
          const hostDisplay = formatHostName(hostAliasName, ipAddress);
          return `Moved ${hostDisplay} from ${formatGroupName(fromGroupName)} to ${formatGroupName(groupName as string)}`;
        }
      }

      if (hostAliasName && groupName) {
        const hostDisplay = formatHostName(hostAliasName, ipAddress);
        return `Assigned ${hostDisplay} to ${formatGroupName(groupName as string)}`;
      } else if (groupName) {
        return `Assigned to ${formatGroupName(groupName as string)}`;
      }
      return 'Assigned to group';
    }

    if (action === 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS') {
      const groups = details?.groups as Array<{ groupFriendlyName: string }> | undefined;
      const hostAliases = details?.hostAliases as Array<{ hostAliasName: string; ipAddress?: string }> | undefined;
      const removedFromGroups = details?.removedFromGroups as Array<{ groupFriendlyName: string }> | undefined;

      if (removedFromGroups && groups && hostAliases) {
        const fromGroupName = removedFromGroups[0]?.groupFriendlyName;
        const toGroupName = groups[0]?.groupFriendlyName;
        if (fromGroupName && toGroupName) {
          const hostDisplay = formatHostList(hostAliases);
          return `Moved ${hostDisplay} from ${formatGroupName(fromGroupName)} to ${formatGroupName(toGroupName)}`;
        }
      }

      if (groups && hostAliases) {
        const groupName = groups[0]?.groupFriendlyName;
        const hostDisplay = formatHostList(hostAliases);
        return `Assigned ${hostDisplay} to ${formatGroupName(groupName)}`;
      }
      return 'Batch assignment';
    }

    // Group unassignment operations
    if (action === 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS') {
      const groupName = details?.groupFriendlyName || details?.groupName;
      const hostAliasName = details?.hostAliasName as string | undefined;
      const ipAddress = details?.ipAddress as string | undefined;

      if (hostAliasName && groupName) {
        const hostDisplay = formatHostName(hostAliasName, ipAddress);
        return `Unassigned ${hostDisplay} from ${formatGroupName(groupName as string)}`;
      } else if (groupName) {
        return `Unassigned from ${formatGroupName(groupName as string)}`;
      }
      return 'Unassigned from group';
    }

    if (action === 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS') {
      const groups = details?.groups as Array<{ groupFriendlyName: string }> | undefined;
      const hostAliases = details?.hostAliases as Array<{ hostAliasName: string; ipAddress?: string }> | undefined;

      if (groups && hostAliases) {
        const groupName = groups[0]?.groupFriendlyName;
        const hostDisplay = formatHostList(hostAliases);
        return `Unassigned ${hostDisplay} from ${formatGroupName(groupName)}`;
      }
      return 'Batch unassignment';
    }

    if (action === 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS') {
      const hostAliases = details?.hostAliases as Array<{ hostAliasName: string; ipAddress?: string }> | undefined;

      if (hostAliases) {
        const hostDisplay = formatHostList(hostAliases);
        return `Unassigned ${hostDisplay} from all groups`;
      }
      return 'Unassigned from all groups';
    }

    // Move operations
    if (action === 'OPNSENSE_GROUP_IP_MOVE_SUCCESS') {
      const fromGroup = details?.fromGroup as { groupFriendlyName: string } | undefined;
      const toGroup = details?.toGroup as { groupFriendlyName: string } | undefined;
      const hostAliasName = details?.hostAliasName as string | undefined;

      if (fromGroup && toGroup && hostAliasName) {
        return `Moved ${hostAliasName} from ${formatGroupName(fromGroup.groupFriendlyName)} to ${formatGroupName(toGroup.groupFriendlyName)}`;
      } else if (fromGroup && toGroup) {
        return `Moved from ${formatGroupName(fromGroup.groupFriendlyName)} to ${formatGroupName(toGroup.groupFriendlyName)}`;
      }
      return 'Moved between groups';
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

    if (action === 'HOST_ALIAS_DELETE_SUCCESS') {
      const aliasName = details?.aliasName;
      if (aliasName) {
        return `Deleted host alias: ${aliasName}`;
      }
      return 'Deleted host alias';
    }

    if (action === 'HOST_ALIAS_UPDATE_SUCCESS') {
      const aliasName = details?.aliasName;
      if (aliasName) {
        return `Updated host alias: ${aliasName}`;
      }
      return 'Updated host alias';
    }

    // Authentication
    if (action === 'LOGIN_SUCCESS') return 'Logged in successfully';
    if (action === 'LOGOUT_SUCCESS') return 'Logged out';
    if (action === 'SETTINGS_UPDATE_SUCCESS') return 'Updated settings';
    if (action === 'PASSWORD_CHANGE_SUCCESS') return 'Changed password';

    // Fallback: format action name
    return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase());
  }, [formatGroupName, formatHostName, formatHostList]);

  // Memoized computed values
  const gridClassName = useMemo(() =>
    `grid gap-4 ${showHostCards ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7' : 'grid-cols-2 md:grid-cols-4'}`,
    [showHostCards]
  );

  const periodLabel = useMemo(() => getPeriodLabel(), [getPeriodLabel]);

  // Memoized adjusted stats based on selected period
  const adjustedStats = useMemo(() => getAdjustedStats(), [getAdjustedStats]);

  // Memoized filtered activities
  const filteredActivities = useMemo(() => {
    // First filter by time period
    const periodFiltered = filterActivitiesByPeriod(recentActivities);

    // Then filter by search term
    return periodFiltered.filter((activity: RecentActivity) => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      const description = getActionDescription(activity).toLowerCase();
      return description.includes(searchLower) ||
        activity.action.toLowerCase().includes(searchLower);
    });
  }, [recentActivities, searchTerm, getActionDescription, filterActivitiesByPeriod]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className={`flex items-center ${isMobile ? 'text-lg' : 'text-xl'}`}>
            <Activity className="mr-2 h-5 w-5" />
            My Activity Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading your activity data...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className={`flex items-center ${isMobile ? 'text-lg' : 'text-xl'}`}>
            <Activity className="mr-2 h-5 w-5" />
            My Activity Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="text-red-600 dark:text-red-400 mb-4">⚠️ {error}</div>
            <Button variant="outline" onClick={() => fetchData(true)}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className={`flex items-center justify-between ${isMobile ? 'text-lg' : 'text-xl'}`}>
          <div className="flex items-center">
            <Activity className="mr-2 h-5 w-5" />
            My Activity Dashboard
          </div>
          <div className="flex items-center space-x-2">
            {/* Refresh Button - Responsive: Icon + Text on desktop, Icon only on mobile */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true, true)}
              disabled={isLoading || isRefreshing}
              className={isMobile ? 'px-2' : ''}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {!isMobile && <span className="ml-2">Refresh</span>}
            </Button>

            {/* Time Period Filter */}
            <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as typeof selectedPeriod)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 Hour</SelectItem>
                <SelectItem value="6h">6 Hours</SelectItem>
                <SelectItem value="12h">12 Hours</SelectItem>
                <SelectItem value="1d">1 Day</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
        <CardDescription>
          Your personal activity summary for {periodLabel.toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
          {/* Desktop Tab Navigation */}
          <TabsList className={`${isMobile ? 'sr-only' : 'grid w-full grid-cols-4'}`}>
            {tabConfig.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Mobile Dropdown Navigation */}
          {isMobile && (
            <div className="w-full mb-4">
              <Select value={activeTab} onValueChange={setActiveTab}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      {currentTab?.icon}
                      {currentTab?.label}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {tabConfig.map((tab) => (
                    <SelectItem key={tab.value} value={tab.value}>
                      <div className="flex items-center gap-2">
                        {tab.icon}
                        {tab.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-2">
            <ScrollArea className="h-[calc(100vh-420px)] w-full">
              <div className="space-y-6 p-4">
                {adjustedStats && (
                  <>
                    {/* Main Statistics Grid */}
                    <div className={gridClassName}>
                      <StatCard
                        icon={<Plus className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-2" />}
                        value={getStatForPeriod(adjustedStats.assignments)}
                        label="Assignments"
                        bgColorScheme="bg-blue-50 dark:bg-blue-950/20"
                        textColorScheme="text-blue-700 dark:text-blue-300"
                      />

                      <StatCard
                        icon={<Minus className="h-8 w-8 text-orange-600 dark:text-orange-400 mb-2" />}
                        value={getStatForPeriod(adjustedStats.unassignments)}
                        label="Unassignments"
                        bgColorScheme="bg-orange-50 dark:bg-orange-950/20"
                        textColorScheme="text-orange-700 dark:text-orange-300"
                      />

                      <StatCard
                        icon={<Move className="h-8 w-8 text-green-600 dark:text-green-400 mb-2" />}
                        value={getStatForPeriod(adjustedStats.moves)}
                        label="Moves"
                        bgColorScheme="bg-green-50 dark:bg-green-950/20"
                        textColorScheme="text-green-700 dark:text-green-300"
                      />

                      {showHostCards && (
                        <>
                          <StatCard
                            icon={<Wrench className="h-8 w-8 text-purple-600 dark:text-purple-400 mb-2" />}
                            value={getStatForPeriod(adjustedStats.hostOperations)}
                            label="Host Operations"
                            bgColorScheme="bg-purple-50 dark:bg-purple-950/20"
                            textColorScheme="text-purple-700 dark:text-purple-300"
                          />

                          <StatCard
                            icon={<HardDriveUpload className="h-8 w-8 text-emerald-600 dark:text-emerald-400 mb-2" />}
                            value={getStatForPeriod(adjustedStats.hostCreations)}
                            label="Host Creations"
                            bgColorScheme="bg-emerald-50 dark:bg-emerald-950/20"
                            textColorScheme="text-emerald-700 dark:text-emerald-300"
                          />
                        </>
                      )}

                      {/* Host Modifications card - visible to all users */}
                      <StatCard
                        icon={<Edit className="h-8 w-8 text-yellow-600 dark:text-yellow-400 mb-2" />}
                        value={getStatForPeriod(adjustedStats.hostModifications)}
                        label="Host Modifications"
                        bgColorScheme="bg-yellow-50 dark:bg-yellow-950/20"
                        textColorScheme="text-yellow-700 dark:text-yellow-300"
                      />

                      {showHostCards && (
                        <>
                          <StatCard
                            icon={<Trash2 className="h-8 w-8 text-orange-600 dark:text-orange-400 mb-2" />}
                            value={getStatForPeriod(adjustedStats.hostDeletions)}
                            label="Host Deletions"
                            bgColorScheme="bg-orange-50 dark:bg-orange-950/20"
                            textColorScheme="text-orange-700 dark:text-orange-300"
                          />
                        </>
                      )}

                      {/* Network Alias Operations - admin only */}
                      {showHostCards && (
                        <>
                          <StatCard
                            icon={<Globe className="h-8 w-8 text-cyan-600 dark:text-cyan-400 mb-2" />}
                            value={getStatForPeriod(adjustedStats.networkAliasCreations)}
                            label="Network Creations"
                            bgColorScheme="bg-cyan-50 dark:bg-cyan-950/20"
                            textColorScheme="text-cyan-700 dark:text-cyan-300"
                          />

                          <StatCard
                            icon={<Edit className="h-8 w-8 text-yellow-600 dark:text-yellow-400 mb-2" />}
                            value={getStatForPeriod(adjustedStats.networkAliasModifications)}
                            label="Network Modifications"
                            bgColorScheme="bg-yellow-50 dark:bg-yellow-950/20"
                            textColorScheme="text-yellow-700 dark:text-yellow-300"
                          />

                          <StatCard
                            icon={<Trash2 className="h-8 w-8 text-red-600 dark:text-red-400 mb-2" />}
                            value={getStatForPeriod(adjustedStats.networkAliasDeletions)}
                            label="Network Deletions"
                            bgColorScheme="bg-red-50 dark:bg-red-950/20"
                            textColorScheme="text-red-700 dark:text-red-300"
                          />
                        </>
                      )}
                    </div>

                    {/* Additional Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg border bg-muted/50">
                        <div className="flex items-center mb-2">
                          <Activity className="h-5 w-5 text-muted-foreground mr-2" />
                          <span className="font-medium">Total Activities</span>
                        </div>
                        <div className="text-2xl font-bold">{adjustedStats.totalActivities}</div>
                        <div className="text-sm text-muted-foreground">For selected period</div>
                      </div>

                      {adjustedStats.mostActiveDay && (
                        <div className="p-4 rounded-lg border bg-muted/50">
                          <div className="flex items-center mb-2">
                            <Calendar className="h-5 w-5 text-muted-foreground mr-2" />
                            <span className="font-medium">Most Active Day</span>
                          </div>
                          <div className="text-lg font-semibold">{adjustedStats.mostActiveDay}</div>
                          <div className="text-sm text-muted-foreground">For selected period</div>
                        </div>
                      )}
                    </div>

                    {/* Top Groups */}
                    {adjustedStats.topGroups.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <TrendingUp className="h-5 w-5 text-muted-foreground mr-2" />
                          <span className="font-medium">Most Assigned Groups</span>
                        </div>
                        <div className="space-y-2">
                          {adjustedStats.topGroups.slice(0, 5).map((group: { groupName: string; count: number }, index: number) => (
                            <div key={group.groupName} className="flex items-center justify-between p-2 rounded border">
                              <div className="flex items-center">
                                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300 mr-3">
                                  {index + 1}
                                </div>
                                <span className="font-medium">{group.groupName}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold">{group.count}</div>
                                <div className="text-xs text-muted-foreground">assign type operations</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Activity Trends Tab */}
          <TabsContent value="trends" className="mt-2">
            <ScrollArea className="h-[calc(100vh-420px)] w-full">
              <div className="space-y-6 p-4">
                {adjustedStats && adjustedStats.dailyBreakdown && adjustedStats.dailyBreakdown.length > 0 ? (
                  <>
                    {/* Total Activity Trend */}
                    <LineChartComponent
                      data={adjustedStats.dailyBreakdown}
                      title="Activity Over Time"
                      description={`Total activities for ${periodLabel.toLowerCase()}`}
                      xAxisKey="date"
                      lines={[
                        { key: 'total', name: 'Total Activities', color: '#3b82f6', strokeWidth: 3 },
                      ]}
                      height={300}
                      formatXAxis={(value) => {
                        const date = new Date(value);
                        // For short periods, show time; for longer periods, show date
                        if (selectedPeriod === '1h' || selectedPeriod === '6h' || selectedPeriod === '12h') {
                          return format(date, 'HH:mm');
                        } else if (selectedPeriod === '1d') {
                          return format(date, 'MMM dd HH:mm');
                        } else {
                          return format(date, 'MMM dd');
                        }
                      }}
                      formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                    />

                    {/* Activity Breakdown by Type */}
                    <AreaChartComponent
                      data={adjustedStats.dailyBreakdown}
                      title="Activity Breakdown by Type"
                      description={`Breakdown of different activity types for ${periodLabel.toLowerCase()}`}
                      xAxisKey="date"
                      areas={[
                        { key: 'assignments', name: 'Assignments', color: '#3b82f6', fillOpacity: 0.6 },
                        { key: 'moves', name: 'Moves', color: '#10b981', fillOpacity: 0.6 },
                        { key: 'unassignments', name: 'Unassignments', color: '#f59e0b', fillOpacity: 0.6 },
                        ...(showHostCards ? [{ key: 'hostOperations', name: 'Host Operations', color: '#8b5cf6', fillOpacity: 0.6 }, { key: 'networkAliasOperations', name: 'Network Alias Ops', color: '#06b6d4', fillOpacity: 0.6 }] : []),
                      ]}
                      height={350}
                      stacked={true}
                      formatXAxis={(value) => {
                        const date = new Date(value);
                        if (selectedPeriod === '1h' || selectedPeriod === '6h' || selectedPeriod === '12h') {
                          return format(date, 'HH:mm');
                        } else if (selectedPeriod === '1d') {
                          return format(date, 'MMM dd HH:mm');
                        } else {
                          return format(date, 'MMM dd');
                        }
                      }}
                      formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                    />

                    {/* Individual Activity Type Trends */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <LineChartComponent
                        data={adjustedStats.dailyBreakdown}
                        title="Assignments & Moves"
                        description="Group assignment and move operations"
                        xAxisKey="date"
                        lines={[
                          { key: 'assignments', name: 'Assignments', color: '#3b82f6' },
                          { key: 'moves', name: 'Moves', color: '#10b981' },
                        ]}
                        height={250}
                        formatXAxis={(value) => {
                          const date = new Date(value);
                          if (selectedPeriod === '1h' || selectedPeriod === '6h' || selectedPeriod === '12h') {
                            return format(date, 'HH:mm');
                          } else if (selectedPeriod === '1d') {
                            return format(date, 'MMM dd HH:mm');
                          } else {
                            return format(date, 'MMM dd');
                          }
                        }}
                        formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                      />

                      <LineChartComponent
                        data={adjustedStats.dailyBreakdown}
                        title="Unassignments"
                        description="Group unassignment operations"
                        xAxisKey="date"
                        lines={[
                          { key: 'unassignments', name: 'Unassignments', color: '#f59e0b' },
                        ]}
                        height={250}
                        formatXAxis={(value) => {
                          const date = new Date(value);
                          if (selectedPeriod === '1h' || selectedPeriod === '6h' || selectedPeriod === '12h') {
                            return format(date, 'HH:mm');
                          } else if (selectedPeriod === '1d') {
                            return format(date, 'MMM dd HH:mm');
                          } else {
                            return format(date, 'MMM dd');
                          }
                        }}
                        formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                      />
                    </div>

                    {showHostCards && (
                      <LineChartComponent
                        data={adjustedStats.dailyBreakdown}
                        title="Operations Over Time"
                        description="Host and network alias operations"
                        xAxisKey="date"
                        lines={[
                          { key: 'hostOperations', name: 'Host Operations', color: '#8b5cf6' },
                          { key: 'networkAliasOperations', name: 'Network Alias Ops', color: '#06b6d4' },
                        ]}
                        height={250}
                        formatXAxis={(value) => {
                          const date = new Date(value);
                          if (selectedPeriod === '1h' || selectedPeriod === '6h' || selectedPeriod === '12h') {
                            return format(date, 'HH:mm');
                          } else if (selectedPeriod === '1d') {
                            return format(date, 'MMM dd HH:mm');
                          } else {
                            return format(date, 'MMM dd');
                          }
                        }}
                        formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <LineChart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Activity Data</h3>
                    <p className="text-muted-foreground">
                      No activities found for the selected period. Try selecting a different time range.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Group Activity Tab */}
          <TabsContent value="groups" className="mt-2">
            <ScrollArea className="h-[calc(100vh-420px)] w-full">
              <div className="space-y-6 p-4">
                {adjustedStats && adjustedStats.topGroups.length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Your Group Interactions</h3>
                    <div className="grid gap-4">
                      {adjustedStats.topGroups.map((group: { groupName: string; count: number }, index: number) => (
                        <div key={group.groupName} className="flex items-center justify-between p-4 rounded-lg border">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-sm font-medium text-blue-700 dark:text-blue-300 mr-3">
                              {index + 1}
                            </div>
                            <div className="font-medium">{group.groupName}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold">{group.count}</div>
                            <div className="text-xs text-muted-foreground">assign type operations</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <PieChart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Group Activity</h3>
                    <p className="text-muted-foreground">
                      You haven&apos;t interacted with any groups yet.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Time Analysis Tab */}
          <TabsContent value="timeline" className="mt-2">
            <ScrollArea className="h-[calc(100vh-420px)] w-full">
              <div className="space-y-6 p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Recent Activities</h3>
                    {totalCount > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({totalCount} total)
                      </span>
                    )}
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search activities..."
                      value={searchTerm}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Activities List - Responsive Layout */}
                  {isMobile ? (
                    // Mobile View: Card-based layout with natural height expansion
                    <div className="space-y-4">
                      {filteredActivities.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <div className="space-y-2">
                            <p className="text-sm">
                              {searchTerm ? 'No activities found matching your search' : 'No recent activities found'}
                            </p>
                            {!searchTerm && (
                              <p className="text-xs">
                                Activities will appear here when you perform actions like group assignments,
                                host operations, or profile updates.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {filteredActivities.map((activity: RecentActivity) => (
                            <Card key={activity.id} className="transition-shadow hover:shadow-md">
                              <CardHeader className="pb-2">
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 mt-1">
                                    {getActionIcon(activity.action)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <CardTitle className="text-base font-medium text-foreground break-words leading-relaxed">
                                      {getActionDescription(activity)}
                                    </CardTitle>
                                    <CardDescription className="flex items-center mt-2 text-xs">
                                      <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
                                      <span className="break-words">
                                        {format(new Date(activity.timestamp), 'MMM d, yyyy h:mm a')}
                                      </span>
                                    </CardDescription>
                                  </div>
                                </div>
                              </CardHeader>
                            </Card>
                          ))}

                          {/* Load More Button - Mobile */}
                          {hasMore && !searchTerm && (
                            <div className="flex justify-center pt-4">
                              <Button
                                variant="outline"
                                onClick={loadMoreActivities}
                                disabled={isLoadingMore}
                                className="w-full"
                              >
                                {isLoadingMore ? (
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
                        </>
                      )}
                    </div>
                  ) : (
                    // Desktop View: Compact list layout with scrolling
                    <div className="space-y-3">
                      {filteredActivities.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <div className="space-y-2">
                            <p className="text-sm">
                              {searchTerm ? 'No activities found matching your search' : 'No recent activities found'}
                            </p>
                            {!searchTerm && (
                              <p className="text-xs">
                                Activities will appear here when you perform actions like group assignments,
                                host operations, or profile updates.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {filteredActivities.map((activity: RecentActivity) => (
                            <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                              <div className="flex-shrink-0 mt-1">
                                {getActionIcon(activity.action)}
                              </div>
                              <div className="flex-1 min-w-0">
                                {/* Activity description - allows wrapping */}
                                <p className="text-sm font-medium text-foreground break-words whitespace-normal leading-relaxed mb-1">
                                  {getActionDescription(activity)}
                                </p>
                                {/* Timestamp */}
                                <div className="flex items-center text-xs text-muted-foreground flex-wrap">
                                  <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
                                  <span className="break-words whitespace-normal">
                                    {format(new Date(activity.timestamp), 'MMM d, yyyy h:mm a')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* Load More Button - Desktop */}
                          {hasMore && !searchTerm && (
                            <div className="flex justify-center pt-4">
                              <Button
                                variant="outline"
                                onClick={loadMoreActivities}
                                disabled={isLoadingMore}
                                className="w-full"
                              >
                                {isLoadingMore ? (
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
                        </>
                      )}
                    </div>
                  )}

                  {/* Search Results Info */}
                  {searchTerm && (
                    <div className="text-center py-2 text-sm text-muted-foreground">
                      <p>Showing {filteredActivities.length} of {recentActivities.length} activities matching &quot;{searchTerm}&quot;</p>
                      {recentActivities.length < totalCount && (
                        <p className="text-xs mt-1">Load more activities to expand search results</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
});

export default UserActivityDashboard;
