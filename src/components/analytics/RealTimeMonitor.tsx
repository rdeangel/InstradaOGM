'use client';

import { useIsMobile } from '@/hooks/use-mobile';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  Activity,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  Pause,
  Search,
  X,
} from 'lucide-react';
import { format } from 'date-fns';

import { LineChart } from './charts/LineChart';



interface RealTimeMetrics {
  timestamp: string;
  activeUsers: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

interface RecentActivity {
  id: string;
  timestamp: string;
  type: 'request' | 'error' | 'user_login' | 'user_logout' | 'api_request' | 'navigation' | 'interaction';
  description: string;
  user?: string;
  endpoint?: string;
  statusCode?: number;
  authMethod?: 'session' | 'api_key';
}

export function RealTimeMonitor() {
  const isMobile = useIsMobile();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [metrics, setMetrics] = useState<RealTimeMetrics[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<RealTimeMetrics | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const { toast } = useToast();


  // Track consecutive errors for exponential backoff
  const errorCountRef = useRef(0);
  const lastErrorTimeRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  logger.debug('RealTimeMonitor rendered, isMonitoring:', isMonitoring);

  // Filter recent activity based on search query
  const filteredActivity = recentActivity.filter(activity => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const searchableText = [
      activity.description,
      activity.user,
      activity.endpoint,
      activity.type,
      activity.statusCode?.toString(),
    ].filter(Boolean).join(' ').toLowerCase();

    // Support exact phrase matching with quotes
    if (query.startsWith('"') && query.endsWith('"')) {
      const exactPhrase = query.slice(1, -1);
      return searchableText.includes(exactPhrase);
    }

    // Support whole word matching and partial matching
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    return queryWords.every(word => searchableText.includes(word));
  });

  const fetchRealTimeData = useCallback(async () => {
    try {
      logger.debug('Fetching real-time data...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('/api/admin/analytics/realtime', {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Failed to fetch real-time data (${response.status}): ${errorText}`);
        error.name = 'ApiError';
        throw error;
      }

      const result = await response.json();
      logger.debug('Real-time data received:', result);

      if (result.success && result.data) {
        const newMetrics = result.data.metrics;
        const newActivity = result.data.recentActivity || [];

        logger.debug('Setting metrics:', newMetrics);
        logger.debug('Setting activity:', newActivity);
        setCurrentMetrics(newMetrics);
        setMetrics(prev => [...prev.slice(-29), newMetrics]); // Keep last 30 data points
        setRecentActivity(newActivity.slice(0, 10)); // Keep last 10 activities

        // Reset error tracking on successful fetch
        errorCountRef.current = 0;
        setConnectionStatus('connected');
      } else {
        const error = new Error('Invalid response format from server');
        error.name = 'DataFormatError';
        logger.error('Invalid response format:', {
          success: result.success,
          hasData: !!result.data,
          result
        });
        throw error;
      }
    } catch (error) {
      // Handle different error types appropriately
      const now = Date.now();
      const timeSinceLastError = now - lastErrorTimeRef.current;

      // Only increment error count if it's been more than 5 seconds since last error
      if (timeSinceLastError > 5000) {
        errorCountRef.current = 0;
      }
      errorCountRef.current++;
      lastErrorTimeRef.current = now;

      // Log error with appropriate level based on error count
      if (errorCountRef.current <= 3) {
        logger.warn('Real-time data fetch failed:', {
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'Unknown',
          errorCount: errorCountRef.current,
          isMonitoring
        });
      } else {
        logger.error('Repeated real-time data fetch failures:', {
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'Unknown',
          errorCount: errorCountRef.current,
          isMonitoring
        });
      }

      setConnectionStatus('error');

      // Show toast only for critical errors or after multiple consecutive failures
      if (errorCountRef.current === 1 || errorCountRef.current % 5 === 0) {
        const isAborted = error instanceof Error && error.name === 'AbortError';
        const isNetworkError = error instanceof Error && (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('Failed to fetch')
        );

        if (!isAborted && (isNetworkError || errorCountRef.current >= 5)) {
          toast({
            title: errorCountRef.current === 1 ? "Connection Issue" : "Persistent Connection Problems",
            description: isNetworkError
              ? "Unable to connect to the analytics server. Check your network connection."
              : `Real-time monitoring has encountered ${errorCountRef.current} consecutive errors. Monitoring will continue attempting to reconnect.`,
            variant: "destructive",
          });
        }
      }

      // Implement exponential backoff for retry logic
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Don't implement backoff here - let the interval handle retries
      // This prevents multiple overlapping retry mechanisms
    }
  }, [toast, isMonitoring]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isMonitoring) {
      // Fetch immediately
      fetchRealTimeData();

      // Then fetch every 5 seconds
      interval = setInterval(fetchRealTimeData, 5000);
    } else {
      setConnectionStatus('disconnected');
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [isMonitoring, fetchRealTimeData, toast]);

  const toggleMonitoring = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    logger.debug('🔄 Toggle monitoring clicked - Real-time Monitor, current state:', isMonitoring);
    const newState = !isMonitoring;
    logger.debug('Setting monitoring to:', newState);

    setIsMonitoring(newState);

    // Use setTimeout to avoid calling toast during render
    setTimeout(() => {
      if (newState) {
        toast({
          title: "Real-time Monitoring Started",
          description: "Now monitoring API activity in real-time.",
        });
      } else {
        toast({
          title: "Real-time Monitoring Stopped",
          description: "Real-time monitoring has been paused.",
        });
      }
    }, 0);
  }, [isMonitoring, toast]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'request':
        return <Zap className="h-4 w-4 text-blue-500" />;
      case 'api_request':
        return <Zap className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'user_login':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'user_logout':
        return <Users className="h-4 w-4 text-gray-500" />;
      case 'navigation':
        return <Activity className="h-4 w-4 text-purple-500" />;
      case 'interaction':
        return <Activity className="h-4 w-4 text-orange-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActivityBadgeVariant = (type: string) => {
    switch (type) {
      case 'request':
        return 'default';
      case 'api_request':
        return 'default';
      case 'error':
        return 'destructive';
      case 'user_login':
        return 'default';
      case 'user_logout':
        return 'secondary';
      case 'navigation':
        return 'outline';
      case 'interaction':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const formatResponseTime = (time: number) => `${time.toFixed(2)}ms`;
  const formatPercentage = (rate: number) => `${(rate * 100).toFixed(2)}%`;

  return (
    <Card className="flex flex-col flex-grow min-h-0">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className={isMobile ? 'text-lg' : 'text-xl'}>Real-time Monitoring</CardTitle>
              {isMonitoring && (
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' :
                    connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
                    }`} />
                  <span className="text-xs text-muted-foreground">
                    {connectionStatus === 'connected' ? 'Connected' :
                      connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}
                  </span>
                </div>
              )}
            </div>
            <CardDescription>Live API activity and performance metrics</CardDescription>
          </div>
          <ResponsiveActionButton
            onClick={toggleMonitoring}
            variant={isMonitoring ? "destructive" : "default"}
            icon={isMonitoring ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            label={isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
            className="cursor-pointer analytics-button"
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-grow min-h-0 p-4">
        {!isMonitoring && metrics.length === 0 ? (
          <div className="flex items-center justify-center flex-grow">
            <div className="text-center">
              <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Real-time Monitoring</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Start monitoring to see live API activity and performance metrics.
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-grow min-h-0 pr-4" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <div className="space-y-6">
              {/* Current Metrics */}
              {currentMetrics && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <div className="text-2xl font-bold">{currentMetrics.activeUsers}</div>
                        {metrics.length > 1 && getTrendIcon(currentMetrics.activeUsers, metrics[metrics.length - 2]?.activeUsers || 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Currently active
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Requests/sec</CardTitle>
                      <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <div className="text-2xl font-bold">{currentMetrics.requestsPerSecond.toFixed(1)}</div>
                        {metrics.length > 1 && getTrendIcon(currentMetrics.requestsPerSecond, metrics[metrics.length - 2]?.requestsPerSecond || 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Current throughput
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Response Time</CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <div className="text-2xl font-bold">{formatResponseTime(currentMetrics.averageResponseTime)}</div>
                        {metrics.length > 1 && getTrendIcon(
                          metrics[metrics.length - 2]?.averageResponseTime || 0,
                          currentMetrics.averageResponseTime
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Average response
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <div className="text-2xl font-bold text-red-600">{formatPercentage(currentMetrics.errorRate)}</div>
                        {metrics.length > 1 && getTrendIcon(
                          metrics[metrics.length - 2]?.errorRate || 0,
                          currentMetrics.errorRate
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Current error rate
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Real-time Charts */}
              {metrics.length > 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <LineChart
                    data={metrics}
                    title="Request Throughput"
                    description="Requests per second over time"
                    xAxisKey="timestamp"
                    lines={[
                      { key: 'requestsPerSecond', name: 'Requests/sec', color: '#3b82f6' },
                    ]}
                    height={280}
                    formatXAxis={(value) => format(new Date(value), 'HH:mm:ss')}
                    formatTooltip={(value, name) => [Number(value).toFixed(1), name]}
                  />

                  <LineChart
                    data={metrics}
                    title="Response Time"
                    description="Average response time over time"
                    xAxisKey="timestamp"
                    lines={[
                      { key: 'averageResponseTime', name: 'Response Time', color: '#10b981' },
                    ]}
                    height={280}
                    formatXAxis={(value) => format(new Date(value), 'HH:mm:ss')}
                    formatTooltip={(value, name) => [formatResponseTime(Number(value)), name]}
                  />
                </div>
              )}

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className={isMobile ? 'text-base' : 'text-lg'}>Recent Activity</CardTitle>
                      <CardDescription>Latest API requests and system events (updates every 5 seconds)</CardDescription>
                    </div>
                    <div className="relative flex items-center max-w-sm">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder='Search activity... (e.g., user, endpoint, "exact phrase")'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-8 text-sm"
                      />
                      {searchQuery && (
                        <button
                          className="absolute right-2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                          onClick={() => setSearchQuery('')}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredActivity.length > 0 ? (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {filteredActivity.map((activity) => (
                        <div key={activity.id} className="flex items-center space-x-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                          {getActivityIcon(activity.type)}
                          <div className="flex-grow">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium">{activity.description}</span>
                              <Badge variant={getActivityBadgeVariant(activity.type)} className="text-xs">
                                {activity.type.replace('_', ' ')}
                              </Badge>
                              {activity.authMethod && (
                                <Badge variant="outline" className="text-xs">
                                  {activity.authMethod === 'api_key' ? 'API Key' : 'Session'}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {format(new Date(activity.timestamp), 'HH:mm:ss')}
                              {activity.user && ` • ${activity.user}`}
                              {activity.endpoint && ` • ${activity.endpoint}`}
                              {activity.statusCode && ` • ${activity.statusCode}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="text-sm">
                        {searchQuery ? 'No Matching Activity' : 'No recent activity'}
                      </div>
                      <div className="text-xs mt-1">
                        {searchQuery
                          ? `No activity found matching "${searchQuery}". Try a different search term.`
                          : 'Activity will appear here when API requests are made'
                        }
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
