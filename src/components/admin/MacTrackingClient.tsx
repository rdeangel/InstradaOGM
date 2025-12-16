'use client';

import { useState, useEffect } from 'react';
import { MacTrackingStats } from './MacTrackingStats';
import { MacTrackingTable } from './MacTrackingTable';
import { MacServiceControl } from './MacServiceControl';
import { MacTrackingAnalytics } from './MacTrackingAnalytics';
import { MacTrackingServiceStatus } from '@/types/mac-tracking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Table, BarChart3, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useIsMobile } from '@/hooks/use-mobile';
import { useLocalStorage } from '@/hooks/use-local-storage';

export function MacTrackingClient() {
  const isMobile = useIsMobile();
  const [serviceStatus, setServiceStatus] = useState<MacTrackingServiceStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFeatureDisabled, setIsFeatureDisabled] = useState(false);
  const [activeTab, setActiveTab] = useLocalStorage<string>('mac-tracking-client-active-tab', 'table-data');
  const [isServiceControlOpen, setIsServiceControlOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchServiceStatus();
  }, [refreshKey]);

  const fetchServiceStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/mac-tracking/service');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setServiceStatus(data.data);
        }
      } else if (response.status === 403) {
        // Feature is disabled
        setIsFeatureDisabled(true);
      }
    } catch (error) {
      console.error('Error fetching service status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Show loading skeleton
  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted rounded animate-pulse" />
            <div className="h-4 w-96 bg-muted rounded animate-pulse hidden sm:block" />
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <div className="h-full w-full bg-muted/20 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  // Show disabled message if feature is disabled
  if (isFeatureDisabled) {
    return (
      <div className="container-responsive py-4 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className={`font-bold ${isMobile ? 'text-2xl' : 'text-3xl'}`}>MAC Address Tracking</h1>
            {!isMobile && <p className="text-muted-foreground">
              Monitor and track MAC addresses discovered through ARP table scanning
            </p>}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              Feature Disabled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              MAC Address Tracking is currently disabled.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      {/* Fixed Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={`font-bold ${isMobile ? 'text-2xl' : 'text-3xl'}`}>MAC Address Tracking</h1>
          {!isMobile && <p className="text-muted-foreground">
            Monitor and track MAC addresses discovered through ARP table scanning
            {serviceStatus?.settings && (
              <span className="ml-2 text-sm">
                (Polling every {serviceStatus.settings.interval} minutes)
              </span>
            )}
          </p>}
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 w-full">
        {/* Mobile dropdown menu */}
        {isMobile ? (
          <div className="w-full">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between h-12 text-left bg-muted/50 hover:bg-muted/70"
                >
                  <div className="flex items-center gap-2">
                    {activeTab === 'table-data' ? <Table className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
                    {activeTab === 'table-data' ? 'MAC Tracking Data' : 'Analytics'}
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full min-w-[var(--radix-dropdown-menu-trigger-width)]">
                <DropdownMenuItem onClick={() => setActiveTab('table-data')} className="flex items-center gap-2 py-3">
                  <Table className="h-4 w-4" />
                  MAC Tracking Data
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('analytics')} className="flex items-center gap-2 py-3">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="table-data" className="flex items-center gap-2">
              <Table className="h-4 w-4" />
              MAC Tracking Data
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>
        )}

        <div className="mt-4 w-full min-w-0 flex-grow flex flex-col min-h-0">
          {activeTab === 'table-data' && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4 h-full">
              {isMobile ? (
                <>
                  <Dialog open={isServiceControlOpen} onOpenChange={setIsServiceControlOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Service Control</DialogTitle>
                      </DialogHeader>
                      <MacServiceControl
                        status={serviceStatus}
                        onStatusChange={handleRefresh}
                        variant="minimal"
                      />
                    </DialogContent>
                  </Dialog>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <MacTrackingTable
                      onRefresh={handleRefresh}
                      onOpenServiceControl={() => setIsServiceControlOpen(true)}
                    />
                  </div>
                </>
              ) : (
                /* Service Control and Table Layout */
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full min-h-0">
                  {/* Service Control Panel */}
                  <div className="xl:col-span-1 order-2 xl:order-1 h-fit">
                    <MacServiceControl
                      status={serviceStatus}
                      onStatusChange={handleRefresh}
                    />
                  </div>

                  {/* MAC Addresses Table */}
                  <div className="xl:col-span-3 order-1 xl:order-2 flex flex-col min-h-0 h-full">
                    <MacTrackingTable onRefresh={handleRefresh} />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <Card className="flex-1 min-h-0 flex flex-col">
              <ScrollArea className="flex-1">
                <div className="space-y-6 p-6">
                  {/* Statistics Cards - Only in Analytics tab */}
                  <MacTrackingStats key={refreshKey} />
                  <MacTrackingAnalytics />
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>
      </Tabs>
    </div>
  );
}
