'use client';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ClientOnly } from '@/components/util/ClientOnly';
import { logger } from '@/lib/logger';
import { usePageReloadDetection } from '@/hooks/usePageReloadDetection';
import { useAbortController } from '@/hooks/useAbortController';
import { checkMacRandomization } from '@/lib/mac-utils';
import { DeviceGroupHistoryGraph, DeviceGroupHistoryGraphHandles } from '@/components/DeviceGroupHistoryGraph';

import { cn } from '@/lib/utils'; // Import cn utility
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button'; // Import Button
import { Loader2, AlertCircle, AlertTriangle, CheckCircle, ShieldAlert, Copy, RefreshCcw, ChevronUp, ChevronDown, HelpCircle, Activity } from 'lucide-react';
import { GoDeviceDesktop } from 'react-icons/go'; // Keep GoDeviceDesktop for the main card title
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge'; // Import Badge
import type { NetworkGroup, IconName } from '@/types/opnsense';
import { useIsMobile } from '@/hooks/use-mobile';
import * as LucideIcons from 'lucide-react'; // Import all Lucide icons
import type { LucideIcon } from 'lucide-react';
import { Network as NetworkIconLucide } from 'lucide-react'; // Import Network icon from Lucide
import { flags, generalEmojis } from '@/components/ui/icon-picker'; // Import comprehensive lists and new Sets
import { RenameHostAliasDialog } from '@/components/RenameHostAliasDialog'; // Import the new dialog
import { VpnClientType } from '@prisma/client'; // Import VpnClientType
import { useGroupType } from '@/context/GroupTypeContext';
import { useSecureUI } from '@/context/SecureUIContext';
import { hasAnyGroupError, getGroupErrorType, getGroupErrorMessage } from '@/utils/groupErrorDetection';
import type { UnmanagedGroupResult } from '@/lib/unmanaged-group-utils';
import { formatLastOperation, getLastOperationTooltip, type LastAssignmentData } from '@/lib/format-last-operation';

const iconMap: Record<IconName, LucideIcon> = {
  'ShieldCheck': ShieldAlert,
  'ShieldQuestion': ShieldAlert,
  'Network': NetworkIconLucide, // Use Lucide's Network icon
};

import { ScrollArea } from "@/components/ui/scroll-area";

interface SelfServiceCardProps {
  className?: string; // Added className prop
  detectedIp: string | null;
  detectedMac: string | null;
  detectedVendor: string | null;
  detectedVendorSource?: 'OPNsense' | 'Local DB' | null;
  detectedHostname: string | null;
  isIpDetecting: boolean;
  ipDetectionError: string | null;
  userIpMemberOfGroups: NetworkGroup[];
  // opnsenseGroupDisplays: OpnsenseGroupDisplay[]; // Removed
  isSelfServiceAllowed: boolean;
  hostAlias: string | null;
  hostAliasUuid: string | null;
  hostAliasEnabled?: string | null; // New prop
  refreshHostAlias: (ip: string) => Promise<void>;
  refreshIpData: (silent?: boolean) => Promise<void>; // Update to accept optional boolean
  hasDhcpReservation: boolean; // New prop for DHCP reservation status
  hasIpConflict: boolean; // New prop for IP conflict status
  isAuthenticated: boolean; // New prop for authentication status
  hasMacConflict: boolean; // New prop for MAC conflict status
  dhcpReservedMac: string | null; // New prop for DHCP reserved MAC
  dhcpReservedVendor: string | null; // New prop for DHCP reserved Vendor
  vpnConnectionStatuses: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>; // Updated to include 'disabled'
  groupVpnMap: Map<string, string>; // New prop for networkGroupId to vpnUuid map
  allEmojiValues: string[]; // New prop for all emoji values
  allFlagValues: string[]; // New prop for all flag values
  onVpnRestart: (vpnUuid: string, vpnType: VpnClientType) => Promise<void>; // New prop for VPN restart action
  isVpnRestarting: boolean; // New prop for VPN restart loading state
  refreshUserIpGroupMembership: () => Promise<void>; // New prop for refreshing group membership
  refetchVpnStatuses?: (inPlace?: boolean, forceRefresh?: boolean) => Promise<void>; // Made optional with forceRefresh support
  refreshGroups?: (inPlace?: boolean) => Promise<void>; // New prop for refreshing groups in-place
  unmanagedGroupResult?: UnmanagedGroupResult | null; // New prop for unmanaged group status
  layoutMode?: 'stacked' | 'side-by-side'; // New prop for layout mode
  isRefreshing?: boolean; // New prop for global refresh state from useOpnsenseData
  onFetchExtendedDetailsReady?: (fetchFn: (forceRefresh?: boolean) => Promise<void>) => void; // New prop to pass fetchExtendedDetails to parent
  onRefreshLastOperationReady?: (refreshFn: () => Promise<void>) => void; // New prop to pass refreshLastOperationOnly to parent
  onRefreshGraphsReady?: (refreshFn: () => Promise<void>) => void; // New prop to pass refreshGraphs to parent
}

import { memo } from 'react'; // Import memo

export default memo(function SelfServiceCard({
  className,
  detectedIp,
  detectedMac,
  detectedVendor,
  detectedVendorSource,
  detectedHostname,
  isIpDetecting,
  ipDetectionError,
  userIpMemberOfGroups,
  hostAlias,
  hostAliasUuid,
  hostAliasEnabled, // New prop
  refreshHostAlias,
  hasDhcpReservation, // Destructure new prop
  hasIpConflict, // Destructure new prop
  hasMacConflict, // Destructure new prop
  dhcpReservedMac, // Destructure new prop
  dhcpReservedVendor, // Destructure new prop
  vpnConnectionStatuses, // Destructure new prop
  groupVpnMap, // Destructure new prop
  allEmojiValues, // Destructure new prop
  allFlagValues, // Destructure new prop
  onVpnRestart, // Destructure new prop
  isVpnRestarting, // Destructure new prop
  refreshUserIpGroupMembership, // Destructure new prop
  refetchVpnStatuses, // Destructure new prop
  refreshGroups, // Destructure new prop
  isAuthenticated, // Destructure new prop
  unmanagedGroupResult, // Destructure new prop
  layoutMode, // Destructure new prop
  isRefreshing: isGlobalRefreshing, // Destructure global refresh state from useOpnsenseData
  onFetchExtendedDetailsReady, // Destructure new prop
  onRefreshLastOperationReady, // Destructure new prop
  onRefreshGraphsReady, // Destructure new prop
}: SelfServiceCardProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { enableGroupTypes, enableSelfServiceMultiSelect, singleSelectName, multiSelectName } = useGroupType();

  // State for extended host alias details (only loaded in side-by-side mode)
  const [extendedDetails, setExtendedDetails] = useState<{
    description?: string;
    lastUpdated?: string;
    lastAssignment?: LastAssignmentData | null;
  } | null>(null);
  const [isLoadingExtendedDetails, setIsLoadingExtendedDetails] = useState(false);

  // Add page reload detection and abort controller hooks
  const { shouldSuppressError, createFocusSafeFetch } = usePageReloadDetection();
  const { createController, isAbortError } = useAbortController();
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);

  // Add ref for DeviceGroupHistoryGraph
  const graphRefCard = useRef<DeviceGroupHistoryGraphHandles>(null);
  const graphRefModal = useRef<DeviceGroupHistoryGraphHandles>(null);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);

  // Filter groups for self-service display - hide MultiSelect groups when self-service multi-select is disabled
  // BUT only when group types are actually enabled
  const filteredUserIpMemberOfGroups = useMemo(() => {
    logger.debug('SelfServiceCard filtering debug:', {
      enableGroupTypes,
      enableSelfServiceMultiSelect,
      totalGroups: userIpMemberOfGroups.length,
      groupTypes: userIpMemberOfGroups.map(g => ({ name: g.name, groupType: g.groupType }))
    });

    if (enableGroupTypes && !enableSelfServiceMultiSelect) {
      // Filter out MultiSelect groups when group types are enabled but self-service multi-select is disabled
      const filtered = userIpMemberOfGroups.filter(group => group.groupType !== 'MultiSelect');
      logger.debug('Filtering applied, filtered groups:', filtered.length);
      return filtered;
    }
    // When group types are disabled, show all groups regardless of enableSelfServiceMultiSelect
    logger.debug('No filtering applied, showing all groups');
    return userIpMemberOfGroups;
  }, [userIpMemberOfGroups, enableGroupTypes, enableSelfServiceMultiSelect]);

  // Check if there are hidden groups (for more accurate messaging)
  // Only when group types are enabled AND self-service multi-select is disabled
  const hasHiddenGroups = useMemo(() => {
    return enableGroupTypes && !enableSelfServiceMultiSelect && userIpMemberOfGroups.length > filteredUserIpMemberOfGroups.length;
  }, [enableGroupTypes, enableSelfServiceMultiSelect, userIpMemberOfGroups.length, filteredUserIpMemberOfGroups.length]);
  const { selfServiceRenamingEnabled } = useSecureUI();
  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);
  // Add state to track refresh button loading (moved here to avoid declaration order issues)
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Combine local and global refreshing states
  const isAnyRefreshing = isRefreshing || isGlobalRefreshing;
  // Add state to preserve hostname during refresh operations
  const [preservedHostname, setPreservedHostname] = useState<string | null>(null);
  // Add local DHCP status state to override the prop when needed
  const [localDhcpStatus, setLocalDhcpStatus] = useState<{
    isDhcpReserved: boolean;
    dhcpReservedMac: string | null;
    dhcpReservedVendor: string | null;
  } | null>(null);

  // Preserve hostname when available to prevent flickering during refreshes
  useEffect(() => {
    if (detectedHostname) {
      setPreservedHostname(detectedHostname);
    }
  }, [detectedHostname]);

  // Clear preserved hostname when IP changes (different network/device)
  useEffect(() => {
    if (!detectedIp) {
      setPreservedHostname(null);
      setLocalDhcpStatus(null); // Clear local DHCP status when IP changes
    }
  }, [detectedIp]);

  // Function to refresh DHCP status using the same method as useIpDetection
  const refreshDhcpStatus = useCallback(async () => {
    if (!detectedIp || !detectedMac) {
      setLocalDhcpStatus(null);
      return;
    }

    try {
      logger.debug('Refreshing DHCP status for IP:', detectedIp, 'MAC:', detectedMac);
      // Use the same endpoint as useIpDetection for consistency
      const dhcpResponse = await fetch(`/api/opnsense/dhcp?action=search_reservation&ip=${detectedIp}&mac=${detectedMac}`);

      if (dhcpResponse.ok) {
        const dhcpData = await dhcpResponse.json();
        logger.debug('DHCP Lookup Response:', dhcpData);

        // Use the same logic as useIpDetection
        const isReserved = dhcpData.success;

        logger.debug(`Setting DHCP reservation status: ${isReserved} for IP ${detectedIp}`);
        setLocalDhcpStatus({
          isDhcpReserved: isReserved,
          dhcpReservedMac: dhcpData.dhcpReservedMac || null,
          dhcpReservedVendor: dhcpData.dhcpReservedVendor || null,
        });
      } else {
        logger.warn(`Failed to fetch DHCP reservation for IP ${detectedIp} and MAC ${detectedMac}: ${dhcpResponse.statusText}`);
        logger.debug(`Setting DHCP reservation to false due to failed response for IP ${detectedIp}`);
        setLocalDhcpStatus({
          isDhcpReserved: false,
          dhcpReservedMac: null,
          dhcpReservedVendor: null,
        });
      }
    } catch (error) {
      logger.error('Error refreshing DHCP status:', error);
      logger.debug(`Setting DHCP reservation to false due to error for IP ${detectedIp}`);
      setLocalDhcpStatus({
        isDhcpReserved: false,
        dhcpReservedMac: null,
        dhcpReservedVendor: null,
      });
    }
  }, [detectedIp, detectedMac]);

  // Use local DHCP status if available, otherwise fall back to props
  const effectiveHasDhcpReservation = localDhcpStatus?.isDhcpReserved ?? hasDhcpReservation;
  const effectiveDhcpReservedMac = localDhcpStatus?.dhcpReservedMac ?? dhcpReservedMac;
  const effectiveDhcpReservedVendor = localDhcpStatus?.dhcpReservedVendor ?? dhcpReservedVendor;

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };

    const handleFocus = () => {
      // Refresh DHCP status when page gains focus (helps with external changes)
      logger.debug('Page gained focus, refreshing DHCP status');

      // Add a delay to reduce collision probability with page reloads
      setTimeout(() => {
        // Create focus-safe fetch that will be cancelled during page reload
        const restoreFetch = createFocusSafeFetch();

        try {
          refreshDhcpStatus();
        } catch (error) {
          // Suppress errors during page transitions
          if (!shouldSuppressError(error, 'DHCP status refresh')) {
            logger.error('Error refreshing DHCP status on focus:', error);
          }
        } finally {
          // Always restore original fetch
          restoreFetch();
        }
      }, 300); // 300ms delay for DHCP status refresh
    };

    if (typeof window !== 'undefined') {
      handleResize(); // Set initial dimensions
      window.addEventListener('resize', handleResize);
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [refreshDhcpStatus, shouldSuppressError, createFocusSafeFetch]);

  // Use a ref to track the last IP address we fetched for
  const lastFetchedIpRef = useRef<string | null>(null);

  // Use a ref to track if a fetch is currently in progress
  const isFetchingRef = useRef<boolean>(false);

  // Lightweight function to refresh ONLY the last operation field without loading states
  const refreshLastOperationOnly = useCallback(async () => {
    // Only refresh if we're in side-by-side mode and have a detected IP
    if (layoutMode !== 'side-by-side' || !detectedIp) {
      return;
    }

    try {
      // Build URL with optional MultiSelect filter
      const params = new URLSearchParams({ ipAddress: detectedIp });

      // Filter out MultiSelect group operations when group types are enabled but multi-select is disabled
      if (enableGroupTypes && !enableSelfServiceMultiSelect) {
        params.append('excludeMultiSelectGroups', 'true');
      }

      // Fetch only the last assignment data
      const lastAssignmentResponse = await fetch(`/api/opnsense/host-alias-last-assignment?${params.toString()}`);

      if (lastAssignmentResponse.ok) {
        const assignmentData = await lastAssignmentResponse.json();
        const lastAssignment = assignmentData.timestamp ? (assignmentData as LastAssignmentData) : null;

        // Update only the lastAssignment field in extendedDetails without triggering loading states
        setExtendedDetails(prev => {
          if (!prev) {
            // If no extended details exist yet, create a minimal object with just lastAssignment
            return { lastAssignment };
          }
          // Update only the lastAssignment field, keeping other fields intact
          return {
            ...prev,
            lastAssignment,
          };
        });
      } else {
        logger.warn(`Failed to refresh last assignment: ${lastAssignmentResponse.statusText}`);
      }
    } catch (error) {
      logger.error('Error refreshing last operation:', error);
    }
  }, [layoutMode, detectedIp, enableGroupTypes, enableSelfServiceMultiSelect]);

  // Function to refresh the graph
  // IMPORTANT: Refresh user IP group membership first to ensure currentGroups prop is up-to-date
  const refreshGraphs = useCallback(async () => {
    try {
      // First, refresh user IP group membership to get latest groups
      await refreshUserIpGroupMembership();

      // Then refresh the graph with updated data
      await Promise.all([
        graphRefCard.current?.refresh(),
        graphRefModal.current?.refresh()
      ].filter(Boolean));
    } catch (error) {
      logger.error('Error refreshing graph:', error);
    }
  }, [refreshUserIpGroupMembership]);

  // Create a memoized function to fetch extended details
  const fetchExtendedDetails = useCallback(async (forceRefresh = false) => {
    // Skip if already fetching
    if (isFetchingRef.current) {
      return;
    }

    // Set flag immediately to prevent race conditions
    isFetchingRef.current = true;

    // Only fetch if we're in side-by-side mode and have a host alias UUID
    if (layoutMode !== 'side-by-side' || !hostAliasUuid || !detectedIp) {
      setExtendedDetails(null);
      lastFetchedIpRef.current = null;
      isFetchingRef.current = false; // Reset flag before returning
      return;
    }

    // Skip fetch if we already fetched for this IP address (unless forceRefresh is true)
    if (!forceRefresh && lastFetchedIpRef.current === detectedIp) {
      isFetchingRef.current = false; // Reset flag before returning
      return;
    }

    lastFetchedIpRef.current = detectedIp;
    setIsLoadingExtendedDetails(true);

    try {
      // Build URL with optional MultiSelect filter for last assignment
      const lastAssignmentParams = new URLSearchParams({ ipAddress: detectedIp });

      // Filter out MultiSelect group operations when group types are enabled but multi-select is disabled
      if (enableGroupTypes && !enableSelfServiceMultiSelect) {
        lastAssignmentParams.append('excludeMultiSelectGroups', 'true');
      }

      // Fetch both host alias details and last assignment in parallel
      const [hostAliasResponse, lastAssignmentResponse] = await Promise.all([
        fetch(`/api/opnsense/host-alias-management?ipAddress=${detectedIp}`),
        fetch(`/api/opnsense/host-alias-last-assignment?${lastAssignmentParams.toString()}`)
      ]);

      let description: string | undefined;
      let lastUpdated: string | undefined;
      let lastAssignment: LastAssignmentData | null = null;

      if (hostAliasResponse.ok) {
        const data = await hostAliasResponse.json();
        description = data.description || undefined;
        lastUpdated = data.last_updated || undefined;
      } else {
        logger.warn(`Failed to fetch extended host alias details: ${hostAliasResponse.statusText}`);
      }

      if (lastAssignmentResponse.ok) {
        const assignmentData = await lastAssignmentResponse.json();
        if (assignmentData.timestamp) {
          lastAssignment = assignmentData as LastAssignmentData;
        }
      } else {
        logger.warn(`Failed to fetch last assignment details: ${lastAssignmentResponse.statusText}`);
      }

      setExtendedDetails({
        description,
        lastUpdated,
        lastAssignment,
      });
    } catch (error) {
      logger.error('Error fetching extended host alias details:', error);
      setExtendedDetails(null);
      lastFetchedIpRef.current = null; // Reset on error so we can retry
    } finally {
      setIsLoadingExtendedDetails(false);
      isFetchingRef.current = false; // Reset fetching flag
    }
  }, [layoutMode, hostAliasUuid, detectedIp, enableGroupTypes, enableSelfServiceMultiSelect]); // Minimal dependencies - no arrays or objects

  // Fetch extended host alias details when dependencies change
  useEffect(() => {
    fetchExtendedDetails();
  }, [fetchExtendedDetails]);

  // Pass fetchExtendedDetails to parent when ready
  useEffect(() => {
    if (onFetchExtendedDetailsReady) {
      onFetchExtendedDetailsReady(fetchExtendedDetails);
    }
  }, [fetchExtendedDetails, onFetchExtendedDetailsReady]);

  // Pass refreshLastOperationOnly to parent when ready
  useEffect(() => {
    if (onRefreshLastOperationReady) {
      onRefreshLastOperationReady(refreshLastOperationOnly);
    }
  }, [refreshLastOperationOnly, onRefreshLastOperationReady]);

  // Pass refreshGraphs to parent when ready
  useEffect(() => {
    if (onRefreshGraphsReady) {
      onRefreshGraphsReady(refreshGraphs);
    }
  }, [refreshGraphs, onRefreshGraphsReady]);

  const calculateCollapsedState = useCallback((width: number, height: number) => {
    // Fold only if width is less than 1024px AND height is less than 750px
    return (width < 1024 && height < 750);
  }, []);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    return calculateCollapsedState(initialWidth, initialHeight);
  });

  useEffect(() => {
    setIsCollapsed(calculateCollapsedState(windowWidth, windowHeight));
  }, [windowWidth, windowHeight, calculateCollapsedState]);

  // Renaming feature is now available from SecureUI context - no API call needed

  // Use refs to avoid dependency issues with focus event handlers
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentControllerRef = useRef<AbortController | null>(null);

  // Store current function references to avoid stale closures
  const refreshFunctionsRef = useRef({
    refreshGroups,
    refreshHostAlias,
    refreshUserIpGroupMembership,
    refetchVpnStatuses,
    fetchExtendedDetails,
    refreshLastOperationOnly,
    refreshGraphs,
    createController,
    isAbortError,
    shouldSuppressError,
    createFocusSafeFetch
  });

  // Update function references whenever they change
  useEffect(() => {
    refreshFunctionsRef.current = {
      refreshGroups,
      refreshHostAlias,
      refreshUserIpGroupMembership,
      refetchVpnStatuses,
      fetchExtendedDetails,
      refreshLastOperationOnly,
      refreshGraphs,
      createController,
      isAbortError,
      shouldSuppressError,
      createFocusSafeFetch
    };
  }, [refreshGroups, refreshHostAlias, refreshUserIpGroupMembership, refetchVpnStatuses, fetchExtendedDetails, refreshLastOperationOnly, refreshGraphs, createController, isAbortError, shouldSuppressError, createFocusSafeFetch]);

  // Effect to refresh data when the window gains focus (e.g., switching tabs back)
  useEffect(() => {
    const handleFocus = async () => {
      const currentDetectedIp = detectedIp; // Capture current value
      logger.debug('Window focused, refreshing group membership...', { detectedIp: currentDetectedIp, hasCurrentController: !!currentControllerRef.current });

      // Abort any previous focus-triggered requests
      if (currentControllerRef.current && !currentControllerRef.current.signal.aborted) {
        logger.debug('Aborting previous self-service focus refresh requests');
        currentControllerRef.current.abort('New focus event triggered');
      }

      // Clear any existing timeout
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }

      // Increased delay to reduce collision probability with page reloads
      focusTimeoutRef.current = setTimeout(async () => {
        if (currentDetectedIp) {
          // Skip if there's already a refresh in progress (currentController exists and not aborted)
          if (currentControllerRef.current && !currentControllerRef.current.signal.aborted) {
            logger.debug('Skipping focus refresh - already in progress');
            return;
          }

          logger.debug('Starting focus refresh for detectedIp:', currentDetectedIp);

          // Create new abort controller for this refresh cycle
          currentControllerRef.current = refreshFunctionsRef.current.createController(30000); // 30 second timeout

          setIsRefreshing(true);

          // Create focus-safe fetch that will be cancelled during page reload
          const restoreFetch = refreshFunctionsRef.current.createFocusSafeFetch();

          try {
            logger.debug('Starting self-service focus refresh with abort controller');

            // Refresh group membership, VPN statuses, host alias status, groups, and last operation
            const refreshPromises = [
              refreshFunctionsRef.current.refreshUserIpGroupMembership(), // Refresh group membership
              refreshFunctionsRef.current.refreshHostAlias(currentDetectedIp), // Refresh host alias status (enabled/disabled)
              refreshFunctionsRef.current.refreshLastOperationOnly() // Lightweight refresh of last operation only (no spinner)
            ];

            if (refreshFunctionsRef.current.refetchVpnStatuses) {
              refreshPromises.push(refreshFunctionsRef.current.refetchVpnStatuses(true, true)); // Refresh VPN statuses in-place with force refresh
            }

            // Only refresh groups if the function is provided
            if (refreshFunctionsRef.current.refreshGroups) {
              refreshPromises.push(refreshFunctionsRef.current.refreshGroups(true)); // Refresh groups in-place
            }

            // Refresh graphs to show any new data points
            if (refreshFunctionsRef.current.refreshGraphs) {
              refreshPromises.push(refreshFunctionsRef.current.refreshGraphs());
            }

            await Promise.all(refreshPromises);

            logger.debug('Self-service focus refresh completed successfully');
          } catch (error) {
            // Only log errors that aren't due to abort or page reload
            if (!refreshFunctionsRef.current.isAbortError(error) && !refreshFunctionsRef.current.shouldSuppressError(error, 'self-service focus refresh')) {
              logger.error('Error during self-service focus refresh:', error);
            } else {
              logger.debug('Self-service focus refresh cancelled or suppressed:', error);
            }
          } finally {
            // Always restore original fetch
            restoreFetch();
            setIsRefreshing(false);
          }
        } else {
          logger.debug('Skipping focus refresh - no detectedIp');
        }
      }, 500); // Increased delay to reduce collision with page reloads
    };

    // Add both focus and visibility change listeners for better reliability
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function to remove the event listeners, timeout, and abort any pending requests
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
      if (currentControllerRef.current && !currentControllerRef.current.signal.aborted) {
        logger.debug('Aborting self-service focus refresh requests due to component cleanup');
        currentControllerRef.current.abort('Component cleanup');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to prevent event listener churn - functions are accessed via refs



  const memoizedAllGeneralEmojiValues = useMemo(() => new Set([...generalEmojis.map(e => e.value.normalize('NFC')), ...allEmojiValues.map(e => e.normalize('NFC'))]), [allEmojiValues]);
  const memoizedAllFlagValues = useMemo(() => new Set([...flags.map(f => f.value.normalize('NFC')), ...allFlagValues.map(f => f.normalize('NFC'))]), [allFlagValues]);

  const getGroupIcon = useCallback((group: NetworkGroup): React.ReactNode => { // Removed opnsenseGroupDisplays parameter
    const mappedIconIdentifier = group.iconIdentifier; // Use group.iconIdentifier directly

    if (mappedIconIdentifier) {
      const normalizedIconIdentifier = mappedIconIdentifier.normalize('NFC');
      const isEmoji = memoizedAllGeneralEmojiValues.has(normalizedIconIdentifier);
      const isFlag = memoizedAllFlagValues.has(normalizedIconIdentifier);

      if (isEmoji || isFlag) {
        return <span className="text-xl leading-none mr-1.5">{mappedIconIdentifier}</span>;
      }

      const IconComponent = LucideIcons[mappedIconIdentifier as keyof typeof LucideIcons] as LucideIcon;
      if (IconComponent) {
        return <IconComponent size={18} className="mr-1.5 text-primary opacity-80" />;
      }
    }

    if (group.icon) {
      const MappedIcon = iconMap[group.icon];
      if (MappedIcon) {
        const DefaultIconComponent = MappedIcon;
        return <DefaultIconComponent size={18} className="mr-1.5 text-primary opacity-80" />;
      }
    }
    if (group.name.toLowerCase().includes('high security')) return <ShieldAlert size={18} className="mr-1.5 text-primary opacity-80" />;
    if (group.name.toLowerCase().includes('vpn')) return <ShieldAlert size={18} className="mr-1.5 text-primary opacity-80" />;
    return <NetworkIconLucide size={18} className="mr-1.5 text-primary opacity-80" />;
  }, [memoizedAllGeneralEmojiValues, memoizedAllFlagValues]); // Removed opnsenseGroupDisplays from dependency array

  // Determine if the host alias is disabled
  const isHostAliasDisabled = hostAliasEnabled !== undefined && hostAliasEnabled !== null && hostAliasEnabled !== '1';

  const generateMarkdownSummary = useCallback(() => {
    let summary = "## Host Network Info (Self-Service Page)\n";

    // Host Alias
    if (hostAlias) {
      summary += `- **Host Alias:** ${hostAlias}`;
      if (isHostAliasDisabled) {
        summary += ` (Disabled)`;
      }
      summary += `\n`;
    } else if (detectedIp) { // Only show "Not yet created" if IP is detected
      summary += `- **Host Alias:** Not yet created\n`;
    }

    // Extended details (only available in side-by-side mode)
    if (extendedDetails) {
      if (extendedDetails.description) {
        summary += `- **Description:** ${extendedDetails.description}\n`;
      }
      if (extendedDetails.lastUpdated) {
        const formattedDate = new Date(extendedDetails.lastUpdated).toLocaleString();
        summary += `- **Last Updated:** ${formattedDate}\n`;
      }
      if (extendedDetails.lastAssignment) {
        summary += `- **Last Operation:** ${formatLastOperation(
          extendedDetails.lastAssignment,
          extendedDetails.lastAssignment.hasOwnProperty('userName')
        )}\n`;
      }
    } else if (layoutMode === 'side-by-side' && detectedIp) {
      // Even if extendedDetails aren't loaded yet, show a placeholder for Last Operation in side-by-side mode
      summary += `- **Last Operation:** Loading...\n`;
    }

    // IP Addresses
    if (detectedIp) {
      summary += `- **IP Address:** \`${detectedIp}\``;
      if (effectiveHasDhcpReservation) {
        summary += ` (DHCP Reserved)`;
      }
      if (hasIpConflict) {
        summary += ` (IP Conflict)`;
      }
      if (hasMacConflict) {
        summary += ` (MAC Conflict)`;
      }
      if (effectiveDhcpReservedMac) {
        summary += ` (DHCP Reserved MAC: ${effectiveDhcpReservedMac})`;
      }
      if (effectiveDhcpReservedVendor) {
        summary += ` (DHCP Reserved Vendor: ${effectiveDhcpReservedVendor})`;
      }
      summary += `\n`;
    }

    // Hostname (only include if available)
    if (preservedHostname || detectedHostname) {
      summary += `- **Hostname:** ${preservedHostname || detectedHostname}\n`;
    }

    // MAC Address and Vendor
    if (detectedMac) {
      summary += `- **MAC Address:** \`${detectedMac}\`\n`;
    }
    if (detectedVendor) {
      summary += `- **MAC Vendor:** ${detectedVendor}\n`;
    }

    // Group Membership
    if (filteredUserIpMemberOfGroups.length > 0) {
      // Count total VPNs
      const totalVpns = filteredUserIpMemberOfGroups.filter(group => {
        const vpnUuid = groupVpnMap.get(group.uuid);
        return vpnUuid && vpnConnectionStatuses.has(vpnUuid);
      }).length;

      summary += `- **Group:** ${filteredUserIpMemberOfGroups.length} Groups (${totalVpns} VPNs)\n`;

      // Group Breakdown
      const groupDetails = filteredUserIpMemberOfGroups.map(g => {
        const name = g.friendlyName || g.name; // Use friendlyName directly
        const groupType = g.groupType;
        // Only include group type text if Group Types are enabled
        const groupTypeText = enableGroupTypes && groupType ? (groupType === 'SingleSelect' ? singleSelectName : multiSelectName) : '';

        const vpnUuid = groupVpnMap.get(g.uuid);
        const vpnInfo = vpnUuid ? vpnConnectionStatuses.get(vpnUuid) : undefined;
        let vpnStatusText = '';
        if (vpnInfo) {
          if (vpnInfo.type.toLowerCase() === 'openvpn') {
            vpnStatusText = `OpenVPN ${vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}`;
          } else if (vpnInfo.type.toLowerCase() === 'wireguard') {
            vpnStatusText = `WireGuard ${vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}`;
          } else if (vpnInfo.type.toLowerCase() === 'ipsec') {
            vpnStatusText = `IPsec ${vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}`;
          }
        }

        // Only include group type in the display if Group Types are enabled
        if (enableGroupTypes && groupTypeText) {
          return vpnInfo && vpnStatusText ? `${name} - ${groupTypeText} (${vpnStatusText})` : `${name} - ${groupTypeText}`;
        } else {
          return vpnInfo && vpnStatusText ? `${name} (${vpnStatusText})` : `${name}`;
        }
      }).join(' - ');
      summary += `- **Group Breakdown:** ${groupDetails}\n`;
    } else {
      if (hasHiddenGroups) {
        summary += `- **Group:** None (other groups may be managed elsewhere)\n`;
      } else {
        summary += `- **Group:** None\n`;
      }
    }

    return summary;
  }, [filteredUserIpMemberOfGroups, detectedIp, hostAlias, detectedMac, detectedVendor, detectedHostname, effectiveHasDhcpReservation, hasIpConflict, hasMacConflict, effectiveDhcpReservedMac, effectiveDhcpReservedVendor, vpnConnectionStatuses, groupVpnMap, preservedHostname, isHostAliasDisabled, hasHiddenGroups, extendedDetails, enableGroupTypes, singleSelectName, multiSelectName, layoutMode]); // Updated to use effective DHCP values and extendedDetails

  const handleCopySummary = useCallback(async () => {
    const summary = generateMarkdownSummary();
    const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
    const success = await safeClipboardCopy(summary);
    if (success) {
      toast({
        title: "Copied!",
        description: "Network status summary copied to clipboard.",
        variant: "success",
      });
    } else {
      logger.error('Failed to copy summary');
      toast({
        title: "Copy Failed",
        description: getClipboardErrorDescription(),
        variant: "destructive",
      });
    }
  }, [generateMarkdownSummary, toast]);

  // Collect all VPNs from all assigned groups
  const allVpnInfos: Array<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }> = (() => {
    const vpns: Array<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }> = [];

    for (const g of filteredUserIpMemberOfGroups) {
      const vpnUuid = groupVpnMap.get(g.uuid);
      if (vpnUuid) {
        // Check if we already have this VPN (avoid duplicates)
        const existingVpn = vpns.find(vpn => vpn.vpnUuid === vpnUuid.trim());
        if (!existingVpn) {
          const vpnInfo = vpnConnectionStatuses.get(vpnUuid.trim());
          if (vpnInfo) {
            vpns.push({ vpnUuid: vpnUuid.trim(), status: vpnInfo.status, type: vpnInfo.type, enabled: vpnInfo.enabled });
          }
        }
      }
    }
    return vpns;
  })();

  // Calculate overall VPN status for badge display
  const relevantVpnInfo: { vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string; isMultiple?: boolean; connectedCount?: number; totalCount?: number } | null = (() => {
    if (allVpnInfos.length === 0) return null;

    if (allVpnInfos.length === 1) {
      // Single VPN - return as-is
      return allVpnInfos[0];
    }

    // Multiple VPNs - determine overall status
    const connectedCount = allVpnInfos.filter(vpn => vpn.status === 'connected').length;

    const totalCount = allVpnInfos.length;

    // Determine overall status
    let overallStatus: 'connected' | 'disconnected' | 'disabled';
    if (connectedCount === totalCount) {
      overallStatus = 'connected'; // All connected - green
    } else if (connectedCount === 0) {
      overallStatus = 'disconnected'; // None connected - red
    } else {
      overallStatus = 'disabled'; // Some connected, some not - orange (using disabled for orange color)
    }

    // Return the first VPN as representative, but with overall status and multiple flag
    return {
      ...allVpnInfos[0],
      status: overallStatus,
      isMultiple: true,
      connectedCount,
      totalCount
    };
  })();



  // Add comprehensive loading state to prevent flickering
  const isFullyLoaded = useMemo(() => {
    // We're fully loaded when:
    // 1. IP detection is complete (either success or error)
    // 2. If we have an IP, we have determined the host alias status
    // Note: We don't need to wait for hostAlias to exist - it can be null (not yet created)
    if (isIpDetecting) return false;
    if (detectedIp && hostAliasEnabled === undefined) return false;
    return true;
  }, [isIpDetecting, detectedIp, hostAliasEnabled]);

  // Add state to track if this is the initial load vs a refresh
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);

  // Update hasInitiallyLoaded when we first get fully loaded data
  useEffect(() => {
    if (isFullyLoaded && !hasInitiallyLoaded) {
      setHasInitiallyLoaded(true);
    }
  }, [isFullyLoaded, hasInitiallyLoaded]);

  // Determine if we should show loading state
  // Only show loading on initial load, not during refreshes
  const shouldShowLoading = !hasInitiallyLoaded && !isFullyLoaded;

  return (
    <React.Fragment>
      <Card className={cn(`shadow-lg ${isMobile ? '' : 'mx-auto'}`, layoutMode === 'side-by-side' ? "flex flex-col min-h-0 lg-only:flex-1 xl-plus:flex-1" : "", className)}> {/* Apply className */}
        <CardHeader className={`flex flex-row items-center justify-between ${isMobile ? 'p-3 pb-1' : 'p-6 pb-3'}`}>
          <div className="flex-grow">
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly fallback={<Skeleton className={`h-6 w-6 mr-2 rounded-full ${isMobile ? 'h-5 w-5' : ''}`} />}><GoDeviceDesktop size={isMobile ? 22 : 28} className="mr-2 text-primary" /></ClientOnly> Host Network Info
            </CardTitle>
          </div>
          <ClientOnly fallback={<Skeleton className={`h-6 w-6 rounded-full ${isMobile ? 'h-5 w-5' : ''}`} />}>
            <div className="flex items-center space-x-1.5"> {/* Control UI container */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6",
                        isMobile ? "h-5 w-5" : "",
                        detectedIp ? "" : "cursor-not-allowed opacity-50"
                      )}
                      onClick={async () => {
                        if (detectedIp && !isRefreshing) {
                          setIsRefreshing(true);
                          try {
                            // Refresh group membership, VPN statuses, host alias status, DHCP status, groups, and last operation
                            const refreshPromises = [
                              refreshUserIpGroupMembership(), // Refresh group membership
                              refreshHostAlias(detectedIp), // Refresh host alias status (enabled/disabled)
                              refreshDhcpStatus(), // Refresh DHCP status using DeviceManagementCard method
                              refreshLastOperationOnly() // Lightweight refresh of last operation only (no spinner)
                            ];

                            if (refetchVpnStatuses) { // Conditionally call refetchVpnStatuses
                              refreshPromises.push(refetchVpnStatuses(true, true)); // Refresh VPN statuses in-place with force refresh
                            }

                            // Only refresh groups if the function is provided
                            if (refreshGroups) {
                              refreshPromises.push(refreshGroups(true)); // Refresh groups in-place
                            }

                            await Promise.all(refreshPromises);
                          } finally {
                            setIsRefreshing(false);
                          }
                        }
                      }}
                      disabled={!detectedIp || isIpDetecting || isAnyRefreshing}
                    >
                      {isIpDetecting || isAnyRefreshing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw size={isMobile ? 18 : 22} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh host network information</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Copy
                      size={isMobile ? 18 : 22}
                      className={cn(
                        "transition-colors",
                        "text-muted-foreground cursor-copy hover:text-primary"
                      )}
                      onClick={() => handleCopySummary()}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copy network status summary</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Graph Modal Button - Always visible, disabled if no detected IP */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!detectedIp}
                      className={cn(
                        "h-6 w-6",
                        isMobile ? "h-5 w-5" : "",
                        !detectedIp ? "opacity-50 cursor-not-allowed" : ""
                      )}
                      onClick={() => detectedIp && setIsGraphModalOpen(true)}
                    >
                      <Activity size={isMobile ? 18 : 22} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View Group Assignment History Graph</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Folding Icon */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6",
                        isMobile ? "h-5 w-5" : ""
                      )}
                      onClick={() => setIsCollapsed(!isCollapsed)}
                    >
                      {isCollapsed ? (
                        <ChevronDown size={isMobile ? 18 : 22} />
                      ) : (
                        <ChevronUp size={isMobile ? 18 : 22} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isCollapsed ? "Expand" : "Collapse"} host network information</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div> {/* End Control UI container */}
          </ClientOnly>
        </CardHeader>
        <CardContent className={cn(
          isMobile ? 'pt-1 pr-3 pl-3' : '',
          layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0 overflow-hidden" : ""
        )}>
          <div className={cn(isMobile ? 'space-y-2' : 'space-y-3', layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0" : "")}>
            <ClientOnly fallback={<Skeleton className="h-8 w-3/4" />}>
              <TooltipProvider> {/* Move TooltipProvider here */}
                {shouldShowLoading ? (
                  // Show comprehensive loading state only on initial load
                  <div className="flex items-center space-x-2">
                    <Loader2 className={`h-5 w-5 animate-spin text-primary ${isMobile ? 'h-4 w-4' : ''}`} />
                    <p className={isMobile ? 'text-sm' : ''}>
                      {isIpDetecting ? 'Detecting IP address and host alias...' : 'Loading host network information...'}
                    </p>
                  </div>
                ) : detectedIp ? (
                  <>


                    {/* Host Alias Display */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <strong className={cn(isMobile ? "text-sm" : "")}>Host Alias:</strong>
                      {isHostAliasDisabled ? (
                        <>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "font-mono p-1 rounded-md inline-block transition-colors cursor-not-allowed bg-gray-400 dark:bg-gray-700 opacity-60 text-white",
                                    isMobile ? "text-sm p-0.5" : "text-base p-0.5"
                                  )}
                                >
                                  {hostAlias ? hostAlias : "Not yet created"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>This host alias is disabled and cannot be managed.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      ) : (
                        <span
                          className={cn(
                            "font-mono px-2.5 py-0.5 rounded-md inline-block transition-colors",
                            (() => {
                              const isUnmanaged = Boolean(unmanagedGroupResult && unmanagedGroupResult.isUnmanaged);
                              if (isUnmanaged || isHostAliasDisabled) {
                                return "cursor-not-allowed bg-gray-400 dark:bg-gray-700 opacity-60 text-white";
                              }
                              if (selfServiceRenamingEnabled && hostAlias && (isAuthenticated || effectiveHasDhcpReservation)) {
                                return detectedMac ? "cursor-pointer hover:bg-primary/90 bg-primary text-primary-foreground" : "cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90";
                              }
                              if (hostAlias) {
                                return detectedMac ? "cursor-copy hover:bg-primary/90 bg-primary text-primary-foreground" : "cursor-copy bg-primary text-primary-foreground hover:bg-primary/90";
                              }
                              // Not yet created case - Cyan
                              return "cursor-not-allowed bg-cyan-500 hover:bg-cyan-600 text-white";
                            })(),
                            isMobile ? "text-sm px-1.5 py-0.5" : "text-base px-2.5 py-0.5"
                          )}
                          onClick={async () => {
                            if (isHostAliasDisabled) return;
                            // Check if host is in unmanaged groups and disable renaming
                            const isUnmanaged = Boolean(unmanagedGroupResult && unmanagedGroupResult.isUnmanaged);
                            if (isUnmanaged) {
                              toast({
                                variant: "destructive",
                                title: "Self-Service Restricted",
                                description: unmanagedGroupResult?.message || "Host alias renaming is restricted for hosts in unmanaged groups.",
                              });
                              return;
                            }
                            if (selfServiceRenamingEnabled && hostAlias && !isHostAliasDisabled && (isAuthenticated || effectiveHasDhcpReservation)) {
                              setIsRenameDialogOpen(true);
                            } else if (!selfServiceRenamingEnabled && hostAlias) {
                              // Copy functionality when renaming is disabled
                              const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                              const success = await safeClipboardCopy(hostAlias);
                              if (success) {
                                toast({
                                  title: "Copied!",
                                  description: "Host alias copied to clipboard.",
                                  variant: "success",
                                });
                              } else {
                                toast({
                                  title: "Copy Failed",
                                  description: getClipboardErrorDescription(),
                                  variant: "destructive",
                                });
                              }
                            }
                          }}
                          title={(() => {
                            const isUnmanaged = Boolean(unmanagedGroupResult && unmanagedGroupResult.isUnmanaged);
                            if (isUnmanaged) {
                              return "Host alias operations are restricted for hosts in unmanaged groups";
                            }
                            if (isHostAliasDisabled) {
                              return "Host alias is disabled";
                            }
                            if (selfServiceRenamingEnabled && hostAlias && (isAuthenticated || effectiveHasDhcpReservation)) {
                              return "Click to rename Host Alias";
                            }
                            if (!selfServiceRenamingEnabled && hostAlias) {
                              return "Click to copy Host Alias";
                            }
                            return undefined;
                          })()}
                        >
                          {hostAlias ? hostAlias : "Not yet created"}
                        </span>
                      )}
                      <Badge className={cn("ml-1.5 px-1.5 py-0.5 text-white", isMobile ? "text-[0.7rem]" : "text-xs",
                        isHostAliasDisabled ? "bg-gray-400 hover:bg-gray-400" :
                          detectedMac ? "bg-green-500 hover:bg-green-500" : "bg-red-500 hover:bg-red-500"
                      )}>
                        {isHostAliasDisabled ? "Disabled" :
                          detectedMac ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    {/* Conditionally render the rest of the content */}
                    {!isCollapsed && (
                      <>
                        {/* Keep the IP and MAC address sections */}
                        <div className="flex items-center gap-1 flex-wrap"> {/* Added flex and gap for alignment, added flex-wrap */}
                          <strong className={cn(isMobile ? "text-sm" : "")}>IP Address:</strong> <span
                            className={cn(
                              "font-mono px-2.5 py-0.5 rounded-md inline-block cursor-copy transition-colors",
                              isHostAliasDisabled
                                ? "bg-gray-400 dark:bg-gray-700 opacity-60 cursor-not-allowed text-white"
                                : !detectedMac
                                  ? "bg-primary text-primary-foreground hover:bg-primary/90" // Enabled but offline
                                  : detectedIp
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "bg-gray-400 dark:bg-gray-700 hover:bg-gray-500 dark:hover:bg-gray-600 text-white",
                              isMobile ? "text-sm px-1.5 py-0.5" : "text-base px-2.5 py-0.5" // Keep text-base for consistent size, adjust padding
                            )}
                            onClick={async () => {
                              if (detectedIp) {
                                const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                                const success = await safeClipboardCopy(detectedIp);
                                if (success) {
                                  toast({
                                    title: "Copied!",
                                    description: "IP address copied to clipboard.",
                                    variant: "success",
                                  });
                                } else {
                                  toast({
                                    title: "Copy Failed",
                                    description: getClipboardErrorDescription(),
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                            title={detectedIp ? "Click to copy IP Address" : undefined}
                          >
                            {detectedIp}
                          </span>
                          {(() => {
                            const isConflict = effectiveHasDhcpReservation && (hasIpConflict || hasMacConflict);
                            const isPrivacyMac = effectiveHasDhcpReservation && effectiveDhcpReservedMac &&
                              checkMacRandomization(effectiveDhcpReservedMac).isRandomized;



                            if (isConflict) {
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className={cn("ml-1.5 bg-orange-500 hover:bg-orange-600 text-white cursor-help px-1.5 py-0.5", isMobile ? "text-[0.7rem]" : "text-xs")}>
                                      DHCP Conflict
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>DHCP Conflict: Reserved for a different MAC address.</p>
                                    {effectiveDhcpReservedMac && <p>Reserved MAC: {effectiveDhcpReservedMac}</p>}
                                    {effectiveDhcpReservedVendor && effectiveDhcpReservedMac && !checkMacRandomization(effectiveDhcpReservedMac).isRandomized && <p>Reserved Vendor: {effectiveDhcpReservedVendor}</p>}
                                    {detectedMac && <p>Active MAC: {detectedMac}</p>}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            } else if (isPrivacyMac) {
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className={cn("ml-1.5 bg-yellow-600 hover:bg-yellow-700 text-white cursor-help px-1.5 py-0.5", isMobile ? "text-[0.7rem]" : "text-xs")}>
                                      DHCP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>DHCP (Privacy MAC)</p>
                                    {effectiveDhcpReservedMac && <p>Reserved MAC: {effectiveDhcpReservedMac}</p>}
                                    {effectiveDhcpReservedVendor && effectiveDhcpReservedMac && !checkMacRandomization(effectiveDhcpReservedMac).isRandomized && <p>Reserved Vendor: {effectiveDhcpReservedVendor}</p>}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            } else if (effectiveHasDhcpReservation) {
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className={cn("ml-1.5 bg-blue-500 hover:bg-blue-600 text-white cursor-help px-1.5 py-0.5", isMobile ? "text-[0.7rem]" : "text-xs")}>
                                      DHCP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>This IP address has a configured DHCP reservation.</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            } else {
                              return null;
                            }
                          })()}
                        </div>
                        {/* Hostname Display (only if available) */}
                        {(preservedHostname || detectedHostname) && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <strong className={cn(isMobile ? "text-sm" : "")}>Hostname:</strong>
                            <span
                              className={cn(
                                "font-mono px-2.5 py-0.5 rounded-md inline-block cursor-copy transition-colors",
                                (preservedHostname || detectedHostname) ? "hover:bg-primary/90" : "hover:bg-gray-500 dark:hover:bg-gray-600",
                                (preservedHostname || detectedHostname) ? "bg-primary" : "bg-gray-400 dark:bg-gray-700",
                                "text-white",
                                isMobile ? "text-sm px-1.5 py-0.5" : "text-base px-2.5 py-0.5"
                              )}

                            >
                              {preservedHostname || detectedHostname}
                            </span>
                          </div>
                        )}

                        {/* MAC Address and Vendor Display */}
                        {detectedMac && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <strong className={cn(isMobile ? "text-sm" : "")}>MAC Address:</strong>
                            <TooltipProvider>
                              <Tooltip delayDuration={200}>
                                <TooltipTrigger asChild>
                                  <span
                                    className={cn(
                                      "font-mono px-2.5 py-0.5 rounded-md inline-block cursor-copy transition-colors",
                                      isHostAliasDisabled
                                        ? "bg-gray-400 dark:bg-gray-700 opacity-60 cursor-not-allowed text-white"
                                        : !detectedMac
                                          ? "bg-primary text-primary-foreground hover:bg-primary/90" // Enabled but offline
                                          : "bg-primary text-primary-foreground hover:bg-primary/90", // Always light blue when enabled and present
                                      isMobile ? "text-sm px-1.5 py-0.5" : "text-base px-2.5 py-0.5"
                                    )}
                                    onClick={async () => {
                                      if (detectedMac) {
                                        const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                                        const success = await safeClipboardCopy(detectedMac);
                                        if (success) {
                                          toast({
                                            title: "Copied!",
                                            description: "MAC address copied to clipboard.",
                                            variant: "success",
                                          });
                                        } else {
                                          toast({
                                            title: "Copy Failed",
                                            description: getClipboardErrorDescription(),
                                            variant: "destructive",
                                          });
                                        }
                                      }
                                    }}
                                    title="Click to copy MAC Address"
                                  >
                                    {detectedMac}
                                  </span>
                                </TooltipTrigger>
                                {detectedVendor && (
                                  <TooltipContent>
                                    {checkMacRandomization(detectedMac).isRandomized && <p>Privacy Mac Address</p>}
                                    {!checkMacRandomization(detectedMac).isRandomized && (
                                      <>
                                        <p>MAC Vendor: {detectedVendor}</p>
                                        {detectedVendorSource && <p className="text-xs text-muted-foreground mt-1">Source: {detectedVendorSource === 'OPNsense' ? 'OPNsense ARP Table' : 'Local Vendor Database'}</p>}
                                      </>
                                    )}
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                            {detectedMac && checkMacRandomization(detectedMac).isRandomized && (
                              <Badge className={cn("ml-1.5 bg-yellow-600 hover:bg-yellow-700 text-white px-1.5 py-0.5", isMobile ? "text-[0.7rem]" : "text-xs")}>
                                Privacy
                              </Badge>
                            )}
                          </div>
                        )}
                        {/* Group Display - Moved here */}
                        <div className="flex items-center gap-1 flex-wrap"> {/* Container for static text and styled span, added flex-wrap */}
                          <strong className={cn(isMobile ? "text-sm" : "")}>Group:</strong> {/* Static text */}
                          {isHostAliasDisabled && filteredUserIpMemberOfGroups && filteredUserIpMemberOfGroups.length > 0 ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={cn(
                                    "font-mono px-2.5 py-0.5 rounded-md inline-flex items-center gap-1",
                                    "bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700 cursor-not-allowed",
                                    isMobile ? "text-sm" : "text-base"
                                  )}>
                                    {(!enableGroupTypes && filteredUserIpMemberOfGroups.length > 1) ? (
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                    ) : (
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                    )}
                                    {enableGroupTypes && filteredUserIpMemberOfGroups.length > 1 ? (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex items-center">
                                              {filteredUserIpMemberOfGroups.length} Groups
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div className="space-y-1">
                                              {filteredUserIpMemberOfGroups.map((g) => (
                                                <div key={g.uuid} className="flex items-center gap-2">
                                                  <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                    {getGroupIcon(g)}
                                                  </ClientOnly>
                                                  <span>
                                                    {g.friendlyName || g.name}
                                                    {enableGroupTypes && g.groupType ? ` (${g.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : hasAnyGroupError(filteredUserIpMemberOfGroups, enableGroupTypes) ? (
                                      // Show error for multiple groups (when disabled) or multiple single-select groups (when enabled)
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex items-center">
                                              {filteredUserIpMemberOfGroups.length} Groups
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div>
                                              <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(filteredUserIpMemberOfGroups, enableGroupTypes))}</p>
                                              <p className="text-sm mt-1">Member of:</p>
                                              {filteredUserIpMemberOfGroups.map((g) => (
                                                <div key={g.uuid} className="flex items-center gap-2">
                                                  <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                    {getGroupIcon(g)}
                                                  </ClientOnly>
                                                  <span className="text-sm">
                                                    {g.friendlyName || g.name}
                                                  </span>
                                                </div>
                                              ))}
                                              <div className="border-t pt-2 mt-2">
                                                <p className="text-xs text-gray-400">
                                                  To resolve: Use the Network Groups section to assign to a single group.
                                                </p>
                                              </div>
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : (
                                      <>
                                        <ClientOnly fallback={<Skeleton className="h-4 w-4 mr-1.5 rounded-full" />}>
                                          {getGroupIcon(filteredUserIpMemberOfGroups[0])}
                                        </ClientOnly>
                                        {filteredUserIpMemberOfGroups[0].friendlyName || filteredUserIpMemberOfGroups[0].name}
                                      </>
                                    )}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Group Membership is Inactive</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : isHostAliasDisabled && (!filteredUserIpMemberOfGroups || filteredUserIpMemberOfGroups.length === 0) ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={cn(
                                    "font-mono px-2.5 py-0.5 rounded-md inline-flex items-center gap-1",
                                    "bg-gray-400 dark:bg-gray-700 text-white border border-gray-400 dark:border-gray-700 cursor-not-allowed opacity-60",
                                    isMobile ? "text-sm" : "text-base"
                                  )}>
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {hasHiddenGroups ? "No Visible Membership" : "No Membership"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{hasHiddenGroups ? "No visible group membership in self-service. Other groups may be managed elsewhere." : "Your device is currently not member of any group!"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className={cn(
                              "font-mono px-2.5 py-0.5 rounded-md inline-flex items-center gap-1",
                              filteredUserIpMemberOfGroups && filteredUserIpMemberOfGroups.length > 0
                                ? (unmanagedGroupResult && unmanagedGroupResult.isUnmanaged)
                                  ? "bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700"
                                  : hasAnyGroupError(filteredUserIpMemberOfGroups, enableGroupTypes)
                                    ? "bg-orange-100 text-orange-800 border border-orange-700"
                                    : "bg-green-100 text-green-800 border border-green-700"
                                : "bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700",
                              isMobile ? "text-sm" : "text-base"
                            )}>
                              {filteredUserIpMemberOfGroups && filteredUserIpMemberOfGroups.length > 0 ? (
                                <>
                                  {(unmanagedGroupResult && unmanagedGroupResult.isUnmanaged) ? (
                                    <ShieldAlert className="h-3 w-3 mr-1" />
                                  ) : hasAnyGroupError(filteredUserIpMemberOfGroups, enableGroupTypes) ? (
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                  ) : (
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                  )}
                                  {(unmanagedGroupResult && unmanagedGroupResult.isUnmanaged) ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center">
                                            {filteredUserIpMemberOfGroups.length === 1 ? (
                                              <>
                                                <ClientOnly fallback={<Skeleton className="h-4 w-4 mr-1.5 rounded-full" />}>
                                                  {getGroupIcon(filteredUserIpMemberOfGroups[0])}
                                                </ClientOnly>
                                                {filteredUserIpMemberOfGroups[0].friendlyName || filteredUserIpMemberOfGroups[0].name}
                                              </>
                                            ) : (
                                              `${filteredUserIpMemberOfGroups.length} Groups`
                                            )}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div>
                                            <p className="text-gray-400 font-semibold">Group Membership Restricted</p>
                                            <p className="text-sm mt-1">Self-service modifications are not allowed for this group.</p>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : hasAnyGroupError(filteredUserIpMemberOfGroups, enableGroupTypes) ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center">
                                            {filteredUserIpMemberOfGroups.length} Groups
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div>
                                            <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(filteredUserIpMemberOfGroups, enableGroupTypes))}</p>
                                            <p className="text-sm mt-1">Member of:</p>
                                            {filteredUserIpMemberOfGroups.map((g) => (
                                              <div key={g.uuid} className="flex items-center gap-2">
                                                <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                  {getGroupIcon(g)}
                                                </ClientOnly>
                                                <span className="text-sm">
                                                  {g.friendlyName || g.name}
                                                  {enableGroupTypes && g.groupType ? ` (${g.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                </span>
                                              </div>
                                            ))}
                                            <div className="border-t pt-2 mt-2">
                                              <p className="text-xs text-gray-400">
                                                To resolve: Use the Network Groups section to assign to a single group.
                                              </p>
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : enableGroupTypes && filteredUserIpMemberOfGroups.length > 1 ? (
                                    // When group types are enabled and multiple groups but no error, show normal tooltip
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center">
                                            {filteredUserIpMemberOfGroups.length} Groups
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="space-y-1">
                                            {filteredUserIpMemberOfGroups.map((g) => (
                                              <div key={g.uuid} className="flex items-center gap-2">
                                                <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                  {getGroupIcon(g)}
                                                </ClientOnly>
                                                <span>
                                                  {g.friendlyName || g.name}
                                                  {enableGroupTypes && g.groupType ? ` (${g.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center">
                                            <ClientOnly fallback={<Skeleton className="h-4 w-4 mr-1.5 rounded-full" />}>
                                              {getGroupIcon(filteredUserIpMemberOfGroups[0])}
                                            </ClientOnly>
                                            {filteredUserIpMemberOfGroups[0].friendlyName || filteredUserIpMemberOfGroups[0].name}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                {getGroupIcon(filteredUserIpMemberOfGroups[0])}
                                              </ClientOnly>
                                              <span>
                                                {filteredUserIpMemberOfGroups[0].friendlyName || filteredUserIpMemberOfGroups[0].name}
                                                {enableGroupTypes && filteredUserIpMemberOfGroups[0].groupType ? ` (${filteredUserIpMemberOfGroups[0].groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                              </span>
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      {"No Membership"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Your device is currently not member of any group!</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                          )}
                          {relevantVpnInfo && (
                            <ClientOnly fallback={<Skeleton className={cn("h-3 w-16 rounded-full", isMobile ? "mt-1" : "ml-1.5")} />}>
                              <div className="flex items-center flex-wrap gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        className={cn(
                                          "text-white px-1.5 py-0.5",
                                          isMobile ? "text-[0.7rem] mt-1" : "text-xs ml-1.5",
                                          // Updated status logic to handle multiple VPNs and mixed states
                                          relevantVpnInfo.status === 'connected' ? "bg-darker-green hover:bg-darker-green/80" :
                                            relevantVpnInfo.status === 'disabled' ? (relevantVpnInfo.isMultiple ? "bg-orange-500 hover:bg-orange-600" : "bg-gray-500 hover:bg-gray-600") :
                                              "bg-darker-red hover:bg-darker-red/80"
                                        )}
                                      >
                                        {relevantVpnInfo.isMultiple ? (
                                          `${relevantVpnInfo.totalCount} VPNs`
                                        ) : (
                                          relevantVpnInfo.type === 'openvpn' ? 'OpenVPN' :
                                            relevantVpnInfo.type === 'wireguard' ? 'WireGuard' :
                                              relevantVpnInfo.type === 'ipsec' ? 'IPsec' :
                                                relevantVpnInfo.type
                                        )}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {relevantVpnInfo.isMultiple ? (
                                        <div className="space-y-1">
                                          <p className="font-medium">VPN Status Summary:</p>
                                          <p>✓ {relevantVpnInfo.connectedCount} Connected</p>
                                          <p>✗ {relevantVpnInfo.totalCount! - relevantVpnInfo.connectedCount!} Disconnected/Disabled</p>
                                          <div className="border-t pt-1 mt-2">
                                            <p className="font-medium">VPNs:</p>
                                            {allVpnInfos.map((vpn, index) => (
                                              <p key={index} className="text-sm">
                                                {vpn.type === 'openvpn' ? 'OpenVPN' :
                                                  vpn.type === 'wireguard' ? 'WireGuard' :
                                                    vpn.type === 'ipsec' ? 'IPsec' :
                                                      vpn.type} - {vpn.status === 'connected' ? 'Connected' : vpn.status === 'disabled' ? 'Disabled' : 'Disconnected'}
                                              </p>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          {relevantVpnInfo.type === 'openvpn' && (
                                            <p>OpenVPN {relevantVpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                                          )}
                                          {relevantVpnInfo.type === 'wireguard' && (
                                            <p>WireGuard {relevantVpnInfo.status === 'connected' ? 'Connected' : relevantVpnInfo.status === 'disabled' ? 'Disabled' : 'Disconnected'}</p>
                                          )}
                                          {relevantVpnInfo.type === 'ipsec' && (
                                            <p>IPsec {relevantVpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                                          )}
                                        </>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {(relevantVpnInfo.status === 'disconnected' && relevantVpnInfo.enabled === '1' &&
                                  (relevantVpnInfo.type === 'openvpn' || relevantVpnInfo.type === 'wireguard' || relevantVpnInfo.type === 'ipsec')) && (
                                    <ClientOnly fallback={<Skeleton className={cn("h-3 w-16 rounded-full", isMobile ? "mt-1" : "ml-1.5")} />}>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className={cn("h-6 w-6 ml-1.5", isMobile ? "h-5 w-5" : "")}
                                              onClick={() => {
                                                // Convert lowercase type to proper VpnClientType
                                                const vpnClientType = relevantVpnInfo.type === 'openvpn' ? 'OpenVPN' :
                                                  relevantVpnInfo.type === 'wireguard' ? 'WireGuard' :
                                                    relevantVpnInfo.type === 'ipsec' ? 'IPsec' :
                                                      'OpenVPN' as VpnClientType;
                                                onVpnRestart(relevantVpnInfo.vpnUuid.trim(), vpnClientType);
                                              }}
                                              disabled={isVpnRestarting}
                                            >
                                              {isVpnRestarting ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <RefreshCcw className="h-4 w-4" />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Restart VPN service</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </ClientOnly>
                                  )}
                              </div>
                            </ClientOnly>
                          )}
                        </div>

                      </>
                    )}

                    {/* Extended Details - Only shown in side-by-side mode */}
                    {layoutMode === 'side-by-side' && (
                      <ScrollArea className="flex-1 min-h-0 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="pr-3 space-y-4">
                          {(extendedDetails || isLoadingExtendedDetails || (filteredUserIpMemberOfGroups && filteredUserIpMemberOfGroups.length >= 2)) && (
                            <div className="space-y-2">
                              {isLoadingExtendedDetails ? (
                                <div className="flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                  <span className={cn("text-sm text-muted-foreground", isMobile ? "text-xs" : "")}>
                                    Loading additional details...
                                  </span>
                                </div>
                              ) : (
                                <>
                                  {extendedDetails?.description && (
                                    <div className="flex items-start gap-1 flex-wrap">
                                      <strong className={cn(isMobile ? "text-sm" : "")}>Description:</strong>
                                      <span className={cn("text-muted-foreground", isMobile ? "text-sm" : "")}>
                                        {extendedDetails.description}
                                      </span>
                                    </div>
                                  )}
                                  {extendedDetails?.lastUpdated && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <div className="flex items-center gap-1">
                                        <strong className={cn(isMobile ? "text-sm" : "")}>Last Updated:</strong>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p className="text-sm">Last modification to this host alias record (name, description, or IP address)</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                      <span className={cn("text-muted-foreground", isMobile ? "text-sm" : "")}>
                                        {new Date(extendedDetails.lastUpdated).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                  {extendedDetails?.lastAssignment && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <strong className={cn(isMobile ? "text-sm" : "")}>Last Operation:</strong>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className={cn("text-muted-foreground cursor-help", isMobile ? "text-sm" : "")}>
                                              {formatLastOperation(
                                                extendedDetails.lastAssignment,
                                                extendedDetails.lastAssignment.hasOwnProperty('userName')
                                              )}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="max-w-xs whitespace-pre-line">
                                            <p>{getLastOperationTooltip(extendedDetails.lastAssignment)}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  )}
                                  {/* Group Breakdown - Only shown when 2 or more groups */}
                                  {filteredUserIpMemberOfGroups && filteredUserIpMemberOfGroups.length >= 2 && (
                                    <div className="flex items-start gap-1 flex-wrap">
                                      <strong className={cn(isMobile ? "text-sm" : "")}>Group Breakdown:</strong>
                                      <span className={cn("text-muted-foreground", isMobile ? "text-sm" : "")}>
                                        {/* Sort groups: Single-Select first, then Multi-Select */}
                                        {[...filteredUserIpMemberOfGroups]
                                          .sort((a, b) => {
                                            const aType = a.groupType;
                                            const bType = b.groupType;
                                            // Single-Select (or undefined) comes before Multi-Select
                                            if (aType === 'SingleSelect' && bType === 'MultiSelect') return -1;
                                            if (aType === 'MultiSelect' && bType === 'SingleSelect') return 1;
                                            return 0;
                                          })
                                          .map((group, index, sortedArray) => {
                                            // Get VPN info for this group
                                            const vpnUuid = groupVpnMap.get(group.uuid);
                                            const vpnInfo = vpnUuid ? vpnConnectionStatuses.get(vpnUuid.trim()) : undefined;

                                            return (
                                              <span key={`${group.uuid}-${index}`} className="inline-flex items-center gap-1">
                                                <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full inline-block" />}>
                                                  {getGroupIcon(group)}
                                                </ClientOnly>
                                                <span>
                                                  {group.friendlyName || group.name}
                                                  {enableGroupTypes && group.groupType ? (
                                                    <span className="ml-0.5 text-xs opacity-70">
                                                      ({group.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})
                                                    </span>
                                                  ) : null}
                                                </span>
                                                {/* Add VPN badge if group has VPN */}
                                                {vpnInfo && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge className={cn(
                                                          "text-white px-1.5 py-0.5",
                                                          vpnInfo.status === 'connected' ? "bg-darker-green hover:bg-darker-green/80 text-white" :
                                                            vpnInfo.status === 'disabled' ? "bg-gray-500 hover:bg-gray-600 text-white" :
                                                              "bg-darker-red hover:bg-darker-red/80 text-white"
                                                        )}>
                                                          {vpnInfo.type === 'openvpn' ? 'OpenVPN' :
                                                            vpnInfo.type === 'wireguard' ? 'WireGuard' :
                                                              vpnInfo.type === 'ipsec' ? 'IPsec' :
                                                                vpnInfo.type}
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        {vpnInfo.type === 'openvpn' && (
                                                          <p>OpenVPN {vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                                                        )}
                                                        {vpnInfo.type === 'wireguard' && (
                                                          <p>WireGuard {vpnInfo.status === 'connected' ? 'Connected' : vpnInfo.status === 'disabled' ? 'Disabled' : 'Disconnected'}</p>
                                                        )}
                                                        {vpnInfo.type === 'ipsec' && (
                                                          <p>IPsec {vpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                                                        )}
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                                {index < sortedArray.length - 1 && <span className="mx-1">-</span>}
                                              </span>
                                            );
                                          })
                                        }
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {/* Graph Section */}
                          {detectedIp && hostAlias && (
                            <>
                              <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
                              <div className="mt-4">
                                <div className="h-[250px] w-full">
                                  <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
                                    <DeviceGroupHistoryGraph
                                      ref={graphRefCard}
                                      ipAddress={detectedIp}
                                      hostAliasName={hostAlias}
                                      currentGroups={userIpMemberOfGroups.map(g => ({
                                        id: g.uuid,
                                        uuid: g.uuid,
                                        name: g.name,
                                        friendlyName: g.friendlyName,
                                        groupType: g.groupType
                                      }))}
                                      isSelfService={true}
                                      className="h-full"
                                    />
                                  </ClientOnly>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </>
                ) : (
                  <Alert variant="destructive" className={isMobile ? 'p-2 text-sm' : ''}>
                    <AlertCircle className={`h-4 w-4 ${isMobile ? 'h-3 w-3' : ''}`} />
                    <AlertTitle className={isMobile ? 'text-sm font-medium' : ''}>IP Detection Issue</AlertTitle>
                    <AlertDescription className={isMobile ? 'text-xs' : ''}>
                      {ipDetectionError || "Could not automatically detect your IP address. Manual IP entry is not supported on this page."}
                    </AlertDescription>
                  </Alert>
                )}
              </TooltipProvider> {/* Close TooltipProvider here */}
            </ClientOnly>

            {/* Group Assignment History Graph (only show in side-by-side mode) */}

          </div>

        </CardContent>
      </Card>
      {hostAlias && hostAliasUuid && detectedIp && ( // Ensure hostAlias, hostAliasUuid and detectedIp are not null before rendering dialog
        <RenameHostAliasDialog
          isOpen={isRenameDialogOpen}
          onClose={() => setIsRenameDialogOpen(false)}
          currentAliasName={hostAlias}
          detectedHostname={detectedHostname}
          ipAddress={detectedIp}
          macAddress={detectedMac}
          isDeviceOnline={!!detectedMac}
          hasDhcpReservation={effectiveHasDhcpReservation}
          isAuthenticated={isAuthenticated}
          deviceUuid={hostAliasUuid} // Add the missing UUID prop
          onRenameSubmit={async (newAliasName, _shouldCreateDhcpReservation, nameChanged, dhcpCreated) => {
            // Progress modal already shows success, no need for toast notifications

            // Update local DHCP status immediately if a reservation was created
            if (dhcpCreated && detectedMac) {
              setLocalDhcpStatus({
                isDhcpReserved: true,
                dhcpReservedMac: detectedMac,
                dhcpReservedVendor: detectedVendor,
              });
            }

            // Trigger a re-fetch of host alias data to update the UI
            if (detectedIp) {
              await refreshHostAlias(detectedIp);
            }
          }}
        />
      )}
      {detectedIp && (
        <Dialog open={isGraphModalOpen} onOpenChange={setIsGraphModalOpen}>
          <DialogContent className="max-w-4xl w-[90vw]">
            <DialogHeader>
              <DialogTitle className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                <span>Group Assignment History</span>
                <span className="hidden md:inline">&nbsp;-&nbsp;</span>
                <span className="text-sm md:text-lg font-normal md:font-semibold text-muted-foreground md:text-foreground">
                  Host Alias: {hostAlias || detectedIp}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="h-[350px] w-full mt-2">
              <DeviceGroupHistoryGraph
                ref={graphRefModal}
                ipAddress={detectedIp}
                hostAliasName={hostAlias || undefined}
                currentGroups={userIpMemberOfGroups.map(g => ({
                  id: g.uuid,
                  uuid: g.uuid,
                  name: g.name,
                  friendlyName: g.friendlyName,
                  groupType: g.groupType
                }))}
                isSelfService={true}
                hideTitle={true}
                className="border-0 shadow-none p-0 h-full"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </React.Fragment>
  );
})
