'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MobileTabs, TabsContent } from '@/components/ui/mobile-tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Clock,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Zap,
  Target,
} from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { LineChart } from './charts/LineChart';
import { AreaChart } from './charts/AreaChart';
import { DateRangePicker } from './DateRangePicker';
import { ExportButton } from './ExportButton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';
import { CardSkeleton } from '@/components/ui/card-skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface PerformanceMetrics {
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  throughput: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

interface EndpointPerformance {
  endpoint: string;
  method: string;
  averageResponseTime: number;
  requestCount: number;
  errorRate: number;
  p95ResponseTime: number;
}

interface TimeSeriesData {
  timestamp: string;
  responseTime: number;
  throughput: number;
  errorRate: number;
  requests: number;
}

interface PerformanceAnalyticsData {
  metrics: PerformanceMetrics;
  endpointPerformance: EndpointPerformance[];
  timeSeries: TimeSeriesData[];
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
}



export function PerformanceAnalyticsDashboard() {
  const isMobile = useIsMobile();

  const [data, setData] = useState<PerformanceAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useLocalStorage<string>('performance-analytics-active-tab', 'trends');
  const { toast } = useToast();

  // Get endpoint options for searchable dropdown
  const getEndpointOptions = () => {
    if (!data?.endpointPerformance) return [];

    return data.endpointPerformance.map((endpoint) => ({
      value: `${endpoint.method}:${endpoint.endpoint}`, // Use method:endpoint as unique key
      label: `${endpoint.method} ${endpoint.endpoint}`,
      searchableText: `${endpoint.endpoint} ${endpoint.method}`,
      isDisabled: false,
    }));
  };

  // Get selected endpoint data
  const getSelectedEndpointData = (selectedEndpoint: string) => {
    if (!data?.endpointPerformance || !selectedEndpoint) return null;

    // selectedEndpoint format is "METHOD:endpoint"
    const [method, ...endpointParts] = selectedEndpoint.split(':');
    const endpoint = endpointParts.join(':');

    return data.endpointPerformance.find(ep =>
      ep.method === method && ep.endpoint === endpoint
    );
  };

  // Get individual metric comparisons for selected endpoint
  const getEndpointMetrics = (selectedEndpoint: string) => {
    const endpointData = getSelectedEndpointData(selectedEndpoint);
    if (!endpointData || !data?.metrics) return null;

    const avgRequestsPerEndpoint = Math.round(data.metrics.totalRequests / data.endpointPerformance.length);

    return {
      avgResponseTime: {
        endpoint: endpointData.averageResponseTime,
        overall: data.metrics.averageResponseTime,
        unit: 'ms',
        label: 'Average Response Time'
      },
      p95ResponseTime: {
        endpoint: endpointData.p95ResponseTime,
        overall: data.metrics.p95ResponseTime,
        unit: 'ms',
        label: 'P95 Response Time'
      },
      errorRate: {
        endpoint: endpointData.errorRate,
        overall: data.metrics.errorRate,
        unit: '%',
        label: 'Error Rate'
      },
      requestCount: {
        endpoint: endpointData.requestCount,
        overall: avgRequestsPerEndpoint,
        unit: 'requests',
        label: 'Request Count'
      }
    };
  };

  // Format response time for display
  const formatResponseTimeDisplay = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Format percentage for display
  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  // Get display name for selected endpoint
  const getEndpointDisplayName = (selectedEndpoint: string) => {
    if (!selectedEndpoint) return 'No endpoint selected';
    // selectedEndpoint format is "METHOD:endpoint"
    const [method, ...endpointParts] = selectedEndpoint.split(':');
    const endpoint = endpointParts.join(':');
    return `${method} ${endpoint}`;
  };

  // Helper to format metric values with proper units
  const formatMetricValue = (value: number, unit: string) => {
    if (unit === 'ms') {
      return formatResponseTimeDisplay(value);
    } else if (unit === '%') {
      return formatPercentage(value);
    } else {
      return value.toLocaleString();
    }
  };

  // Set initial selected endpoint when data loads
  React.useEffect(() => {
    if (data?.endpointPerformance && data.endpointPerformance.length > 0 && !selectedEndpoint) {
      const firstEndpoint = data.endpointPerformance[0];
      setSelectedEndpoint(`${firstEndpoint.method}:${firstEndpoint.endpoint}`);
    }
  }, [data?.endpointPerformance, selectedEndpoint]);

  const fetchPerformanceData = useCallback(async (isRefresh = false) => {
    if (!dateRange?.from || !dateRange?.to) {
      return;
    }

    // Only set loading to true for initial load, not for refresh
    if (!isRefresh) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        includeDetails: 'true',
      });

      const response = await fetch(`/api/admin/api-keys/analytics/performance?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch performance data (${response.status})`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch performance data');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load performance data.';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
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
    fetchPerformanceData();
  }, [fetchPerformanceData]);

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

  if (error || !data) {
    return (
      <Card className="flex flex-col flex-grow min-h-0">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className={isMobile ? 'text-lg' : 'text-xl'}>Performance Analytics</CardTitle>
          <CardDescription>API performance metrics and insights</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col flex-grow min-h-0 p-4">
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-3" />
            <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">Failed to Load Performance Data</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{error}</p>
            <Button onClick={() => fetchPerformanceData()} size="sm">Try Again</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col flex-grow min-h-0">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className={isMobile ? 'text-lg' : 'text-xl'}>Performance Analytics</CardTitle>
            {!isMobile && <CardDescription>Detailed API performance metrics and endpoint analysis</CardDescription>}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 relative z-10">
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              className="w-full sm:w-auto text-sm"
            />
            <div className="flex items-center gap-2">
              <ExportButton
                data={data?.timeSeries || []}
                filename="performance-analytics"
                title="Export"
                className="analytics-button"
              />
              <ResponsiveActionButton
                icon={isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                label="Refresh"
                onClick={() => fetchPerformanceData(true)}
                className="cursor-pointer analytics-button"
                disabled={isLoading || isRefreshing}
                key={refreshKey}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-grow min-h-0 p-4">
        <ScrollArea className="flex-grow pr-4">
          <div className="space-y-6">

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatResponseTimeDisplay(data.metrics.averageResponseTime)}</div>
                  <p className="text-xs text-muted-foreground">
                    P95: {formatResponseTimeDisplay(data.metrics.p95ResponseTime)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Throughput</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatMetricValue(data.metrics.throughput, 'req/s')}</div>
                  <p className="text-xs text-muted-foreground">
                    {data.metrics.totalRequests.toLocaleString()} total requests
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{formatPercentage(data.metrics.errorRate)}</div>
                  <p className="text-xs text-muted-foreground">
                    {data.metrics.failedRequests.toLocaleString()} failed requests
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatPercentage(1 - data.metrics.errorRate)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {data.metrics.successfulRequests.toLocaleString()} successful requests
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <MobileTabs
              defaultValue="trends"
              value={activeTab}
              onValueChange={setActiveTab}
              className="space-y-4"
              tabs={[
                { value: "trends", label: "Performance Trends" },
                { value: "endpoints", label: "Endpoint Performance" }
              ]}
            >

              <TabsContent value="trends" className="space-y-4">
                {data.timeSeries && data.timeSeries.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <LineChart
                        data={data.timeSeries}
                        title="Response Time Trends"
                        description="Average response time over time"
                        xAxisKey="timestamp"
                        lines={[
                          { key: 'responseTime', name: 'Response Time', color: '#8884d8' },
                        ]}
                        height={300}
                        formatXAxis={(value) => format(new Date(value), 'MMM dd')}
                        formatTooltip={(value, name) => [formatResponseTimeDisplay(Number(value)), name]}
                      />

                      <AreaChart
                        data={data.timeSeries}
                        title="Request Volume"
                        description="API request volume over time"
                        xAxisKey="timestamp"
                        areas={[
                          { key: 'requests', name: 'Requests', color: '#82ca9d' },
                        ]}
                        height={300}
                        formatXAxis={(value) => format(new Date(value), 'MMM dd')}
                        formatTooltip={(value, name) => [Number(value).toLocaleString(), name]}
                      />
                    </div>

                    <LineChart
                      data={data.timeSeries}
                      title="Error Rate Trends"
                      description="Error rate percentage over time"
                      xAxisKey="timestamp"
                      lines={[
                        { key: 'errorRate', name: 'Error Rate', color: '#ff7300' },
                      ]}
                      height={300}
                      formatXAxis={(value) => format(new Date(value), 'MMM dd')}
                      formatTooltip={(value, name) => [formatPercentage(Number(value)), name]}
                    />
                  </>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                      <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">No Performance Data</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        No API usage data found for the selected time period. Try selecting a different date range or check if there have been any API requests.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="endpoints" className="space-y-4">
                {data.endpointPerformance && data.endpointPerformance.length > 0 ? (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">Endpoint Performance Analysis</h3>
                          <p className="text-sm text-muted-foreground">Compare selected endpoint metrics against overall averages</p>
                        </div>
                        <SearchableSelect
                          options={getEndpointOptions()}
                          value={selectedEndpoint}
                          onValueChange={(value) => setSelectedEndpoint(value || '')}
                          placeholder="Select endpoint..."
                          className="w-[300px]"
                        />
                      </div>
                      {selectedEndpoint && (() => {
                        const metrics = getEndpointMetrics(selectedEndpoint);
                        if (!metrics) return null;

                        return (
                          <div className="space-y-4">
                            <div className="text-center">
                              <h4 className="text-lg font-medium">{getEndpointDisplayName(selectedEndpoint)}</h4>
                              <p className="text-sm text-muted-foreground">Performance comparison vs overall averages</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              {Object.entries(metrics).map(([key, metric]) => {
                                const isEndpointBetter = key === 'errorRate'
                                  ? metric.endpoint < metric.overall
                                  : metric.endpoint > metric.overall;
                                const difference = key === 'errorRate'
                                  ? ((metric.overall - metric.endpoint) / metric.overall * 100)
                                  : ((metric.endpoint - metric.overall) / metric.overall * 100);

                                return (
                                  <Card key={key} className="relative">
                                    <CardHeader className="pb-2">
                                      <CardTitle className="text-sm font-medium text-muted-foreground">
                                        {metric.label}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs text-muted-foreground">This Endpoint</span>
                                          <span className="text-lg font-bold">
                                            {formatMetricValue(metric.endpoint, metric.unit)}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs text-muted-foreground">Overall Avg</span>
                                          <span className="text-sm text-muted-foreground">
                                            {formatMetricValue(metric.overall, metric.unit)}
                                          </span>
                                        </div>
                                        {Math.abs(difference) > 1 && (
                                          <div className={`text-xs text-center px-2 py-1 rounded ${isEndpointBetter
                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                            : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                            }`}>
                                            {isEndpointBetter ? '↓' : '↑'} {Math.abs(difference).toFixed(1)}%
                                          </div>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className={isMobile ? 'text-base' : 'text-lg'}>Endpoint Performance Details</CardTitle>
                        <CardDescription>Click on any endpoint to view detailed metrics</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {data.endpointPerformance.slice(0, 20).map((endpoint, index) => (
                            <div
                              key={`${endpoint.method}-${endpoint.endpoint}-${index}`}
                              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors relative z-10 pointer-events-auto"
                              onClick={() => {
                                toast({
                                  title: 'Endpoint Details',
                                  description: `${endpoint.method} ${endpoint.endpoint} - ${endpoint.requestCount} requests, ${formatResponseTimeDisplay(endpoint.averageResponseTime)} avg response time`,
                                });
                              }}
                            >
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                    {endpoint.method}
                                  </span>
                                  <span className="font-medium">{endpoint.endpoint}</span>
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  {endpoint.requestCount} requests • {formatPercentage(endpoint.errorRate)}% error rate
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium">{formatResponseTimeDisplay(endpoint.averageResponseTime)}</div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  P95: {formatResponseTimeDisplay(endpoint.p95ResponseTime)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                      <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">No Endpoint Data</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        No endpoint performance data found for the selected time period. Try selecting a different date range or check if there have been any API requests.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </MobileTabs>


          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
