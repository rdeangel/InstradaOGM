'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Laptop, Activity, Clock, AlertCircle, Shield, Server, AlertTriangle } from 'lucide-react';
import { MacTrackingServiceStatus } from '@/types/mac-tracking';

export function MacTrackingStats() {
  const [stats, setStats] = useState<MacTrackingServiceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/mac-tracking/service');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching MAC tracking stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {[...Array(7)].map((_, i) => (
          <Card key={i} className="h-20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-3" />
            </CardHeader>
            <CardContent className="px-3 pb-2">
              <Skeleton className="h-6 w-12 mb-1" />
              <Skeleton className="h-2 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">Failed to load MAC tracking statistics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getServiceStatusColor = (isRunning: boolean, enabled: boolean) => {
    if (!enabled) return 'text-muted-foreground';
    return isRunning ? 'text-green-600' : 'text-red-600';
  };

  const getServiceStatusText = (isRunning: boolean, enabled: boolean) => {
    if (!enabled) return 'Disabled';
    return isRunning ? 'Running' : 'Stopped';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
      <Card className="h-20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
          <CardTitle className="text-xs font-medium">Total MACs</CardTitle>
          <Laptop className="h-3 w-3 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="text-lg font-bold">{stats.stats.totalMacs}</div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            All discovered
          </p>
        </CardContent>
      </Card>

      <Card className="h-20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
          <CardTitle className="text-xs font-medium">Active MACs</CardTitle>
          <Activity className="h-3 w-3 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="text-lg font-bold text-green-600">{stats.stats.activeMacs}</div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Currently active
          </p>
        </CardContent>
      </Card>

        <Card className="h-20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
            <CardTitle className="text-xs font-medium">Inactive MACs</CardTitle>
            <AlertCircle className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-2">
            <div className="text-lg font-bold text-red-600">{stats.stats.totalMacs - stats.stats.activeMacs}</div>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Not seen recently
            </p>
          </CardContent>
        </Card>

      <Card className="h-20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
          <CardTitle className="text-xs font-medium">Privacy MACs</CardTitle>
          <Shield className="h-3 w-3 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="text-lg font-bold text-yellow-600">{stats.stats.privacyMacs}</div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {stats.stats.privacyMacPercentage}% privacy
          </p>
        </CardContent>
      </Card>

      <Card className="h-20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
          <CardTitle className="text-xs font-medium">DHCP Reserved</CardTitle>
          <Server className="h-3 w-3 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="text-lg font-bold text-blue-600">{stats.stats.dhcpReservedMacs || 0}</div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            With reservations
          </p>
        </CardContent>
      </Card>

      <Card className="h-20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
          <CardTitle className="text-xs font-medium">DHCP Conflicts</CardTitle>
          <AlertTriangle className="h-3 w-3 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="text-lg font-bold text-orange-600">{stats.stats.dhcpConflictMacs || 0}</div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Need attention
          </p>
        </CardContent>
      </Card>

      <Card className="h-20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
          <CardTitle className="text-xs font-medium">Service Status</CardTitle>
          <Activity className="h-3 w-3 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className={`text-lg font-bold ${getServiceStatusColor(stats.isRunning, stats.settings.enabled)}`}>
            {getServiceStatusText(stats.isRunning, stats.settings.enabled)}
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {stats.settings.enabled ? `Every ${stats.settings.interval}min` : 'Disabled'}
          </p>
        </CardContent>
      </Card>

      <Card className="h-20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
          <CardTitle className="text-xs font-medium">Last Scan</CardTitle>
          <Clock className="h-3 w-3 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="text-lg font-bold">
            {stats.lastScanTime ? (
              new Date(stats.lastScanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            ) : (
              'Never'
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {stats.lastScanTime ? (
              `${Math.round((Date.now() - new Date(stats.lastScanTime).getTime()) / 60000)}min ago`
            ) : (
              'No scans'
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
