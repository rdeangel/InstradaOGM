'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MobileTabs, TabsContent } from '@/components/ui/mobile-tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';
import {
  BarChart3,
  Users,
  Key,
  Activity,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { BarChart } from '../analytics/charts/BarChart';
import { PieChart } from '../analytics/charts/PieChart';
import { ExportButton } from '../analytics/ExportButton';
import { EndpointsBarChart } from '../analytics/charts/EndpointsBarChart';
import { EndpointsPieChart } from '../analytics/charts/EndpointsPieChart';
import { DateRangePicker } from '../analytics/DateRangePicker';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';
import { CardSkeleton } from '@/components/ui/card-skeleton';

interface SystemWideUsageStats {
  totalApiKeys: number;
  activeApiKeys: number;
  totalUsers: number;
  usersWithApiKeys: number;
  totalRequests: number;
  rateLimitViolations: number;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    apiKeyCount: number;
    totalRequests: number;
  }>;
  topApiKeys: Array<{
    id: string;
    name: string;
    userId: string;
    userName: string | null;
    requests: number;
    lastUsed: string | null;
  }>;
  usageByPeriod: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  requestsByEndpoint: Array<{
    endpoint: string;
    count: number;
    percentage: number;
  }>;
}

interface UsageTrend {
  date: string;
  totalRequests: number;
  uniqueApiKeys: number;
  uniqueUsers: number;
  topApiKeys: Array<{
    id: string;
    name: string;
    requests: number;
    userName: string | null;
  }>;
}

interface UsageTrendsData {
  trends: UsageTrend[];
  summary: {
    totalRequests: number;
    avgRequestsPerPeriod: number;
    peakUsage: number;
    peakDate: string | null;
    periodType: string;
    daysAnalyzed: number;
  };
}

export default function ApiKeyUsageDashboard() {
  const isMobile = useIsMobile();
  const [systemStats, setSystemStats] = useState<SystemWideUsageStats | null>(null);
  const [usageTrends, setUsageTrends] = useState<UsageTrendsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    to: new Date(),
  });
  const [selectedTrendPeriod, setSelectedTrendPeriod] = useState<'7' | '30' | '90'>('30');
  const [activeTab, setActiveTab] = useLocalStorage<string>('api-key-usage-active-tab', 'top-users');
  const { toast } = useToast();



  const fetchSystemStats = useCallback(async (isRefresh = false) => {
    if (!dateRange?.from || !dateRange?.to) {
      return;
    }

    // Only set loading to true for initial load, not for refresh
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
      });

      const response = await fetch(`/api/admin/api-keys/usage/overview?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch system stats (${response.status})`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        setSystemStats(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch system stats');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load system statistics.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      // Only set loading to false for initial load, not for refresh
      if (isRefresh) {
        setIsRefreshing(false);
        // Force re-render by updating refresh key
        setRefreshKey(prev => prev + 1);
      } else {
        setIsLoading(false);
      }
    }
  }, [dateRange, toast]);

  useEffect(() => {
    fetchSystemStats();
  }, [fetchSystemStats]);

  const fetchUsageTrends = async (days: string) => {
    setIsLoadingTrends(true);
    try {
      const response = await fetch(`/api/admin/api-keys/usage/trends?days=${days}&windowType=daily`);
      if (!response.ok) {
        throw new Error(`Failed to fetch usage trends (${response.status})`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        setUsageTrends(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch usage trends');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load usage trends.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoadingTrends(false);
    }
  };

  const handleTrendPeriodChange = (period: '7' | '30' | '90') => {
    setSelectedTrendPeriod(period);
    fetchUsageTrends(period);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

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

  if (!systemStats) {
    return (
      <Card className="flex flex-col flex-grow min-h-0">
        <CardContent className="flex items-center justify-center py-8">
          <p>No API key usage data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col flex-grow min-h-0">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className={`${isMobile ? 'text-lg' : 'text-xl'}`}>API Key Usage Dashboard</CardTitle>
            {!isMobile && <CardDescription className="text-sm">System-wide API key usage statistics and analytics</CardDescription>}
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
                  ...systemStats.topUsers,
                  ...systemStats.topApiKeys,
                  ...systemStats.requestsByEndpoint,
                ]}
                filename="api-usage-analytics"
                title="Export"
                className="analytics-button"
              />
              <ResponsiveActionButton
                icon={isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                label="Refresh"
                onClick={() => fetchSystemStats(true)}
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Total API Keys</CardTitle>
                <Key className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{systemStats.totalApiKeys.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {systemStats.activeApiKeys} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Total Users</CardTitle>
                <Users className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{systemStats.totalUsers.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {systemStats.usersWithApiKeys} {systemStats.usersWithApiKeys === 1 ? 'user' : 'users'} with API keys
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Total Requests</CardTitle>
                <BarChart3 className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold">{systemStats.totalRequests.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  All time
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-xs font-medium">Rate Limit Violations</CardTitle>
                <AlertTriangle className="h-3 w-3 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-xl font-bold text-red-600">{systemStats.rateLimitViolations.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  All time
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Usage by Period */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className={`flex items-center gap-2 ${isMobile ? 'text-sm' : 'text-base'}`}>
                  <Activity className="h-4 w-4" />
                  Usage by Time Period
                </CardTitle>
                <CardDescription className="text-xs">API requests over different time periods</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-lg font-bold text-blue-600">{systemStats.usageByPeriod.last24Hours.toLocaleString()}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Last 24 Hours</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-lg font-bold text-green-600">{systemStats.usageByPeriod.last7Days.toLocaleString()}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Last 7 Days</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-lg font-bold text-purple-600">{systemStats.usageByPeriod.last30Days.toLocaleString()}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Last 30 Days</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {systemStats.usageByPeriod.last30Days === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className={`${isMobile ? 'text-base' : 'text-lg'}`}>Usage Distribution</CardTitle>
                  <CardDescription>Request distribution across time periods</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center" style={{ height: 250 }}>
                    <div className="text-center text-gray-500 dark:text-gray-400">
                      <p className="text-sm">No usage data available yet</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <PieChart
                data={[
                  { name: 'Last 24 Hours', value: systemStats.usageByPeriod.last24Hours },
                  { name: 'Last 7 Days', value: systemStats.usageByPeriod.last7Days - systemStats.usageByPeriod.last24Hours },
                  { name: 'Last 30 Days', value: systemStats.usageByPeriod.last30Days - systemStats.usageByPeriod.last7Days },
                ]}
                title="Usage Distribution"
                description="Request distribution across time periods"
                colors={['#3b82f6', '#10b981', '#8b5cf6']}
                height={250}
              />
            )}
          </div>

          <MobileTabs
            defaultValue="top-users"
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value);
              if (value === 'trends' && !usageTrends) {
                fetchUsageTrends(selectedTrendPeriod);
              }
            }}
            className="space-y-4"
            tabs={[
              { value: "top-users", label: "Top Users" },
              { value: "top-keys", label: "Top API Keys" },
              { value: "endpoints", label: "Top Endpoints" },
              { value: "trends", label: "Usage Trends" }
            ]}
          >

            <TabsContent value="top-users" className="space-y-4">
              {systemStats.topUsers.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8 text-gray-600 dark:text-gray-400">
                    No user data available yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <BarChart
                    data={systemStats.topUsers.slice(0, 10).map(user => ({
                      name: user.userName || user.userEmail || `User ${user.userId}`,
                      requests: Number(user.totalRequests) || 0,
                      apiKeys: Number(user.apiKeyCount) || 0,
                    }))}
                    title="Top Users by Request Volume"
                    description="Users with the highest API request counts"
                    xAxisKey="name"
                    bars={[
                      { key: 'requests', name: 'Total Requests', color: '#3b82f6' },
                    ]}
                    height={400}
                    formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle>Top Users Details</CardTitle>
                      <CardDescription>Detailed breakdown of top API users</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {systemStats.topUsers.slice(0, 10).map((user, index) => (
                          <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-8 h-8 bg-primary/10 text-primary rounded-full text-sm font-medium">
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {user.userName || 'Unknown User'}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  {user.userEmail}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-gray-900 dark:text-white">
                                {user.totalRequests.toLocaleString()} requests
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {user.apiKeyCount} API key{user.apiKeyCount !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="top-keys" className="space-y-4">
              {systemStats.topApiKeys.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8 text-gray-600 dark:text-gray-400">
                    No API key data available yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <BarChart
                    data={systemStats.topApiKeys.slice(0, 10).map(apiKey => ({
                      name: apiKey.name || `API Key ${apiKey.id.slice(0, 8)}...`,
                      requests: Number(apiKey.requests) || 0,
                      user: apiKey.userName || 'Unknown',
                    }))}
                    title="Top API Keys by Request Volume"
                    description="API keys with the highest request counts"
                    xAxisKey="name"
                    bars={[
                      { key: 'requests', name: 'Total Requests', color: '#10b981' },
                    ]}
                    height={400}
                    formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle>Top API Keys Details</CardTitle>
                      <CardDescription>Detailed breakdown of top API keys</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {systemStats.topApiKeys.slice(0, 10).map((apiKey, index) => (
                          <div key={apiKey.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-8 h-8 bg-primary/10 text-primary rounded-full text-sm font-medium">
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {apiKey.name}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  Owner: {apiKey.userName || 'Unknown User'}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-gray-900 dark:text-white">
                                {apiKey.requests.toLocaleString()} requests
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {apiKey.lastUsed ? `Last used ${formatDateTime(apiKey.lastUsed)}` : 'Never used'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="endpoints" className="space-y-4">
              {systemStats.requestsByEndpoint.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8 text-gray-600 dark:text-gray-400">
                    No endpoint data available yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <EndpointsBarChart
                    data={systemStats.requestsByEndpoint.slice(0, 10).map(endpoint => ({
                      name: endpoint.endpoint.length > 30 ? `${endpoint.endpoint.slice(0, 30)}...` : endpoint.endpoint,
                      fullEndpoint: endpoint.endpoint,
                      requests: Number(endpoint.count) || 0,
                      percentage: Number(endpoint.percentage) || 0,
                    }))}
                    title="Top Endpoints by Request Count"
                    description="Most frequently accessed API endpoints"
                    height={400}
                  />

                  <EndpointsPieChart
                    data={systemStats.requestsByEndpoint.slice(0, 8).map(endpoint => ({
                      name: endpoint.endpoint.length > 20 ? `${endpoint.endpoint.slice(0, 20)}...` : endpoint.endpoint,
                      fullEndpoint: endpoint.endpoint,
                      value: endpoint.count,
                    }))}
                    title="Endpoint Usage Distribution"
                    description="Request distribution across top endpoints"
                    height={400}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Usage Trends</CardTitle>
                      <CardDescription>API usage patterns over time</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={selectedTrendPeriod === '7' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleTrendPeriodChange('7')}
                        className="analytics-button"
                      >
                        7 Days
                      </Button>
                      <Button
                        variant={selectedTrendPeriod === '30' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleTrendPeriodChange('30')}
                        className="analytics-button"
                      >
                        30 Days
                      </Button>
                      <Button
                        variant={selectedTrendPeriod === '90' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleTrendPeriodChange('90')}
                        className="analytics-button"
                      >
                        90 Days
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingTrends ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="ml-2">Loading trends...</span>
                    </div>
                  ) : usageTrends ? (
                    <div className="space-y-6">
                      {/* Summary Statistics */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="text-lg font-bold text-blue-600">
                            {usageTrends.summary.totalRequests.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Total Requests</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="text-lg font-bold text-green-600">
                            {usageTrends.summary.avgRequestsPerPeriod.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Avg per Day</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="text-lg font-bold text-orange-600">
                            {usageTrends.summary.peakUsage.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Peak Usage</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="text-lg font-bold text-purple-600">
                            {usageTrends.summary.peakDate ? formatDate(usageTrends.summary.peakDate) : 'N/A'}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Peak Date</div>
                        </div>
                      </div>

                      {/* Simple trend visualization */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Daily Request Volume</h4>
                        <div className="space-y-1">
                          {usageTrends.trends.slice(-14).map((trend) => {
                            const maxRequests = Math.max(...usageTrends.trends.map(t => t.totalRequests));
                            const percentage = maxRequests > 0 ? (trend.totalRequests / maxRequests) * 100 : 0;

                            return (
                              <div key={trend.date} className="flex items-center gap-3">
                                <div className="w-20 text-xs text-gray-600 dark:text-gray-400">
                                  {formatDate(trend.date)}
                                </div>
                                <div className="flex-1">
                                  <Progress value={percentage} className="h-3" />
                                </div>
                                <div className="w-16 text-xs text-right text-gray-900 dark:text-white">
                                  {trend.totalRequests.toLocaleString()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                      Click a time period button to load usage trends.
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
