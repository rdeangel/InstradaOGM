'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsPhone } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MacAddress } from '@/types/mac-tracking';
import { MacExclusion, EnhancedMacHistoryResponse } from '@/types/mac-exclusion';

import { MacGraphModal } from './MacGraphModal';

// Type for history entries from the API
interface MacIpHistoryEntry {
  id: string;
  macAddressId: string;
  ipAddress?: string; // Legacy format (single IP)
  ipAddresses?: string[]; // New format (multiple IPs in a configuration snapshot)
  networkInterface?: string;
  ipToInterfaceMap?: Record<string, string | null>; // Map of IP address to network interface
  firstSeen: Date;
  lastSeen: Date;
  detectionCount?: number;
  rawPeriodsCount?: number; // Number of activation periods in this snapshot
  isOpnsenseMac?: boolean;
  hostname?: string | null;
  hostAlias?: string | null;
  hostAliases?: Array<{ ipAddress: string; alias: string }>; // New format
  hostnames?: Array<{ ipAddress: string; hostname: string }>; // New format
  isDhcpReserved?: boolean;
  hasDhcpConflict?: boolean;
  isActive?: boolean;
}
import { Monitor, Network, Search, XCircle, Edit, Loader2, Activity } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

// User lookup interface
interface UserInfo {
  id: string;
  name: string;
  username?: string;
  email?: string;
}

// User lookup cache to avoid duplicate API calls
const userCache = new Map<string, UserInfo>();

interface MacHistoryDialogProps {
  macAddress: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}



export function MacHistoryDialog({ macAddress, open, onOpenChange }: MacHistoryDialogProps) {
  const { toast } = useToast();
  const isPhone = useIsPhone();
  const [macData, setMacData] = useState<MacAddress | null>(null);
  const [history, setHistory] = useState<MacIpHistoryEntry[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<MacIpHistoryEntry[]>([]);
  const [currentIps, setCurrentIps] = useState<Array<{
    ipAddress: string;
    networkInterface?: string;
    hostAlias?: string;
    isDhcpReserved: boolean;
    hasDhcpConflict: boolean;
    isActive: boolean;
  }>>([]);

  const [isLoading, setIsLoading] = useState(true);

  // Exclusion state
  const [exclusion, setExclusion] = useState<MacExclusion | null>(null);
  const [selectedExclusionMode, setSelectedExclusionMode] = useState<'FULL' | 'PARTIAL'>('FULL');

  const [isUpdatingExclusion, setIsUpdatingExclusion] = useState(false);
  const [exclusionReason, setExclusionReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState(false);

  // User resolution state
  const [userResolutions, setUserResolutions] = useState<Map<string, UserInfo>>(new Map());
  const [isResolvingUsers, setIsResolvingUsers] = useState(false);

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingExclusionState, setPendingExclusionState] = useState<boolean | null>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const [mobileCurrentIpsOpen, setMobileCurrentIpsOpen] = useState(false);

  const [desktopCurrentIpsModalOpen, setDesktopCurrentIpsModalOpen] = useState(false);

  const [mobileFullHistoryOpen, setMobileFullHistoryOpen] = useState(false);

  const [desktopFullHistoryOpen, setDesktopFullHistoryOpen] = useState(false);

  const [graphModalOpen, setGraphModalOpen] = useState(false);

  // IP Associations pagination and search state
  const [currentIpsSearchTerm, setCurrentIpsSearchTerm] = useState('');
  const [currentIpsPage, setCurrentIpsPage] = useState(1);
  const [currentIpsPageSize, setCurrentIpsPageSize] = useState(25);
  const [currentIpsTotalCount, setCurrentIpsTotalCount] = useState(0);
  const [currentIpsTotalPages, setCurrentIpsTotalPages] = useState(0);
  const [isCurrentIpsButtonRefreshing, setIsCurrentIpsButtonRefreshing] = useState(false);
  const [isHistoryButtonRefreshing, setIsHistoryButtonRefreshing] = useState(false);

  // User lookup function with caching
  const resolveUser = useCallback(async (userId: string): Promise<UserInfo | null> => {
    // Check cache first
    if (userCache.has(userId)) {
      return userCache.get(userId)!;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`);
      if (response.ok) {
        const userData = await response.json();
        const userInfo: UserInfo = {
          id: userData.id,
          name: userData.name,
          username: userData.username,
          email: userData.email
        };

        // Cache the result
        userCache.set(userId, userInfo);

        // Update component state
        setUserResolutions(prev => new Map(prev).set(userId, userInfo));

        return userInfo;
      }
    } catch (error) {
      console.error(`Failed to resolve user ${userId}:`, error);
    }

    // Return fallback if user not found
    const fallbackInfo: UserInfo = {
      id: userId,
      name: 'Unknown User',
      username: undefined,
      email: undefined
    };

    // Cache the fallback
    userCache.set(userId, fallbackInfo);
    setUserResolutions(prev => new Map(prev).set(userId, fallbackInfo));

    return fallbackInfo;
  }, []);

  // Resolve multiple users in parallel
  const resolveUsers = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) return;

    setIsResolvingUsers(true);

    try {
      // Filter out already cached users
      const uncachedIds = userIds.filter(id => !userCache.has(id));

      if (uncachedIds.length > 0) {
        // Resolve all uncached users in parallel
        await Promise.all(uncachedIds.map(id => resolveUser(id)));
      }
    } finally {
      setIsResolvingUsers(false);
    }
  }, [resolveUser]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  // Ref for scroll area to preserve scroll position
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Ref to track if this is the initial load
  const isInitialLoadRef = useRef(true);
  // Ref to track if fetch is in progress to prevent duplicate calls
  const isFetchingRef = useRef(false);

  // Filter history based on search term and update pagination
  // Note: currentPage is intentionally not in the dependency array to avoid infinite loops
  // when pagination state updates. The effect only needs to recalculate when the data changes.
  useEffect(() => {
    // All history entries are historical by nature (from MacIpHistoryEntry table)
    const historyToFilter = history;

    if (!searchTerm.trim()) {
      setFilteredHistory(historyToFilter);
    } else {
      const filtered = historyToFilter.filter(entry => {
        const searchLower = searchTerm.toLowerCase();
        // Handle both old format (ipAddress) and new format (ipAddresses array)
        const ips = entry.ipAddresses || (entry.ipAddress ? [entry.ipAddress] : []);
        const aliases = entry.hostAliases || (entry.hostAlias ? [{ ipAddress: entry.ipAddress!, alias: entry.hostAlias }] : []);
        const hostnames = entry.hostnames || (entry.hostname ? [{ ipAddress: entry.ipAddress!, hostname: entry.hostname }] : []);

        return ips.some(ip => ip.toLowerCase().includes(searchLower)) ||
          (entry.networkInterface && entry.networkInterface.toLowerCase().includes(searchLower)) ||
          aliases.some(a => a.alias.toLowerCase().includes(searchLower)) ||
          hostnames.some(h => h.hostname.toLowerCase().includes(searchLower));
      });
      setFilteredHistory(filtered);
      // Reset to page 1 when search changes
      setCurrentPage(1);
    }

    // Update pagination counts based on filtered results
    const filteredCount = searchTerm.trim() ?
      historyToFilter.filter(entry => {
        const searchLower = searchTerm.toLowerCase();
        const ips = entry.ipAddresses || (entry.ipAddress ? [entry.ipAddress] : []);
        const aliases = entry.hostAliases || (entry.hostAlias ? [{ ipAddress: entry.ipAddress!, alias: entry.hostAlias }] : []);
        const hostnames = entry.hostnames || (entry.hostname ? [{ ipAddress: entry.ipAddress!, hostname: entry.hostname }] : []);

        return ips.some(ip => ip.toLowerCase().includes(searchLower)) ||
          (entry.networkInterface && entry.networkInterface.toLowerCase().includes(searchLower)) ||
          aliases.some(a => a.alias.toLowerCase().includes(searchLower)) ||
          hostnames.some(h => h.hostname.toLowerCase().includes(searchLower));
      }).length : historyToFilter.length;

    setTotalCount(filteredCount);
    const newTotalPages = Math.ceil(filteredCount / pageSize);
    setTotalPages(newTotalPages);
  }, [history, searchTerm, pageSize]);

  // Get paginated results from filtered history
  const paginatedHistory = filteredHistory.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Filter and paginate current IPs
  useEffect(() => {
    const lowerSearchTerm = currentIpsSearchTerm.toLowerCase();
    const filtered = currentIpsSearchTerm.trim()
      ? currentIps.filter(ip =>
        ip.ipAddress?.toLowerCase().includes(lowerSearchTerm) ||
        ip.networkInterface?.toLowerCase().includes(lowerSearchTerm) ||
        ip.hostAlias?.toLowerCase().includes(lowerSearchTerm)
      )
      : currentIps;

    setCurrentIpsTotalCount(filtered.length);
    const newTotalPages = Math.ceil(filtered.length / currentIpsPageSize);
    setCurrentIpsTotalPages(newTotalPages);

    // Reset to page 1 when search changes
    if (currentIpsSearchTerm.trim()) {
      setCurrentIpsPage(1);
    }
  }, [currentIps, currentIpsSearchTerm, currentIpsPageSize]);

  // Get filtered current IPs
  const filteredCurrentIps = currentIpsSearchTerm.trim() ?
    currentIps.filter(ip =>
      ip.ipAddress?.toLowerCase().includes(currentIpsSearchTerm.toLowerCase()) ||
      ip.networkInterface?.toLowerCase().includes(currentIpsSearchTerm.toLowerCase()) ||
      ip.hostAlias?.toLowerCase().includes(currentIpsSearchTerm.toLowerCase())
    ) : currentIps;

  // Get paginated current IPs
  const paginatedCurrentIps = filteredCurrentIps.slice(
    (currentIpsPage - 1) * currentIpsPageSize,
    currentIpsPage * currentIpsPageSize
  );

  // Handler functions for current IPs pagination


  const handleCurrentIpsPageSizeChange = (newSize: number | 'ALL') => {
    if (newSize === 'ALL') {
      setCurrentIpsPageSize(currentIpsTotalCount);
    } else {
      setCurrentIpsPageSize(newSize);
    }
    setCurrentIpsPage(1);
  };

  // Reset IP Association search and pagination when modals close
  useEffect(() => {
    if (!mobileCurrentIpsOpen && !desktopCurrentIpsModalOpen) {
      setCurrentIpsSearchTerm('');
      setCurrentIpsPage(1);
    }
  }, [mobileCurrentIpsOpen, desktopCurrentIpsModalOpen]);

  const fetchMacHistory = useCallback(async () => {
    // Prevent duplicate API calls
    if (isFetchingRef.current) {

      return;
    }



    try {
      isFetchingRef.current = true;
      setIsLoading(true);

      // Fetch ALL history data without pagination - use high limit to get complete dataset
      const url = new URL(`/api/admin/mac-tracking/${encodeURIComponent(macAddress)}/history`, window.location.origin);
      url.searchParams.set('pageSize', '10000'); // High limit to get all data
      // Use MacIpActivationPeriod for detailed IP transition history
      url.searchParams.set('includeIpHistory', 'true');


      const response = await fetch(url.toString());

      if (response.ok) {
        const data: EnhancedMacHistoryResponse = await response.json();

        if (data.success) {


          setMacData(data.data.macAddress as MacAddress);
          setSelectedExclusionMode((data.data.exclusion?.exclusionMode as 'FULL' | 'PARTIAL') ?? 'FULL');
          // Normalize and sort history by lastSeen descending (newest -> oldest)
          // This matches the ordering used in the MAC table (most recent first)
          const rawHistory = (data.data.history as MacIpHistoryEntry[] | undefined) ?? [];
          const sortedHistory = [...rawHistory].sort((a, b) => {
            const aTs = new Date(a.lastSeen).getTime();
            const bTs = new Date(b.lastSeen).getTime();
            return bTs - aTs;
          });

          setHistory(sortedHistory);

          // Use live current IPs data from API response (same as main table)
          const rawCurrentIps = data.data.currentIps ?? [];
          const liveCurrentIps = rawCurrentIps.map(ip => ({
            ipAddress: ip.ipAddress,
            networkInterface: ip.networkInterface ?? undefined,
            hostAlias: undefined,
            isDhcpReserved: false,
            hasDhcpConflict: false,
            isActive: true
          }));
          setCurrentIps(liveCurrentIps);

          // Debug logging


          // Set exclusion state from API response
          setExclusion(data.data.exclusion || null);
          setExclusionReason(data.data.exclusion?.reason || '');

          // Resolve user IDs to names
          const userIdsToResolve: string[] = [];
          if (data.data.exclusion?.excludedBy) {
            userIdsToResolve.push(data.data.exclusion.excludedBy);
          }
          if (data.data.exclusion?.lastModifiedBy) {
            userIdsToResolve.push(data.data.exclusion.lastModifiedBy);
          }

          if (userIdsToResolve.length > 0) {
            await resolveUsers(userIdsToResolve);
          }
        }
      } else {
      }
    } catch (error) {
      console.error('Error fetching MAC history:', error);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [macAddress, resolveUsers]);

  // Helper function to format user display name
  const formatUserName = useCallback((userId: string | null | undefined, includeId: boolean = false): string => {
    if (!userId) return '';

    const userInfo = userResolutions.get(userId);
    if (userInfo) {
      if (userInfo.name === 'Unknown User') {
        return 'Unknown User';
      }
      return includeId ? `${userInfo.name} (${userId})` : userInfo.name;
    }

    // Still loading or not found
    return isResolvingUsers ? 'Loading...' : 'Unknown User';
  }, [userResolutions, isResolvingUsers]);

  // Handle exclusion toggle request (shows confirmation dialog)
  const handleToggleExclusionRequest = useCallback((enabled: boolean) => {
    setPendingExclusionState(enabled);
    setPendingReason(enabled ? exclusionReason : '');
    setReasonError('');

    if (enabled) {
      // When enabling exclusion, show confirmation dialog with reason input
      setShowConfirmDialog(true);
    } else {
      // When disabling exclusion, show simple confirmation dialog
      setShowConfirmDialog(true);
    }
  }, [exclusionReason]);

  // Handle actual exclusion toggle after confirmation
  const handleConfirmExclusionToggle = useCallback(async () => {
    if (pendingExclusionState === null) return;


    // Validate reason when enabling exclusion
    if (pendingExclusionState && !pendingReason.trim()) {
      setReasonError('Exclusion reason is required when enabling exclusion');
      return;
    }

    setIsUpdatingExclusion(true);
    setShowConfirmDialog(false);

    try {
      const requestBody: { enabled: boolean; reason?: string; exclusionMode?: 'FULL' | 'PARTIAL' } = {
        enabled: pendingExclusionState,
        reason: pendingExclusionState ? pendingReason : undefined,
        ...(pendingExclusionState ? { exclusionMode: selectedExclusionMode } : {})
      };


      const response = await fetch(`/api/admin/mac-exclusions/${encodeURIComponent(macAddress)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });


      if (response.ok) {
        const result = await response.json();

        if (result.success) {
          // Update local state with API result

          setExclusion(result.data);
          setExclusionReason(result.data.reason || '');
          setShowReasonInput(false);

          // Resolve user IDs from the updated exclusion
          const userIdsToResolve: string[] = [];
          if (result.data.excludedBy) {
            userIdsToResolve.push(result.data.excludedBy);
          }
          if (result.data.lastModifiedBy) {
            userIdsToResolve.push(result.data.lastModifiedBy);
          }

          if (userIdsToResolve.length > 0) {
            await resolveUsers(userIdsToResolve);
          }

          toast({
            title: "Success",
            description: pendingExclusionState
              ? "MAC exclusion enabled successfully. IP history will be cleaned up."
              : "MAC exclusion disabled successfully. IP history tracking will resume.",
          });

          // Notify other components (e.g., Analytics) to refresh
          try {
            window.dispatchEvent(new CustomEvent('mac-tracking:exclusion-updated', {
              detail: { macAddress, exclusion: result.data }
            }));
          } catch { }

        } else {
          throw new Error(result.message || 'Failed to toggle exclusion');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error toggling exclusion:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      toast({
        title: "Error",
        description: `Failed to toggle MAC exclusion: ${errorMessage}`,
        variant: "destructive",
      });

      // Re-show dialog on error so user can retry
      setShowConfirmDialog(true);
    } finally {
      setIsUpdatingExclusion(false);
      if (!showConfirmDialog) {
        setPendingExclusionState(null);
        setPendingReason('');
        setReasonError('');
      }
    }
  }, [macAddress, pendingExclusionState, pendingReason, selectedExclusionMode, resolveUsers, toast, showConfirmDialog]);

  // Handle exclusion toggle (legacy for direct calls)
  const handleToggleExclusion = useCallback(async (enabled: boolean, reason?: string) => {
    setIsUpdatingExclusion(true);
    try {
      const reqBody: { enabled: boolean; reason?: string; exclusionMode?: 'FULL' | 'PARTIAL' } = {
        enabled,
        reason,
        ...(enabled ? { exclusionMode: selectedExclusionMode } : {})
      };
      const response = await fetch(`/api/admin/mac-exclusions/${encodeURIComponent(macAddress)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setExclusion(result.data);
          setExclusionReason(result.data.reason || '');
          toast({
            title: "Success",
            description: enabled
              ? "MAC exclusion enabled successfully. IP history will be cleaned up."
              : "MAC exclusion disabled successfully. IP history tracking will resume.",
          });

          // Notify other components (e.g., Analytics) to refresh
          try {
            window.dispatchEvent(new CustomEvent('mac-tracking:exclusion-updated', {
              detail: { macAddress, exclusion: result.data }
            }));
          } catch { }

        } else {
          throw new Error(result.message || 'Failed to toggle exclusion');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error toggling exclusion:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      toast({
        title: "Error",
        description: `Failed to toggle MAC exclusion: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingExclusion(false);
    }
  }, [macAddress, toast, selectedExclusionMode]);

  // Effect to handle dialog opening and MAC address changes
  useEffect(() => {


    if (open && macAddress) {

      // Mark this as initial load
      isInitialLoadRef.current = true;
      // Reset pagination when dialog opens or MAC address changes
      setCurrentPage(1);
      setPageSize(25);
      // Clear existing data
      setHistory([]);
      setMacData(null);
      // CRITICAL FIX: Don't reset exclusion state on dialog open
      // Let API fetch determine the current exclusion state
      // setExclusion(null);
      // setExclusionReason('');
      setShowReasonInput(false);
      setTotalCount(0);
      setTotalPages(0);
      setSearchTerm('');
      // Reset confirmation dialog state
      setShowConfirmDialog(false);
      setPendingExclusionState(null);
      setPendingReason('');
      setReasonError('');
      setIsUpdatingExclusion(false);
    } else if (!open) {

      // Reset state when dialog closes
      isInitialLoadRef.current = true;
      isFetchingRef.current = false; // Reset fetch flag
      setIsLoading(true);
      setSearchTerm('');
      // CRITICAL FIX: Don't reset exclusion state on dialog close
      // This preserves exclusion data for the next dialog open
      // setExclusion(null);
      // setExclusionReason('');
      setShowReasonInput(false);
      // Reset confirmation dialog state
      setShowConfirmDialog(false);
      setPendingExclusionState(null);
      setPendingReason('');
      setReasonError('');
      setIsUpdatingExclusion(false);
    }
  }, [open, macAddress]);

  // Effect to handle all data fetching (initial and pagination)
  useEffect(() => {


    if (open && macAddress) {
      const isInitialLoad = isInitialLoadRef.current;
      if (isInitialLoad) {

        // Reset the flag after first use
        isInitialLoadRef.current = false;
      }
      // Fetch data with appropriate loading state
      fetchMacHistory();
    }
  }, [open, macAddress, fetchMacHistory]);

  // CRITICAL FIX: Completely remove exclusion refresh useEffect that was causing flapping
  // The exclusion data is already fetched in the initial API call, so no refresh is needed


  const handlePageSizeChange = (newPageSize: number | 'ALL') => {
    if (newPageSize === 'ALL') {
      setPageSize(totalCount);
    } else {
      setPageSize(newPageSize);
    }
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Effective exclusion mode helpers for conditional rendering
  const exclusionEnabled = exclusion?.enabled === true;
  const effectiveExclusionMode: 'FULL' | 'PARTIAL' | null = exclusionEnabled
    ? ((showReasonInput || showConfirmDialog) ? selectedExclusionMode : ((exclusion?.exclusionMode as 'FULL' | 'PARTIAL' | undefined) ?? 'FULL'))
    : null;
  // Show current IP modals whenever there are current IPs detected.
  // Previously this was gated to partial exclusion which prevented the "Show More" modal
  // from appearing even though inline IPs were visible.
  const shouldShowCurrentIps = currentIps.length > 0;
  const shouldShowHistory = !exclusionEnabled;


  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {

        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="max-w-4xl h-[85vh] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            MAC Address History
            {isLoading ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <>
                {!exclusion?.enabled ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs cursor-help">Tracked</Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs leading-snug">Full tracking enabled.</p>
                        <p className="text-xs leading-snug">Current IPs and history recorded.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (exclusion?.exclusionMode === 'PARTIAL' ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-xs cursor-help">Partial Tracking</Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs leading-snug">Current IPs tracked and visible.</p>
                        <p className="text-xs leading-snug">History is disabled; counter hidden.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="bg-gray-500 hover:bg-gray-600 text-white text-xs cursor-help">Excluded</Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs leading-snug">Tracking disabled.</p>
                        <p className="text-xs leading-snug">Current IPs and history are not recorded.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {shouldShowHistory && history.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setGraphModalOpen(true)}
                        >
                          <Activity className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View Activity Graph</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-left">
            View detailed history and manage settings for this device.
          </DialogDescription>


        </DialogHeader>

        <MacGraphModal
          open={graphModalOpen}
          onOpenChange={setGraphModalOpen}
          history={history}
          macAddress={macAddress}
        />

        {isLoading ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-48" />
            </div>
            <Separator />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ) : macData ? (
          <div className="pr-1 flex-1 min-h-0 overflow-hidden">
            <div className="flex flex-col gap-4 h-full min-h-0 overflow-hidden">
              {/* MAC Address Details */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">MAC Address:</span>
                  <span className="font-mono text-sm">{macData.macAddress.toUpperCase()}</span>
                </div>

                {macData.vendor && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Vendor:</span>
                    <span className="text-sm">{macData.vendor}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status:</span>
                  <div className="flex items-center gap-2">
                    {macData.isPrivacyMac && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs cursor-help">
                              Privacy
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Randomized privacy MAC address</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {macData.isOpnsenseMac && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-xs cursor-help">
                              OPNsense
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>OPNsense router/firewall interface MAC address</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {'hasMultipleIps' in macData && macData.hasMultipleIps && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs cursor-help">
                              Multi-IP
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs leading-snug">MAC has multiple active IP addresses.</p>
                            <p className="text-xs leading-snug">Common in keepalived or HA cluster configurations.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {!(exclusion?.enabled && exclusion?.exclusionMode === 'FULL') && (
                      <Badge variant={macData.isActive ? 'success' : 'destructive'}>
                        {macData.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">First Seen:</span>
                  <span className="text-sm">{new Date(macData.firstSeen).toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Last Seen:</span>
                  <div className="text-right">
                    <span className="text-sm">{new Date(macData.lastSeen).toLocaleString()}</span>
                    {!exclusion?.enabled && (
                      <div className="text-xs text-muted-foreground">
                        {Math.round((Date.now() - new Date(macData.lastSeen).getTime()) / 60000)}min ago
                      </div>
                    )}
                  </div>
                </div>

                {/* Current IPs Section - Only show if MAC is active */}
                {currentIps.length > 0 && macData?.isActive && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2 mb-2">
                      <Network className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Current IP{currentIps.length > 1 ? 's' : ''}:</span>
                    </div>
                    <div className="space-y-2">
                      {/* Show only first IP inline */}
                      {currentIps.slice(0, 1).map((ip, idx) => {
                        // Determine the interface to display
                        const displayInterface = ip.networkInterface || (currentIps.length === 1 ? macData?.currentInterface : undefined);

                        return (
                          <div key={`${idx}-${ip.ipAddress}`} className="bg-muted/50 p-2 rounded text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-mono">{ip.ipAddress}</span>
                              {displayInterface && (
                                <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                                  {displayInterface}
                                </Badge>
                              )}
                            </div>
                            {ip.hostAlias && (
                              <div className="text-xs text-muted-foreground mt-1"><span className="font-semibold">Host Alias:</span> {ip.hostAlias}</div>
                            )}
                            {/* DHCP and Conflict Badges */}
                            {(ip.hasDhcpConflict || ip.isDhcpReserved) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {ip.hasDhcpConflict && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs cursor-help">
                                          DHCP Conflict
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <p className="text-xs leading-snug">DHCP reservation mismatch detected.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {ip.isDhcpReserved && !ip.hasDhcpConflict && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs cursor-help">
                                          DHCP
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <p className="text-xs leading-snug">DHCP reservation exists for this IP.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Show More button if there are multiple IPs */}
                      {currentIps.length > 1 && (
                        <Button
                          onClick={() => setDesktopCurrentIpsModalOpen(true)}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          Show More ({currentIps.length - 1})
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Exclusion Management Section */}
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium">
                      MAC Exclusion Status
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {!exclusionEnabled
                        ? "This MAC address is fully tracked (history enabled)"
                        : effectiveExclusionMode === 'FULL'
                          ? "Tracking disabled for this MAC (excluded)"
                          : "History disabled; current IPs continue to be tracked"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={exclusion?.enabled || false}
                        onCheckedChange={handleToggleExclusionRequest}
                        disabled={isUpdatingExclusion}
                      />
                      {isUpdatingExclusion && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {exclusion?.enabled && (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="exclusion-mode-inline" className="text-sm font-medium">Exclusion Mode</Label>
                    <div className="flex items-center gap-2">
                      <Select value={selectedExclusionMode} onValueChange={(v) => setSelectedExclusionMode(v as 'FULL' | 'PARTIAL')}>
                        <SelectTrigger id="exclusion-mode-inline" className="w-[260px]">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FULL">Full exclusion (skip all tracking)</SelectItem>
                          <SelectItem value="PARTIAL">Partial exclusion (track current IPs, no history)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => handleToggleExclusion(true, (exclusion?.reason ?? undefined))} disabled={isUpdatingExclusion}>
                        {isUpdatingExclusion ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Update Mode'
                        )}
                      </Button>
                    </div>
                  </div>
                )}


                {/* Exclusion Reason */}
                {exclusion?.enabled && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="exclusion-reason" className="text-sm font-medium">
                        Exclusion Reason
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowReasonInput(!showReasonInput)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        {showReasonInput ? 'Cancel' : 'Edit'}
                      </Button>
                    </div>

                    {!showReasonInput ? (
                      <div className="p-3 bg-background border rounded-md">
                        <p className="text-sm">{exclusion.reason || 'No reason provided'}</p>
                        {exclusion.excludedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Excluded on {new Date(exclusion.excludedAt).toLocaleString()}
                            {exclusion.excludedBy && (
                              <span>
                                {' by '}
                                {isResolvingUsers && !userResolutions.has(exclusion.excludedBy) ? (
                                  <span className="inline-flex items-center">
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    Loading...
                                  </span>
                                ) : (
                                  formatUserName(exclusion.excludedBy, false)
                                )}
                              </span>
                            )}
                          </p>
                        )}
                      </div>


                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          id="exclusion-reason"
                          placeholder="Enter reason for exclusion..."
                          value={exclusionReason}
                          onChange={(e) => {
                            setExclusionReason(e.target.value);
                            if (reasonError) setReasonError('');
                          }}
                          className="min-h-[80px]"
                          maxLength={500}
                        />
                        <div className="space-y-2">
                          <Label htmlFor="inline-exclusion-mode" className="text-sm font-medium">
                            Exclusion Mode
                          </Label>
                          <Select
                            value={selectedExclusionMode}
                            onValueChange={(v) => setSelectedExclusionMode(v as 'FULL' | 'PARTIAL')}
                          >
                            <SelectTrigger id="inline-exclusion-mode" className="w-full">
                              <SelectValue placeholder="Select mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FULL">Full exclusion (skip all tracking)</SelectItem>
                              <SelectItem value="PARTIAL">Partial exclusion (track current IPs, no history)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {exclusionReason.length}/500 characters
                          </span>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowReasonInput(false);
                                setExclusionReason(exclusion?.reason || '');
                                setReasonError('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleToggleExclusion(true, exclusionReason)}
                              disabled={isUpdatingExclusion}
                            >
                              {isUpdatingExclusion ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Updating...
                                </>
                              ) : (
                                <>
                                  Update Reason
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                )}


                {/* Action Buttons - Removed redundant disable exclusion button */}
              </div>

              <Separator />

              {/* IP Association History */}
              <div className="flex-1 min-h-0 flex flex-col">
                {shouldShowCurrentIps && (
                  <>
                    {/* Mobile modal for Current IPs */}
                    <Dialog open={mobileCurrentIpsOpen} onOpenChange={setMobileCurrentIpsOpen}>
                      <DialogContent className="w-[95vw] max-w-none h-[85vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Network className="h-5 w-5" />
                            Current IP Associations ({currentIps.length})
                          </DialogTitle>
                        </DialogHeader>

                        <div className="flex-1 min-h-0 flex flex-col">
                          {/* Search Field */}
                          <div className="relative mb-3 shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search by IP address, interface, or host alias..."
                              value={currentIpsSearchTerm}
                              onChange={(e) => setCurrentIpsSearchTerm(e.target.value)}
                              className="pl-10 pr-10"
                            />
                            {currentIpsSearchTerm && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                onClick={() => setCurrentIpsSearchTerm("")}
                              >
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>

                          {/* Scrollable Content Area */}
                          <div className="border rounded-lg flex-1 min-h-0 overflow-hidden flex flex-col">
                            <div className="flex-1 min-h-0 overflow-y-auto">
                              <div className="space-y-3 p-2">
                                {paginatedCurrentIps.length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    {currentIpsSearchTerm ? 'No matching IP associations found' : 'No active IPs currently associated.'}
                                  </p>
                                ) : (
                                  paginatedCurrentIps.map((ip, idx) => {
                                    const displayInterface = ip.networkInterface || (currentIps.length === 1 ? macData?.currentInterface : undefined);
                                    return (
                                      <div key={`${idx}-${ip.ipAddress}`} className="border rounded-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <span className="font-mono text-sm font-medium">{ip.ipAddress}</span>
                                            {ip.hostAlias && (
                                              <div className="text-xs text-muted-foreground mt-1"><span className="font-semibold">Host Alias:</span> {ip.hostAlias}</div>
                                            )}
                                          </div>
                                          {displayInterface && (
                                            <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                                              {displayInterface}
                                            </Badge>
                                          )}
                                        </div>
                                        {/* DHCP and Conflict Badges */}
                                        <div className="flex flex-wrap gap-1">
                                          {ip.hasDhcpConflict && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs cursor-help">
                                                    DHCP Conflict
                                                  </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                  <p className="text-xs leading-snug">DHCP reservation mismatch detected.</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                          {ip.isDhcpReserved && !ip.hasDhcpConflict && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs cursor-help">
                                                    DHCP
                                                  </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                  <p className="text-xs leading-snug">DHCP reservation exists for this IP.</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Pagination Controls - Fixed at Bottom */}
                          <div className="mt-4 pt-4 border-t shrink-0">
                            <PaginationControls
                              currentPage={currentIpsPage}
                              totalPages={currentIpsTotalPages}
                              totalCount={currentIpsTotalCount}
                              filteredCount={currentIpsTotalCount}
                              pageSize={currentIpsPageSize}
                              onPageChange={async (page) => {
                                setIsCurrentIpsButtonRefreshing(true);
                                await new Promise(resolve => setTimeout(resolve, 500));
                                setCurrentIpsPage(page);
                                setIsCurrentIpsButtonRefreshing(false);
                              }}
                              onPageSizeChange={handleCurrentIpsPageSizeChange}
                              isLoadMoreMode={isPhone}
                              isLoading={isLoading || isCurrentIpsButtonRefreshing}
                              pageSizeOptions={[10, 25, 50, 100]}
                              showAllOption={false}
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {/* Desktop modal for Current IPs */}
                    <Dialog open={desktopCurrentIpsModalOpen} onOpenChange={setDesktopCurrentIpsModalOpen}>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Network className="h-5 w-5" />
                            Current IP Associations ({currentIps.length})
                          </DialogTitle>
                        </DialogHeader>

                        <div className="flex-1 min-h-0 flex flex-col">
                          {/* Search Field */}
                          <div className="relative mb-4 shrink-0">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search by IP address, interface, or host alias..."
                              value={currentIpsSearchTerm}
                              onChange={(e) => setCurrentIpsSearchTerm(e.target.value)}
                              className="pl-10 pr-10"
                            />
                            {currentIpsSearchTerm && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                                onClick={() => setCurrentIpsSearchTerm("")}
                              >
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>

                          {/* Scrollable Content Area */}
                          <div className="border rounded-lg flex-1 min-h-0 overflow-hidden flex flex-col">
                            <div className="flex-1 min-h-0 overflow-y-auto">
                              <div className="space-y-3 p-2">
                                {paginatedCurrentIps.length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    {currentIpsSearchTerm ? 'No matching IP associations found' : 'No active IPs currently associated.'}
                                  </p>
                                ) : (
                                  paginatedCurrentIps.map((ip, idx) => {
                                    const displayInterface = ip.networkInterface || (currentIps.length === 1 ? macData?.currentInterface : undefined);
                                    return (
                                      <div key={`${idx}-${ip.ipAddress}`} className="border rounded-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <span className="font-mono text-sm font-medium">{ip.ipAddress}</span>
                                            {ip.hostAlias && (
                                              <div className="text-xs text-muted-foreground mt-1"><span className="font-semibold">Host Alias:</span> {ip.hostAlias}</div>
                                            )}
                                          </div>
                                          {displayInterface && (
                                            <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                                              {displayInterface}
                                            </Badge>
                                          )}
                                        </div>
                                        {/* DHCP and Conflict Badges */}
                                        <div className="flex flex-wrap gap-1">
                                          {ip.hasDhcpConflict && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs cursor-help">
                                                    DHCP Conflict
                                                  </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                  <p className="text-xs leading-snug">DHCP reservation mismatch detected.</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                          {ip.isDhcpReserved && !ip.hasDhcpConflict && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs cursor-help">
                                                    DHCP
                                                  </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                  <p className="text-xs leading-snug">DHCP reservation exists for this IP.</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Pagination Controls - Fixed at Bottom */}
                          <div className="mt-4 pt-4 border-t shrink-0">
                            <PaginationControls
                              currentPage={currentIpsPage}
                              totalPages={currentIpsTotalPages}
                              totalCount={currentIpsTotalCount}
                              filteredCount={currentIpsTotalCount}
                              pageSize={currentIpsPageSize}
                              onPageChange={setCurrentIpsPage}
                              onPageSizeChange={handleCurrentIpsPageSizeChange}
                              isLoadMoreMode={isPhone}
                              pageSizeOptions={[10, 25, 50, 100]}
                              showAllOption={false}
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                )}

                {shouldShowHistory && (
                  <>
                    {/* Desktop button for Full History */}
                    <div className="hidden md:block mb-6">
                      <Button onClick={() => setDesktopFullHistoryOpen(true)} variant="outline" className="w-full flex items-center justify-center gap-2">
                        <Network className="h-4 w-4" />
                        Full History ({totalCount > 0 ? totalCount : history.length})
                      </Button>
                    </div>

                    {/* Desktop modal for Full History */}
                    <Dialog open={desktopFullHistoryOpen} onOpenChange={setDesktopFullHistoryOpen}>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                            <div className="flex items-center gap-2">
                              <Network className="h-5 w-5" />
                              <span>Full History ({totalCount > 0 ? totalCount : history.length})</span>
                              {history.length > 0 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 ml-1"
                                        onClick={() => setGraphModalOpen(true)}
                                      >
                                        <Activity className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>View Activity Graph</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <span className="hidden md:inline">&nbsp;-&nbsp;</span>
                            <span className="text-sm md:text-lg font-normal md:font-semibold text-muted-foreground md:text-foreground text-left md:pl-0">
                              MAC: {macAddress}
                            </span>
                          </DialogTitle>
                        </DialogHeader>

                        <div className="flex-1 min-h-0 flex flex-col">
                          {/* Search Field */}
                          <div className="relative mb-4 shrink-0">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search by IP address, interface, or host alias..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="pl-10 pr-10"
                            />
                            {searchTerm && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                                onClick={() => setSearchTerm("")}
                              >
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>

                          {/* Scrollable Content Area */}
                          <div className="border rounded-lg flex-1 min-h-0 overflow-hidden flex flex-col">
                            <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-y-auto">
                              <div className="p-3 space-y-3">
                                {paginatedHistory.length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    {searchTerm ? 'No matching IP associations found' : 'No IP associations found'}
                                  </p>
                                ) : (
                                  (() => {
                                    // Build a chronological sequence map for each IP
                                    // This will show 1x for oldest, incrementing to Nx for newest
                                    const ipSequenceMap: Record<string, Map<string, number>> = {}; // IP -> (timestamp -> sequence number)

                                    // Sort all history by lastSeen (oldest to newest) to assign sequence numbers
                                    const sortedHistory = [...history].sort((a, b) =>
                                      new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime()
                                    );

                                    sortedHistory.forEach(h => {
                                      const ips = h.ipAddresses || (h.ipAddress ? [h.ipAddress] : []);
                                      const timestamp = new Date(h.lastSeen).toISOString();

                                      ips.forEach(ip => {
                                        // eslint-disable-next-line security/detect-object-injection
                                        if (!ipSequenceMap[ip]) {
                                          // eslint-disable-next-line security/detect-object-injection
                                          ipSequenceMap[ip] = new Map();
                                        }
                                        // Assign the next sequence number for this IP
                                        // eslint-disable-next-line security/detect-object-injection
                                        const currentCount = ipSequenceMap[ip].size + 1;
                                        // eslint-disable-next-line security/detect-object-injection
                                        ipSequenceMap[ip].set(timestamp, currentCount);
                                      });
                                    });

                                    // Group paginated entries by identical firstSeen+lastSeen timestamps
                                    type Group = {
                                      key: string;
                                      firstSeen: string | Date;
                                      lastSeen: string | Date;
                                      entries: MacIpHistoryEntry[];
                                    };

                                    const groups: Group[] = [];

                                    paginatedHistory.forEach(entry => {
                                      const key = `${new Date(entry.firstSeen).toISOString()}|${new Date(entry.lastSeen).toISOString()}`;
                                      let g = groups.find(x => x.key === key);
                                      if (!g) {
                                        g = { key, firstSeen: entry.firstSeen, lastSeen: entry.lastSeen, entries: [] };
                                        groups.push(g);
                                      }
                                      g.entries.push(entry);
                                    });

                                    // Calculate total number of groups for reverse numbering
                                    const totalGroups = groups.length;

                                    return groups.map((group, gi) => {
                                      // Check if this is an inactivity period (no IPs)
                                      const hasIps = group.entries.some(entry => {
                                        const ips = entry.ipAddresses || (entry.ipAddress ? [entry.ipAddress] : []);
                                        return ips.length > 0;
                                      });

                                      if (!hasIps) {
                                        // Render inactivity period card
                                        const duration = new Date(group.lastSeen).getTime() - new Date(group.firstSeen).getTime();
                                        const durationMinutes = Math.round(duration / 60000);
                                        const durationHours = Math.round(duration / 3600000);
                                        const durationDisplay = durationHours > 0
                                          ? `${durationHours}h ${durationMinutes % 60}m`
                                          : `${durationMinutes}m`;
                                        // Calculate event number (oldest = #1)
                                        const eventNumber = totalGroups - gi;

                                        return (
                                          <div key={group.key + gi} className="border border-red-500/30 bg-red-500/5 rounded-lg p-3 space-y-2">
                                            <div className="flex items-start justify-between">
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">
                                                    Inactive Period
                                                  </Badge>
                                                  <span className="text-xs text-muted-foreground">
                                                    Duration: {durationDisplay}
                                                  </span>
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                  MAC address not detected in ARP table during this period
                                                </div>
                                              </div>
                                              <Badge variant="outline" className="text-xs ml-2">
                                                #{eventNumber}
                                              </Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              <div>First: {new Date(group.firstSeen).toLocaleString()}</div>
                                              <div>Last: {new Date(group.lastSeen).toLocaleString()}</div>
                                            </div>
                                          </div>
                                        );
                                      }

                                      // Render normal activity period card
                                      // Calculate duration for active period
                                      const duration = new Date(group.lastSeen).getTime() - new Date(group.firstSeen).getTime();
                                      const durationMinutes = Math.round(duration / 60000);
                                      const durationHours = Math.round(duration / 3600000);
                                      const durationDisplay = durationHours > 0
                                        ? `${durationHours}h ${durationMinutes % 60}m`
                                        : `${durationMinutes}m`;
                                      // Calculate event number (oldest = #1)
                                      const eventNumber = totalGroups - gi;

                                      return (
                                        <div key={group.key + gi} className="border border-green-500/30 bg-green-500/5 rounded-lg p-3 space-y-2">
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs">
                                                  Active Period
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                  Duration: {durationDisplay}
                                                </span>
                                              </div>
                                              {/* List multiple IPs for this timestamp group */}
                                              {group.entries.map((association, idx) => {
                                                // Handle both old format (ipAddress) and new format (ipAddresses array)
                                                const ips = association.ipAddresses || (association.ipAddress ? [association.ipAddress] : []);
                                                const aliases = association.hostAliases || [];
                                                const timestamp = new Date(association.lastSeen).toISOString();

                                                return ips.map((ip, ipIdx) => {
                                                  const alias = aliases.find(a => a.ipAddress === ip);
                                                  const hostname = association.hostnames?.find(h => h.ipAddress === ip);
                                                  // eslint-disable-next-line security/detect-object-injection
                                                  const sequenceNumber = ipSequenceMap[ip]?.get(timestamp) || 1;

                                                  return (
                                                    <div key={`${association.id}-${idx}-${ipIdx}`} className="mb-2">
                                                      <div className="flex items-center justify-between">
                                                        <div>
                                                          <span className="font-mono text-sm font-medium">{ip}</span>
                                                          {hostname && (
                                                            <div className="text-xs text-muted-foreground"><span className="font-semibold">Hostname:</span> {hostname.hostname}</div>
                                                          )}
                                                          {alias && (
                                                            <div className="text-xs text-muted-foreground"><span className="font-semibold">Host Alias:</span> {alias.alias}</div>
                                                          )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                          {/* eslint-disable-next-line security/detect-object-injection */}
                                                          {(association.ipToInterfaceMap?.[ip] || association.networkInterface) && (
                                                            <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                                                              {/* eslint-disable-next-line security/detect-object-injection */}
                                                              {association.ipToInterfaceMap?.[ip] || association.networkInterface}
                                                            </Badge>
                                                          )}
                                                          <Badge className="bg-gray-400 hover:bg-gray-500 text-white text-xs">
                                                            {sequenceNumber}x
                                                          </Badge>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  );
                                                });
                                              })}
                                            </div>
                                            <Badge variant="outline" className="text-xs ml-2">
                                              #{eventNumber}
                                            </Badge>
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            <div>First: {new Date(group.firstSeen).toLocaleString()}</div>
                                            <div>Last: {new Date(group.lastSeen).toLocaleString()}</div>
                                          </div>
                                        </div>
                                      );
                                    });
                                  })()
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Pagination Controls - Fixed at Bottom */}
                          <div className="mt-4 pt-4 border-t shrink-0">
                            <PaginationControls
                              currentPage={currentPage}
                              totalPages={totalPages}
                              totalCount={totalCount}
                              filteredCount={totalCount}
                              pageSize={pageSize}
                              onPageChange={async (page) => {
                                setIsHistoryButtonRefreshing(true);
                                await new Promise(resolve => setTimeout(resolve, 500));
                                setCurrentPage(page);
                                setIsHistoryButtonRefreshing(false);
                              }}
                              onPageSizeChange={handlePageSizeChange}
                              isLoadMoreMode={isPhone}
                              isLoading={isLoading || isHistoryButtonRefreshing}
                              pageSizeOptions={[10, 25, 50, 100]}
                              showAllOption={false}
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </div>

              {/* Mobile IP Association History trigger and modal (mobile only) */}
              {shouldShowHistory && (
                <div className="md:hidden mb-4">
                  <Button onClick={() => setMobileFullHistoryOpen(true)} variant="outline" className="w-full">
                    <Network className="h-4 w-4 mr-2" />
                    Full History ({totalCount > 0 ? totalCount : history.length})
                  </Button>

                  <Dialog open={mobileFullHistoryOpen} onOpenChange={setMobileFullHistoryOpen}>
                    <DialogContent className="w-[95vw] max-w-none h-[85vh] overflow-hidden flex flex-col">
                      <DialogHeader>
                        <DialogTitle className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                          <div className="flex items-center gap-2">
                            <Network className="h-5 w-5" />
                            <span>Full History ({totalCount > 0 ? totalCount : history.length})</span>
                            {history.length > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 ml-1"
                                      onClick={() => setGraphModalOpen(true)}
                                    >
                                      <Activity className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>View Activity Graph</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <span className="hidden md:inline">&nbsp;-&nbsp;</span>
                          <span className="text-sm md:text-lg font-normal md:font-semibold text-muted-foreground md:text-foreground text-left md:pl-0">
                            MAC: {macAddress}
                          </span>
                        </DialogTitle>
                      </DialogHeader>

                      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {/* Search Field */}
                        <div className="relative mb-3 shrink-0">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search by IP address, interface, or host alias..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-10"
                          />
                          {searchTerm && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                              onClick={() => setSearchTerm("")}
                            >
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>

                        {/* Scrollable Card List */}
                        <div className="border rounded-lg flex-1 min-h-0 overflow-hidden flex flex-col">
                          <div className="flex-1 min-h-0 overflow-y-auto">
                            <div className="p-3 space-y-3">
                              {paginatedHistory.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                  {searchTerm ? 'No matching IP associations found' : 'No IP associations found'}
                                </p>
                              ) : (
                                (() => {
                                  // Build a chronological sequence map for each IP
                                  const ipSequenceMap: Record<string, Map<string, number>> = {}; // IP -> (timestamp -> sequence number)

                                  // Sort all history by lastSeen (oldest to newest) to assign sequence numbers
                                  const sortedHistory = [...history].sort((a, b) =>
                                    new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime()
                                  );

                                  sortedHistory.forEach(h => {
                                    const ips = h.ipAddresses || (h.ipAddress ? [h.ipAddress] : []);
                                    const timestamp = new Date(h.lastSeen).toISOString();

                                    ips.forEach(ip => {
                                      // eslint-disable-next-line security/detect-object-injection
                                      if (!ipSequenceMap[ip]) {
                                        // eslint-disable-next-line security/detect-object-injection
                                        ipSequenceMap[ip] = new Map();
                                      }
                                      // Assign the next sequence number for this IP
                                      // eslint-disable-next-line security/detect-object-injection
                                      const currentCount = ipSequenceMap[ip].size + 1;
                                      // eslint-disable-next-line security/detect-object-injection
                                      ipSequenceMap[ip].set(timestamp, currentCount);
                                    });
                                  });

                                  // Group paginated entries by identical firstSeen+lastSeen timestamps
                                  type Group = {
                                    key: string;
                                    firstSeen: string | Date;
                                    lastSeen: string | Date;
                                    entries: MacIpHistoryEntry[];
                                  };

                                  const groups: Group[] = [];

                                  paginatedHistory.forEach(entry => {
                                    const key = `${new Date(entry.firstSeen).toISOString()}|${new Date(entry.lastSeen).toISOString()}`;
                                    let g = groups.find(x => x.key === key);
                                    if (!g) {
                                      g = { key, firstSeen: entry.firstSeen, lastSeen: entry.lastSeen, entries: [] };
                                      groups.push(g);
                                    }
                                    g.entries.push(entry);
                                  });

                                  // Calculate total number of groups for reverse numbering
                                  const totalGroups = groups.length;

                                  return groups.map((group, gi) => {
                                    // Check if this is an inactivity period (no IPs)
                                    const hasIps = group.entries.some(entry => {
                                      const ips = entry.ipAddresses || (entry.ipAddress ? [entry.ipAddress] : []);
                                      return ips.length > 0;
                                    });

                                    if (!hasIps) {
                                      // Render inactivity period card
                                      const duration = new Date(group.lastSeen).getTime() - new Date(group.firstSeen).getTime();
                                      const hours = Math.floor(duration / (1000 * 60 * 60));
                                      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                                      const durationDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                                      // Calculate event number (oldest = #1)
                                      const eventNumber = totalGroups - gi;

                                      return (
                                        <div key={group.key + gi} className="border border-red-500/30 bg-red-500/5 rounded-lg p-3 space-y-2">
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">
                                                  Inactive Period
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                  Duration: {durationDisplay}
                                                </span>
                                              </div>
                                              <div className="text-sm text-muted-foreground">
                                                MAC address not detected in ARP table during this period
                                              </div>
                                            </div>
                                            <Badge variant="outline" className="text-xs ml-2">
                                              #{eventNumber}
                                            </Badge>
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            <div>First: {new Date(group.firstSeen).toLocaleString()}</div>
                                            <div>Last: {new Date(group.lastSeen).toLocaleString()}</div>
                                          </div>
                                        </div>
                                      );
                                    }

                                    // Render normal activity period card
                                    // Calculate duration for active period
                                    const duration = new Date(group.lastSeen).getTime() - new Date(group.firstSeen).getTime();
                                    const hours = Math.floor(duration / (1000 * 60 * 60));
                                    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                                    const durationDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                                    // Calculate event number (oldest = #1)
                                    const eventNumber = totalGroups - gi;

                                    return (
                                      <div key={group.key + gi} className="border border-green-500/30 bg-green-500/5 rounded-lg p-3 space-y-2">
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                              <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs">
                                                Active Period
                                              </Badge>
                                              <span className="text-xs text-muted-foreground">
                                                Duration: {durationDisplay}
                                              </span>
                                            </div>
                                            {/* List multiple IPs for this timestamp group */}
                                            {group.entries.map((association, idx) => {
                                              // Handle both old format (ipAddress) and new format (ipAddresses array)
                                              const ips = association.ipAddresses || (association.ipAddress ? [association.ipAddress] : []);
                                              const aliases = association.hostAliases || [];
                                              const timestamp = new Date(association.lastSeen).toISOString();

                                              return ips.map((ip, ipIdx) => {
                                                const alias = aliases.find(a => a.ipAddress === ip);
                                                const hostname = association.hostnames?.find(h => h.ipAddress === ip);
                                                // eslint-disable-next-line security/detect-object-injection
                                                const sequenceNumber = ipSequenceMap[ip]?.get(timestamp) || 1;

                                                return (
                                                  <div key={`${association.id}-${idx}-${ipIdx}`} className="mb-2">
                                                    <div className="flex items-center justify-between">
                                                      <div>
                                                        <span className="font-mono text-sm font-medium">{ip}</span>
                                                        {hostname && (
                                                          <div className="text-xs text-muted-foreground"><span className="font-semibold">Hostname:</span> {hostname.hostname}</div>
                                                        )}
                                                        {alias && (
                                                          <div className="text-xs text-muted-foreground"><span className="font-semibold">Host Alias:</span> {alias.alias}</div>
                                                        )}
                                                      </div>
                                                      <div className="flex items-center gap-2">
                                                        {/* eslint-disable-next-line security/detect-object-injection */}
                                                        {(association.ipToInterfaceMap?.[ip] || association.networkInterface) && (
                                                          <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                                                            {/* eslint-disable-next-line security/detect-object-injection */}
                                                            {association.ipToInterfaceMap?.[ip] || association.networkInterface}
                                                          </Badge>
                                                        )}
                                                        <Badge className="bg-gray-400 hover:bg-gray-500 text-white text-xs">
                                                          {sequenceNumber}x
                                                        </Badge>
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              });
                                            })}
                                          </div>
                                          <Badge variant="outline" className="text-xs ml-2">
                                            #{eventNumber}
                                          </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          <div>First: {new Date(group.firstSeen).toLocaleString()}</div>
                                          <div>Last: {new Date(group.lastSeen).toLocaleString()}</div>
                                        </div>
                                      </div>
                                    );
                                  });
                                })()
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Pagination Controls - Fixed at Bottom */}
                        <div className="mt-4 pt-4 border-t shrink-0">
                          <PaginationControls
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalCount={totalCount}
                            filteredCount={totalCount}
                            pageSize={pageSize}
                            onPageChange={async (page) => {
                              setIsHistoryButtonRefreshing(true);
                              await new Promise(resolve => setTimeout(resolve, 500));
                              setCurrentPage(page);
                              setIsHistoryButtonRefreshing(false);
                            }}
                            onPageSizeChange={handlePageSizeChange}
                            isLoadMoreMode={isPhone}
                            isLoading={isLoading || isHistoryButtonRefreshing}
                            pageSizeOptions={[10, 25, 50, 100]}
                            showAllOption={false}
                          />
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div >
              )
              }

            </div >
          </div >

        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Failed to load MAC address history</p>
          </div>
        )}
      </DialogContent >

      {/* Confirmation Dialog */}
      < Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog} >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingExclusionState ? 'Enable MAC Exclusion' : 'Disable MAC Exclusion'}
            </DialogTitle>
            <DialogDescription>
              {pendingExclusionState
                ? 'This MAC address will be excluded from tracking and will not appear in future scans. (Existing history will be deleted!)'
                : 'This MAC address will be re-enabled for tracking and will appear in future scans.'
              }
            </DialogDescription>
          </DialogHeader>

          {pendingExclusionState && (
            <div className="space-y-3">
              <Label htmlFor="confirm-reason" className="text-sm font-medium">
                Exclusion Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="confirm-reason"
                placeholder="Please enter a reason for excluding this MAC address..."
                value={pendingReason}
                onChange={(e) => {
                  setPendingReason(e.target.value);
                  if (reasonError) setReasonError('');
                }}
                className="min-h-[100px]"
                maxLength={500}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {pendingReason.length}/500 characters
                </span>
                {reasonError && (
                  <span className="text-xs text-red-500">{reasonError}</span>
                )}

                <div className="space-y-2">
                  <Label htmlFor="exclusion-mode" className="text-sm font-medium">
                    Exclusion Mode
                  </Label>
                  <select
                    id="exclusion-mode"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedExclusionMode}
                    onChange={(e) => setSelectedExclusionMode(e.target.value as 'FULL' | 'PARTIAL')}
                  >
                    <option value="FULL">Full exclusion (skip all tracking)</option>
                    <option value="PARTIAL">Partial exclusion (track current IPs, no history)</option>
                  </select>
                </div>

              </div>
            </div>
          )}

          <DialogFooter>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirmDialog(false);
                  setPendingExclusionState(null);
                  setPendingReason('');
                  setReasonError('');
                }}
                disabled={isUpdatingExclusion}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmExclusionToggle}
                disabled={isUpdatingExclusion || (pendingExclusionState === true && !pendingReason.trim())}
                className={pendingExclusionState ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                {isUpdatingExclusion ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {pendingExclusionState ? 'Enabling...' : 'Disabling...'}
                  </>
                ) : (
                  <>
                    {pendingExclusionState ? 'Enable Exclusion' : 'Disable Exclusion'}
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog >
    </Dialog >
  );
}
