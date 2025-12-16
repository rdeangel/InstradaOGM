'use client';

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SortableTable } from "@/components/ui/sortable-table";
import { PaginationControls } from '@/components/ui/pagination-controls';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';


import { ClientOnly } from '@/components/util/ClientOnly';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, RefreshCcw, Plus, XCircle, Save, AlertCircle } from 'lucide-react';
import { GoDeviceDesktop } from 'react-icons/go';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { ValidLocalNetwork } from '@/types/settings';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { sortIpAddresses, isValidCidr } from '@/lib/network-utils';

interface SelfServiceAccessTabProps {
  allowedNetworks: ValidLocalNetwork[];
  setallowedNetworks: React.Dispatch<React.SetStateAction<ValidLocalNetwork[]>>;
  newNetworkType: 'include' | 'exclude';
  setNewNetworkType: React.Dispatch<React.SetStateAction<'include' | 'exclude'>>;
  newNetworkCidr: string;
  setNewNetworkCidr: React.Dispatch<React.SetStateAction<string>>;
  newNetworkStartIp: string;
  setNewNetworkStartIp: React.Dispatch<React.SetStateAction<string>>;
  newNetworkEndIp: string;
  setNewNetworkEndIp: React.Dispatch<React.SetStateAction<string>>;
  newNetworkDescription: string;
  setNewNetworkDescription: React.Dispatch<React.SetStateAction<string>>;
  handleSaveGlobalSettings: () => Promise<void>;
  isSavingGlobalSettings: boolean;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (newSortBy: string, newSortDirection: 'asc' | 'desc') => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  // Add pagination props
  currentPage: number;
  pageSize: number | 'ALL';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | 'ALL') => void;
}

export function SelfServiceAccessTab({
  allowedNetworks,
  setallowedNetworks,
  newNetworkType,
  setNewNetworkType,
  newNetworkCidr,
  setNewNetworkCidr,
  newNetworkStartIp,
  setNewNetworkStartIp,
  newNetworkEndIp,
  setNewNetworkEndIp,
  newNetworkDescription,
  setNewNetworkDescription,
  handleSaveGlobalSettings,
  isSavingGlobalSettings,
  sortBy,
  sortDirection,
  onSortChange,
  isRefreshing = false,
  onRefresh,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: SelfServiceAccessTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [isAdding, setIsAdding] = React.useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = React.useState(false);
  const [initialAllowedNetworks, setInitialAllowedNetworks] = React.useState<ValidLocalNetwork[]>([]);
  const [hasInitialized, setHasInitialized] = React.useState(false);
  const [prevIsRefreshing, setPrevIsRefreshing] = React.useState(false);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = React.useState(false);

  // Track initial state when component first mounts - capture the initial database state ONCE
  React.useEffect(() => {
    if (!hasInitialized) {
      // Capture whatever the initial state is (even if empty array)
      setInitialAllowedNetworks([...allowedNetworks]);
      setHasInitialized(true);
    }
  }, [allowedNetworks, hasInitialized]);

  // Reset initial state when refresh completes (isRefreshing transitions from true to false)
  React.useEffect(() => {
    if (prevIsRefreshing && !isRefreshing) {
      // Refresh just completed, update initial state to the fresh data
      setInitialAllowedNetworks([...allowedNetworks]);
      // Mark that initial load is complete - change detection can now run
      if (!hasCompletedInitialLoad) {
        setHasCompletedInitialLoad(true);
      }
    }
    setPrevIsRefreshing(isRefreshing);
  }, [isRefreshing, prevIsRefreshing, allowedNetworks, hasCompletedInitialLoad]);

  // Check if there are unsaved changes
  // Suppress change detection while data is refreshing
  const hasUnsavedChangesRaw = useUnsavedChanges(allowedNetworks, initialAllowedNetworks);

  // Suppress change detection until initial load completes AND while refreshing
  // This prevents false positives during the initial data load
  const hasUnsavedChanges = (!hasCompletedInitialLoad || isRefreshing) ? false : hasUnsavedChangesRaw;

  // Show toast notification when unsaved changes are first detected (but not during initial load)
  const [hasShownUnsavedToast, setHasShownUnsavedToast] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Track when initial loading is complete
  useEffect(() => {
    if (allowedNetworks.length >= 0 && initialAllowedNetworks.length >= 0) {
      // Add a small delay to ensure all initial state comparisons are complete
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [allowedNetworks.length, initialAllowedNetworks.length]);

  useEffect(() => {
    if (hasUnsavedChanges && !hasShownUnsavedToast && !isInitialLoad) {
      toast({
        title: "You have unsaved changes",
        description: "Click Save to persist your changes.",
        variant: "default"
      });
      setHasShownUnsavedToast(true);
    } else if (!hasUnsavedChanges) {
      setHasShownUnsavedToast(false);
    }
  }, [hasUnsavedChanges, hasShownUnsavedToast, isInitialLoad, toast]);

  // Wrapper function to handle save and reset initial state
  const handleSaveWithReset = useCallback(async () => {
    await handleSaveGlobalSettings();
    // Reset initial state to current state after successful save
    setInitialAllowedNetworks([...allowedNetworks]);
  }, [handleSaveGlobalSettings, allowedNetworks]);

  const handleAddRule = async () => {
    setIsAdding(true);
    try {
      // Validation based on type
      if (newNetworkType === 'include') {
        if (newNetworkCidr.trim() === '') {
          toast({ title: "Validation Error", description: "Please enter a network range to allow access from.", variant: "destructive" });
          return;
        }
        if (!isValidCidr(newNetworkCidr.trim())) {
          toast({ title: "Validation Error", description: "Please enter a valid network range (e.g., 192.168.1.0/24).", variant: "destructive" });
          return;
        }
      }
      if (newNetworkType === 'exclude' && (newNetworkStartIp.trim() === '' || newNetworkEndIp.trim() === '')) {
        toast({ title: "Validation Error", description: "Please enter both start and end IP addresses to define the blocked range.", variant: "destructive" });
        return;
      }

      const newNetwork: ValidLocalNetwork = {
        id: String(Date.now()), // Temporary ID for frontend state
        type: newNetworkType,
        network: newNetworkType === 'include' ? newNetworkCidr.trim() : undefined,
        startIp: newNetworkType === 'exclude' ? newNetworkStartIp.trim() : undefined,
        endIp: newNetworkType === 'exclude' ? newNetworkEndIp.trim() : undefined,
        description: newNetworkDescription.trim() || null,
        createdAt: new Date(), // Placeholder
        updatedAt: new Date(), // Placeholder
      };

      setallowedNetworks([...allowedNetworks, newNetwork]);
      setNewNetworkType('include'); // Reset type
      setNewNetworkCidr(''); // Clear CIDR input
      setNewNetworkStartIp(''); // Clear Start IP input
      setNewNetworkEndIp(''); // Clear End IP input
      setNewNetworkDescription(''); // Clear description
      setIsAddDialogOpen(false); // Close dialog
      toast({ title: "Access Rule Added", description: "New network access rule added. Click 'Save Settings' to apply the changes." });
    } finally {
      setIsAdding(false);
    }
  };

  // Pagination logic
  const totalItems = allowedNetworks.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  const paginatedNetworks = useMemo(() => {
    if (pageSize === 'ALL') {
      return allowedNetworks;
    }

    if (isPhone) {
      return allowedNetworks.slice(0, currentPage * pageSize);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return allowedNetworks.slice(startIndex, endIndex);
  }, [allowedNetworks, currentPage, pageSize, isPhone]);



  // Reset to first page when data length changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [allowedNetworks.length, currentPage, totalPages, onPageChange]);

  return (
    <Card className="flex flex-col flex-1 mb-0 min-h-0">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
        <div>
          <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            <ClientOnly><GoDeviceDesktop size={28} className="mr-2 text-primary" /></ClientOnly> Self-Service Access Control
          </CardTitle>
          <CardDescription className="hidden md:block">
            Configure network access rules for self-service features when users are not logged in.
          </CardDescription>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2 text-orange-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>You have unsaved changes</span>
            </div>
          )}
          <div className="flex w-full justify-end md:w-auto gap-2">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size={isMobile ? "icon" : "default"}>
                  <Plus className={cn("h-4 w-4", !isMobile && "mr-2")} />
                  {!isMobile && "Add Rule"}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Access Rule</DialogTitle>
                  <DialogDescription>
                    Add a new network access rule for self-service features.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Rule Type Select */}
                  <div>
                    <label htmlFor="networkType" className="block text-sm font-medium text-muted-foreground mb-1">Rule Type</label>
                    <select
                      id="networkType"
                      value={newNetworkType}
                      onChange={(e) => setNewNetworkType(e.target.value as 'include' | 'exclude')}
                      className="block w-full p-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm h-10"
                    >
                      <option value="include">Include</option>
                      <option value="exclude">Exclude</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Include: Allow access. Exclude: Block access.
                    </p>
                  </div>

                  {/* Network Range Input */}
                  {newNetworkType === 'include' ? (
                    <div>
                      <label htmlFor="networkCidr" className="block text-sm font-medium text-muted-foreground mb-1">Network Range (CIDR)</label>
                      <Input
                        id="networkCidr"
                        type="text"
                        placeholder="e.g., 192.168.1.0/24"
                        value={newNetworkCidr}
                        onChange={(e) => setNewNetworkCidr(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter network in CIDR format (e.g., 192.168.1.0/24).
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">IP Address Range</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Input
                            type="text"
                            placeholder="e.g., 10.0.0.1"
                            value={newNetworkStartIp}
                            onChange={(e) => setNewNetworkStartIp(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground mt-1">Start IP</p>
                        </div>
                        <div>
                          <Input
                            type="text"
                            placeholder="e.g., 10.0.0.10"
                            value={newNetworkEndIp}
                            onChange={(e) => setNewNetworkEndIp(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground mt-1">End IP</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Description Input */}
                  <div>
                    <label htmlFor="ruleDescription" className="block text-sm font-medium text-muted-foreground mb-1">Rule Description (optional)</label>
                    <Input
                      id="ruleDescription"
                      type="text"
                      placeholder="e.g., Main Office Network"
                      value={newNetworkDescription}
                      onChange={(e) => setNewNetworkDescription(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Add a descriptive name for this rule.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddRule} disabled={isAdding}>
                    {isAdding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Add Rule
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {onRefresh && (
              <Button variant="outline" onClick={onRefresh} disabled={isRefreshing} size={isMobile ? "icon" : "default"}>
                <ClientOnly>
                  {isRefreshing ? (
                    <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                  ) : (
                    <RefreshCcw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                  )}
                </ClientOnly>
                {!isMobile && "Refresh"}
              </Button>
            )}
            <Button
              onClick={handleSaveWithReset}
              disabled={isSavingGlobalSettings || !hasUnsavedChanges}
              size={isMobile ? "icon" : "default"}
              variant={hasUnsavedChanges ? "default" : "outline"}
              className={cn(
                hasUnsavedChanges ? "bg-orange-600 hover:bg-orange-700" : "",
                !isMobile && "min-w-[120px]" // Fixed width to prevent layout shifts
              )}
            >
              {isSavingGlobalSettings ? <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} /> : <Save className={cn("h-4 w-4", !isMobile && "mr-2")} />}
              {!isMobile && (hasUnsavedChanges ? "Save Changes" : "Save Settings")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-6 pb-8 md:pb-6 relative flex flex-col flex-1 overflow-hidden">
        <h4 className="text-lg font-semibold mb-4">Current Access Control Rules</h4>
        {allowedNetworks.length === 0 ? (
          <p className="text-muted-foreground">No access control rules defined yet.</p>
        ) : (
          <>
            {isMobile ? (
              // Mobile View: Render as Cards
              <ScrollArea className="flex-1 min-h-0 pr-4">
                <div className="space-y-4">
                  {paginatedNetworks.map((network) => (
                    <Card key={`card-${network.id}`}>
                      <CardHeader>
                        <CardTitle className={`${isMobile ? 'text-sm' : 'text-base'} font-mono break-all`}>
                          {network.network || `${network.startIp} - ${network.endIp}`}
                        </CardTitle>
                        {network.description && (
                          <CardDescription>{network.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Type:</span>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${network.type === 'include' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}
                          >
                            {network.type.charAt(0).toUpperCase() + network.type.slice(1)}
                          </span>
                        </div>
                        <div className="flex flex-col space-y-2">
                          <Button variant="destructive" size={isMobile ? "icon" : "sm"} onClick={() => {
                            setallowedNetworks(allowedNetworks.filter(n => n.id !== network.id));
                            const networkIdentifier = network.network || `${network.startIp}-${network.endIp}`;
                            toast({ title: "Access Rule Deleted", description: `Network access rule ${networkIdentifier} removed. Click 'Save Settings' to apply the changes.` });
                          }} className={isMobile ? "" : "w-full"}>
                            <XCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
                            {!isMobile && "Delete"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              // Desktop View: Render as Table
              <ScrollArea className="flex-1 min-h-0 w-full">
                <SortableTable<ValidLocalNetwork>
                  data={paginatedNetworks}
                  columns={[
                    {
                      key: 'type',
                      label: 'Type',
                      sortable: true,
                      headerClassName: "text-center",
                      render: (network) => (
                        <div className="flex justify-center">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${network.type === 'include' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                            {network.type.charAt(0).toUpperCase() + network.type.slice(1)}
                          </span>
                        </div>
                      ),
                    },
                    {
                      key: 'network',
                      label: 'Network Range',
                      sortable: true,
                      render: (network) => (
                        <span className="font-mono break-all">
                          {network.network || `${network.startIp} - ${network.endIp}`}
                        </span>
                      ),
                      compareFn: (a, b) => {
                        const ipA = a.network ? a.network.split('/')[0] : a.startIp;
                        const ipB = b.network ? b.network.split('/')[0] : b.startIp;
                        return sortIpAddresses(ipA ?? null, ipB ?? null);
                      },
                    },
                    {
                      key: 'description',
                      label: 'Description',
                      sortable: true,
                      render: (network) => network.description || '-',
                    },
                    {
                      key: 'actions',
                      label: 'Actions',
                      headerClassName: 'text-left', // Justify Actions header to the left
                      render: (network) => (
                        <div className="text-left">
                          <Button variant="destructive" size={isMobile ? "icon" : "sm"} onClick={() => {
                            setallowedNetworks(allowedNetworks.filter(n => n.id !== network.id));
                            const networkIdentifier = network.network || `${network.startIp}-${network.endIp}`;
                            toast({ title: "Access Rule Deleted", description: `Network access rule ${networkIdentifier} removed. Click 'Save Settings' to apply the changes.` });
                          }}>
                            <XCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
                            {!isMobile && "Delete"}
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}
                />
              </ScrollArea>
            )}
          </>
        )}

        {/* Pagination Controls */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalItems}
          filteredCount={totalItems}
          pageSize={pageSize}
          onPageChange={async (page) => {
            setIsButtonRefreshing(true);
            await new Promise(resolve => setTimeout(resolve, 500));
            onPageChange(page);
            setIsButtonRefreshing(false);
          }}
          onPageSizeChange={onPageSizeChange}
          isLoadMoreMode={isPhone}
          isLoading={isRefreshing || isButtonRefreshing}
          pageSizeOptions={[5, 10, 50, 100, 500]}
          showAllOption={true}
        />
      </CardContent>
    </Card>
  );
} 