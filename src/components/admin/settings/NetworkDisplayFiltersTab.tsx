'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react'; // Import useEffect and useState
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ListFilter, Loader2, AlertCircle, RefreshCcw, Plus, XCircle, Save } from 'lucide-react';

import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { flags, generalEmojis } from '@/components/ui/icon-picker';
import { ClientOnly } from '@/components/util/ClientOnly';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { NetworkGroup } from '@/types/opnsense';
import type { GroupFilter, OpnsenseGroupDisplay, CustomLucideIcon, CustomEmoji, CustomFlag } from '@/types/settings';
import { filterNetworkGroups } from '@/lib/group-filter-utils';
import type { GloballyDisabledGroup } from '@prisma/client';
import { SortableTable } from "@/components/ui/sortable-table";
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

interface NetworkDisplayFiltersTabProps {
  groupFilters: GroupFilter[];
  setGroupFilters: (filters: GroupFilter[]) => void;
  isLoadingFilters: boolean;
  isRefreshing: boolean; // Ensure this is explicitly typed as required, not optional
  isSavingFilters: boolean;
  setIsSavingFilters: (isSaving: boolean) => void; // New prop for setting saving state

  newPattern: string;
  setNewPattern: (pattern: string) => void;
  newDescription: string;
  setNewDescription: (description: string) => void;
  newPatternType: 'include' | 'exclude';
  setNewPatternType: (type: 'include' | 'exclude') => void;
  allNetworkGroups: NetworkGroup[];
  isLoadingAllGroups: boolean;
  errorLoadingAllGroups: string | null;
  opnsenseGroupDisplays: OpnsenseGroupDisplay[]; // Pass the mappings for display in preview
  customLucideIcons: CustomLucideIcon[];
  customEmojis: CustomEmoji[];
  customFlags: CustomFlag[];
  onRefreshOpnsenseGroups: (showLoadingSpinner?: boolean) => Promise<void>; // Made required
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (newSortBy: string, newSortDirection: 'asc' | 'desc') => void;
  // Add pagination props
  currentPage: number;
  pageSize: number | 'ALL';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | 'ALL') => void;
}

export function NetworkDisplayFiltersTab({
  groupFilters,
  setGroupFilters,
  isLoadingFilters,
  isRefreshing, // Destructure the prop
  isSavingFilters,
  setIsSavingFilters, // Destructure new prop

  newPattern,
  setNewPattern,
  newDescription,
  setNewDescription,
  newPatternType,
  setNewPatternType,
  allNetworkGroups,
  isLoadingAllGroups,
  errorLoadingAllGroups,
  opnsenseGroupDisplays, // Renamed prop
  customLucideIcons,
  customEmojis,
  customFlags,
  onRefreshOpnsenseGroups, // New prop
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: NetworkDisplayFiltersTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const [previewFilteredGroups, setPreviewFilteredGroups] = useState<NetworkGroup[]>([]); // Manage internally
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false); // Renamed local state for refresh button
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [initialGroupFilters, setInitialGroupFilters] = useState<GroupFilter[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [prevIsRefreshing, setPrevIsRefreshing] = useState(false);
  const [prevIsButtonRefreshing, setPrevIsButtonRefreshing] = useState(false);
  const [prevIsLoadingFilters, setPrevIsLoadingFilters] = useState(true);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);

  // Track initial state when component first mounts - capture the initial database state ONCE
  useEffect(() => {
    if (!hasInitialized) {
      // Capture whatever the initial state is (even if empty array)
      setInitialGroupFilters([...groupFilters]);
      setHasInitialized(true);
    }
  }, [groupFilters, hasInitialized]);

  // Reset initial state when initial data loading completes (isLoadingFilters transitions from true to false)
  useEffect(() => {
    if (prevIsLoadingFilters && !isLoadingFilters) {
      // Initial data load just completed, update initial state to the fresh data
      setInitialGroupFilters([...groupFilters]);
      // Mark that initial load is complete - change detection can now run
      setHasCompletedInitialLoad(true);
    }
    setPrevIsLoadingFilters(isLoadingFilters);
  }, [isLoadingFilters, prevIsLoadingFilters, groupFilters]);

  // Reset initial state when refresh completes (isRefreshing OR isButtonRefreshing transitions from true to false)
  useEffect(() => {
    const parentRefreshCompleted = prevIsRefreshing && !isRefreshing;
    const buttonRefreshCompleted = prevIsButtonRefreshing && !isButtonRefreshing;

    if (parentRefreshCompleted || buttonRefreshCompleted) {
      // Refresh just completed, update initial state to the fresh data
      setInitialGroupFilters([...groupFilters]);
    }

    setPrevIsRefreshing(isRefreshing);
    setPrevIsButtonRefreshing(isButtonRefreshing);
  }, [isRefreshing, prevIsRefreshing, isButtonRefreshing, prevIsButtonRefreshing, groupFilters]);

  // Check if there are unsaved changes
  // Suppress change detection while data is loading or refreshing
  const hasUnsavedChangesRaw = useUnsavedChanges(groupFilters, initialGroupFilters);

  // Suppress change detection until initial load completes AND while loading/refreshing
  // This prevents false positives during the initial data load
  const hasUnsavedChanges = (!hasCompletedInitialLoad || isLoadingFilters || isRefreshing || isButtonRefreshing) ? false : hasUnsavedChangesRaw;

  // Show toast notification when unsaved changes are first detected (but not during initial load)
  const [hasShownUnsavedToast, setHasShownUnsavedToast] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Track when initial loading is complete
  useEffect(() => {
    if (groupFilters.length > 0 || initialGroupFilters.length === 0) {
      // Add a small delay to ensure all initial state comparisons are complete
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [groupFilters.length, initialGroupFilters.length]);

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

  // Pagination logic
  const totalItems = groupFilters.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  const paginatedFilters = useMemo(() => {
    if (pageSize === 'ALL') {
      return groupFilters;
    }

    if (isPhone) {
      return groupFilters.slice(0, currentPage * pageSize);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return groupFilters.slice(startIndex, endIndex);
  }, [groupFilters, currentPage, pageSize, isPhone]);



  // Reset to first page when data length changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [groupFilters.length, currentPage, totalPages, onPageChange]);

  // Effect to update previewFilteredGroups when filters or allNetworkGroups change
  useEffect(() => {
    const updatePreview = async () => {
      if (allNetworkGroups.length > 0) {
        const globallyDisabledGroups: GloballyDisabledGroup[] = opnsenseGroupDisplays.filter(d => d.isGloballyDisabled).map(d => ({ id: d.id, opnsenseUuid: d.opnsenseUuid, createdAt: new Date(), updatedAt: new Date() }));
        const filtered = await filterNetworkGroups(allNetworkGroups, groupFilters, globallyDisabledGroups);
        setPreviewFilteredGroups(filtered);
      } else {
        setPreviewFilteredGroups([]);
      }
    };
    updatePreview();
  }, [allNetworkGroups, groupFilters, opnsenseGroupDisplays]); // Added opnsenseGroupDisplays to dependencies





  const handleAddPatternFromDialog = async () => {
    setIsAdding(true);
    try {
      if (newPattern.trim() === '') {
        toast({ title: "Validation Error", description: "Pattern cannot be empty.", variant: "destructive" });
        return;
      }
      const newFilter = {
        id: String(Date.now()),
        pattern: newPattern,
        description: newDescription || 'User-defined pattern',
        type: newPatternType,
      };
      const updatedFilters = [...groupFilters, newFilter];
      setGroupFilters(updatedFilters);
      setNewPattern('');
      setNewDescription('');
      setNewPatternType('include');
      setIsAddDialogOpen(false); // Close dialog
      toast({ title: "Pattern Added (Unsaved)", description: "New filter pattern added. Click 'Save Settings' to persist." });
    } finally {
      setIsAdding(false);
    }
  };



  const handleDeletePattern = (id: string) => {
    const updatedFilters = groupFilters.filter(filter => filter.id !== id);
    setGroupFilters(updatedFilters);
  };

  const handleSaveSettings = async () => {
    setIsSavingFilters(true); // Set to true at the beginning of the function
    const payload = groupFilters;
    try {
      const response = await fetch('/api/settings/group-filters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to Save Settings to API');
      }
      const result = await response.json();
      toast({
        title: "Settings Saved",
        description: result.message || "Group filter settings have been successfully saved to the database.",
        variant: "success",
      });

      // Update initial state to reflect saved changes
      setInitialGroupFilters([...groupFilters]);
    } catch (error) {
      logger.error("Failed to save network filters to API", error);
      const msg = error instanceof Error ? error.message : "Could not save network filters to the server.";
      toast({
        title: "Error Saving Settings",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSavingFilters(false); // Set to false in the finally block
    }
  };

  // Function to refresh OPNsense group data in-place
  const handleRefresh = useCallback(async () => {
    if (!onRefreshOpnsenseGroups) return;

    setIsButtonRefreshing(true); // Use local state for button
    try {
      // Call refresh with showLoadingSpinner=false for in-place update
      await onRefreshOpnsenseGroups(false);
    } catch (error) {
      logger.error("Failed to refresh OPNsense groups:", error);
      toast({
        title: "Error Refreshing",
        description: "Failed to refresh OPNsense group data.",
        variant: "destructive",
      });
    } finally {
      setIsButtonRefreshing(false); // Reset local state
    }
  }, [onRefreshOpnsenseGroups, toast]);

  return (
    <>
      <Card className="flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center text-xl md:text-2xl">
              <ClientOnly><ListFilter size={28} className="mr-2 text-primary" /></ClientOnly> Network Display Filters
            </CardTitle>
            <CardDescription className="hidden md:block">
              Define patterns to filter out unwanted network groups from the display.
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
                    {!isMobile && "Add Pattern"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Filter Pattern</DialogTitle>
                    <DialogDescription>
                      Add a new regex pattern to filter network groups.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Pattern Input */}
                    <div>
                      <label htmlFor="patternInput" className="block text-sm font-medium text-muted-foreground mb-1">Regex Pattern</label>
                      <Input
                        id="patternInput"
                        type="text"
                        placeholder="Enter regex pattern (e.g., ^GRP_.*)"
                        value={newPattern}
                        onChange={(e) => setNewPattern(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Use regex patterns to match network group names.
                      </p>
                    </div>

                    {/* Description Input */}
                    <div>
                      <label htmlFor="descriptionInput" className="block text-sm font-medium text-muted-foreground mb-1">Description (optional)</label>
                      <Input
                        id="descriptionInput"
                        type="text"
                        placeholder="Description (optional)"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Add a description to help identify this pattern.
                      </p>
                    </div>

                    {/* Pattern Type Select */}
                    <div>
                      <label htmlFor="patternTypeSelect" className="block text-sm font-medium text-muted-foreground mb-1">Type</label>
                      <select
                        id="patternTypeSelect"
                        value={newPatternType}
                        onChange={(e) => setNewPatternType(e.target.value as 'include' | 'exclude')}
                        className="block w-full p-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm h-10"
                      >
                        <option value="include">Include</option>
                        <option value="exclude">Exclude</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Include: Show matching groups. Exclude: Hide matching groups.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddPatternFromDialog} disabled={isAdding}>
                      {isAdding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Pattern
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={() => setIsPreviewModalOpen(true)} disabled={isLoadingAllGroups || isLoadingFilters} size={isMobile ? "icon" : "default"}>
                <ClientOnly><ListFilter className={cn("h-4 w-4", !isMobile && "mr-2")} /></ClientOnly>
                {!isMobile && "Preview"}
              </Button>
              <Button variant="outline" onClick={handleRefresh} disabled={isLoadingAllGroups || isButtonRefreshing || isRefreshing} size={isMobile ? "icon" : "default"}>
                <ClientOnly>
                  {(isButtonRefreshing || isRefreshing) ? ( // Show spinner if button is refreshing OR parent is refreshing
                    <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                  ) : (
                    <RefreshCcw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                  )}
                </ClientOnly>
                {!isMobile && "Refresh"}
              </Button>
              <Button
                onClick={handleSaveSettings}
                disabled={isSavingFilters || isLoadingFilters || !hasUnsavedChanges}
                size={isMobile ? "icon" : "default"}
                variant={hasUnsavedChanges ? "default" : "outline"}
                className={cn(
                  hasUnsavedChanges ? "bg-orange-600 hover:bg-orange-700" : "",
                  !isMobile && "min-w-[120px]" // Fixed width to prevent layout shifts
                )}
              >
                {isSavingFilters ? <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} /> : <Save className={cn("h-4 w-4", !isMobile && "mr-2")} />}
                {!isMobile && (hasUnsavedChanges ? "Save Changes" : "Save Settings")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2 md:p-6 pb-8 md:pb-6 relative flex flex-col flex-1 overflow-hidden">
          <h3 className="text-lg font-semibold mb-4">Current Filter Patterns</h3>
          {isLoadingFilters && groupFilters.length === 0 ? (
            <div className="flex items-center space-x-2 text-muted-foreground py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading filter definitions...</span>
            </div>
          ) : groupFilters.length > 0 ? (
            <>
              {isMobile ? (
                // Mobile View: Render as Cards
                <ScrollArea className="flex-1 min-h-0 pr-4">
                  <div className="space-y-4">
                    {paginatedFilters.map((filter) => (
                      <Card key={`card-${filter.id}`}>
                        <CardHeader className="p-3">
                          <CardTitle className="text-base break-all">
                            {filter.pattern}
                          </CardTitle>
                          {filter.description && (
                            <CardDescription>{filter.description}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Type:</span>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${filter.type === 'include' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}>
                              {filter.type.charAt(0).toUpperCase() + filter.type.slice(1)}
                            </span>
                          </div>
                          <div className="flex space-x-2">
                            <Button variant="destructive" size={isMobile ? "icon" : "sm"} onClick={() => handleDeletePattern(filter.id)} className={isMobile ? "" : "w-full"}>
                              <ClientOnly><XCircle className={cn("h-4 w-4", !isMobile && "mr-2")} /></ClientOnly>
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
                  <SortableTable<GroupFilter>
                    data={paginatedFilters}
                    columns={[
                      {
                        key: 'pattern',
                        label: 'Regex Pattern',
                        sortable: true,
                        headerClassName: "w-[35%]",
                        render: (filter) => <span className="font-mono break-all">{filter.pattern}</span>,
                      },
                      {
                        key: 'description',
                        label: 'Description',
                        sortable: true,
                        headerClassName: "w-[35%]",
                      },
                      {
                        key: 'type',
                        label: 'Type',
                        sortable: true,
                        headerClassName: "w-[15%]",
                        render: (filter) => (
                          <span className={`px-2 py-1 text-sm font-medium rounded-full ${filter.type === 'include' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                            {filter.type.charAt(0).toUpperCase() + filter.type.slice(1)}
                          </span>
                        ),
                      },
                      {
                        key: 'actions',
                        label: 'Actions',
                        sortable: false,
                        headerClassName: "w-[15%] text-right",
                        render: (filter) => (
                          <div className="text-right">
                            <Button variant="destructive" size={isMobile ? "icon" : "sm"} onClick={() => handleDeletePattern(filter.id)}>
                              <ClientOnly><XCircle className={cn("h-4 w-4", !isMobile && "mr-2")} /></ClientOnly>
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
          ) : (
            <p className="text-muted-foreground">No group filter patterns defined yet.</p>
          )}

          {/* Pagination Controls */}
          {groupFilters.length > 0 && (
            <>
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
                pageSizeOptions={[5, 10, 50, 100, 500]}
                showAllOption={true}
                isLoading={isRefreshing || isButtonRefreshing}
              />

            </>
          )}
        </CardContent>
      </Card >

      {/* Preview Modal */}
      < Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen} >
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ClientOnly><ListFilter size={24} className="mr-2 text-primary" /></ClientOnly>
              Network Display Filter Preview
            </DialogTitle>
            <DialogDescription>
              This shows which of your OPNsense network groups would be visible in the application based on the current filter definitions.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {(isLoadingAllGroups && allNetworkGroups.length === 0) ? (
              <div className="space-y-2 mt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : errorLoadingAllGroups ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error Loading Preview</AlertTitle>
                <AlertDescription>{errorLoadingAllGroups}</AlertDescription>
              </Alert>
            ) : allNetworkGroups.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Network Groups Found</AlertTitle>
                <AlertDescription>Could not find any OPNsense network groups to preview the filters against. Ensure groups exist in OPNsense.</AlertDescription>
              </Alert>
            ) : groupFilters.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Filters Defined</AlertTitle>
                <AlertDescription>No filters are currently defined. All {allNetworkGroups.length} groups would be shown. Add filters above to refine the list.</AlertDescription>
              </Alert>
            ) : previewFilteredGroups.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Matching Groups</AlertTitle>
                <AlertDescription>With the current filters, no network groups would be shown. Adjust your filters or check your OPNsense group names.</AlertDescription>
              </Alert>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Showing {previewFilteredGroups.length} of {allNetworkGroups.length} total groups based on current filters:
                  {isRefreshing && <Loader2 className="ml-2 h-4 w-4 inline-block animate-spin" />}
                </p>
                <div className="min-h-[120px] h-[calc(100vh-600px)] max-h-[400px] w-full rounded-md border p-3 overflow-y-auto">
                  <div className="space-y-4">
                    {previewFilteredGroups.map(group => {
                      const existingDisplay = opnsenseGroupDisplays.find(d => d.opnsenseUuid === group.uuid);
                      const friendlyName = existingDisplay ? existingDisplay.friendlyName : '-';
                      return (
                        <Card key={`preview-card-${group.uuid || group.id}`}>
                          <CardHeader className="p-3">
                            <CardTitle className="text-sm font-medium">{group.name}</CardTitle>
                            {friendlyName !== '-' && (
                              <CardDescription className="text-xs">Mapped Name: {friendlyName}</CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">Icon:</span>
                              <ClientOnly>
                                {(() => {
                                  const iconIdentifier = existingDisplay?.iconIdentifier;
                                  if (!iconIdentifier) {
                                    return <LucideIcons.Network className="h-5 w-5 text-muted-foreground" />;
                                  }
                                  const LucideIconComponent = LucideIcons[iconIdentifier as keyof typeof LucideIcons] as LucideIcon | undefined;
                                  if (LucideIconComponent) {
                                    return <LucideIconComponent className="h-5 w-5" />;
                                  }
                                  const customLucide = customLucideIcons.find(icon => icon.name === iconIdentifier);
                                  if (customLucide) {
                                    const IconComponent = customLucide.icon as LucideIcon;
                                    return <IconComponent className="h-5 w-5" />;
                                  }
                                  const emojiItem = [...generalEmojis, ...customEmojis].find(emoji => emoji.value === iconIdentifier);
                                  if (emojiItem) {
                                    return <span className="text-xl">{emojiItem.value}</span>;
                                  }
                                  const flagItem = [...flags, ...customFlags].find(flag => flag.value === iconIdentifier);
                                  if (flagItem) {
                                    return <span className="text-xl">{flagItem.value}</span>;
                                  }
                                  return <LucideIcons.Network className="h-5 w-5 text-muted-foreground" />;
                                })()}
                              </ClientOnly>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
                {(isLoadingAllGroups || isLoadingFilters) ? (
                  <Skeleton className="h-6 w-32 mt-4" />
                ) : (
                  <div className="mt-4 text-sm text-muted-foreground">
                    Showing {previewFilteredGroups.length} of {allNetworkGroups.length} records.
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog >

      {/* Remove the old preview card - it's now in the modal */}

    </>
  );
}