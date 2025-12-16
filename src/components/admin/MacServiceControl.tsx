'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Play, Square, RefreshCw, Trash2, Settings, Loader2, Info } from 'lucide-react';
import { MacTrackingServiceStatus } from '@/types/mac-tracking';
import { useToast } from '@/hooks/use-toast';
import { ResponsiveActionButton } from '@/components/analytics/ResponsiveActionButton';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types/opnsense';

interface MacServiceControlProps {
  status: MacTrackingServiceStatus | null;
  onStatusChange: () => void;
  variant?: 'default' | 'minimal';
}

export function MacServiceControl({ status, onStatusChange, variant = 'default' }: MacServiceControlProps) {
  const { toast } = useToast();
  const { data: session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [retentionDays, setRetentionDays] = useState(90);
  const [inputValue, setInputValue] = useState('90');

  // Only SUPER_ADMIN can manage service
  const canManageService = session?.user?.role === Role.SUPER_ADMIN;

  const handleServiceAction = async (action: string, params?: Record<string, unknown>, isRefresh = false) => {
    try {
      // Only set loading to true for initial load, not for refresh
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      const response = await fetch('/api/admin/mac-tracking/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params })
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Success",
          description: data.message,
          variant: "success",
        });
        onStatusChange();
      } else {
        toast({
          title: "Error",
          description: data.message || 'Operation failed',
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: 'Failed to control service',
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
  };

  const handleStart = () => {
    handleServiceAction('start');
  };

  const handleStop = () => {
    handleServiceAction('stop');
  };


  const handleInputBlur = () => {
    const numValue = parseInt(inputValue, 10);

    // Validate the number
    if (isNaN(numValue) || numValue < 0 || numValue > 365) {
      // Reset to previous valid value
      setInputValue(retentionDays.toString());
      toast({
        title: "Invalid Input",
        description: 'Retention days must be a number between 0 and 365',
        variant: "destructive",
      });
    } else {
      // Update the retention days with validated value
      setRetentionDays(numValue);
    }
  };

  const handleCleanup = () => {
    const message = retentionDays === 0
      ? 'This will delete ALL inactive MAC associations. Continue?'
      : `This will delete MAC associations older than ${retentionDays} days. Continue?`;

    if (confirm(message)) {
      handleServiceAction('cleanup', { retentionDays });
    }
  };

  const content = (
    <div className="space-y-6">
      {/* Service Status */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Current Status</Label>
          {status?.settings.enabled && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-gray-100">
                        <Info className="h-4 w-4 text-gray-500 cursor-help" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Service Restart Behavior</DialogTitle>
                        <DialogDescription>
                          Understanding how service control works
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 text-sm">
                        <p>
                          <strong>Stopping the service is temporary.</strong>
                        </p>
                        <p>
                          The service will automatically restart when the application restarts (e.g., container restart, deployment update).
                        </p>
                        <p>
                          To permanently disable the service (and remove the page from view), toggle &quot;Enable MAC Tracking&quot; to off in Global Settings.
                        </p>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Click for information about service restart behavior</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status?.settings.enabled
            ? (status.isRunning ? 'bg-green-500' : 'bg-red-500')
            : 'bg-gray-400'
            }`} />
          <span className="text-sm">
            {!status?.settings.enabled
              ? 'Disabled in settings'
              : status.isRunning
                ? `Running (${status.settings.interval}min interval)`
                : 'Stopped'
            }
          </span>
        </div>
        {status?.lastScanTime && (
          <p className="text-xs text-muted-foreground">
            Last scan: {new Date(status.lastScanTime).toLocaleString()}
          </p>
        )}
      </div>

      <Separator />

      {/* Service Controls */}
      {canManageService ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <ResponsiveActionButton
              icon={<Play className="h-4 w-4" />}
              label="Start Service"
              onClick={handleStart}
              disabled={isLoading || !status?.settings.enabled || status?.isRunning}
              size="sm"
            />

            <ResponsiveActionButton
              icon={<Square className="h-4 w-4" />}
              label="Stop Service"
              onClick={handleStop}
              disabled={isLoading || !status?.isRunning}
              variant="destructive"
              size="sm"
            />

            <ResponsiveActionButton
              icon={isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              label="Run Once"
              onClick={() => handleServiceAction('run', undefined, true)}
              disabled={isRefreshing || isLoading || !status?.settings.enabled}
              variant="outline"
              size="sm"
              key={refreshKey} // Force re-render when refresh key changes
            />
          </div>

          <Separator />

          {/* Data Cleanup */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="retention">Data Retention (days)</Label>
              <Input
                id="retention"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={handleInputBlur}
                placeholder="0-365"
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                {retentionDays === 0
                  ? 'Set to 0 to purge all inactive records, or enter days (1-365)'
                  : `Delete inactive MAC associations older than ${retentionDays} days`
                }
              </p>
            </div>

            <Button
              onClick={handleCleanup}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Cleanup Old Data
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (variant === 'minimal') {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {canManageService ? 'Service Control' : 'Service Info'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}
