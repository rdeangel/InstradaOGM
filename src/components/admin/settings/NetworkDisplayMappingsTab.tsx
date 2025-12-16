'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Skeleton } from "@/components/ui/skeleton";

import { Network, Loader2, AlertCircle, RefreshCcw, XCircle, Save } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { OpnsenseGroupDisplay, CustomLucideIcon, CustomEmoji, CustomFlag } from '@/types/settings';
import type { NetworkGroup } from '@/types/opnsense';
import NetworkDisplayMappingsCard from './NetworkDisplayMappingsCard';
import { SortableTable } from "@/components/ui/sortable-table";
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Switch } from '@/components/ui/switch';
import { IconPicker } from '@/components/ui/icon-picker';
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGroupType } from '@/context/GroupTypeContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NetworkGroupHostAliasModal } from './NetworkGroupHostAliasModal';
import { useUnsavedOpnsenseGroupDisplayChanges } from '@/hooks/use-unsaved-changes';

interface HostAlias {
  uuid: string;
  name: string;
  content: string; // IP address
  description: string;
  enabled: string;
  hasArpEntry?: boolean; // Whether the IP has an active ARP entry
}

// Memoized input component to prevent focus loss
const MemoizedInput = React.memo(({
  uuid,
  initialValue,
  onValueChange
}: {
  uuid: string;
  initialValue: string;
  onValueChange: (uuid: string, value: string) => void;
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update local value when initial value changes (from parent state)
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue); // Immediate local update

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounced parent update
    timeoutRef.current = setTimeout(() => {
      onValueChange(uuid, newValue);
    }, 100);
  }, [uuid, onValueChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <Input
      type="text"
      placeholder="Enter friendly name"
      value={localValue}
      onChange={handleChange}
      className="w-full"
    />
  );
});

MemoizedInput.displayName = 'MemoizedInput';


interface NetworkDisplayMappingsTabProps {
  allOpnsenseGroups: NetworkGroup[]; // All groups from OPNsense, unfiltered
  opnsenseGroupDisplays: OpnsenseGroupDisplay[]; // Existing display mappings from DB
  setOpnsenseGroupDisplays: (mappings: OpnsenseGroupDisplay[]) => void;
  isLoadingOpnsenseGroups: boolean; // Loading state for all OPNsense groups
  errorLoadingOpnsenseGroups: string | null; // Error state for all OPNsense groups
  isLoadingOpnsenseGroupDisplays: boolean; // Loading state for display mappings
  isSavingOpnsenseGroupDisplays: boolean; // Saving state for display mappings
  setIsSavingOpnsenseGroupDisplays: (isSaving: boolean) => void; // New prop for setting saving state
  isRefreshing: boolean; // New prop to indicate in-place refresh from parent
  customLucideIcons: CustomLucideIcon[];
  customEmojis: CustomEmoji[];
  customFlags: CustomFlag[];

  onRefreshOpnsenseGroups: (showLoadingSpinner?: boolean) => Promise<void>; // Function to refresh OPNsense group data
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (newSortBy: string, newSortDirection: 'asc' | 'desc') => void;
  // Add pagination props
  currentPage: number;
  pageSize: number | 'ALL';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number | 'ALL') => void;
  // Add search props to persist across tab switches
  searchTerm: string;
  onSearchTermChange: (searchTerm: string) => void;
}

export function NetworkDisplayMappingsTab({
  allOpnsenseGroups,
  opnsenseGroupDisplays,
  setOpnsenseGroupDisplays,
  isLoadingOpnsenseGroups,
  errorLoadingOpnsenseGroups,
  isLoadingOpnsenseGroupDisplays,
  isSavingOpnsenseGroupDisplays,
  setIsSavingOpnsenseGroupDisplays, // Destructure new prop
  isRefreshing, // Destructure the prop
  customLucideIcons,
  customEmojis,
  customFlags,

  onRefreshOpnsenseGroups, // Destructure new prop
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchTermChange,
}: NetworkDisplayMappingsTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const { enableGroupTypes, singleSelectName, multiSelectName } = useGroupType();
  const [workingDisplays, setWorkingDisplays] = useState<OpnsenseGroupDisplay[]>([]);
  // searchTerm is now managed by parent component and passed as prop
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false); // Renamed local state for refresh button
  const [prevIsRefreshing, setPrevIsRefreshing] = useState(false);
  const [prevIsLoadingOpnsenseGroups, setPrevIsLoadingOpnsenseGroups] = useState(true);
  const [prevIsLoadingOpnsenseGroupDisplays, setPrevIsLoadingOpnsenseGroupDisplays] = useState(true);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);

  // Validation modal state
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [validationNetworkGroup, setValidationNetworkGroup] = useState<NetworkGroup | null>(null);
  const [validationHostAliases, setValidationHostAliases] = useState<HostAlias[]>([]);
  const [isLoadingValidation, setIsLoadingValidation] = useState(false);

  // Track which group is currently being checked for associations (for loading indicator)
  const [checkingGroupUuid, setCheckingGroupUuid] = useState<string | null>(null);

  // Pagination logic
  const filteredGroups = useMemo(() => {
    return allOpnsenseGroups.filter(group => {
      const display = workingDisplays.find(d => d.opnsenseUuid === group.uuid);
      const searchTermLower = (searchTerm || '').toLowerCase();
      if (searchTermLower === '') return true;
      const matchesName = group.name.toLowerCase().includes(searchTermLower);
      const matchesFriendlyName = display?.friendlyName?.toLowerCase().includes(searchTermLower);
      return matchesName || matchesFriendlyName;
    });
  }, [allOpnsenseGroups, workingDisplays, searchTerm]);

  const totalItems = filteredGroups.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  // Create a lookup map for workingDisplays to avoid repeated .find() calls
  const workingDisplaysMap = useMemo(() => {
    const map = new Map<string, OpnsenseGroupDisplay>();
    workingDisplays.forEach(display => {
      map.set(display.opnsenseUuid, display);
    });
    return map;
  }, [workingDisplays]);

  const paginatedGroups = useMemo(() => {
    if (pageSize === 'ALL') {
      return filteredGroups;
    }

    if (isPhone) {
      return filteredGroups.slice(0, currentPage * pageSize);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredGroups.slice(startIndex, endIndex);
  }, [filteredGroups, currentPage, pageSize, isPhone]);



  // Reset to first page when data length changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [filteredGroups.length, currentPage, totalPages, onPageChange]);

  // Effect to initialize workingDisplays when allOpnsenseGroups or initial OpnsenseGroupDisplays change
  // Effect to initialize workingDisplays when allOpnsenseGroups or opnsenseGroupDisplays change
  useEffect(() => {
    // Only initialize if workingDisplays is empty or if the source data has actually changed
    if (allOpnsenseGroups.length > 0 && workingDisplays.length === 0) {
      if (opnsenseGroupDisplays.length > 0) {
        // Merge existing display mappings with all OPNsense groups
        const mergedDisplays: OpnsenseGroupDisplay[] = allOpnsenseGroups.map(group => {
          const existingDisplay = opnsenseGroupDisplays.find(d => d.opnsenseUuid === group.uuid);
          return existingDisplay || {
            id: String(Date.now()), // Temporary ID for new mappings
            opnsenseUuid: group.uuid,
            friendlyName: '', // Default to empty string like mobile view
            iconIdentifier: null,
            isGloballyDisabled: false, // Default to not disabled
            groupType: 'SingleSelect' as const, // Default to SingleSelect
          } as OpnsenseGroupDisplay;
        });
        setWorkingDisplays(mergedDisplays);
      } else {
        // If no existing mappings, initialize with all OPNsense groups as non-disabled
        setWorkingDisplays(allOpnsenseGroups.map(group => ({
          id: String(Date.now()),
          opnsenseUuid: group.uuid,
          friendlyName: '',
          iconIdentifier: null,
          isGloballyDisabled: false,
          groupType: 'SingleSelect' as const,
        })) as OpnsenseGroupDisplay[]);
      }
    }
  }, [allOpnsenseGroups, opnsenseGroupDisplays, workingDisplays.length]);

  // Track when initial data loading completes
  useEffect(() => {
    const groupsLoadCompleted = prevIsLoadingOpnsenseGroups && !isLoadingOpnsenseGroups;
    const displaysLoadCompleted = prevIsLoadingOpnsenseGroupDisplays && !isLoadingOpnsenseGroupDisplays;

    if ((groupsLoadCompleted || displaysLoadCompleted) && !isLoadingOpnsenseGroups && !isLoadingOpnsenseGroupDisplays) {
      // Initial data load just completed - mark it
      setHasCompletedInitialLoad(true);
    }

    setPrevIsLoadingOpnsenseGroups(isLoadingOpnsenseGroups);
    setPrevIsLoadingOpnsenseGroupDisplays(isLoadingOpnsenseGroupDisplays);
  }, [isLoadingOpnsenseGroups, prevIsLoadingOpnsenseGroups, isLoadingOpnsenseGroupDisplays, prevIsLoadingOpnsenseGroupDisplays]);

  // Reset workingDisplays when refresh completes (isRefreshing transitions from true to false)
  useEffect(() => {
    if (prevIsRefreshing && !isRefreshing && allOpnsenseGroups.length > 0) {
      // Refresh just completed, reinitialize workingDisplays with fresh data
      if (opnsenseGroupDisplays.length > 0) {
        const mergedDisplays: OpnsenseGroupDisplay[] = allOpnsenseGroups.map(group => {
          const existingDisplay = opnsenseGroupDisplays.find(d => d.opnsenseUuid === group.uuid);
          return existingDisplay || {
            id: String(Date.now()),
            opnsenseUuid: group.uuid,
            friendlyName: '',
            iconIdentifier: null,
            isGloballyDisabled: false,
            groupType: 'SingleSelect' as const,
          } as OpnsenseGroupDisplay;
        });
        setWorkingDisplays(mergedDisplays);
      } else {
        setWorkingDisplays(allOpnsenseGroups.map(group => ({
          id: String(Date.now()),
          opnsenseUuid: group.uuid,
          friendlyName: '',
          iconIdentifier: null,
          isGloballyDisabled: false,
          groupType: 'SingleSelect' as const,
        })) as OpnsenseGroupDisplay[]);
      }
    }
    setPrevIsRefreshing(isRefreshing);
  }, [isRefreshing, prevIsRefreshing, allOpnsenseGroups, opnsenseGroupDisplays]);

  const handleMappingChange = useCallback((updatedMapping: OpnsenseGroupDisplay) => {
    setWorkingDisplays(prevDisplays => {
      // Create a Map for O(1) lookup instead of O(n) findIndex
      const displaysMap = new Map(prevDisplays.map(d => [d.opnsenseUuid, d]));
      displaysMap.set(updatedMapping.opnsenseUuid, updatedMapping);
      return Array.from(displaysMap.values());
    });
  }, []);

  // Check if there are unsaved changes using the reusable hook
  // Suppress change detection while data is loading or refreshing
  const hasUnsavedChangesRaw = useUnsavedOpnsenseGroupDisplayChanges(workingDisplays, opnsenseGroupDisplays);

  // Suppress change detection until initial load completes AND while loading/refreshing
  // This prevents false positives during the initial data load
  const hasUnsavedChanges = (!hasCompletedInitialLoad || isLoadingOpnsenseGroups || isLoadingOpnsenseGroupDisplays || isRefreshing || isButtonRefreshing) ? false : hasUnsavedChangesRaw;

  // Show toast notification when unsaved changes are first detected (but not during initial load)
  const [hasShownUnsavedToast, setHasShownUnsavedToast] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Track when initial loading is complete
  useEffect(() => {
    if (workingDisplays.length > 0 || opnsenseGroupDisplays.length === 0) {
      // Add a small delay to ensure all initial state comparisons are complete
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [workingDisplays.length, opnsenseGroupDisplays.length]);

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

  // Memoize the table data transformation to prevent unnecessary re-computations
  const tableData = useMemo(() => {
    return paginatedGroups.map(group => {
      const initialMapping = workingDisplaysMap.get(group.uuid);
      return {
        ...group,
        friendlyName: initialMapping?.friendlyName || '',
        iconIdentifier: initialMapping?.iconIdentifier || null,
        isGloballyDisabled: initialMapping?.isGloballyDisabled || false,
        groupType: initialMapping?.groupType || 'SingleSelect',
      };
    });
  }, [paginatedGroups, workingDisplaysMap]);

  // Memoized handlers for IconPicker and Switch to prevent re-creation on every render
  const handleIconChange = useCallback((uuid: string, newIcon: string | null) => {
    const currentMapping = workingDisplaysMap.get(uuid);
    const updated = {
      id: currentMapping?.id || String(Date.now()),
      opnsenseUuid: uuid,
      friendlyName: currentMapping?.friendlyName || '',
      iconIdentifier: newIcon,
      isGloballyDisabled: currentMapping?.isGloballyDisabled || false,
      groupType: currentMapping?.groupType || 'SingleSelect'
    };
    handleMappingChange(updated);
  }, [workingDisplaysMap, handleMappingChange]);

  // Function to check if a network group has host aliases assigned
  const checkHostAliasesForGroup = useCallback(async (networkGroupUuid: string): Promise<HostAlias[]> => {
    try {
      const response = await fetch(`/api/opnsense/network-groups/${networkGroupUuid}/host-aliases`);
      if (!response.ok) {
        throw new Error('Failed to fetch host aliases for network group');
      }
      const hostAliases = await response.json();
      return hostAliases;
    } catch (error) {
      logger.error('Error checking host aliases for group:', error);
      return [];
    }
  }, []);

  // Function to handle validation and show modal if needed
  const handleValidationCheck = useCallback(async (uuid: string, networkGroup: NetworkGroup) => {
    setIsLoadingValidation(true);
    setCheckingGroupUuid(uuid); // Set the checking state for this specific group
    try {
      const hostAliases = await checkHostAliasesForGroup(uuid);
      if (hostAliases.length > 0) {
        // Show validation modal
        setValidationNetworkGroup(networkGroup);
        setValidationHostAliases(hostAliases);
        setValidationModalOpen(true);
        return false; // Prevent toggle
      }
      return true; // Allow toggle
    } catch (error) {
      logger.error('Error during validation check:', error);
      toast({
        title: 'Validation Error',
        description: 'Failed to check host alias assignments.',
        variant: 'destructive',
      });
      return false; // Prevent toggle on error
    } finally {
      setIsLoadingValidation(false);
      setCheckingGroupUuid(null); // Clear the checking state
    }
  }, [checkHostAliasesForGroup, toast]);

  const handleGloballyDisabledChange = useCallback(async (uuid: string, checked: boolean) => {
    // If trying to enable (checked = true), check for host aliases first
    if (checked) {
      const networkGroup = allOpnsenseGroups.find(group => group.uuid === uuid);
      if (networkGroup) {
        const canToggle = await handleValidationCheck(uuid, networkGroup);
        if (!canToggle) {
          return; // Don't proceed with toggle if validation failed
        }
      }
    }

    const currentMapping = workingDisplaysMap.get(uuid);
    const updated = {
      id: currentMapping?.id || String(Date.now()),
      opnsenseUuid: uuid,
      friendlyName: currentMapping?.friendlyName || '',
      iconIdentifier: currentMapping?.iconIdentifier || null,
      isGloballyDisabled: checked,
      groupType: currentMapping?.groupType || 'SingleSelect'
    };
    handleMappingChange(updated);
  }, [workingDisplaysMap, handleMappingChange, allOpnsenseGroups, handleValidationCheck]);

  const handleInputValueChange = useCallback((uuid: string, value: string) => {
    const currentMapping = workingDisplaysMap.get(uuid);
    const updated = {
      id: currentMapping?.id || String(Date.now()),
      opnsenseUuid: uuid,
      friendlyName: value,
      iconIdentifier: currentMapping?.iconIdentifier || null,
      isGloballyDisabled: currentMapping?.isGloballyDisabled || false,
      groupType: currentMapping?.groupType || 'SingleSelect'
    };
    handleMappingChange(updated);
  }, [workingDisplaysMap, handleMappingChange]);

  const handleGroupTypeChange = useCallback((uuid: string, groupType: 'SingleSelect' | 'MultiSelect') => {
    const currentMapping = workingDisplaysMap.get(uuid);
    const updated = {
      id: currentMapping?.id || String(Date.now()),
      opnsenseUuid: uuid,
      friendlyName: currentMapping?.friendlyName || '',
      iconIdentifier: currentMapping?.iconIdentifier || null,
      isGloballyDisabled: currentMapping?.isGloballyDisabled || false,
      groupType: groupType
    };
    handleMappingChange(updated);
  }, [workingDisplaysMap, handleMappingChange]);



  // Modal handlers
  const handleRemoveAllHostAliases = useCallback(async () => {
    if (!validationNetworkGroup || !validationHostAliases.length) return;

    try {
      // Use batch operation to unassign all host aliases from the specific group
      const response = await fetch('/api/opnsense/host-group-management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'batch',
          operationType: 'unassign',
          hostAliases: validationHostAliases.map(alias => ({
            hostAliasName: alias.name
          })),
          groups: [{
            groupId: validationNetworkGroup.uuid
          }]
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to remove host aliases from group');
      }

      // Refresh the validation data
      const updatedHostAliases = await checkHostAliasesForGroup(validationNetworkGroup.uuid);
      setValidationHostAliases(updatedHostAliases);

      if (updatedHostAliases.length === 0) {
        // Now we can enable the toggle
        const currentMapping = workingDisplaysMap.get(validationNetworkGroup.uuid);
        const updated = {
          id: currentMapping?.id || String(Date.now()),
          opnsenseUuid: validationNetworkGroup.uuid,
          friendlyName: currentMapping?.friendlyName || '',
          iconIdentifier: currentMapping?.iconIdentifier || null,
          isGloballyDisabled: true,
          groupType: currentMapping?.groupType || 'SingleSelect'
        };
        handleMappingChange(updated);
      }
    } catch (error) {
      throw error; // Re-throw to be handled by the modal
    }
  }, [validationNetworkGroup, validationHostAliases, checkHostAliasesForGroup, workingDisplaysMap, handleMappingChange]);

  const handleDisableAnyway = useCallback(async () => {
    if (!validationNetworkGroup) return;

    try {
      // Enable the toggle anyway
      const currentMapping = workingDisplaysMap.get(validationNetworkGroup.uuid);
      const updated = {
        id: currentMapping?.id || String(Date.now()),
        opnsenseUuid: validationNetworkGroup.uuid,
        friendlyName: currentMapping?.friendlyName || '',
        iconIdentifier: currentMapping?.iconIdentifier || null,
        isGloballyDisabled: true,
        groupType: currentMapping?.groupType || 'SingleSelect'
      };
      handleMappingChange(updated);
    } catch (error) {
      throw error; // Re-throw to be handled by the modal
    }
  }, [validationNetworkGroup, workingDisplaysMap, handleMappingChange]);

  const fetchNetworkDisplayMappings = useCallback(async (showLoadingSpinner: boolean = true) => {
    // Always set refreshing to true when fetch starts
    // Using the local isButtonRefreshing state here for the button's spinner
    if (showLoadingSpinner) setIsButtonRefreshing(true);
    try {
      const fetchResponse = await fetch('/api/settings/opnsense-group-display');
      if (fetchResponse.ok) {
        const fetchedDisplays: OpnsenseGroupDisplay[] = await fetchResponse.json();
        setOpnsenseGroupDisplays(fetchedDisplays); // Update the parent state with the latest from DB
      } else {
        const errorData = await fetchResponse.json();
        throw new Error(errorData.error || 'Failed to fetch group display mappings');
      }
    } catch (error) {
      logger.error("Failed to load network display mappings:", error);
      const msg = error instanceof Error ? error.message : "Could not load network display mappings from the server.";
      toast({
        title: "Error Loading Network Display Mappings",
        description: msg,
        variant: "destructive",
      });
    } finally {
      if (showLoadingSpinner) {
        setIsButtonRefreshing(false); // Reset local state
      } else {
        setIsButtonRefreshing(false); // Reset local state
      }
    }
  }, [setOpnsenseGroupDisplays, toast]);

  // Effect to fetch data only on initial mount:
  // Remove this useEffect:
  // useEffect(() => {
  //   fetchNetworkDisplayMappings(true);
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);
  // useEffect(() => {
  //   if (isActive) {
  //     fetchNetworkDisplayMappings(true);
  //   }
  // }, [isActive, fetchNetworkDisplayMappings]);

  const handleSaveMappings = async () => {
    setIsSavingOpnsenseGroupDisplays(true); // Set saving state to true
    try {
      const response = await fetch('/api/settings/opnsense-group-display', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workingDisplays), // Send workingDisplays which now includes isGloballyDisabled
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save group mappings to API');
      }
      const result = await response.json();
      toast({
        title: "Mappings Saved",
        description: result.message || "Group mappings have been successfully saved to the database.",
        variant: "success",
      });
      // Re-fetch mappings to get database IDs and ensure state is in sync
      fetchNetworkDisplayMappings();
    } catch (error) {
      logger.error("Failed to save group mappings to API", error);
      const msg = error instanceof Error ? error.message : "Could not save group mappings to the server.";
      toast({
        title: "Error Saving Mappings",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSavingOpnsenseGroupDisplays(false); // Set saving state to false
    }
  };

  return (
    <Card className="flex flex-col flex-1 mb-0 min-h-0">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center text-xl md:text-2xl">
            <ClientOnly><Network size={28} className="mr-2 text-primary" /></ClientOnly> Network Display Mappings
          </CardTitle>
          <CardDescription className="hidden md:block">
            Map OPNsense network group aliases to user-friendly names and manage their global visibility.
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
            <Button variant="outline" onClick={async () => {
              setIsButtonRefreshing(true); // Use local state for button
              try {
                // Refresh both display mappings and OPNsense group data in-place
                await Promise.all([
                  fetchNetworkDisplayMappings(false),
                  onRefreshOpnsenseGroups(false)
                ]);
              } finally {
                setIsButtonRefreshing(false); // Use local state for button
              }
            }} disabled={isLoadingOpnsenseGroups || isLoadingOpnsenseGroupDisplays || isSavingOpnsenseGroupDisplays || isButtonRefreshing || isRefreshing} size={isMobile ? "icon" : "default"}>
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
              onClick={handleSaveMappings}
              disabled={isSavingOpnsenseGroupDisplays || isLoadingOpnsenseGroupDisplays || !hasUnsavedChanges}
              size={isMobile ? "icon" : "default"}
              variant={hasUnsavedChanges ? "default" : "outline"}
              className={cn(
                hasUnsavedChanges ? "bg-orange-600 hover:bg-orange-700" : "",
                !isMobile && "min-w-[120px]" // Fixed width to prevent layout shifts
              )}
            >
              {isSavingOpnsenseGroupDisplays ? <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} /> : <Save className={cn("h-4 w-4", !isMobile && "mr-2")} />}
              {!isMobile && (hasUnsavedChanges ? "Save Changes" : "Save Settings")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-6 pb-8 md:pb-6 relative flex flex-col flex-1 overflow-hidden">
        {isLoadingOpnsenseGroups || isLoadingOpnsenseGroupDisplays ? (
          <div className="space-y-2 mt-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : errorLoadingOpnsenseGroups ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Groups</AlertTitle>
            <AlertDescription>{errorLoadingOpnsenseGroups}</AlertDescription>
          </Alert>
        ) : (allOpnsenseGroups.length === 0 && opnsenseGroupDisplays.length === 0 && !isLoadingOpnsenseGroups && !isLoadingOpnsenseGroupDisplays) ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Groups Found</AlertTitle>
            <AlertDescription>No network groups found in OPNsense. Please check your OPNsense configuration.</AlertDescription>
          </Alert>
        ) : (
          // Render content only when not loading and no errors, and then check for empty data
          <>
            {/* This condition now relies on data being present in workingDisplays, which is set by useEffect */}
            {workingDisplays.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Mappings Found</AlertTitle>
                <AlertDescription>No network group mappings available. Add new mappings or ensure OPNsense groups exist.</AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Search Input */}
                <div className="mb-4 relative max-w-sm">
                  <Input
                    type="text"
                    placeholder="Search by OPNsense Group Name or Friendly Name..."
                    value={searchTerm || ''}
                    onChange={(e) => onSearchTermChange(e.target.value)}
                    className="w-full pr-8"
                  />
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                      onClick={() => onSearchTermChange("")}
                    >
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>

                {isMobile ? (
                  // Mobile View: Render as Cards
                  <ScrollArea className="flex-1 min-h-0 pr-4">
                    <div className="space-y-4">
                      {paginatedGroups.length === 0 ? (
                        <p className="text-center text-muted-foreground">No groups found.</p>
                      ) : (
                        paginatedGroups.map((group) => {
                          const initialMapping = workingDisplaysMap.get(group.uuid);
                          return (
                            <NetworkDisplayMappingsCard
                              key={`mapping-card-${group.uuid}`}
                              group={group}
                              initialMapping={initialMapping}
                              onMappingChange={handleMappingChange}

                              onRefreshData={fetchNetworkDisplayMappings}
                              customLucideIcons={customLucideIcons}
                              customEmojis={customEmojis}
                              customFlags={customFlags}
                              onValidationCheck={handleValidationCheck}
                            />
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  // Desktop View: Render as Table
                  <ScrollArea className="overflow-x-auto flex-1 min-h-0 pr-4">
                    <SortableTable<NetworkGroup & { friendlyName: string; iconIdentifier: string | null; isGloballyDisabled: boolean; groupType: 'SingleSelect' | 'MultiSelect' }>
                      data={tableData}
                      columns={[
                        {
                          key: 'name',
                          label: 'OPNsense Group Name',
                          sortable: true,
                          headerClassName: "w-[25%]",
                          render: (item) => {
                            const isDisabled = !item.enabled;
                            return (
                              <div className={`flex items-start justify-between ${isDisabled ? 'opacity-50' : ''}`}>
                                <div className="flex-1 min-w-0">
                                  <div className={`font-medium ${isDisabled ? 'text-muted-foreground' : ''}`}>{item.name}</div>
                                  {item.description && (
                                    <div className="text-sm text-muted-foreground mt-1 break-words">
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          },
                        },
                        {
                          key: 'friendlyName',
                          label: 'User-Friendly Group Name',
                          sortable: true,
                          headerClassName: "w-[25%]",
                          render: (item) => {
                            const currentMapping = workingDisplaysMap.get(item.uuid);
                            const initialValue = currentMapping?.friendlyName || '';

                            return (
                              <MemoizedInput
                                uuid={item.uuid}
                                initialValue={initialValue}
                                onValueChange={handleInputValueChange}
                              />
                            );
                          },
                        },
                        {
                          key: 'iconIdentifier',
                          label: 'Icon',
                          sortable: false,
                          headerClassName: "w-[15%]",
                          render: (item) => {
                            const currentMapping = workingDisplaysMap.get(item.uuid);
                            const iconIdentifier = currentMapping?.iconIdentifier || null;

                            return (
                              <ClientOnly>
                                <IconPicker
                                  value={iconIdentifier}
                                  onChange={(newIcon: string | null) => handleIconChange(item.uuid, newIcon)}
                                  additionalLucideIcons={customLucideIcons}
                                  additionalEmojis={customEmojis}
                                  additionalFlags={customFlags}
                                />
                              </ClientOnly>
                            );
                          },
                        },
                        // Conditionally include Group Type column only when group types are enabled
                        ...(enableGroupTypes ? [{
                          key: 'groupType',
                          label: 'Group Type',
                          sortable: true,
                          headerClassName: "w-[15%]",
                          render: (item: NetworkGroup) => {
                            const currentMapping = workingDisplaysMap.get(item.uuid);
                            const groupType = currentMapping?.groupType || 'SingleSelect';

                            return (
                              <select
                                value={groupType}
                                onChange={(e) => handleGroupTypeChange(item.uuid, e.target.value as 'SingleSelect' | 'MultiSelect')}
                                className="w-full px-2 py-1 text-sm border border-input rounded-md bg-background"
                              >
                                <option value="SingleSelect">{singleSelectName}</option>
                                <option value="MultiSelect">{multiSelectName}</option>
                              </select>
                            );
                          },
                        }] : []),
                        {
                          key: 'isGloballyDisabled',
                          label: 'Globally Disabled',
                          sortable: false,
                          headerClassName: "w-[15%] text-center",
                          render: (item) => {
                            const currentMapping = workingDisplaysMap.get(item.uuid);
                            const isGloballyDisabled = currentMapping?.isGloballyDisabled || false;
                            const isCheckingThisGroup = checkingGroupUuid === item.uuid;

                            return (
                              <div className="flex justify-center items-center gap-2">
                                {isCheckingThisGroup && (
                                  <ClientOnly>
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  </ClientOnly>
                                )}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <Switch
                                          checked={isGloballyDisabled}
                                          onCheckedChange={(checked: boolean) => handleGloballyDisabledChange(item.uuid, checked)}
                                          aria-label="Globally Disable Group"
                                          disabled={isCheckingThisGroup}
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {isCheckingThisGroup
                                          ? "Checking for associated devices..."
                                          : isGloballyDisabled
                                            ? "Group is globally disabled"
                                            : "Click to globally disable this group"
                                        }
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            );
                          },
                        },

                      ]}
                      sortBy={sortBy}
                      sortDirection={sortDirection}
                      onSortChange={onSortChange}
                    />
                  </ScrollArea>
                )}

                {/* Pagination Controls */}
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={totalItems}
                  filteredCount={totalItems}
                  pageSize={pageSize}
                  onPageChange={async (page) => {
                    setIsButtonRefreshing(true); // Reuse this state to trigger spinner on button
                    // Small delay to show the spinner and give visual feedback
                    await new Promise(resolve => setTimeout(resolve, 500));
                    onPageChange(page);
                    setIsButtonRefreshing(false);
                  }}
                  onPageSizeChange={onPageSizeChange}
                  isLoadMoreMode={isPhone}
                  pageSizeOptions={[5, 10, 50, 100, 500]}
                  showAllOption={true}
                  isLoading={isRefreshing || isButtonRefreshing} // Ensure isButtonRefreshing triggers loading state
                />
              </>
            )}
          </>
        )}
      </CardContent>

      {/* Validation Modal */}
      <NetworkGroupHostAliasModal
        isOpen={validationModalOpen}
        onClose={() => setValidationModalOpen(false)}
        networkGroup={validationNetworkGroup}
        hostAliases={validationHostAliases}
        onRemoveAll={handleRemoveAllHostAliases}
        onDisableAnyway={handleDisableAnyway}
        isLoading={isLoadingValidation}
      />
    </Card>
  );
}