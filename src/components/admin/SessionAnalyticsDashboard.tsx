'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MobileTabs, TabsContent } from '@/components/ui/mobile-tabs';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useLocalStorage } from '@/hooks/use-local-storage';
import {
  Users,
  Activity,
  MousePointer,
  Globe,
  Loader2,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { BarChart } from '../analytics/charts/BarChart';
import { MultiAxisBarChart } from '../analytics/charts/MultiAxisBarChart';
import { LineChart } from '../analytics/charts/LineChart';
import { PieChart } from '../analytics/charts/PieChart';
import { ExportButton } from '../analytics/ExportButton';
import { DateRangePicker } from '../analytics/DateRangePicker';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';
import { CardSkeleton } from '@/components/ui/card-skeleton';

interface SessionAnalyticsData {
  summary: {
    totalRequests: number;
    totalApiCalls: number;
    totalPageViews: number;
    totalUiActions: number;
    totalUsers: number;
    totalSessions: number;
    avgRequestsPerUser: number;
    avgRequestsPerSession: number;
  };
  dailyStats: Array<{
    date: string;
    totalRequests: number;
    apiCalls: number;
    pageViews: number;
    uiActions: number;
    successfulRequests: number;
    failedRequests: number;
    uniqueUsers: number;
    uniqueSessions: number;
  }>;
  topUsers: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    requests: number;
  }>;
  recentActivity: {
    last24Hours: number;
    recentEvents: Array<{
      timestamp: string;
      userId: string;
      userName: string | null;
      endpoint: string;
      actionType: string;
      statusCode: number | null;
      responseTime: number | null;
    }>;
  };
}

import { useIsMobile } from '@/hooks/use-mobile';

export default function SessionAnalyticsDashboard() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<SessionAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useLocalStorage<string>('session-analytics-active-tab', 'trends');
  const { toast } = useToast();

  const fetchSessionAnalytics = useCallback(async (isRefresh = false) => {
    if (!dateRange?.from || !dateRange?.to) {
      return;
    }

    // Only set loading to true for initial load, not for refresh
    if (!isRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
      });

      const response = await fetch(`/api/admin/sessions/analytics/system?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch session analytics');
      }

      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch session analytics');
      }
    } catch (error) {
      logger.error('Error fetching session analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load session analytics data',
        variant: 'destructive',
      });
    } finally {
      // Only set loading to false for initial load, not for refresh
      if (!isRefresh) {
        setLoading(false);
      } else {
        setIsRefreshing(false);
        // Force re-render by updating refresh key
        setRefreshKey(prev => prev + 1);
      }
    }
  }, [dateRange, toast]);

  useEffect(() => {
    fetchSessionAnalytics();
  }, [fetchSessionAnalytics]);

  if (loading) {
    return (
      <CardSkeleton
        title={true}
        description={true}
        content={true}
        footer={true}
      />
    );
  }

  if (!data) {
    return (
      <Card className="flex flex-col flex-grow min-h-0">
        <CardContent className="flex items-center justify-center py-8">
          <p>No session analytics data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col flex-grow min-h-0">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl">Session Analytics Dashboard</CardTitle>
            {!isMobile && <CardDescription className="text-sm">System-wide session usage statistics and user activity</CardDescription>}
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
                  ...data.topUsers,
                  ...data.dailyStats,
                  ...data.recentActivity.recentEvents,
                ]}
                filename="session-analytics"
                title="Export"
                className="analytics-button"
              />
              <ResponsiveActionButton
                icon={isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                label="Refresh"
                onClick={() => fetchSessionAnalytics(true)}
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
          {/* Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Total Sessions</CardTitle>
                <Users className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{data.summary.totalSessions.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.totalUsers} unique users
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Total Requests</CardTitle>
                <Activity className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{data.summary.totalRequests.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {Math.round(data.summary.avgRequestsPerSession)} avg per session
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Page Views</CardTitle>
                <Globe className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{data.summary.totalPageViews.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.totalApiCalls.toLocaleString()} API calls
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">UI Actions</CardTitle>
                <MousePointer className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{data.summary.totalUiActions.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  User interactions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Activity Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <PieChart
              data={[
                { name: 'Page Views', value: data.summary.totalPageViews },
                { name: 'API Calls', value: data.summary.totalApiCalls },
                { name: 'UI Actions', value: data.summary.totalUiActions },
              ]}
              title="Activity Breakdown"
              description="Distribution of session activities"
              colors={['#3b82f6', '#10b981', '#f59e0b']}
              height={250}
            />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
                <CardDescription className="text-xs">Last 24 hours activity summary</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{data.recentActivity.last24Hours.toLocaleString()}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Events in last 24 hours</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Analytics Tabs */}
          <MobileTabs
            defaultValue="trends"
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-4"
            tabs={[
              { value: "trends", label: "Usage Trends" },
              { value: "users", label: "Top Users" },
              { value: "activity", label: "Recent Activity" }
            ]}
          >

            <TabsContent value="trends" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LineChart
                  data={data.dailyStats.map(stat => ({
                    date: stat.date,
                    requests: stat.totalRequests,
                    users: stat.uniqueUsers,
                    sessions: stat.uniqueSessions,
                  }))}
                  title="Daily Request Trends"
                  description="Total requests over time"
                  xAxisKey="date"
                  lines={[
                    { key: 'requests', name: 'Total Requests', color: '#3b82f6' },
                  ]}
                  height={300}
                  formatXAxis={(value) => format(new Date(value), 'MMM dd')}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />

                <MultiAxisBarChart
                  data={data.dailyStats.slice(-7).map(stat => ({
                    date: format(new Date(stat.date), 'MMM dd'),
                    pageViews: stat.pageViews,
                    apiCalls: stat.apiCalls,
                    uiActions: stat.uiActions,
                  }))}
                  title="Activity Types (Last 7 Days)"
                  description="Breakdown of activity types"
                  xAxisKey="date"
                  bars={[
                    { key: 'pageViews', name: 'Page Views', color: '#3b82f6', yAxisId: 'left' },
                    { key: 'apiCalls', name: 'API Calls', color: '#10b981', yAxisId: 'right' },
                    { key: 'uiActions', name: 'UI Actions', color: '#f59e0b', yAxisId: 'right' },
                  ]}
                  yAxes={[
                    { id: 'left', orientation: 'left', color: '#3b82f6' },
                    { id: 'right', orientation: 'right', color: '#10b981' },
                  ]}
                  height={300}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              {data.topUsers.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8 text-gray-600 dark:text-gray-400">
                    No user data available yet.
                  </CardContent>
                </Card>
              ) : (
                <BarChart
                  data={data.topUsers.slice(0, 10).map(user => ({
                    name: user.name || user.email || `User ${user.userId}`,
                    requests: Number(user.requests) || 0,
                  }))}
                  title="Top Users by Activity"
                  description="Users with the highest session activity"
                  xAxisKey="name"
                  bars={[
                    { key: 'requests', name: 'Total Requests', color: '#8b5cf6' },
                  ]}
                  height={400}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />
              )}
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent Session Events</CardTitle>
                  <CardDescription className="text-xs">Latest user activity across all sessions</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  {data.recentActivity.recentEvents.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                      No recent activity data available.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.recentActivity.recentEvents.slice(0, 20).map((event, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              {event.userName || 'Unknown User'}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {event.actionType} • {event.endpoint}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">
                            {format(new Date(event.timestamp), 'MMM dd, HH:mm')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </MobileTabs>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
