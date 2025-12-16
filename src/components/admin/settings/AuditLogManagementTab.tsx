'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { logger } from '@/lib/logger';

import { AlertTriangle, Database, Trash2, Eye, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClientOnly } from '@/components/util/ClientOnly';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';

interface AuditManagementStats {
  auditLogs: {
    totalCount: number;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
    timePeriodCounts: {
      lastDay: number;
      lastWeek: number;
      lastMonth: number;
      lastYear: number;
    };
  };
  analytics: {
    apiKeyUsageEvents: {
      totalCount: number;
      oldestTimestamp: string | null;
      newestTimestamp: string | null;
      timePeriodCounts: {
        lastDay: number;
        lastWeek: number;
        lastMonth: number;
        lastYear: number;
      };
    };
    apiKeyUsageStats: {
      totalCount: number;
      oldestDate: string | null;
      newestDate: string | null;
      timePeriodCounts: {
        lastDay: number;
        lastWeek: number;
        lastMonth: number;
        lastYear: number;
      };
    };
    sessionUsageEvents: {
      totalCount: number;
      oldestTimestamp: string | null;
      newestTimestamp: string | null;
      timePeriodCounts: {
        lastDay: number;
        lastWeek: number;
        lastMonth: number;
        lastYear: number;
      };
    };
    sessionUsageStats: {
      totalCount: number;
      oldestDate: string | null;
      newestDate: string | null;
      timePeriodCounts: {
        lastDay: number;
        lastWeek: number;
        lastMonth: number;
        lastYear: number;
      };
    };
  };
}

interface TrimPreview {
  cutoffDate: string;
  retentionPeriod: number;
  retentionUnit: string;
  auditLogs?: {
    logsToDeleteCount: number;
    logsToKeepCount: number;
    totalCount: number;
    oldestLogToDelete: string | null;
    newestLogToDelete: string | null;
  };
  analytics?: {
    apiKeyUsageEvents: {
      eventsToDeleteCount: number;
      eventsToKeepCount: number;
      totalCount: number;
      oldestEventToDelete: string | null;
      newestEventToDelete: string | null;
    };
    apiKeyUsageStats: {
      statsToDeleteCount: number;
      statsToKeepCount: number;
      totalCount: number;
      oldestStatToDelete: string | null;
      newestStatToDelete: string | null;
    };
    sessionUsageEvents: {
      eventsToDeleteCount: number;
      eventsToKeepCount: number;
      totalCount: number;
      oldestEventToDelete: string | null;
      newestEventToDelete: string | null;
    };
    sessionUsageStats: {
      statsToDeleteCount: number;
      statsToKeepCount: number;
      totalCount: number;
      oldestStatToDelete: string | null;
      newestStatToDelete: string | null;
    };
  };
}

import { useIsMobile } from '@/hooks/use-mobile';

export function AuditManagementTab() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [stats, setStats] = useState<AuditManagementStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [retentionPeriod, setRetentionPeriod] = useState<number>(30);
  const [retentionUnit, setRetentionUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('days');
  const [trimPreview, setTrimPreview] = useState<TrimPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [isTrimming, setIsTrimming] = useState(false);
  const [operationType, setOperationType] = useState<'logs' | 'analytics' | 'both'>('logs');
  const [advancedAnalyticsEnabled, setAdvancedAnalyticsEnabled] = useState<boolean>(false);

  const fetchStats = useCallback(async (isRefresh = false) => {
    try {
      // Only set loading to true for initial load, not for refresh
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoadingStats(true);
      }
      const response = await fetch('/api/admin/audit-logs/stats');
      if (!response.ok) {
        throw new Error('Failed to fetch audit management statistics');
      }
      const data = await response.json();
      setStats(data);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to fetch audit management statistics',
        variant: 'destructive',
      });
    } finally {
      // Only set loading to false for initial load, not for refresh
      if (isRefresh) {
        setIsRefreshing(false);
        // Force re-render by updating refresh key
        setRefreshKey(prev => prev + 1);
      } else {
        setIsLoadingStats(false);
      }
    }
  }, [toast]);

  const fetchPreview = useCallback(async (opType: 'logs' | 'analytics' | 'both' = operationType) => {
    if (retentionPeriod === undefined || retentionPeriod === null || retentionPeriod < 0) {
      setTrimPreview(null);
      return;
    }

    const dataTypes = opType === 'both' ? ['logs', 'analytics'] : [opType];

    try {
      setIsLoadingPreview(true);
      const response = await fetch('/api/admin/audit-logs/preview-trim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retentionPeriod,
          retentionUnit,
          dataTypes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to preview trim');
      }

      const data = await response.json();
      setTrimPreview(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
      setTrimPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [retentionPeriod, retentionUnit, operationType, toast]);



  const handleTrim = async () => {
    if (confirmationText !== 'CONFIRM') {
      toast({
        title: 'Error',
        description: 'Please type "CONFIRM" to proceed',
        variant: 'destructive',
      });
      return;
    }

    const dataTypes = operationType === 'both' ? ['logs', 'analytics'] : [operationType];

    try {
      setIsTrimming(true);
      const response = await fetch('/api/admin/audit-logs/trim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retentionPeriod,
          retentionUnit,
          confirmation: confirmationText,
          dataTypes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to trim data');
      }

      const data = await response.json();

      // Build success message based on what was deleted
      let successMessage = 'Successfully completed trim operation:';
      if (data.auditLogs) {
        successMessage += ` ${data.auditLogs.deletedCount} audit logs deleted (${data.auditLogs.remainingCount} remain).`;
      }
      if (data.analytics) {
        const totalAnalyticsDeleted =
          data.analytics.apiKeyUsageEvents.deletedCount +
          data.analytics.apiKeyUsageStats.deletedCount +
          data.analytics.sessionUsageEvents.deletedCount +
          data.analytics.sessionUsageStats.deletedCount;
        successMessage += ` ${totalAnalyticsDeleted} analytics records deleted.`;
      }

      toast({
        title: 'Success',
        description: successMessage,
      });

      // Reset state and refresh data
      setIsConfirmDialogOpen(false);
      setConfirmationText('');
      setTrimPreview(null);
      await fetchStats();
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsTrimming(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Check if advanced analytics is enabled
  useEffect(() => {
    const checkAnalyticsEnabled = async () => {
      try {
        const response = await fetch('/api/settings/analytics-enabled');
        if (response.ok) {
          const data = await response.json();
          setAdvancedAnalyticsEnabled(data.enableAdvancedAnalytics || false);
        } else {
          setAdvancedAnalyticsEnabled(false);
        }
      } catch (error) {
        logger.error('Failed to check analytics setting:', error);
        setAdvancedAnalyticsEnabled(false);
      } finally {
        // Analytics setting loaded
      }
    };

    checkAnalyticsEnabled();

    // Listen for advanced analytics setting changes
    const handleAdvancedAnalyticsChange = () => {
      checkAnalyticsEnabled();
    };

    window.addEventListener('advancedAnalyticsSettingsChanged', handleAdvancedAnalyticsChange);

    return () => {
      window.removeEventListener('advancedAnalyticsSettingsChanged', handleAdvancedAnalyticsChange);
    };
  }, []);

  // Always set operation type to 'logs' - we're removing the UI for operation type selection
  useEffect(() => {
    setOperationType('logs');
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchPreview(operationType);
    }, 500); // Debounce preview requests

    return () => clearTimeout(timeoutId);
  }, [fetchPreview, operationType]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center text-2xl">
          <ClientOnly><Database size={28} className="mr-2 text-primary" /></ClientOnly>
          Audit Management
        </CardTitle>
        {!isMobile && (
          <CardDescription>
            Manage audit logs and analytics data retention. Analytics data includes API key usage statistics and session tracking data. Only SUPER_ADMIN users can perform these operations.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full w-full">
          <div className="space-y-6 pr-4">
            {/* Statistics Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-xl">
                  Current Data Statistics
                  <ResponsiveActionButton
                    icon={isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className={`h-4 w-4 ${isLoadingStats ? 'animate-spin' : ''}`} />}
                    label="Refresh"
                    onClick={() => fetchStats(true)}
                    disabled={isRefreshing || isLoadingStats}
                    key={refreshKey} // Force re-render when refresh key changes
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {[...Array(8)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  </div>
                ) : stats ? (
                  <div className="space-y-6">
                    {/* Audit Logs Statistics */}
                    <div>
                      <h4 className="text-lg font-semibold mb-3 text-primary">Audit Logs</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">{stats.auditLogs.totalCount.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Total Logs</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">{stats.auditLogs.timePeriodCounts.lastDay.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Last 24 Hours</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{stats.auditLogs.timePeriodCounts.lastWeek.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Last Week</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">{stats.auditLogs.timePeriodCounts.lastMonth.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Last Month</div>
                        </div>
                      </div>
                      {stats.auditLogs.oldestTimestamp && stats.auditLogs.newestTimestamp && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t mt-4">
                          <div>
                            <Label className="text-sm font-medium">Oldest Log</Label>
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(stats.auditLogs.oldestTimestamp), 'yyyy-MM-dd HH:mm:ss')}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Newest Log</Label>
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(stats.auditLogs.newestTimestamp), 'yyyy-MM-dd HH:mm:ss')}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Analytics Statistics - Always show with status message */}
                    <div>
                      <h4 className="text-lg font-semibold mb-3 text-orange-600">Analytics Data</h4>

                      {/* Status message about what analytics data is available */}
                      <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded mb-4 w-fit">
                        {advancedAnalyticsEnabled ? (
                          <span className="text-green-600 dark:text-green-400">
                            ✓ Advanced Analytics enabled - Full session tracking and API key usage data available
                          </span>
                        ) : (
                          <span className="text-orange-600 dark:text-orange-400">
                            ⚠️ Advanced Analytics disabled - Only API key usage data is collected (session tracking is off)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* API Key Usage */}
                        <div>
                          <h5 className="text-md font-medium mb-2">API Key Usage</h5>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-center">
                              <div className="text-lg font-bold text-blue-600">{stats.analytics.apiKeyUsageEvents.totalCount.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">Events</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-green-600">{stats.analytics.apiKeyUsageStats.totalCount.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">Daily Stats</div>
                            </div>
                          </div>
                        </div>

                        {/* Session Usage */}
                        <div>
                          <h5 className="text-md font-medium mb-2">Session Usage</h5>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-center">
                              <div className="text-lg font-bold text-blue-600">{stats.analytics.sessionUsageEvents.totalCount.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">Events</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-green-600">{stats.analytics.sessionUsageStats.totalCount.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">Daily Stats</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">Failed to load statistics</div>
                )}
              </CardContent>
            </Card>

            {/* Trimming Configuration Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  <ClientOnly><Trash2 className="mr-2 h-5 w-5 text-destructive" /></ClientOnly>
                  Data Trimming
                </CardTitle>
                <CardDescription>
                  Configure retention period and trim old audit logs and/or analytics data. This action cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="retention-period">Retention Period</Label>
                    <Input
                      id="retention-period"
                      type="number"
                      min="0"
                      value={retentionPeriod}
                      onChange={(e) => setRetentionPeriod(parseInt(e.target.value) || 0)}
                      placeholder="Enter number (0 = delete all)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="retention-unit">Time Unit</Label>
                    <Select value={retentionUnit} onValueChange={(value: 'days' | 'weeks' | 'months' | 'years') => setRetentionUnit(value)}>
                      <SelectTrigger id="retention-unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                        <SelectItem value="years">Years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Operation Type Selection - Always show with appropriate messaging */}
                  <div className="space-y-2">
                    <Label htmlFor="operation-type">Operation Type</Label>
                    <Select value={operationType} onValueChange={(value: 'logs' | 'analytics' | 'both') => setOperationType(value)}>
                      <SelectTrigger id="operation-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="logs">Logs Only</SelectItem>
                        <SelectItem value="analytics">Analytics Only</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Status message based on Advanced Analytics setting */}
                    <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded w-fit">
                      {advancedAnalyticsEnabled ? (
                        <span className="text-green-600 dark:text-green-400">
                          ✓ Advanced Analytics enabled - Full session tracking and API key usage data available
                        </span>
                      ) : (
                        <span className="text-orange-600 dark:text-orange-400">
                          ⚠️ Advanced Analytics disabled - Only API key usage data is collected (session tracking is off)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview Section */}
                {isLoadingPreview ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : trimPreview ? (
                  <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center text-lg text-orange-800 dark:text-orange-200">
                        <ClientOnly><Eye className="mr-2 h-4 w-4" /></ClientOnly>
                        Trim Preview - {operationType === 'both' ? 'Logs & Analytics' : operationType === 'analytics' ? 'Analytics Only' : 'Logs Only'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Audit Logs Preview */}
                      {trimPreview.auditLogs && (
                        <div>
                          <h5 className="font-medium text-primary mb-2">Audit Logs</h5>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="text-center">
                              <div className="text-xl font-bold text-destructive">{trimPreview.auditLogs.logsToDeleteCount.toLocaleString()}</div>
                              <div className="text-sm text-muted-foreground">Logs to Delete</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl font-bold text-green-600">{trimPreview.auditLogs.logsToKeepCount.toLocaleString()}</div>
                              <div className="text-sm text-muted-foreground">Logs to Keep</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl font-bold text-blue-600">{trimPreview.auditLogs.totalCount.toLocaleString()}</div>
                              <div className="text-sm text-muted-foreground">Total Logs</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Analytics Preview */}
                      {trimPreview.analytics && (
                        <div>
                          <h5 className="font-medium text-orange-600 mb-2">Analytics Data</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h6 className="text-sm font-medium mb-2">API Key Usage</h6>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="text-center">
                                  <div className="text-lg font-bold text-destructive">{trimPreview.analytics.apiKeyUsageEvents.eventsToDeleteCount.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Events to Delete</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-lg font-bold text-destructive">{trimPreview.analytics.apiKeyUsageStats.statsToDeleteCount.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Stats to Delete</div>
                                </div>
                              </div>
                            </div>
                            <div>
                              <h6 className="text-sm font-medium mb-2">Session Usage</h6>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="text-center">
                                  <div className="text-lg font-bold text-destructive">{trimPreview.analytics.sessionUsageEvents.eventsToDeleteCount.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Events to Delete</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-lg font-bold text-destructive">{trimPreview.analytics.sessionUsageStats.statsToDeleteCount.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Stats to Delete</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="pt-3 border-t border-orange-200 dark:border-orange-800">
                        {retentionPeriod === 0 ? (
                          <div className="text-sm">
                            <strong>Retention Period:</strong> 0 days (Delete ALL data)
                            <div className="text-sm text-muted-foreground mt-1">
                              This will permanently delete ALL data regardless of age.
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm">
                              <strong>Cutoff Date:</strong> {format(new Date(trimPreview.cutoffDate), 'yyyy-MM-dd HH:mm:ss')}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              All data older than this date will be permanently deleted.
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchPreview(operationType)}
                    disabled={isLoadingPreview || retentionPeriod === undefined || retentionPeriod === null || retentionPeriod < 0}
                  >
                    <ClientOnly><Eye className="mr-2 h-4 w-4" /></ClientOnly>
                    Preview {operationType === 'both' ? 'Both' : operationType === 'analytics' ? 'Analytics' : 'Logs'}
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={async () => {
                      await fetchPreview(operationType);
                      setIsConfirmDialogOpen(true);
                    }}
                    disabled={isLoadingPreview || retentionPeriod === undefined || retentionPeriod === null || retentionPeriod < 0}
                  >
                    <ClientOnly><Trash2 className="mr-2 h-4 w-4" /></ClientOnly>
                    Clear {operationType === 'both' ? 'Both' : operationType === 'analytics' ? 'Analytics' : 'Logs'}
                  </Button>
                </div>

                {trimPreview && (
                  // Check if there's no data to delete based on what was requested
                  ((operationType === 'logs' && (!trimPreview.auditLogs || trimPreview.auditLogs.logsToDeleteCount === 0)) ||
                    (operationType === 'analytics' && (!trimPreview.analytics || (
                      trimPreview.analytics.apiKeyUsageEvents.eventsToDeleteCount === 0 &&
                      trimPreview.analytics.apiKeyUsageStats.statsToDeleteCount === 0 &&
                      trimPreview.analytics.sessionUsageEvents.eventsToDeleteCount === 0 &&
                      trimPreview.analytics.sessionUsageStats.statsToDeleteCount === 0
                    ))) ||
                    (operationType === 'both' && (
                      (!trimPreview.auditLogs || trimPreview.auditLogs.logsToDeleteCount === 0) &&
                      (!trimPreview.analytics || (
                        trimPreview.analytics.apiKeyUsageEvents.eventsToDeleteCount === 0 &&
                        trimPreview.analytics.apiKeyUsageStats.statsToDeleteCount === 0 &&
                        trimPreview.analytics.sessionUsageEvents.eventsToDeleteCount === 0 &&
                        trimPreview.analytics.sessionUsageStats.statsToDeleteCount === 0
                      ))
                    ))) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ClientOnly><AlertTriangle className="h-4 w-4" /></ClientOnly>
                      No {operationType === 'both' ? 'data' : operationType} found older than the specified retention period.
                    </div>
                  )
                )}
              </CardContent>
            </Card>

            {/* Confirmation Dialog */}
            <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center text-destructive">
                    <ClientOnly><AlertTriangle className="mr-2 h-5 w-5" /></ClientOnly>
                    Confirm Data Trimming - {operationType === 'both' ? 'Logs & Analytics' : operationType === 'analytics' ? 'Analytics Only' : 'Logs Only'}
                  </DialogTitle>
                  <DialogDescription>
                    {operationType === 'logs' && trimPreview?.auditLogs && (
                      <>This action will permanently delete <strong>{trimPreview.auditLogs.logsToDeleteCount.toLocaleString()}</strong> audit logs.</>
                    )}
                    {operationType === 'analytics' && trimPreview?.analytics && (
                      <>This action will permanently delete analytics data: <strong>
                        {(trimPreview.analytics.apiKeyUsageEvents.eventsToDeleteCount +
                          trimPreview.analytics.apiKeyUsageStats.statsToDeleteCount +
                          trimPreview.analytics.sessionUsageEvents.eventsToDeleteCount +
                          trimPreview.analytics.sessionUsageStats.statsToDeleteCount).toLocaleString()}
                      </strong> records.</>
                    )}
                    {operationType === 'both' && trimPreview?.auditLogs && trimPreview?.analytics && (
                      <>This action will permanently delete <strong>{trimPreview.auditLogs.logsToDeleteCount.toLocaleString()}</strong> audit logs and <strong>
                        {(trimPreview.analytics.apiKeyUsageEvents.eventsToDeleteCount +
                          trimPreview.analytics.apiKeyUsageStats.statsToDeleteCount +
                          trimPreview.analytics.sessionUsageEvents.eventsToDeleteCount +
                          trimPreview.analytics.sessionUsageStats.statsToDeleteCount).toLocaleString()}
                      </strong> analytics records.</>
                    )}
                    {' '}This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Type <code className="bg-destructive text-destructive-foreground px-2 py-1 rounded text-xs font-semibold">CONFIRM</code> to proceed:
                  </div>
                  <Input
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="Type CONFIRM here"
                    className="text-center"
                  />
                </div>
                <DialogFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsConfirmDialogOpen(false);
                      setConfirmationText('');
                    }}
                    disabled={isTrimming}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleTrim}
                    disabled={confirmationText !== 'CONFIRM' || isTrimming}
                  >
                    {isTrimming ? (
                      <>
                        <ClientOnly><RefreshCw className="mr-2 h-4 w-4 animate-spin" /></ClientOnly>
                        Clearing...
                      </>
                    ) : (
                      <>
                        <ClientOnly><Trash2 className="mr-2 h-4 w-4" /></ClientOnly>
                        Clear {operationType === 'both' ? 'Both' : operationType === 'analytics' ? 'Analytics' : 'Logs'}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
