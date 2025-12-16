'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, Loader2, AlertCircle, RefreshCw, Square, CircleOff, RefreshCcw, XCircle, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge'; // Corrected syntax
import { ClientOnly } from '@/components/util/ClientOnly';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile'; // Corrected syntax
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { NetworkGroup, OpnsenseVpnEntry, VpnMapping } from '@/types/opnsense';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import type { OpnsenseGroupDisplay } from '@/types/settings';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SortableTable } from "@/components/ui/sortable-table";
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OpnsenseIpsecConnection } from '@/types/opnsense'; // Import specific VPN types for casting
import { VpnClientType } from '@prisma/client'; // Import VpnClientType directly from prisma client

import { isOpnsenseVpnSession, isOpnsenseWireguardClient, isOpnsenseIpsecConnection } from '@/types/opnsense'; // Import type guards

// Memoized input component to prevent focus loss and improve performance
const MemoizedVpnInput = React.memo(({
  vpnId,
  initialValue,
  onValueChange,
  disabled
}: {
  vpnId: string;
  initialValue: string;
  onValueChange: (vpnId: string, value: string) => void;
  disabled: boolean;
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

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
      onValueChange(vpnId, newValue);
    }, 100);
  }, [vpnId, onValueChange]);

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
      disabled={disabled}
    />
  );
});

MemoizedVpnInput.displayName = 'MemoizedVpnInput';

// Self-contained VPN Mappings Card component
const VpnMappingsCard = React.memo(({
  vpn,
  networkGroupOptions,
  onFriendlyNameChange,
  onNetworkGroupChange,
  onStopVpn,
  onRestartVpn,
  isSavingMappings,
  getVpnStatusText,
  isOpnsenseIpsecConnection
}: {
  vpn: OpnsenseVpnEntry & { id: string; vpnUuid: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null; vpnDisplayName: string; isStopping: boolean; isRestarting: boolean; };
  networkGroupOptions: { value: string; label: string; isDisabled: boolean; }[];
  onFriendlyNameChange: (vpnId: string, value: string) => void;
  onNetworkGroupChange: (vpnId: string, value: string | null) => void;
  onStopVpn: (vpnId: string, vpnType: VpnClientType) => void;
  onRestartVpn: (vpnId: string, vpnType: VpnClientType) => void;
  isSavingMappings: boolean;
  getVpnStatusText: (vpn: OpnsenseVpnEntry & { id: string; vpnUuid: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null; vpnDisplayName: string; isStopping: boolean; isRestarting: boolean; }) => string;
  isOpnsenseIpsecConnection: (vpn: OpnsenseVpnEntry & { id: string; vpnUuid: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null; vpnDisplayName: string; isStopping: boolean; isRestarting: boolean; }) => boolean;
}) => {
  const [currentVpn, setCurrentVpn] = useState(vpn);
  const debounceTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Helper function to check if VPN is connected for IPsec
  const isIpsecConnected = () => {
    if (isOpnsenseIpsecConnection(currentVpn)) {
      return (currentVpn as OpnsenseIpsecConnection).connected;
    }
    return false;
  };

  // Update local state when prop changes
  useEffect(() => {
    setCurrentVpn(vpn);
  }, [vpn]);

  const handleFriendlyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFriendlyName = e.target.value;
    setCurrentVpn(prev => ({ ...prev, friendlyName: newFriendlyName }));

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      onFriendlyNameChange(vpn.id!, newFriendlyName);
    }, 100);
  };

  const handleNetworkGroupChange = (value: string | null) => {
    const newGroupId = value === '__NONE__' ? null : value;
    setCurrentVpn(prev => ({
      ...prev,
      opnsenseNetworkGroupId: newGroupId,
      opnsenseNetworkGroup: newGroupId ? { name: networkGroupOptions.find(g => g.value === newGroupId)?.label || '' } : null
    }));
    onNetworkGroupChange(vpn.id!, newGroupId);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const statusText = getVpnStatusText(currentVpn);

  // Define formatBytes function for data display
  const formatBytes = (bytes: number): string => {
    if (isNaN(bytes)) return 'N/A';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  };

  return (
    <Card key={`vpn-card-${currentVpn.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{currentVpn.vpnDisplayName}</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              {currentVpn.type}
            </div>
          </div>
          <div className="flex-shrink-0">
            {(() => {
              let statusVariant: 'default' | 'success' | 'destructive' | 'outline' = 'outline';

              if (statusText === 'connected') {
                statusVariant = 'success';
              } else if (statusText === 'disconnected') {
                statusVariant = 'destructive';
              } else if (statusText === 'disabled') {
                return (
                  <Badge className="bg-gray-500 hover:bg-gray-600 text-white">
                    {statusText}
                  </Badge>
                );
              }
              return (
                <Badge variant={statusVariant}>
                  {statusText}
                </Badge>
              );
            })()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <label htmlFor={`friendly-name-${currentVpn.id}`} className="block text-sm font-medium text-muted-foreground mb-1">Friendly Name</label>
          <Input
            id={`friendly-name-${currentVpn.id}`}
            type="text"
            placeholder="Enter friendly name"
            value={currentVpn.friendlyName || ''}
            onChange={handleFriendlyNameChange}
            className="w-full"
            disabled={currentVpn.isStopping || currentVpn.isRestarting || isSavingMappings}
          />
        </div>
        <div>
          <label htmlFor={`vpn-group-${currentVpn.id}`} className="block text-sm font-medium text-muted-foreground mb-1">Network Group</label>
          <Select
            value={currentVpn.opnsenseNetworkGroupId || '__NONE__'}
            onValueChange={handleNetworkGroupChange}
            disabled={currentVpn.isStopping || currentVpn.isRestarting || isSavingMappings}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Group" />
            </SelectTrigger>
            <SelectContent>
              {networkGroupOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.isDisabled}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Data Transfer</label>
          <div className="text-sm font-medium text-foreground">
            {isOpnsenseVpnSession(currentVpn) ? (
              <>RX: {formatBytes(parseInt(currentVpn.bytes_received))} • TX: {formatBytes(parseInt(currentVpn.bytes_sent))}</>
            ) : isOpnsenseWireguardClient(currentVpn) ? (
              <>RX: {formatBytes(currentVpn.transfer_rx)} • TX: {formatBytes(currentVpn.transfer_tx)}</>
            ) : isOpnsenseIpsecConnection(currentVpn) ? (
              <>RX: {formatBytes(currentVpn['bytes-in'])} • TX: {formatBytes(currentVpn['bytes-out'])}</>
            ) : (
              'N/A'
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Address</label>
          <div className="text-sm font-medium text-foreground">
            {isOpnsenseVpnSession(currentVpn) ? (
              <>{currentVpn.virtual_address || 'N/A'} <br /> ({currentVpn.real_address || 'N/A'})</>
            ) : isOpnsenseWireguardClient(currentVpn) ? (
              <>{currentVpn.tunneladdress || 'N/A'}</>
            ) : isOpnsenseIpsecConnection(currentVpn) ? (
              <>{currentVpn['local-addrs'] || 'N/A'} <br /> ({currentVpn['remote-addrs'] || 'N/A'})</>
            ) : (
              'N/A'
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Connected Since</label>
          <div className="text-sm font-medium text-foreground">
            {isOpnsenseVpnSession(currentVpn) ? (
              currentVpn.connected_since || 'N/A'
            ) : isOpnsenseIpsecConnection(currentVpn) ? (
              (() => {
                const ipsecVpn = currentVpn as OpnsenseIpsecConnection;
                if (ipsecVpn['install-time']) {
                  const installTimeSeconds = parseInt(ipsecVpn['install-time']);
                  if (!isNaN(installTimeSeconds)) {
                    // Calculate connection start time from current time minus duration
                    const connectionStartTimeSeconds = Math.floor(Date.now() / 1000) - installTimeSeconds;
                    const date = new Date(connectionStartTimeSeconds * 1000); // Convert seconds to milliseconds
                    // Format as YYYY-MM-DD HH:MM:SS
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                  }
                }
                return 'N/A';
              })()
            ) : (
              'N/A'
            )}
          </div>
        </div>
        <div className="flex items-center justify-between space-x-2">
          <span className="text-sm font-medium text-muted-foreground">Actions</span>
          <div className="flex space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    key={`stop-${currentVpn.id}-${currentVpn.isStopping ? 'processing' : 'idle'}`}
                    variant="destructive"
                    size="sm"
                    onClick={() => onStopVpn(currentVpn.id!, currentVpn.type as VpnClientType)}
                    disabled={currentVpn.isStopping || currentVpn.isRestarting || (currentVpn.type !== 'OpenVPN' && currentVpn.type !== 'WireGuard' && currentVpn.type !== 'IPsec') || (isOpnsenseIpsecConnection(currentVpn) && !isIpsecConnected()) || (currentVpn.type === 'WireGuard' && currentVpn.enabled === '0') || (currentVpn.type === 'OpenVPN' && (currentVpn.status === 'down' || currentVpn.status === 'disconnected'))}
                  >
                    {currentVpn.isStopping ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : currentVpn.type === 'WireGuard' ? (
                      <CircleOff className="h-3 w-3 mr-1" />
                    ) : (
                      <Square className="h-3 w-3 mr-1" />
                    )}
                    {currentVpn.type === 'WireGuard' ? 'Disable' : 'Stop'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{currentVpn.type === 'WireGuard' ? 'Disable VPN' : 'Stop VPN'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    key={`restart-${currentVpn.id}-${currentVpn.isRestarting ? 'processing' : 'idle'}`}
                    variant="default"
                    size="sm"
                    onClick={() => onRestartVpn(currentVpn.id!, currentVpn.type as VpnClientType)}
                    disabled={currentVpn.isStopping || currentVpn.isRestarting || (currentVpn.type !== 'OpenVPN' && currentVpn.type !== 'WireGuard' && currentVpn.type !== 'IPsec')}
                  >
                    {currentVpn.isRestarting ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Restart
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Restart VPN</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

VpnMappingsCard.displayName = 'VpnMappingsCard';

interface VpnMappingsTabProps {
  allNetworkGroups: NetworkGroup[]; // All groups from OPNsense, unfiltered
  opnsenseGroupDisplays: OpnsenseGroupDisplay[]; // Existing display mappings from DB
  isLoadingAllGroups: boolean; // Loading state for all OPNsense groups
  // Removed unused errorLoadingAllGroups parameter
  vpnMappings: (OpnsenseVpnEntry & { id: string; vpnUuid: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null; vpnDisplayName: string; isStopping: boolean; isRestarting: boolean; })[];
  isLoadingInitialData: boolean;
  isRefreshing: boolean;
  vpnMappingsError: string | null;
  onRefresh: () => void;
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

export function VpnMappingsTab({
  allNetworkGroups,
  opnsenseGroupDisplays,
  isLoadingAllGroups,
  vpnMappings,
  isLoadingInitialData,
  isRefreshing,
  vpnMappingsError,
  onRefresh,
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchTermChange,
}: VpnMappingsTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  // Remove all internal fetch logic/state for VPN mappings
  // Use isLoadingInitialData for skeleton, isRefreshing for button spinner, onRefresh for refresh button
  // Use vpnMappings for table data
  // Use vpnMappingsError for error display
  // Remove all internal vpnSessions state
  // Use vpnMappings prop for all table data and logic
  // Initialize and update workingVpnSessions from vpnMappings prop
  const [workingVpnSessions, setWorkingVpnSessions] = useState(vpnMappings);
  const [initialWorkingVpnSessions, setInitialWorkingVpnSessions] = useState(vpnMappings);
  const [isSavingMappings, setIsSavingMappings] = useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false); // Add local state for button refresh
  const [prevIsRefreshing, setPrevIsRefreshing] = useState(isRefreshing);
  const [prevIsLoadingInitialData, setPrevIsLoadingInitialData] = useState(isLoadingInitialData);

  // Track if initial data load is complete
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  // const [refreshKey, setRefreshKey] = useState(0);

  // Reset initial state when initial data loading completes (isLoadingInitialData transitions from true to false)
  // This ensures we capture the initial state AFTER data loads, not during the skeleton phase
  useEffect(() => {
    if (prevIsLoadingInitialData && !isLoadingInitialData) {
      // Initial data load just completed: hydrate working from server data, then capture initial
      const fresh = vpnMappings.map(vpn => ({ ...vpn, isStopping: false, isRestarting: false }));
      setWorkingVpnSessions(fresh);
      setInitialWorkingVpnSessions([...fresh]);
      // Delay enabling change detection to ensure all state updates have settled
      const timer = setTimeout(() => {
        setHasCompletedInitialLoad(true);
      }, 100);
      return () => clearTimeout(timer);
    }
    setPrevIsLoadingInitialData(isLoadingInitialData);
  }, [isLoadingInitialData, prevIsLoadingInitialData, vpnMappings]);

  // Reset initial state when refresh completes (isRefreshing transitions from true to false)
  useEffect(() => {
    if (prevIsRefreshing && !isRefreshing) {
      // Refresh just completed: hydrate working from server data, then capture initial
      const fresh = vpnMappings.map(vpn => ({ ...vpn, isStopping: false, isRestarting: false }));
      setWorkingVpnSessions(fresh);
      setInitialWorkingVpnSessions([...fresh]);
      // Force re-render by updating refresh key
      // setRefreshKey(prev => prev + 1);
    }
    setPrevIsRefreshing(isRefreshing);
  }, [isRefreshing, prevIsRefreshing, vpnMappings]);


  // Fallback: if the tab mounts with data already loaded (isLoadingInitialData === false),
  // capture the initial state once and enable change detection after a short delay.
  useEffect(() => {
    if (!isLoadingInitialData && !hasCompletedInitialLoad && initialWorkingVpnSessions.length === 0 && vpnMappings.length > 0) {
      // No loading phase and no initial captured yet: hydrate from server and capture
      const fresh = vpnMappings.map(vpn => ({ ...vpn, isStopping: false, isRestarting: false }));
      setWorkingVpnSessions(fresh);
      setInitialWorkingVpnSessions([...fresh]);
      const timer = setTimeout(() => {
        setHasCompletedInitialLoad(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoadingInitialData, hasCompletedInitialLoad, initialWorkingVpnSessions.length, vpnMappings]);

  // Check if there are unsaved changes - only compare user-modifiable fields
  // Suppress change detection while data is loading or refreshing
  const hasUnsavedChangesRaw = useUnsavedChanges(
    workingVpnSessions,
    initialWorkingVpnSessions,
    (working, initial) => {
      // Only compare the fields that users can actually modify
      if (working.length !== initial.length) return true;

      for (let i = 0; i < working.length; i++) {
        const workingVpn = working[i];
        const initialVpn = initial.find(v => v.id === workingVpn.id);

        if (!initialVpn) return true;

        // Only compare user-modifiable fields
        if (workingVpn.friendlyName !== initialVpn.friendlyName ||
          workingVpn.opnsenseNetworkGroupId !== initialVpn.opnsenseNetworkGroupId) {
          return true;
        }
      }

      return false;
    }
  );

  // Suppress change detection until initial load completes AND while loading/refreshing
  // This prevents false positives during the initial data load
  const hasUnsavedChanges = (!hasCompletedInitialLoad || isLoadingInitialData || isRefreshing) ? false : hasUnsavedChangesRaw;
  const canSave = hasUnsavedChanges && !isSavingMappings;

  // Show toast notification when unsaved changes are first detected (but not during initial load)
  const [hasShownUnsavedToast, setHasShownUnsavedToast] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Track when initial loading is complete
  useEffect(() => {
    if (workingVpnSessions.length > 0 && initialWorkingVpnSessions.length > 0) {
      // Add a small delay to ensure all initial state comparisons are complete
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [initialWorkingVpnSessions.length, workingVpnSessions.length]);

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

  // Helper function to determine VPN status text for display and search
  const getVpnStatusText = useCallback((vpn: OpnsenseVpnEntry & { id: string; vpnUuid: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null; vpnDisplayName: string; isStopping: boolean; isRestarting: boolean; }) => {
    if (isOpnsenseVpnSession(vpn)) {
      if (vpn.status === 'up' || vpn.status === 'connected' || vpn.enabled === '1') {
        return 'connected';
      } else if (vpn.status === 'down' || vpn.status === 'disconnected' || vpn.enabled === '0') {
        return 'disconnected';
      }
    } else if (isOpnsenseIpsecConnection(vpn)) {
      const ipsecVpn = vpn as OpnsenseIpsecConnection;
      if (ipsecVpn.connected) {
        return 'connected';
      } else {
        return 'disconnected';
      }
    } else { // Wireguard
      if (vpn.enabled === '0') {
        return 'disabled';
      } else if (vpn.status === 'online') {
        return 'connected';
      } else if (vpn.status === 'offline') {
        return 'disconnected';
      }
    }
    return 'N/A';
  }, []);

  // Pagination logic
  const filteredVpnSessions = useMemo(() => {
    return workingVpnSessions.filter(vpn => {
      const vpnDisplayName = vpn.vpnDisplayName || '';
      const vpnStatus = getVpnStatusText(vpn);
      const mappedGroup = vpn.opnsenseNetworkGroup?.name || '';
      const friendlyName = vpn.friendlyName || '';

      const searchLower = (searchTerm || '').toLowerCase();
      if (searchLower === '') return true;
      return vpnDisplayName.toLowerCase().includes(searchLower) ||
        vpnStatus.toLowerCase().includes(searchLower) ||
        mappedGroup.toLowerCase().includes(searchLower) ||
        friendlyName.toLowerCase().includes(searchLower);
    });
  }, [workingVpnSessions, searchTerm, getVpnStatusText]);

  const totalItems = filteredVpnSessions.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  const paginatedVpnSessions = useMemo(() => {
    if (pageSize === 'ALL') {
      return filteredVpnSessions;
    }

    if (isPhone) {
      return filteredVpnSessions.slice(0, currentPage * pageSize);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredVpnSessions.slice(startIndex, endIndex);
  }, [filteredVpnSessions, currentPage, pageSize, isPhone]);



  // Reset to first page when data length changes or when current page is greater than total pages
  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0) {
      onPageChange(1);
    }
  }, [filteredVpnSessions.length, currentPage, totalPages, onPageChange]);



  const networkGroupOptions = React.useMemo(() => {
    const options = allNetworkGroups.map(group => ({
      value: group.id,
      label: opnsenseGroupDisplays.find(display => display.opnsenseUuid === group.id)?.friendlyName || group.name,
      isDisabled: false, // Add required isDisabled property
    }));
    // Add a "No Group" option
    options.unshift({ value: '__NONE__', label: 'No Group', isDisabled: false });
    return options;
  }, [allNetworkGroups, opnsenseGroupDisplays]);

  // Removed useEffect for fetchVpnMappings

  // Removed isProcessingVpn state change log
  // useEffect(() => {
  //   logger.debug('[Frontend] isProcessingVpn state changed:', isProcessingVpn);
  // }, [isProcessingVpn]);

  const handleFriendlyNameChange = useCallback((vpnUuid: string, newFriendlyName: string) => {
    setWorkingVpnSessions(prev => prev.map(vpn =>
      vpn.id === vpnUuid ? { ...vpn, friendlyName: newFriendlyName } : vpn
    ));
  }, []);

  const handleNetworkGroupChange = useCallback((vpnUuid: string, newOpnsenseNetworkGroupId: string | null) => {
    setWorkingVpnSessions(prev => prev.map(vpn => {
      const updatedVpn = vpn.id === vpnUuid ? {
        ...vpn,
        opnsenseNetworkGroupId: newOpnsenseNetworkGroupId,
        opnsenseNetworkGroup: newOpnsenseNetworkGroupId ? { name: allNetworkGroups.find(g => g.id === newOpnsenseNetworkGroupId)?.name || '' } : null
      } : vpn;
      return updatedVpn;
    }));
  }, [allNetworkGroups]);

  const handleSaveSettings = useCallback(async () => {
    setIsSavingMappings(true);
    try {
      const mappingsToSave: VpnMapping[] = [];
      for (const workingVpn of workingVpnSessions) {
        const originalVpn = vpnMappings.find(v => v.id === workingVpn.id);

        // Determine the OPNsense VPN Name for validation
        const opnsenseVpnName = isOpnsenseVpnSession(workingVpn) ? workingVpn.description || 'N/A' : isOpnsenseIpsecConnection(workingVpn) ? workingVpn.phase1desc || workingVpn.name || 'N/A' : workingVpn.name || 'N/A';

        // Check for friendly name validation (cannot be same as OPNsense VPN Name)
        if (workingVpn.friendlyName && workingVpn.friendlyName.toLowerCase() === (opnsenseVpnName?.toLowerCase() ?? '')) {
          toast({
            title: "Validation Error",
            description: `Friendly VPN Name for "${opnsenseVpnName}" cannot be the same as OPNsense VPN Name.`,
            variant: "destructive",
          });
          setIsSavingMappings(false);
          return; // Stop saving if validation fails
        }

        // Check for friendly name uniqueness across all working VPN sessions
        const duplicateFriendlyName = workingVpnSessions.some(
          (otherVpn) =>
            otherVpn.id !== workingVpn.id &&
            otherVpn.friendlyName &&
            workingVpn.friendlyName &&
            otherVpn.friendlyName.toLowerCase() === workingVpn.friendlyName.toLowerCase()
        );

        if (duplicateFriendlyName) {
          toast({
            title: "Validation Error",
            description: `Friendly VPN Name "${workingVpn.friendlyName}" is already in use by another VPN. Please choose a unique name.`,
            variant: "destructive",
          });
          setIsSavingMappings(false);
          return; // Stop saving if validation fails
        }

        // Only include mappings that have changed
        if (
          workingVpn.friendlyName !== originalVpn?.friendlyName ||
          workingVpn.opnsenseNetworkGroupId !== originalVpn?.opnsenseNetworkGroupId
        ) {
          mappingsToSave.push({
            id: workingVpn.mappingId || '',
            vpnUuid: workingVpn.id!,
            vpnName: opnsenseVpnName!, // Use the determined OPNsense VPN Name
            vpnClient: workingVpn.type as VpnClientType,
            friendlyName: workingVpn.friendlyName,
            opnsenseNetworkGroupId: (workingVpn.opnsenseNetworkGroupId === '__NONE__' || !allNetworkGroups.some(g => g.id === workingVpn.opnsenseNetworkGroupId)) ? null : workingVpn.opnsenseNetworkGroupId,
          });
        }
      }

      if (mappingsToSave.length === 0) {
        toast({
          title: "No Changes",
          description: "No VPN mapping changes to save.",
          variant: "default",
        });
        setIsSavingMappings(false);
        return;
      }

      const response = await fetch('/api/opnsense/vpn-mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mappingsToSave),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save VPN mappings');
      }

      toast({
        title: "VPN Mappings Saved",
        description: "All changes to VPN mappings have been saved successfully.",
        variant: "success",
      });

      // Update initial state to reflect saved changes
      setInitialWorkingVpnSessions([...workingVpnSessions]);


    } catch (error) {
      logger.error("Failed to save VPN mappings:", error);
      const msg = error instanceof Error ? error.message : "Could not save VPN mappings to the server.";
      toast({
        title: "Error Saving VPN Mappings",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSavingMappings(false);
    }
  }, [vpnMappings, workingVpnSessions, toast, allNetworkGroups]); // Added allNetworkGroups to dependencies

  const handleRestartVpn = useCallback(async (vpnUuid: string, vpnType: VpnClientType) => {
    // Capture the VPN's display name at the start
    const vpnToRestart = workingVpnSessions.find(vpn => vpn.id === vpnUuid);
    const vpnDisplayName = vpnToRestart?.vpnDisplayName || 'N/A';

    setWorkingVpnSessions(prev => prev.map(vpn =>
      vpn.id === vpnUuid ? { ...vpn, isRestarting: true, isStopping: false } : vpn
    ));

    try {
      let endpoint = '';
      if (vpnType === VpnClientType.OpenVPN) {
        endpoint = '/api/opnsense/openvpn-service/restart';
      } else if (vpnType === VpnClientType.WireGuard) {
        endpoint = '/api/opnsense/wireguard/service/restart';
      } else if (vpnType === VpnClientType.IPsec) {
        endpoint = '/api/opnsense/ipsec-service/restart';
      } else {
        throw new Error(`Unsupported VPN type for restart: ${vpnType}`);
      }

      logger.debug(`[Frontend] Sending restart request for ${vpnType} VPN: ${vpnDisplayName} (UUID: ${vpnUuid})`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vpnUuid, vpnType }),
      });

      logger.debug(`[Frontend] Received response for restart request. Status: ${response.status}, OK: ${response.ok}`);

      if (!response.ok) {
        const errorData = await response.json();
        logger.error(`[Frontend] Restart API error response:`, errorData);
        throw new Error(errorData.error || `Failed to restart ${vpnType} VPN`);
      }

      logger.debug(`[Frontend] Restart successful for ${vpnType} VPN: ${vpnDisplayName}. Attempting to stop spinner.`);

      toast({
        title: `${vpnType} VPN Restarted`,
        description: `${vpnDisplayName} has been restarted.`,
        variant: "success",
      });

      // Stop spinner immediately after successful API call for all types
      setWorkingVpnSessions(prev => prev.map(vpn =>
        vpn.id === vpnUuid ? { ...vpn, isRestarting: false } : vpn
      ));

      // Delay status update based on VPN type
      const delay = vpnType === VpnClientType.IPsec ? 5000 : 3000;
      setTimeout(() => {
        onRefresh();
      }, delay);
    } catch (error) {
      logger.error(`[Frontend] Caught error during ${vpnType} VPN restart:`, error);
      const msg = error instanceof Error ? error.message : `Could not restart ${vpnType} VPN.`;
      toast({
        title: `Error Restarting ${vpnType} VPN`,
        description: msg,
        variant: "destructive",
      });
      // Ensure spinner stops on error
      setWorkingVpnSessions(prev => prev.map(vpn =>
        vpn.id === vpnUuid ? { ...vpn, isRestarting: false } : vpn
      ));
    }
  }, [onRefresh, toast, workingVpnSessions]);

  const handleStopVpn = useCallback(async (vpnUuid: string, vpnType: VpnClientType) => {
    // Capture the VPN's display name at the start
    const vpnToStop = workingVpnSessions.find(vpn => vpn.id === vpnUuid);
    const vpnDisplayName = vpnToStop?.vpnDisplayName || 'N/A';

    setWorkingVpnSessions(prev => prev.map(vpn =>
      vpn.id === vpnUuid ? { ...vpn, isStopping: true, isRestarting: false } : vpn
    ));

    try {
      let endpoint = '';
      if (vpnType === VpnClientType.OpenVPN) {
        endpoint = '/api/opnsense/openvpn-service/stop';
      } else if (vpnType === VpnClientType.WireGuard) {
        endpoint = '/api/opnsense/wireguard/service/stop';
      } else if (vpnType === VpnClientType.IPsec) {
        endpoint = '/api/opnsense/ipsec-service/stop';
      } else {
        throw new Error(`Unsupported VPN type for stop: ${vpnType}`);
      }

      logger.debug(`[Frontend] Sending stop request for ${vpnType} VPN: ${vpnDisplayName} (UUID: ${vpnUuid})`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vpnUuid }),
      });

      logger.debug(`[Frontend] Received response for stop request. Status: ${response.status}, OK: ${response.ok}`);

      if (!response.ok) {
        const errorData = await response.json();
        logger.error(`[Frontend] Stop API error response:`, errorData);
        throw new Error(errorData.error || `Failed to stop ${vpnType} VPN`);
      }

      logger.debug(`[Frontend] Stop successful for ${vpnType} VPN: ${vpnDisplayName}. Attempting to stop spinner.`);

      toast({
        title: `${vpnType} VPN Disconnected`,
        description: `${vpnDisplayName} has been disconnected.`,
        variant: "success",
      });

      // Short delay before fetching status update
      setTimeout(() => {
        onRefresh();
      }, 3000); // Increased delay to 3 seconds

    } catch (error) {
      logger.error(`[Frontend] Caught error during ${vpnType} VPN stop:`, error);
      const msg = error instanceof Error ? error.message : `Could not stop ${vpnType} VPN.`;
      toast({
        title: `Error Stopping ${vpnType} VPN`,
        description: msg,
        variant: "destructive",
      });
    } finally {
      setWorkingVpnSessions(prev => prev.map(vpn =>
        vpn.id === vpnUuid ? { ...vpn, isStopping: false } : vpn
      ));
    }
  }, [onRefresh, toast, workingVpnSessions]);

  // Define formatBytes here to ensure it's in scope
  const formatBytes = (bytes: number): string => {
    if (isNaN(bytes)) return 'N/A';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  };

  return (
    <Card className="flex flex-col flex-1 mb-0 min-h-0">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center text-xl md:text-2xl">
            <ClientOnly><ShieldCheck size={28} className="mr-2 text-primary" /></ClientOnly> VPN Mappings
          </CardTitle>
          <CardDescription className="hidden md:block">
            Map VPN sessions to network groups for easier identification and management.
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
            <Button variant="outline" onClick={onRefresh} disabled={isLoadingInitialData || isSavingMappings || isRefreshing} size={isMobile ? "icon" : "default"}>
              <ClientOnly>
                {isRefreshing ? (
                  <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                ) : (
                  <RefreshCcw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                )}
              </ClientOnly>
              {!isMobile && "Refresh"}
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={!canSave}
              size={isMobile ? "icon" : "default"}
              variant={canSave ? "default" : "outline"}
              className={cn(
                canSave ? "bg-orange-600 hover:bg-orange-700" : "",
                !isMobile && "min-w-[120px]" // Fixed width to prevent layout shifts
              )}
            >
              {isSavingMappings ? <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} /> : <Save className={cn("h-4 w-4", !isMobile && "mr-2")} />}
              {!isMobile && (canSave ? "Save Changes" : "Save Settings")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-6 pb-8 md:pb-6 relative flex flex-col flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0">
          {(isLoadingInitialData || isLoadingAllGroups) ? (
            <div className="space-y-2 mt-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : vpnMappingsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error Loading Data</AlertTitle>
              <AlertDescription>{vpnMappingsError}</AlertDescription>
            </Alert>
          ) : vpnMappings.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No VPN Sessions Found</AlertTitle>
              <AlertDescription>No VPN sessions found in OPNsense. Please check your OPNsense configuration.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="mb-4 relative">
                <Input
                  type="text"
                  placeholder="Search by VPN Name, Friendly Name, Type, Status, Address, or Network Group..."
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
                    {paginatedVpnSessions.map((vpn) => (
                      <VpnMappingsCard
                        key={`vpn-card-${vpn.id}`}
                        vpn={vpn}
                        networkGroupOptions={networkGroupOptions}
                        onFriendlyNameChange={handleFriendlyNameChange}
                        onNetworkGroupChange={handleNetworkGroupChange}
                        onStopVpn={handleStopVpn}
                        onRestartVpn={handleRestartVpn}
                        isSavingMappings={isSavingMappings}
                        getVpnStatusText={getVpnStatusText}
                        isOpnsenseIpsecConnection={isOpnsenseIpsecConnection}
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                // Desktop View: Render as Table
                <ScrollArea className="min-h-[300px] h-[calc(100vh-550px)] w-full">
                  <SortableTable<OpnsenseVpnEntry & { id: string; vpnUuid: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null; vpnDisplayName: string; isStopping: boolean; isRestarting: boolean; }>
                    data={paginatedVpnSessions}
                    columns={[
                      {
                        key: 'vpnDisplayName',
                        label: 'VPN Name',
                        sortable: true,
                        headerClassName: "w-[15%]",
                        render: (vpn) => <span className="font-medium whitespace-normal break-words">{vpn.vpnDisplayName}</span>,
                      },
                      {
                        key: 'friendlyName',
                        label: 'Friendly VPN Name',
                        sortable: true,
                        headerClassName: "w-[15%]",
                        render: (vpn) => (
                          <MemoizedVpnInput
                            vpnId={vpn.id!}
                            initialValue={vpn.friendlyName || ''}
                            onValueChange={handleFriendlyNameChange}
                            disabled={vpn.isStopping || vpn.isRestarting || isSavingMappings}
                          />
                        ),
                      },
                      {
                        key: 'type',
                        label: 'VPN Type',
                        sortable: true,
                        headerClassName: "w-[10%]",
                        render: (vpn) => <Badge variant="outline">{vpn.type || 'N/A'}</Badge>,
                      },
                      {
                        key: 'enabled',
                        label: 'Status',
                        sortable: true,
                        headerClassName: "w-[10%] text-center",
                        render: (vpn) => {
                          const statusText = getVpnStatusText(vpn);
                          let statusVariant: 'default' | 'success' | 'destructive' | 'outline' = 'outline';

                          if (statusText === 'connected') {
                            statusVariant = 'success';
                          } else if (statusText === 'disconnected') {
                            statusVariant = 'destructive';
                          } else if (statusText === 'disabled') {
                            // Use custom grey styling for disabled status
                            return (
                              <div className="flex justify-center">
                                <Badge className="bg-gray-500 hover:bg-gray-600 text-white">
                                  {statusText}
                                </Badge>
                              </div>
                            );
                          }
                          return (
                            <div className="flex justify-center">
                              <Badge variant={statusVariant}>
                                {statusText}
                              </Badge>
                            </div>
                          );
                        },
                      },
                      {
                        key: 'address',
                        label: 'Address',
                        sortable: false,
                        headerClassName: "w-[12%]",
                        render: (vpn) => (
                          <span className="whitespace-normal break-words">
                            {isOpnsenseVpnSession(vpn) ? (
                              <>{vpn.virtual_address || 'N/A'} <br /> ({vpn.real_address || 'N/A'})</>
                            ) : isOpnsenseWireguardClient(vpn) ? (
                              <>{vpn.tunneladdress || 'N/A'}</>
                            ) : isOpnsenseIpsecConnection(vpn) ? (
                              <>{vpn['local-addrs'] || 'N/A'} <br /> ({vpn['remote-addrs'] || 'N/A'})</> // Use hyphenated keys
                            ) : 'N/A'}
                          </span>
                        ),
                      },
                      {
                        key: 'data',
                        label: 'Data',
                        sortable: true,
                        headerClassName: "w-[12%]",
                        render: (vpn) => (
                          <span className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
                            {isOpnsenseVpnSession(vpn) ? (
                              <>RX: {formatBytes(parseInt(vpn.bytes_received))} <br /> TX: {formatBytes(parseInt(vpn.bytes_sent))}</> // Pass numbers
                            ) : isOpnsenseWireguardClient(vpn) ? (
                              <>RX: {formatBytes(vpn.transfer_rx)} <br /> TX: {formatBytes(vpn.transfer_tx)}</> // Pass numbers
                            ) : isOpnsenseIpsecConnection(vpn) ? (
                              <>RX: {formatBytes(vpn['bytes-in'])} <br /> TX: {formatBytes(vpn['bytes-out'])}</> // Pass numbers, use hyphenated keys
                            ) : 'N/A'}
                          </span>
                        ),
                        sortValue: (vpn) => {
                          if (isOpnsenseVpnSession(vpn)) {
                            const rxBytes = parseInt(vpn.bytes_received);
                            const txBytes = parseInt(vpn.bytes_sent);
                            return (isNaN(rxBytes) ? 0 : rxBytes) + (isNaN(txBytes) ? 0 : txBytes);
                          } else if (isOpnsenseWireguardClient(vpn)) {
                            const rxBytes = vpn.transfer_rx;
                            const txBytes = vpn.transfer_tx;
                            return (isNaN(rxBytes) ? 0 : rxBytes) + (isNaN(txBytes) ? 0 : txBytes);
                          } else if (isOpnsenseIpsecConnection(vpn)) {
                            const rxBytes = vpn['bytes-in']; // Now a number
                            const txBytes = vpn['bytes-out']; // Now a number
                            return (isNaN(rxBytes) ? 0 : rxBytes) + (isNaN(txBytes) ? 0 : txBytes);
                          }
                          return 0;
                        },
                      },
                      {
                        key: 'connected_since',
                        label: 'Connected Since',
                        sortable: true,
                        headerClassName: "w-[15%]",
                        render: (vpn) => {
                          if (isOpnsenseVpnSession(vpn)) {
                            return vpn.connected_since || 'N/A';
                          } else if (isOpnsenseIpsecConnection(vpn)) {
                            const ipsecVpn = vpn as OpnsenseIpsecConnection; // Explicitly cast
                            if (ipsecVpn['install-time']) {
                              const installTimeSeconds = parseInt(ipsecVpn['install-time']);
                              if (!isNaN(installTimeSeconds)) {
                                // Calculate connection start time from current time minus duration
                                const connectionStartTimeSeconds = Math.floor(Date.now() / 1000) - installTimeSeconds;
                                const date = new Date(connectionStartTimeSeconds * 1000); // Convert seconds to milliseconds
                                // Format as YYYY-MM-DD HH:MM:SS
                                const year = date.getFullYear();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const day = String(date.getDate()).padStart(2, '0');
                                const hours = String(date.getHours()).padStart(2, '0');
                                const minutes = String(date.getMinutes()).padStart(2, '0');
                                const seconds = String(date.getSeconds()).padStart(2, '0');
                                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                              }
                            }
                            return 'N/A';
                          }
                          return 'N/A';
                        },
                      },
                      {
                        key: 'opnsenseNetworkGroupId',
                        label: 'Network Group',
                        sortable: true,
                        headerClassName: "flex-1", // Use flex-1 for flexible width
                        render: (vpn) => (
                          <SearchableSelect
                            options={networkGroupOptions}
                            value={vpn.opnsenseNetworkGroupId || '__NONE__'}
                            onValueChange={(value) => handleNetworkGroupChange(vpn.id!, value === '__NONE__' ? null : value)}
                            placeholder="Select Group"
                            emptyValueLabel="No Group"
                            disabled={vpn.isStopping || vpn.isRestarting || isSavingMappings}
                            // Enable progressive loading for consistency
                            enableVirtualScrolling={true}
                            initialLoadCount={100}
                            loadMoreCount={50}
                            searchDebounceMs={300}
                          />
                        ),
                      },
                      {
                        key: 'actions',
                        label: 'Actions',
                        sortable: false,
                        headerClassName: "w-[8%] text-right",
                        render: (vpn) => {
                          // Removed isRestartButtonProcessing and isStopButtonProcessing local variables
                          // logger.debug(`[Frontend Render] VPN ID: ${vpn.id}`);
                          // logger.debug(`  isProcessingVpn:`, isProcessingVpn);
                          // logger.debug(`  Restart Button Processing: ${isRestartButtonProcessing}`);
                          // logger.debug(`  Stop Button Processing: ${isStopButtonProcessing}`);

                          return (
                            <div className="flex space-x-2 justify-end">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      key={`stop-${vpn.id}-${vpn.isStopping ? 'processing' : 'idle'}`} // Use vpn.isStopping
                                      variant="destructive"
                                      size="icon"
                                      onClick={() => handleStopVpn(vpn.id!, vpn.type as VpnClientType)}
                                      disabled={vpn.isStopping || vpn.isRestarting || (vpn.type !== VpnClientType.OpenVPN && vpn.type !== VpnClientType.WireGuard && vpn.type !== VpnClientType.IPsec) || (isOpnsenseIpsecConnection(vpn) && !vpn.connected) || (vpn.type === VpnClientType.WireGuard && vpn.enabled === '0') || (vpn.type === VpnClientType.OpenVPN && (vpn.status === 'down' || vpn.status === 'disconnected'))}
                                    >
                                      {vpn.isStopping ? ( // Use vpn.isStopping
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : vpn.type === VpnClientType.WireGuard ? (
                                        <CircleOff className="h-4 w-4" />
                                      ) : (
                                        <Square className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{vpn.type === VpnClientType.WireGuard ? 'Disable VPN' : 'Stop VPN'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      key={`restart-${vpn.id}-${vpn.isRestarting ? 'processing' : 'idle'}`} // Use vpn.isRestarting
                                      variant="default"
                                      size="icon"
                                      onClick={() => handleRestartVpn(vpn.id!, vpn.type as VpnClientType)}
                                      disabled={vpn.isStopping || vpn.isRestarting || (vpn.type !== VpnClientType.OpenVPN && vpn.type !== VpnClientType.WireGuard && vpn.type !== VpnClientType.IPsec)}
                                    >
                                      {vpn.isRestarting ? ( // Use vpn.isRestarting
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Restart VPN</p>
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
                  setIsButtonRefreshing(true);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  onPageChange(page);
                  setIsButtonRefreshing(false);
                }}
                onPageSizeChange={onPageSizeChange}
                isLoadMoreMode={isPhone}
                pageSizeOptions={[5, 10, 50, 100, 500]}
                showAllOption={true}
                isLoading={isLoadingInitialData || isButtonRefreshing}
              />

            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}