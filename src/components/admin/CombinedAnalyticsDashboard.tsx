'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MobileTabs, TabsContent } from '@/components/ui/mobile-tabs';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useLocalStorage } from '@/hooks/use-local-storage';
import {
  Activity,
  Key,
  Users,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Input } from '@/components/ui/input';

import { LineChart } from '../analytics/charts/LineChart';
import { MultiAxisBarChart } from '../analytics/charts/MultiAxisBarChart';
import { PieChart } from '../analytics/charts/PieChart';
import { ExportButton } from '../analytics/ExportButton';
import { DateRangePicker } from '../analytics/DateRangePicker';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';
import { CardSkeleton } from '@/components/ui/card-skeleton';

interface CombinedAnalyticsData {
  summary: {
    totalRequests: number;
    apiKeyRequests: number;
    sessionRequests: number;
    sessionBreakdown: {
      apiCalls: number;
      pageViews: number;
      uiActions: number;
    };
    successfulRequests: number;
    failedRequests: number;
    rateLimitHits: number;
    uniqueApiKeys: number;
    uniqueSessions: number;
    totalUniqueUsers: number;
  };
  dailyStats: Array<{
    date: string;
    apiKeyRequests: number;
    sessionRequests: number;
    sessionApiCalls: number;
    sessionPageViews: number;
    sessionUiActions: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rateLimitHits: number;
  }>;
  recentActivity: {
    totalEvents: number;
    events: Array<{
      timestamp: string;
      type: 'api_key' | 'session';
      source: string;
      user: string | null;
      endpoint: string;
      method: string;
      actionType?: string;
      statusCode: number | null;
      responseTime: number | null;
    }>;
  };
  breakdown: {
    apiKeys: {
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      rateLimitHits: number;
      uniqueApiKeys: number;
      uniqueUsers: number;
    };
    sessions: {
      totalRequests: number;
      apiCalls: number;
      pageViews: number;
      uiActions: number;
      successfulRequests: number;
      failedRequests: number;
      uniqueSessions: number;
      uniqueUsers: number;
    };
  };
}

import { useIsMobile } from '@/hooks/use-mobile';

export default function CombinedAnalyticsDashboard() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<CombinedAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    to: new Date(),
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useLocalStorage<string>('combined-analytics-active-tab', 'trends');
  const { toast } = useToast();

  // Filter recent activity based on search query
  const filteredRecentActivity = data?.recentActivity.events.filter(event => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const searchableText = [
      event.user,
      event.endpoint,
      event.method,
      event.type,
      event.actionType,
      event.source,
      event.statusCode?.toString(),
    ].filter(Boolean).join(' ').toLowerCase();

    // Support exact phrase matching with quotes
    if (query.startsWith('"') && query.endsWith('"')) {
      const exactPhrase = query.slice(1, -1);
      return searchableText.includes(exactPhrase);
    }

    // Support whole word matching and partial matching
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    return queryWords.every(word => searchableText.includes(word));
  }) || [];

  const fetchCombinedAnalytics = useCallback(async (isRefresh = false) => {
    if (!dateRange?.from || !dateRange?.to) {
      return;
    }

    // Only set loading to true for initial load, not for refresh
    if (!isRefresh) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
      });

      const response = await fetch(`/api/admin/analytics/combined?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch combined analytics');
      }

      const result = await response.json();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch combined analytics');
      }
    } catch (error) {
      logger.error('Error fetching combined analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load combined analytics data',
        variant: 'destructive',
      });
    } finally {
      // Only set loading to false for initial load, not for refresh
      if (!isRefresh) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
        // Force re-render by updating refresh key
        setRefreshKey(prev => prev + 1);
      }
    }
  }, [dateRange, toast]);

  useEffect(() => {
    fetchCombinedAnalytics();
  }, [fetchCombinedAnalytics]);

  if (isLoading) {
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
          <p>No combined analytics data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col flex-grow min-h-0">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl">Combined Analytics Dashboard</CardTitle>
            {!isMobile && <CardDescription>Unified view of API key and session usage across the system</CardDescription>}
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
                  ...data.dailyStats,
                  ...data.recentActivity.events,
                ]}
                filename="combined-analytics"
                title="Export"
                className="analytics-button"
              />
              <ResponsiveActionButton
                icon={isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                label="Refresh"
                onClick={() => fetchCombinedAnalytics(true)}
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
                <CardTitle className="text-xs font-medium">Total Requests</CardTitle>
                <Activity className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{data.summary.totalRequests.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {Math.round((data.summary.successfulRequests / data.summary.totalRequests) * 100)}% success rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">API Key Usage</CardTitle>
                <Key className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{data.summary.apiKeyRequests.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.uniqueApiKeys} active keys
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Session Usage</CardTitle>
                <Users className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{data.summary.sessionRequests.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.uniqueSessions} sessions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Total Users</CardTitle>
                <Globe className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{data.summary.totalUniqueUsers.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Unique users
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Usage Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <PieChart
              data={[
                { name: 'API Key Requests', value: data.summary.apiKeyRequests },
                { name: 'Session Requests', value: data.summary.sessionRequests },
              ]}
              title="Request Distribution"
              description="API key vs session usage"
              colors={['#3b82f6', '#10b981']}
              height={250}
            />

            <PieChart
              data={[
                { name: 'Page Views', value: data.summary.sessionBreakdown.pageViews },
                { name: 'API Calls', value: data.summary.sessionBreakdown.apiCalls },
                { name: 'UI Actions', value: data.summary.sessionBreakdown.uiActions },
              ]}
              title="Session Activity Breakdown"
              description="Types of session activities"
              colors={['#8b5cf6', '#f59e0b', '#ef4444']}
              height={250}
            />
          </div>

          {/* Detailed Analytics Tabs */}
          <MobileTabs
            defaultValue="trends"
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-4"
            tabs={[
              { value: "trends", label: "Usage Trends" },
              { value: "comparison", label: "API vs Session" },
              { value: "activity", label: "Recent Activity" }
            ]}
          >

            <TabsContent value="trends" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LineChart
                  data={data.dailyStats.map(stat => ({
                    date: stat.date,
                    total: stat.totalRequests,
                    successful: stat.successfulRequests,
                    failed: stat.failedRequests,
                  }))}
                  title="Daily Request Trends"
                  description="Total requests over time"
                  xAxisKey="date"
                  lines={[
                    { key: 'total', name: 'Total Requests', color: '#3b82f6' },
                    { key: 'successful', name: 'Successful', color: '#10b981' },
                    { key: 'failed', name: 'Failed', color: '#ef4444' },
                  ]}
                  height={300}
                  formatXAxis={(value) => format(new Date(value), 'MMM dd')}
                  formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                />

                <MultiAxisBarChart
                  data={data.dailyStats.slice(-7).map(stat => ({
                    date: format(new Date(stat.date), 'MMM dd'),
                    apiKey: Number(stat.apiKeyRequests) || 0,
                    session: Number(stat.sessionRequests) || 0,
                  }))}
                  title="API Key vs Session Usage (Last 7 Days)"
                  description="Comparison of usage types"
                  xAxisKey="date"
                  bars={[
                    { key: 'apiKey', name: 'API Key Requests', color: '#3b82f6', yAxisId: 'left' },
                    { key: 'session', name: 'Session Requests', color: '#10b981', yAxisId: 'right' },
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

            <TabsContent value="comparison" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      API Key Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Requests:</span>
                      <span className="font-medium">{data.breakdown.apiKeys.totalRequests.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Success Rate:</span>
                      <span className="font-medium">
                        {data.breakdown.apiKeys.totalRequests > 0
                          ? Math.round((data.breakdown.apiKeys.successfulRequests / data.breakdown.apiKeys.totalRequests) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Rate Limit Hits:</span>
                      <span className="font-medium">{data.breakdown.apiKeys.rateLimitHits.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Active API Keys:</span>
                      <span className="font-medium">{data.breakdown.apiKeys.uniqueApiKeys}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Unique Users:</span>
                      <span className="font-medium">{data.breakdown.apiKeys.uniqueUsers}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Session Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Requests:</span>
                      <span className="font-medium">{data.breakdown.sessions.totalRequests.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Page Views:</span>
                      <span className="font-medium">{data.breakdown.sessions.pageViews.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">API Calls:</span>
                      <span className="font-medium">{data.breakdown.sessions.apiCalls.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">UI Actions:</span>
                      <span className="font-medium">{data.breakdown.sessions.uiActions.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Active Sessions:</span>
                      <span className="font-medium">{data.breakdown.sessions.uniqueSessions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Unique Users:</span>
                      <span className="font-medium">{data.breakdown.sessions.uniqueUsers}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        Recent Activity
                        {data && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({searchQuery ? filteredRecentActivity.length : data.recentActivity.events.length} events)
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs">Latest events from both API keys and sessions</CardDescription>
                    </div>
                    <div className="relative flex items-center max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder='Search activity... (e.g., user, endpoint, "exact phrase")'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-8 text-sm"
                      />
                      {searchQuery && (
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                          onClick={() => setSearchQuery('')}
                          title="Clear search"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="overflow-auto">
                  {filteredRecentActivity.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="text-sm">
                        {searchQuery ? 'No Matching Activity' : 'No Recent Activity'}
                      </div>
                      <div className="text-xs mt-1">
                        {searchQuery
                          ? `No activity found matching "${searchQuery}". Try a different search term.`
                          : 'Recent activity will appear here when API requests and sessions are active'
                        }
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filteredRecentActivity.map((event, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {event.type === 'api_key' ? (
                                <Key className="h-3 w-3 text-blue-500" />
                              ) : (
                                <Users className="h-3 w-3 text-green-500" />
                              )}
                              <span className="text-sm font-medium">
                                {event.user || 'Unknown User'}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                                {event.type === 'api_key' ? 'API' : 'Session'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {event.method} {event.endpoint}
                              {event.actionType && ` • ${event.actionType}`}
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
