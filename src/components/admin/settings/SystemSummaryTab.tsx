/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HostAliasListModal } from './HostAliasListModal';

import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GoDeviceDesktop } from 'react-icons/go';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';


// Create CSS preview component for default option (shows both single and multi dots)
const DefaultPreview: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <div className={`flex items-center gap-1 ${className || ''}`} style={{ width: size * 2.5, height: size }}>
    {/* Single dot preview */}
    <div className="relative" style={{ width: size * 0.6, height: size * 0.6 }}>
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 rounded-full"
        style={{ width: size * 0.15, height: size * 0.15 }}
      ></div>
    </div>
    {/* Separator */}
    <div className="text-xs text-gray-400">|</div>
    {/* Multi dots preview */}
    <div className="relative" style={{ width: size * 0.6, height: size * 0.6 }}>
      <div
        className="absolute bg-blue-600 rounded-full"
        style={{
          top: size * 0.05,
          left: size * 0.05,
          width: size * 0.1,
          height: size * 0.1
        }}
      ></div>
      <div
        className="absolute bg-blue-600 rounded-full"
        style={{
          top: size * 0.05,
          right: size * 0.05,
          width: size * 0.1,
          height: size * 0.1
        }}
      ></div>
      <div
        className="absolute bg-blue-600 rounded-full"
        style={{
          bottom: size * 0.05,
          left: size * 0.05,
          width: size * 0.1,
          height: size * 0.1
        }}
      ></div>
      <div
        className="absolute bg-blue-600 rounded-full"
        style={{
          bottom: size * 0.05,
          right: size * 0.05,
          width: size * 0.1,
          height: size * 0.1
        }}
      ></div>
    </div>
  </div>
);

// Helper function to get the Lucide icon component
const getIconComponent = (iconName: string): LucideIcon | React.FC<{ size?: number; className?: string }> => {
  if (iconName === 'DEFAULT') {
    return DefaultPreview;
  }
  const IconComponent = (LucideIcons as Record<string, unknown>)[iconName] as LucideIcon | undefined;
  return IconComponent || LucideIcons.CircleDot; // Fallback to a default icon
};

// Helper function to render icon with proper props
const renderIcon = (iconName: string, props: { className?: string; size?: number }) => {
  if (iconName === 'DEFAULT') {
    // For our custom DefaultPreview component
    return React.createElement(DefaultPreview, props);
  } else {
    // For Lucide icons
    const IconComponent = getIconComponent(iconName) as LucideIcon;
    const lucideProps = {
      className: props.className,
      size: props.size
    };
    return React.createElement(IconComponent as any, lucideProps);
  }
};


interface SystemSummaryTabProps {
  systemSummaryData: any;
  isLoadingInitialData: boolean;
  systemSummaryError: string | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export function SystemSummaryTab({
  systemSummaryData,
  isLoadingInitialData,
  systemSummaryError,
  isRefreshing = false,
  onRefresh,
}: SystemSummaryTabProps) {
  const isMobile = useIsMobile();


  // State for managing modal visibility and data
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    hostAliases: any[];
    category: 'managed' | 'unmanaged' | 'total';
  }>({
    isOpen: false,
    title: '',
    description: '',
    hostAliases: [],
    category: 'managed',
  });

  // Function to open modal with specific data
  const openModal = (
    title: string,
    description: string,
    hostAliases: any[],
    category: 'managed' | 'unmanaged' | 'total'
  ) => {


    setModalState({
      isOpen: true,
      title,
      description,
      hostAliases,
      category,
    });
  };

  // Function to close modal
  const closeModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };

  // Remove all internal fetch logic/state
  // Use systemSummaryData for table data
  // Use isLoadingInitialData for skeleton
  // Use systemSummaryError for error display

  if (isLoadingInitialData) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <LucideIcons.Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-lg font-medium text-muted-foreground">Loading System Summary...</p>
      </div>
    );
  }

  if (systemSummaryError) {
    return (
      <div className="text-center p-4 text-red-500">
        <LucideIcons.AlertCircle className="h-8 w-8 mx-auto mb-2" />
        <p>Error: {systemSummaryError}</p>
        <p>Please try refreshing the page or contact support if the issue persists.</p>
      </div>
    );
  }

  if (!systemSummaryData) {
    return (
      <div className="text-center p-4 text-muted-foreground">
        <LucideIcons.Info className="h-8 w-8 mx-auto mb-2" />
        <p>No system summary data available.</p>
      </div>
    );
  }

  return (
    <Card className="flex flex-col flex-1 mb-0 min-h-0">
      <CardHeader className="pb-4 relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center text-xl md:text-2xl">
              <LucideIcons.Globe size={28} className="mr-2 text-primary" /> System Summary
            </CardTitle>
            <CardDescription className="hidden md:block">
              Overview of system configuration and statistics.
            </CardDescription>
          </div>
          {onRefresh && (
            <div className="flex-shrink-0 mt-1">
              <Button
                onClick={onRefresh}
                variant="outline"
                className={cn("mr-2", isMobile && "size-9 p-0")}
                disabled={isLoadingInitialData || isRefreshing}
              >
                {isRefreshing ? (
                  <LucideIcons.Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                ) : (
                  <LucideIcons.RefreshCcw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                )}
                {!isMobile && "Refresh"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 min-h-0 w-full">
          <div className="space-y-6">

            <div className="space-y-4">
              {/* Global Options Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.Globe className="mr-2" /> Global Options</CardTitle>
                  <CardDescription>Summary of global application settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Basic Settings */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-muted-foreground">Basic Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center">
                        <span className="font-medium">Registration:</span>
                        <Badge variant={systemSummaryData.globalSettings?.enableRegistration ? "success" : "destructive"} className="ml-2">
                          {systemSummaryData.globalSettings?.enableRegistration ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.enableRegistration ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Remove Self-Service Page:</span>
                        <Badge variant={systemSummaryData.globalSettings?.removeSelfServicePage ? "destructive" : "success"} className="ml-2">
                          {systemSummaryData.globalSettings?.removeSelfServicePage ? <LucideIcons.XCircle className="h-4 w-4 mr-1" /> : <LucideIcons.CheckCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.removeSelfServicePage ? 'Removed' : 'Available'}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Renaming Self-Service Page:</span>
                        <Badge variant={systemSummaryData.globalSettings?.enableRenamingSelfServicePage ? "success" : "destructive"} className="ml-2">
                          {systemSummaryData.globalSettings?.enableRenamingSelfServicePage ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.enableRenamingSelfServicePage ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Renaming Device Management Page:</span>
                        <Badge variant={systemSummaryData.globalSettings?.enableRenamingDeviceManagementPage ? "success" : "destructive"} className="ml-2">
                          {systemSummaryData.globalSettings?.enableRenamingDeviceManagementPage ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.enableRenamingDeviceManagementPage ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Group Type Settings */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-muted-foreground">Group Type Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center">
                        <span className="font-medium">Group Types:</span>
                        <Badge variant={systemSummaryData.globalSettings?.enableGroupTypes ? "success" : "destructive"} className="ml-2">
                          {systemSummaryData.globalSettings?.enableGroupTypes ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.enableGroupTypes ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Self-Service Multi-Select:</span>
                        <Badge variant={systemSummaryData.globalSettings?.enableSelfServiceMultiSelect ? "success" : "destructive"} className="ml-2">
                          {systemSummaryData.globalSettings?.enableSelfServiceMultiSelect ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.enableSelfServiceMultiSelect ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Single Select Name:</span>
                        <Badge variant="outline" className="ml-2">
                          {systemSummaryData.globalSettings?.singleSelectName || 'Single Select'}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Multi Select Name:</span>
                        <Badge variant="outline" className="ml-2">
                          {systemSummaryData.globalSettings?.multiSelectName || 'Multi Select'}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Single Select Icon:</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="ml-2 flex items-center">
                                {renderIcon(systemSummaryData.globalSettings?.singleSelectIcon || 'CircleDot', { className: "h-4 w-4 mr-1", size: 16 })}
                                {systemSummaryData.globalSettings?.singleSelectIcon || 'DEFAULT'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{systemSummaryData.globalSettings?.singleSelectIcon || 'Default Icon'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Multi Select Icon:</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="ml-2 flex items-center">
                                {renderIcon(systemSummaryData.globalSettings?.multiSelectIcon || 'CircleDot', { className: "h-4 w-4 mr-1", size: 16 })}
                                {systemSummaryData.globalSettings?.multiSelectIcon || 'DEFAULT'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{systemSummaryData.globalSettings?.multiSelectIcon || 'Default Icon'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Features */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-muted-foreground">Advanced Features</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center">
                        <span className="font-medium">Advanced Analytics:</span>
                        <Badge variant={systemSummaryData.globalSettings?.enableAdvancedAnalytics ? "success" : "destructive"} className="ml-2">
                          {systemSummaryData.globalSettings?.enableAdvancedAnalytics ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.enableAdvancedAnalytics ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      {/* Logs and Analytics Retention */}
                      <div className="flex items-center">
                        <span className="font-medium">Logs Data Retention:</span>
                        <Badge variant="outline" className="ml-2">
                          {systemSummaryData.globalSettings?.logsAnalyticsRetentionDays || 90} days
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* MAC Tracking Configuration */}
                  {systemSummaryData.globalSettings?.enableMacTracking && (
                    <div>
                      <h4 className="font-semibold text-sm mb-3 text-muted-foreground">MAC Tracking Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center">
                          <span className="font-medium">MAC Address Tracking:</span>
                          <Badge variant={systemSummaryData.globalSettings?.enableMacTracking ? "success" : "destructive"} className="ml-2">
                            {systemSummaryData.globalSettings?.enableMacTracking ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                            {systemSummaryData.globalSettings?.enableMacTracking ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        <div className="flex items-center">
                          <span className="font-medium">Scan Interval:</span>
                          <Badge variant="outline" className="ml-2">
                            {systemSummaryData.globalSettings?.macTrackingInterval || 5} minutes
                          </Badge>
                        </div>
                        <div className="flex items-center">
                          <span className="font-medium">Inactive Timeout:</span>
                          <Badge variant="outline" className="ml-2">
                            {Math.round((systemSummaryData.globalSettings?.macInactiveTimeout || 1440) / 60)} hours
                          </Badge>
                        </div>
                        <div className="flex items-center">
                          <span className="font-medium">Data Retention:</span>
                          <Badge variant="outline" className="ml-2">
                            {systemSummaryData.globalSettings?.macDataRetentionDays || 90} days
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Application Subtitle Settings */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-muted-foreground">Application Subtitle</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center">
                        <span className="font-medium">Header Subtitle:</span>
                        <Badge variant={systemSummaryData.globalSettings?.enableApplicationSubtitle ? "success" : "destructive"} className="ml-2">
                          {systemSummaryData.globalSettings?.enableApplicationSubtitle ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.enableApplicationSubtitle ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Login Page Subtitle:</span>
                        <Badge variant={systemSummaryData.globalSettings?.enableLoginPageSubtitle ? "success" : "destructive"} className="ml-2">
                          {systemSummaryData.globalSettings?.enableLoginPageSubtitle ? <LucideIcons.CheckCircle className="h-4 w-4 mr-1" /> : <LucideIcons.XCircle className="h-4 w-4 mr-1" />}
                          {systemSummaryData.globalSettings?.enableLoginPageSubtitle ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      {(systemSummaryData.globalSettings?.enableApplicationSubtitle || systemSummaryData.globalSettings?.enableLoginPageSubtitle) && (
                        <div className="flex items-center md:col-span-2">
                          <span className="font-medium">Subtitle Text:</span>
                          <Badge variant="outline" className="ml-2">
                            {systemSummaryData.globalSettings?.subtitleText || 'Not set'}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Custom Symbols Summary */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-muted-foreground">Custom Symbols</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center">
                        <span className="font-medium">Custom Icons:</span>
                        <Badge variant="outline" className="ml-2">
                          {systemSummaryData.globalSettings?.customLucideIcons?.length || 0} configured
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Custom Emojis:</span>
                        <Badge variant="outline" className="ml-2">
                          {systemSummaryData.globalSettings?.customEmojis?.length || 0} configured
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="font-medium">Custom Flags:</span>
                        <Badge variant="outline" className="ml-2">
                          {systemSummaryData.globalSettings?.customFlags?.length || 0} configured
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><GoDeviceDesktop size={20} className="mr-2" /> Self-Service Access Control</CardTitle>
                  <CardDescription>Networks from which self-service access is permitted. Excluded ranges are evaluated first.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!systemSummaryData.allowedNetworks || systemSummaryData.allowedNetworks.length === 0 ? (
                    <p className="text-muted-foreground">No access control rules configured.</p>
                  ) : (
                    <>
                      {/* Desktop View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Network/IP Range</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {systemSummaryData.allowedNetworks.map((network: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>
                                  <Badge variant={network.type === 'include' ? 'success' : 'destructive'}>
                                    {network.type.charAt(0).toUpperCase() + network.type.slice(1)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {network.network || (network.startIp && network.endIp ? `${network.startIp} - ${network.endIp}` : 'N/A')}
                                </TableCell>
                                <TableCell>{network.description || 'N/A'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile/Tablet View */}
                      <div className="block lg:hidden space-y-4">
                        {systemSummaryData.allowedNetworks.map((network: any, index: number) => (
                          <Card key={`allowed-network-card-${index}`} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Type:</span>
                              <Badge variant={network.type === 'include' ? 'success' : 'destructive'}>
                                {network.type.charAt(0).toUpperCase() + network.type.slice(1)}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Network/IP Range:</span>
                              <span className="text-sm text-muted-foreground">
                                {network.network || (network.startIp && network.endIp ? `${network.startIp} - ${network.endIp}` : 'N/A')}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Description:</span>
                              <span className="text-sm text-muted-foreground">{network.description || 'N/A'}</span>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.ListFilter className="mr-2" /> Device Filters</CardTitle>
                  <CardDescription>Configured filters for displaying devices.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!systemSummaryData.groupFilters || systemSummaryData.groupFilters.length === 0 ? (
                    <p className="text-muted-foreground">No device filters configured.</p>
                  ) : (
                    <>
                      {/* Desktop View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Pattern</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {systemSummaryData.groupFilters.map((filter: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{filter.pattern}</TableCell>
                                <TableCell>
                                  <Badge variant={filter.type === 'include' ? 'success' : 'destructive'}>
                                    {filter.type.charAt(0).toUpperCase() + filter.type.slice(1)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{filter.description || 'N/A'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile/Tablet View */}
                      <div className="block lg:hidden space-y-4">
                        {systemSummaryData.groupFilters.map((filter: any, index: number) => (
                          <Card key={`device-filter-card-${index}`} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Pattern:</span>
                              <span className="text-sm text-muted-foreground font-mono break-all">{filter.pattern}</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Type:</span>
                              <Badge variant={filter.type === 'include' ? 'success' : 'destructive'}>
                                {filter.type.charAt(0).toUpperCase() + filter.type.slice(1)}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Description:</span>
                              <span className="text-sm text-muted-foreground">{filter.description || 'N/A'}</span>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

            </div>

            <div className="space-y-4">

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <LucideIcons.Router className="mr-2" /> Host Alias (Devices) Statistics

                  </CardTitle>
                  <CardDescription>Overview of managed and unmanaged host aliases.</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Desktop View */}
                  <div className="hidden lg:block space-y-6">
                    {/* Managed Host Aliases Section */}
                    <Card className="p-4 border-l-4 border-l-green-500">
                      <h4 className="font-semibold text-sm mb-3 text-green-600">Managed Host Aliases</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Managed Host Aliases',
                            'All host aliases that are manageable by the system (pass filtering criteria)',
                            systemSummaryData.hostAliasStats?.managed?.lists?.all || [],
                            'managed'
                          )}
                        >
                          <span className="font-medium">Host Aliases:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.managed?.hostAliases || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Managed Host Aliases - Assigned to Network Groups',
                            'Managed host aliases that are members of one or more network groups',
                            systemSummaryData.hostAliasStats?.managed?.lists?.assignedToNetworkGroups || [],
                            'managed'
                          )}
                        >
                          <span className="font-medium">Assigned to Network Groups:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.managed?.assignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Managed Host Aliases - Not Assigned to Network Groups',
                            'Managed host aliases that are not members of any network groups',
                            systemSummaryData.hostAliasStats?.managed?.lists?.notAssignedToNetworkGroups || [],
                            'managed'
                          )}
                        >
                          <span className="font-medium">Not Assigned to Network Groups:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.managed?.notAssignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Managed Host Aliases - Active Devices',
                            'Managed host aliases with devices currently active in the ARP table',
                            systemSummaryData.hostAliasStats?.managed?.lists?.activeDevicesInArpTable || [],
                            'managed'
                          )}
                        >
                          <span className="font-medium">Active Devices (in ARP Table):</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.managed?.activeDevicesInArpTable || 0}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Unmanaged Host Aliases Section */}
                    <Card className="p-4 border-l-4 border-l-orange-500">
                      <h4 className="font-semibold text-sm mb-3 text-orange-600">Unmanaged Host Aliases</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Unmanaged Host Aliases',
                            'Host aliases that exist in OPNsense but are filtered out by group filters or globally disabled groups',
                            systemSummaryData.hostAliasStats?.unmanaged?.lists?.all || [],
                            'unmanaged'
                          )}
                        >
                          <span className="font-medium">Host Aliases:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.unmanaged?.hostAliases || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Unmanaged Host Aliases - Assigned to Network Groups',
                            'Unmanaged host aliases that are members of network groups (typically 0 as they are filtered out)',
                            systemSummaryData.hostAliasStats?.unmanaged?.lists?.assignedToNetworkGroups || [],
                            'unmanaged'
                          )}
                        >
                          <span className="font-medium">Assigned to Network Groups:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.unmanaged?.assignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Unmanaged Host Aliases - Not Assigned to Network Groups',
                            'Unmanaged host aliases that are not members of any network groups',
                            systemSummaryData.hostAliasStats?.unmanaged?.lists?.notAssignedToNetworkGroups || [],
                            'unmanaged'
                          )}
                        >
                          <span className="font-medium">Not Assigned to Network Groups:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.unmanaged?.notAssignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Unmanaged Host Aliases - Active Devices',
                            'Unmanaged host aliases with devices currently active in the ARP table',
                            systemSummaryData.hostAliasStats?.unmanaged?.lists?.activeDevicesInArpTable || [],
                            'unmanaged'
                          )}
                        >
                          <span className="font-medium">Active Devices (in ARP Table):</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.unmanaged?.activeDevicesInArpTable || 0}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Total Device Statistics Section */}
                    <Card className="p-4 border-l-4 border-l-blue-500">
                      <h4 className="font-semibold text-sm mb-3 text-blue-600">Total Device Statistics</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'All Host Aliases',
                            'All host aliases (both managed and unmanaged) that meet basic criteria',
                            systemSummaryData.hostAliasStats?.total?.lists?.all || [],
                            'total'
                          )}
                        >
                          <span className="font-medium">Host Aliases:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.total?.hostAliases || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'All Host Aliases - Assigned to Network Groups',
                            'All host aliases (managed and unmanaged) that are members of network groups',
                            systemSummaryData.hostAliasStats?.total?.lists?.assignedToNetworkGroups || [],
                            'total'
                          )}
                        >
                          <span className="font-medium">Assigned to Network Groups:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.total?.assignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'All Host Aliases - Not Assigned to Network Groups',
                            'All host aliases (managed and unmanaged) that are not members of any network groups',
                            systemSummaryData.hostAliasStats?.total?.lists?.notAssignedToNetworkGroups || [],
                            'total'
                          )}
                        >
                          <span className="font-medium">Not Assigned to Network Groups:</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.total?.notAssignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'All Host Aliases - Active Devices',
                            'All host aliases (managed and unmanaged) with devices currently active in the ARP table',
                            systemSummaryData.hostAliasStats?.total?.lists?.activeDevicesInArpTable || [],
                            'total'
                          )}
                        >
                          <span className="font-medium">Active Devices (in ARP Table):</span>
                          <span className="ml-2 text-blue-600 underline">{systemSummaryData.hostAliasStats?.total?.activeDevicesInArpTable || 0}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="font-medium">Total Active Devices (in ARP Table):</span> {systemSummaryData.hostAliasStats?.total?.totalActiveDevicesInArp || 0}
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Mobile/Tablet View */}
                  <div className="block lg:hidden space-y-4">
                    {/* Managed Host Aliases Section */}
                    <Card className="p-4 border-l-4 border-l-green-500">
                      <h4 className="font-semibold text-sm mb-3 text-green-600">Managed Host Aliases</h4>
                      <div className="space-y-2">
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Managed Host Aliases',
                            'All host aliases that are manageable by the system (pass filtering criteria)',
                            systemSummaryData.hostAliasStats?.managed?.lists?.all || [],
                            'managed'
                          )}
                        >
                          <span className="text-sm font-medium">Host Aliases:</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.managed?.hostAliases || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Managed Host Aliases - Assigned to Network Groups',
                            'Managed host aliases that are members of one or more network groups',
                            systemSummaryData.hostAliasStats?.managed?.lists?.assignedToNetworkGroups || [],
                            'managed'
                          )}
                        >
                          <span className="text-sm font-medium">Assigned to Network Groups:</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.managed?.assignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Managed Host Aliases - Not Assigned to Network Groups',
                            'Managed host aliases that are not members of any network groups',
                            systemSummaryData.hostAliasStats?.managed?.lists?.notAssignedToNetworkGroups || [],
                            'managed'
                          )}
                        >
                          <span className="text-sm font-medium">Not Assigned to Network Groups:</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.managed?.notAssignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Managed Host Aliases - Active Devices',
                            'Managed host aliases with devices currently active in the ARP table',
                            systemSummaryData.hostAliasStats?.managed?.lists?.activeDevicesInArpTable || [],
                            'managed'
                          )}
                        >
                          <span className="text-sm font-medium">Active Devices (in ARP Table):</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.managed?.activeDevicesInArpTable || 0}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Unmanaged Host Aliases Section */}
                    <Card className="p-4 border-l-4 border-l-orange-500">
                      <h4 className="font-semibold text-sm mb-3 text-orange-600">Unmanaged Host Aliases</h4>
                      <div className="space-y-2">
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Unmanaged Host Aliases',
                            'Host aliases that exist in OPNsense but are filtered out by group filters or globally disabled groups',
                            systemSummaryData.hostAliasStats?.unmanaged?.lists?.all || [],
                            'unmanaged'
                          )}
                        >
                          <span className="text-sm font-medium">Host Aliases:</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.unmanaged?.hostAliases || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Assigned to Network Groups:</span>
                          <span className="text-sm text-muted-foreground">{systemSummaryData.hostAliasStats?.unmanaged?.assignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Unmanaged Host Aliases - Not Assigned to Network Groups',
                            'Unmanaged host aliases that are not members of any network groups',
                            systemSummaryData.hostAliasStats?.unmanaged?.lists?.notAssignedToNetworkGroups || [],
                            'unmanaged'
                          )}
                        >
                          <span className="text-sm font-medium">Not Assigned to Network Groups:</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.unmanaged?.notAssignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'Unmanaged Host Aliases - Active Devices',
                            'Unmanaged host aliases with devices currently active in the ARP table',
                            systemSummaryData.hostAliasStats?.unmanaged?.lists?.activeDevicesInArpTable || [],
                            'unmanaged'
                          )}
                        >
                          <span className="text-sm font-medium">Active Devices (in ARP Table):</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.unmanaged?.activeDevicesInArpTable || 0}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Total Device Statistics Section */}
                    <Card className="p-4 border-l-4 border-l-blue-500">
                      <h4 className="font-semibold text-sm mb-3 text-blue-600">Total Device Statistics</h4>
                      <div className="space-y-2">
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'All Host Aliases',
                            'All host aliases (both managed and unmanaged) that meet basic criteria',
                            systemSummaryData.hostAliasStats?.total?.lists?.all || [],
                            'total'
                          )}
                        >
                          <span className="text-sm font-medium">Host Aliases:</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.total?.hostAliases || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'All Host Aliases - Assigned to Network Groups',
                            'All host aliases that are members of one or more network groups',
                            systemSummaryData.hostAliasStats?.total?.lists?.assignedToNetworkGroups || [],
                            'total'
                          )}
                        >
                          <span className="text-sm font-medium">Assigned to Network Groups:</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.total?.assignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'All Host Aliases - Not Assigned to Network Groups',
                            'All host aliases that are not members of any network groups',
                            systemSummaryData.hostAliasStats?.total?.lists?.notAssignedToNetworkGroups || [],
                            'total'
                          )}
                        >
                          <span className="text-sm font-medium">Not Assigned to Network Groups:</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.total?.notAssignedToNetworkGroups || 0}</span>
                        </div>
                        <div
                          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/80 p-2 rounded transition-colors"
                          onClick={() => openModal(
                            'All Host Aliases - Active Devices',
                            'All host aliases with devices currently active in the ARP table',
                            systemSummaryData.hostAliasStats?.total?.lists?.activeDevicesInArpTable || [],
                            'total'
                          )}
                        >
                          <span className="text-sm font-medium">Active Devices (in ARP Table):</span>
                          <span className="text-sm text-blue-600 underline">{systemSummaryData.hostAliasStats?.total?.activeDevicesInArpTable || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Total Active Devices (in ARP Table):</span>
                          <span className="text-sm text-muted-foreground">{systemSummaryData.hostAliasStats?.total?.totalActiveDevicesInArp || 0}</span>
                        </div>
                      </div>
                    </Card>
                  </div>
                </CardContent>
              </Card>


              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.Users className="mr-2" /> Users</CardTitle>
                  <CardDescription>Statistics about users in the system.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <LucideIcons.CircleDot className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Total Users:</span> {systemSummaryData.userStats?.totalUsers || 0}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.CircleDot className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Local Users:</span> {systemSummaryData.userStats?.localUsers || 0}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.CircleDot className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">SSO Users:</span> {systemSummaryData.userStats?.ssoUsers || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.Users className="mr-2" /> User Groups</CardTitle>
                  <CardDescription>Details about User groups managed by the system. (Not OPNsense related groups)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <span className="font-medium">Total User Groups:</span> {systemSummaryData.groupStats?.totalManagedGroups || 0}
                  </div>
                  {!systemSummaryData.groupStats?.groups || systemSummaryData.groupStats.groups.length === 0 ? (
                    <p className="text-muted-foreground">No user groups found.</p>
                  ) : (
                    <>
                      {/* Desktop View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Group Name</TableHead>
                              <TableHead>Host Aliases Permissions</TableHead>
                              <TableHead>Directly Assigned Users</TableHead>
                              <TableHead>SSO Assigned Users</TableHead>
                              <TableHead>Filters</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {systemSummaryData.groupStats.groups.map((group: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{group.name}</TableCell>
                                <TableCell>
                                  {group.assignedHostAliasesCount > 0 ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span>{group.assignedHostAliasesCountLabel}</span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <ul className="list-disc list-inside">
                                            {group.assignedHostAliases.map((alias: string, i: number) => (
                                              <li key={i}>{alias}</li>
                                            ))}
                                          </ul>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <span className="text-muted-foreground">0</span>
                                  )}
                                </TableCell>
                                <TableCell>{group.directUsersCount}</TableCell>
                                <TableCell>{group.ssoUsersCount}</TableCell>
                                <TableCell>{group.filtersCount}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile/Tablet View */}
                      <div className="block lg:hidden space-y-4">
                        {systemSummaryData.groupStats.groups.map((group: any, index: number) => (
                          <Card key={`user-group-card-${index}`} className="p-4">
                            <CardHeader className="p-0 mb-2">
                              <CardTitle className="text-base">{group.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Host Aliases Permissions:</span>
                                <span className="text-sm text-muted-foreground">{group.assignedHostAliasesCountLabel}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Directly Assigned Users:</span>
                                <span className="text-sm text-muted-foreground">{group.directUsersCount}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">SSO Assigned Users:</span>
                                <span className="text-sm text-muted-foreground">{group.ssoUsersCount}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Filters:</span>
                                <span className="text-sm text-muted-foreground">{group.filtersCount}</span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.GitFork className="mr-2" /> SSO Group Mappings</CardTitle>
                  <CardDescription>Details about SSO Group Mappings configured in the system.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <span className="font-medium">Total SSO Group Mappings:</span> {systemSummaryData.ssoGroupMappingStats?.totalSsoGroupMappings || 0}
                  </div>
                  {!systemSummaryData.ssoGroupMappingStats?.ssoGroupMappings || systemSummaryData.ssoGroupMappingStats.totalSsoGroupMappings === 0 ? (
                    <p className="text-muted-foreground">No SSO group mappings found.</p>
                  ) : (
                    <>
                      {/* Desktop View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Local Group</TableHead>
                              <TableHead>SSO Group</TableHead>
                              <TableHead>SSO Provider</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {systemSummaryData.ssoGroupMappingStats.ssoGroupMappings.map((mapping: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{mapping.localGroup?.name || 'N/A'}</TableCell>
                                <TableCell>{mapping.ssoGroupName}</TableCell>
                                <TableCell>{mapping.ssoProviderDisplayName || mapping.ssoProvider}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile/Tablet View */}
                      <div className="block lg:hidden space-y-4">
                        {systemSummaryData.ssoGroupMappingStats.ssoGroupMappings.map((mapping: any, index: number) => (
                          <Card key={`sso-mapping-card-${index}`} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Local Group:</span>
                              <span className="text-sm text-muted-foreground">{mapping.localGroup?.name || 'N/A'}</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">SSO Group:</span>
                              <span className="text-sm text-muted-foreground">{mapping.ssoGroupName}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">SSO Provider:</span>
                              <span className="text-sm text-muted-foreground">{mapping.ssoProviderDisplayName || mapping.ssoProvider}</span>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.Network className="mr-2" /> Network Groups</CardTitle>
                  <CardDescription>Details of all Network Groups retrievel from OPNsense.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <span className="font-medium">Total Network Groups:</span> {systemSummaryData.networkGroupStats?.totalNetworkGroups || 0}
                  </div>
                  {!systemSummaryData.networkGroupStats?.networkGroups || systemSummaryData.networkGroupStats.networkGroups.length === 0 ? (
                    <p className="text-muted-foreground">No network groups found.</p>
                  ) : (
                    <>
                      {/* Desktop View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Group Name</TableHead>
                              <TableHead>Friendly Name</TableHead>
                              <TableHead>Members</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-center">Globally disabled</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {systemSummaryData.networkGroupStats?.networkGroups?.map((group: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{group.name}</TableCell>
                                <TableCell>{group.friendlyName || '-'}</TableCell>
                                <TableCell>{group.memberCount}</TableCell>
                                <TableCell>{group.description || 'N/A'}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={group.isGloballyDisabled ? "destructive" : "success"}>
                                    {group.isGloballyDisabled ? 'Yes' : 'No'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile/Tablet View */}
                      <div className="block lg:hidden space-y-4">
                        {systemSummaryData.networkGroupStats?.networkGroups?.map((group: any, index: number) => (
                          <Card key={`network-group-card-${index}`} className="p-4">
                            <CardHeader className="p-0 mb-2">
                              <CardTitle className="text-base">{group.name}</CardTitle>
                              <CardDescription className="text-xs">Friendly Name: {group.friendlyName || '-'}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Members:</span>
                                <span className="text-sm text-muted-foreground">{group.memberCount}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Description:</span>
                                <span className="text-sm text-muted-foreground">{group.description || 'N/A'}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Globally disabled:</span>
                                <Badge variant={group.isGloballyDisabled ? "destructive" : "success"}>
                                  {group.isGloballyDisabled ? 'Yes' : 'No'}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.ShieldCheck className="mr-2" /> VPN Statistics</CardTitle>
                  <CardDescription>Details about configured VPN mappings.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <span className="font-medium">Total VPN Mappings:</span> {systemSummaryData.vpnStats?.totalVpns || 0}
                  </div>
                  {!systemSummaryData.vpnStats?.vpnMappings || systemSummaryData.vpnStats.vpnMappings.length === 0 ? (
                    <p className="text-muted-foreground">No VPN mappings configured.</p>
                  ) : (
                    <>
                      {/* Desktop View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>VPN Server</TableHead>
                              <TableHead>Mapped Network Group</TableHead>
                              <TableHead>VPN Type</TableHead>
                              <TableHead>Data Transferred (RX/TX)</TableHead>
                              <TableHead className="text-center">VPN Status</TableHead>
                              <TableHead className="text-center">Mapped</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {systemSummaryData.vpnStats.vpnMappings.map((vpn: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{vpn.vpnServer}</TableCell>
                                <TableCell>{vpn.mappedNetworkGroup || 'N/A'}</TableCell>
                                <TableCell>{vpn.vpnType || 'N/A'}</TableCell>
                                <TableCell>{`${vpn.dataTransferredRx} / ${vpn.dataTransferredTx}`}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={vpn.vpnStatus === 'connected' ? 'success' : 'destructive'}>
                                    {vpn.vpnStatus ? vpn.vpnStatus.charAt(0).toUpperCase() + vpn.vpnStatus.slice(1) : 'Unknown'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={vpn.mappedNetworkGroup && vpn.mappedNetworkGroup !== '-' && vpn.mappedNetworkGroup !== 'N/A' ? 'success' : 'destructive'}>
                                    {vpn.mappedNetworkGroup && vpn.mappedNetworkGroup !== '-' && vpn.mappedNetworkGroup !== 'N/A' ? 'Yes' : 'No'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile/Tablet View */}
                      <div className="block lg:hidden space-y-4">
                        {systemSummaryData.vpnStats.vpnMappings.map((vpn: any, index: number) => (
                          <Card key={`vpn-mapping-card-${index}`} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">VPN Server:</span>
                              <span className="text-sm text-muted-foreground">{vpn.vpnServer}</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Mapped Network Group:</span>
                              <span className="text-sm text-muted-foreground">{vpn.mappedNetworkGroup || 'N/A'}</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">VPN Type:</span>
                              <span className="text-sm text-muted-foreground">{vpn.vpnType || 'N/A'}</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Data Transferred (RX/TX):</span>
                              <span className="text-sm text-muted-foreground">{`${vpn.dataTransferredRx} / ${vpn.dataTransferredTx}`}</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">VPN Status:</span>
                              <Badge variant={vpn.vpnStatus === 'connected' ? 'success' : 'destructive'}>
                                {vpn.vpnStatus.charAt(0).toUpperCase() + vpn.vpnStatus.slice(1)}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Mapped:</span>
                              <Badge variant={vpn.mappedNetworkGroup && vpn.mappedNetworkGroup !== '-' && vpn.mappedNetworkGroup !== 'N/A' ? 'success' : 'destructive'}>
                                {vpn.mappedNetworkGroup && vpn.mappedNetworkGroup !== '-' && vpn.mappedNetworkGroup !== 'N/A' ? 'Yes' : 'No'}
                              </Badge>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.Server className="mr-2" /> DHCP / Hosts Statistics</CardTitle>
                  <CardDescription>Current DHCP server and active devices statistics.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <LucideIcons.CircleDot className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Number of Reservations:</span> {systemSummaryData.dhcpStats?.reservationsCount || 0}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.CircleDot className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Number of Active Leases:</span> {systemSummaryData.dhcpStats?.activeLeasesCount || 0}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.CircleDot className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Number of Active Devices (ARP Table):</span> {systemSummaryData.dhcpStats?.activeDevicesCount || 0}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.CircleDot className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Number of Active Devices (ARP Table) with DHCP Reserved:</span> {systemSummaryData.dhcpStats?.activeDevicesWithDhcpReservedCount || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LucideIcons.HardDrive className="mr-2" /> Backup Statistics</CardTitle>
                  <CardDescription>Information about system backups.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <LucideIcons.CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Backups in last week:</span> {systemSummaryData.backupStats?.lastWeekCount || 0}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Backups in last month:</span> {systemSummaryData.backupStats?.lastMonthCount || 0}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Backups in last 3 months:</span> {systemSummaryData.backupStats?.last3MonthsCount || 0}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Last backup date:</span> {systemSummaryData.backupStats?.lastBackupDate || 'N/A'}
                  </div>
                  <div className="flex items-center">
                    <LucideIcons.FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="font-medium">Last backup file:</span> <span className="break-all">{systemSummaryData.backupStats?.lastBackupFileName || 'N/A'}</span>
                  </div>
                </CardContent>
              </Card>

            </div>

          </div>
        </ScrollArea>
      </CardContent>

      {/* Host Alias List Modal */}
      <HostAliasListModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.title}
        description={modalState.description}
        hostAliases={modalState.hostAliases}
        category={modalState.category}
      />
    </Card>
  );
}