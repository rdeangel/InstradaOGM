'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  Network,
  AlertCircle,
  BarChart3,
  PieChart,
  Calendar,
  Slash,
  Clock
} from 'lucide-react';
import { PieChart as RechartsPieChart } from '@/components/analytics/charts/PieChart';
import { LineChart } from '@/components/analytics/charts/LineChart';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MacAnalyticsData {
  totalMacs: number;
  activeMacs: number;
  inactiveMacs: number;
  privacyMacs: number;
  dhcpReservedMacs: number;
  dhcpConflictMacs: number;
  newMacsToday: number;
  newMacsThisWeek: number;
  newMacsThisMonth: number;
  topInterfaces: Array<{
    interface: string;
    count: number;
    percentage: number;
  }>;
  topVendors: Array<{
    vendor: string;
    count: number;
    percentage: number;
  }>;
  activityTrend: Array<{
    date: string;
    active: number;
    total: number;
  }>;
  privacyMacPercentage: number;
  dhcpCoveragePercentage: number;
  fullyExcludedMacs: number;
  partiallyExcludedMacs: number;
}

interface MacTrackingAnalyticsProps {
  className?: string;
}

export function MacTrackingAnalytics({ className }: MacTrackingAnalyticsProps) {
  const [analytics, setAnalytics] = useState<MacAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<string>(() => {
    // Load from localStorage or default to 7 days
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mac-analytics-trend-period') || '7';
    }
    return '7';
  });

  // Fetch main analytics once on mount
  useEffect(() => {
    fetchAnalytics();

    // Refresh analytics in real-time when exclusions are changed elsewhere
    const onExclusionUpdated: EventListener = () => { fetchAnalytics(); };
    window.addEventListener('mac-tracking:exclusion-updated', onExclusionUpdated);
    return () => window.removeEventListener('mac-tracking:exclusion-updated', onExclusionUpdated);
    // fetchAnalytics is intentionally excluded to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch trend data when period changes
  useEffect(() => {
    if (analytics) {
      fetchTrendData();
    }
    // analytics and fetchTrendData are intentionally excluded to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendPeriod]);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/mac-tracking/analytics?days=${trendPeriod}`);

      if (response.status === 403) {
        // Feature disabled - fail silently as parent will handle UI
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const data = await response.json();
      if (data.success) {
        setAnalytics(data.data);
      } else {
        throw new Error(data.message || 'Failed to load analytics');
      }
    } catch (error) {
      console.error('Error fetching MAC analytics:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTrendData = async () => {
    try {
      setIsTrendLoading(true);

      const response = await fetch(`/api/admin/mac-tracking/analytics?days=${trendPeriod}`);

      if (response.status === 403) {
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch trend data');
      }

      const data = await response.json();
      if (data.success && analytics) {
        // Only update the activityTrend data
        setAnalytics({
          ...analytics,
          activityTrend: data.data.activityTrend
        });
      }
    } catch (error) {
      console.error('Error fetching trend data:', error);
    } finally {
      setIsTrendLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">
              {error || 'Failed to load MAC tracking analytics'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>

      {/* Discovery Trends */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Today</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{analytics.newMacsToday}</div>
            <p className="text-xs text-muted-foreground">
              Discovered today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{analytics.newMacsThisWeek}</div>
            <p className="text-xs text-muted-foreground">
              Past 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New This Month</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>


          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{analytics.newMacsThisMonth}</div>
            <p className="text-xs text-muted-foreground">
              Past 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Exclusion Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-row items-center justify-between w-full cursor-help">
                    <CardTitle className="text-sm font-medium">Fully Excluded MACs</CardTitle>
                    <Slash className="h-4 w-4 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs leading-snug">Tracking disabled.</p>
                  <p className="text-xs leading-snug">Current IPs and history are not recorded.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{analytics.fullyExcludedMacs}</div>
            <p className="text-xs text-muted-foreground">Tracking disabled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-row items-center justify-between w-full cursor-help">
                    <CardTitle className="text-sm font-medium">Partially Excluded MACs</CardTitle>
                    <Network className="h-4 w-4 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs leading-snug">Current IPs tracked and visible.</p>
                  <p className="text-xs leading-snug">History is disabled; counter hidden.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{analytics.partiallyExcludedMacs}</div>
            <p className="text-xs text-muted-foreground">IP Tracking - No History</p>
          </CardContent>
        </Card>
      </div>


      {/* Issues and Conflicts */}
      {analytics.dhcpConflictMacs > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
              <AlertCircle className="h-5 w-5" />
              DHCP Conflicts Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-orange-700 dark:text-orange-300">
              {analytics.dhcpConflictMacs} MAC address{analytics.dhcpConflictMacs !== 1 ? 'es' : ''}
              {' '}ha{analytics.dhcpConflictMacs !== 1 ? 've' : 's'} DHCP reservation conflicts that need attention.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Top Interfaces and Vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Interfaces */}
        <Card className="h-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Network Interfaces by Host Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="h-60 overflow-y-auto">
            <div className="space-y-3">
              {analytics.topInterfaces.map((item, index) => (
                <div key={item.interface} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      #{index + 1}
                    </Badge>
                    <span className="font-mono text-sm">{item.interface}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{item.count}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Vendors */}
        <Card className="h-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Device Vendors by Host Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="h-60 overflow-y-auto">
            <div className="space-y-3">
              {analytics.topVendors.map((item, index) => (
                <div key={item.vendor} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      #{index + 1}
                    </Badge>
                    <span className="text-sm truncate max-w-[150px]">
                      {item.vendor || 'Unknown'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{item.count}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interface Distribution Pie Chart */}
        <RechartsPieChart
          data={analytics.topInterfaces.slice(0, 5).map(item => ({
            name: item.interface || 'Unknown',
            value: item.count
          }))}
          title="Top 5 Interfaces"
          description="MAC addresses by network interface"
          height={300}
          colors={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']}
        />

        {/* Vendor Distribution Pie Chart */}
        <RechartsPieChart
          data={analytics.topVendors.slice(0, 5).map(item => ({
            name: item.vendor || 'Unknown',
            value: item.count
          }))}
          title="Top 5 Vendors"
          description="MAC addresses by device vendor"
          height={300}
          colors={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']}
        />
      </div>

      {/* Activity Trends Chart */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                MAC Address Activity Trends
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Devices active each day (based on activation periods) vs. total devices discovered
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Select
                value={trendPeriod}
                onValueChange={(value) => {
                  setTrendPeriod(value);
                  localStorage.setItem('mac-analytics-trend-period', value);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last 1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="relative">
            {isTrendLoading && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10 rounded-md">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Loading trend data...
                </div>
              </div>
            )}
            <LineChart
              data={analytics.activityTrend.map((item: { date: string; active: number; total: number }) => ({
                date: new Date(item.date).toLocaleDateString(),
                active: item.active,
                total: item.total
              }))}
              xAxisKey="date"
              lines={[
                {
                  key: 'active',
                  name: 'Active Devices',
                  color: '#10b981',
                  strokeWidth: 2
                },
                {
                  key: 'total',
                  name: 'Total Devices',
                  color: '#3b82f6',
                  strokeWidth: 2
                }
              ]}
              height={300}
              formatTooltip={(value, name) => [value.toString(), name]}
            />
          </CardContent>
        </Card>
      </div>


    </div>
  );
}

