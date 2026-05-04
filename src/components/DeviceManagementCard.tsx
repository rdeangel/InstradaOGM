'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from "@/components/ui/button"; // Import Button
import { Terminal, Laptop, CheckCircle, AlertCircle, AlertTriangle, ShieldAlert, Network as NetworkIconLucide, RefreshCcw, Loader2, ChevronUp, ChevronDown, HelpCircle, Activity, MousePointerClick } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ClientOnly } from '@/components/util/ClientOnly';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react'; // Corrected import
// Removed unused import IconName
import { flags, generalEmojis } from '@/components/ui/icon-picker';
import { RenameHostAliasDialog } from '@/components/RenameHostAliasDialog';
import { VpnClientType } from '@prisma/client'; // Import VpnClientType

import { logger } from '@/lib/logger';
import { checkMacRandomization } from '@/lib/mac-utils';
import { useGroupType } from '@/context/GroupTypeContext';
import { useSecureUI } from '@/context/SecureUIContext';
import { hasAnyGroupError, getGroupErrorType, getGroupErrorMessage } from '@/utils/groupErrorDetection';
import { formatLastOperation, getLastOperationTooltip, type LastAssignmentData } from '@/lib/format-last-operation';

// Removed unused iconMap

import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { usePageReloadDetection } from '@/hooks/usePageReloadDetection';
import { useAbortController } from '@/hooks/useAbortController';
import { Copy } from 'lucide-react';
import { DeviceGroupHistoryGraph, DeviceGroupHistoryGraphHandles } from '@/components/DeviceGroupHistoryGraph';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusDotWithTooltip, getHostAliasStatusColor } from '@/components/ui/status-dot';
import { ScrollArea } from "@/components/ui/scroll-area";

export interface HostAlias {
  uuid: string;
  name: string;
  type: string;
  content: string;
  description?: string;
  detectedMac?: string | null; // Added
  detectedVendor?: string | null; // Added
  detectedVendorSource?: 'OPNsense' | 'Local DB' | null; // Added for vendor source tracking
  detectedHostname?: string | null; // Added for hostname from ARP table
  isDhcpReserved?: boolean; // Added for DHCP reservation status
  dhcpReservedMac?: string | null; // Added for DHCP reservation MAC
  dhcpReservedVendor?: string | null; // Added for DHCP reservation Vendor
  memberOfGroups?: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[]; // Added for group memberships
  enabled?: string | null; // Add this new prop (matching OPNsense API response)
  hasIpConflict?: boolean; // Added for IP conflict status
  hasMacConflict?: boolean; // Added for MAC conflict status
}

interface SearchableSelectOption {
  value: string;
  label: string;
  detectedMac?: string | null;
  detectedVendor?: string | null;
  isDhcpReserved?: boolean; // Added for DHCP reservation status
  dhcpReservedMac?: string | null; // Added for DHCP reservation MAC
  dhcpReservedVendor?: string | null; // Added for DHCP reservation Vendor
  aliasDescription?: string | null; // Added for alias description
  memberOfGroups?: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[]; // Re-added for group memberships
  vpnInfo?: { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string } | null; // Updated to include 'disabled'
  isDisabled: boolean; // Add isDisabled based on device.enabled
  hasIpConflict?: boolean; // New prop for IP conflict status
  hasMacConflict?: boolean; // New prop for MAC conflict status
  searchableText?: string; // New prop for custom searchable text
}

interface DeviceManagementCardProps {
  onDeviceSelect: (device: HostAlias | null) => void;
  onDevicesLoaded?: (devices: HostAlias[]) => void;
  selectedDeviceUuid: string | null;
  selectedDeviceMemberOfGroups: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[];
  // opnsenseGroupDisplays: OpnsenseGroupDisplay[]; // Removed
  allEmojiValues: string[]; // New prop for all emoji values
  allFlagValues: string[]; // New prop for all flag values
  detectedMac: string | null;
  detectedVendor: string | null;
  detectedHostname: string | null;
  hasDhcpReservation: boolean; // New prop for DHCP reservation status
  hasIpConflict: boolean; // New prop for IP conflict status
  hasMacConflict: boolean; // New prop for MAC conflict status
  vpnConnectionStatuses: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>; // Updated to include 'disabled'
  groupVpnMap: Map<string, string>; // New prop for networkGroupId to vpnUuid map
  onVpnRestart: (vpnUuid: string, vpnClientType: VpnClientType) => Promise<void>; // New prop for VPN restart action
  isVpnRestarting: boolean; // New prop for VPN restart loading state
  refetchVpnStatuses: (inPlace?: boolean, forceRefresh?: boolean) => Promise<void>; // New prop for refreshing VPN statuses with forceRefresh support
  refreshGroups?: (inPlace?: boolean) => Promise<void>; // New prop for refreshing groups in-place
  onClearDeviceCache?: (deviceUuid: string) => void; // New prop for clearing device cache after rename
  layoutMode?: 'stacked' | 'side-by-side'; // New prop for layout mode
  onFetchExtendedDetailsReady?: (fetchFn: (forceRefresh?: boolean) => Promise<void>) => void; // New prop to pass fetchExtendedDetails to parent
}

export interface DeviceManagementCardHandles {
  refreshPermittedDevices: () => Promise<void>;
  updateDeviceMembership: (uuid: string, memberOfGroups: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[]) => void;
  refreshLastOperationOnly: () => Promise<void>;
  refreshGraphs: () => Promise<void>;
}

const DeviceManagementCard = forwardRef<DeviceManagementCardHandles, DeviceManagementCardProps>(function DeviceManagementCard({
  onDeviceSelect,
  onDevicesLoaded,
  selectedDeviceMemberOfGroups,
  allEmojiValues,
  allFlagValues,
  detectedHostname,
  vpnConnectionStatuses,
  groupVpnMap,
  onVpnRestart,
  isVpnRestarting,
  selectedDeviceUuid,
  refetchVpnStatuses,
  refreshGroups,
  onClearDeviceCache,
  layoutMode,
  onFetchExtendedDetailsReady,
}, ref) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { enableGroupTypes, singleSelectName, multiSelectName } = useGroupType();

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

  const [permittedDevices, setPermittedDevices] = useState<HostAlias[]>(() => {
    try {
      const cached = localStorage.getItem('devices-cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const { deviceManagementRenamingEnabled } = useSecureUI();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); // State to control dropdown open/close
  const [windowWidth, setWindowWidth] = useState(0);

  // Persist device list to localStorage for pre-load on next visit
  useEffect(() => {
    try {
      if (permittedDevices.length > 0) {
        localStorage.setItem('devices-cache', JSON.stringify(permittedDevices));
      }
    } catch {}
  }, [permittedDevices]);
  const [windowHeight, setWindowHeight] = useState(0);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const graphRefCard = useRef<DeviceGroupHistoryGraphHandles>(null);
  const graphRefModal = useRef<DeviceGroupHistoryGraphHandles>(null);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };

    if (typeof window !== 'undefined') {
      handleResize(); // Set initial dimensions
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

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



  const memoizedAllGeneralEmojiValues = useMemo(() => new Set([...generalEmojis.map(e => e.value.normalize('NFC')), ...allEmojiValues.map(e => e.normalize('NFC'))]), [allEmojiValues]);
  const memoizedAllFlagValues = useMemo(() => new Set([...flags.map(f => f.value.normalize('NFC')), ...allFlagValues.map(flag => flag.normalize('NFC'))]), [allFlagValues]);

  const getGroupIcon = useCallback((groupUuid: string): React.ReactNode => {
    // Since opnsenseGroupDisplays is removed, we need to find the group from selectedDeviceMemberOfGroups
    const group = selectedDeviceMemberOfGroups.find(g => g.uuid === groupUuid);
    const mappedIconIdentifier = group?.iconIdentifier; // Use iconIdentifier directly from the group

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

    // Fallback to default icons based on group name if no specific iconIdentifier is found
    if (group?.name.toLowerCase().includes('high security')) {
      return <ShieldAlert size={18} className="mr-1.5 text-primary opacity-80" />;
    }
    if (group?.name.toLowerCase().includes('vpn')) {
      return <ShieldAlert size={18} className="mr-1.5 text-primary opacity-80" />;
    }
    return <NetworkIconLucide size={18} className="mr-1.5 text-primary opacity-80" />;
  }, [selectedDeviceMemberOfGroups, memoizedAllGeneralEmojiValues, memoizedAllFlagValues]); // Removed opnsenseGroupDisplays from dependency array

  // Use a ref to track if a fetch is currently in progress for permitted devices
  const isFetchingPermittedDevicesRef = useRef<boolean>(false);

  const fetchPermittedDevices = useCallback(async () => {
    // Skip if already fetching
    if (isFetchingPermittedDevicesRef.current) {
      return;
    }

    // Set flag immediately to prevent race conditions
    isFetchingPermittedDevicesRef.current = true;

    try {
      setIsLoading(true);
      // Use the user-specific devices API
      const response = await fetch('/api/user/devices', { cache: 'no-store' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch permitted devices');
      }
      const displayableHostAliases = await response.json(); // The /api/user/devices endpoint returns the array directly

      const processedHostAliases = displayableHostAliases.map((device: HostAlias) => {
        const calculatedHasIpConflict = device.isDhcpReserved && device.dhcpReservedMac && device.detectedMac && device.dhcpReservedMac.toLowerCase() !== device.detectedMac.toLowerCase();
        // hasMacConflict cannot be reliably determined per device without full DHCP lease information
        // from the API. We'll set it to false for now based on current data constraints.
        const calculatedHasMacConflict = false;

        return {
          ...device,
          hasIpConflict: calculatedHasIpConflict,
          hasMacConflict: calculatedHasMacConflict,
        };
      });

      setPermittedDevices(processedHostAliases);
      onDevicesLoaded?.(processedHostAliases);
    } catch (err) {
      logger.error("Error fetching permitted devices:", err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
      isFetchingPermittedDevicesRef.current = false; // Reset flag
    }
  }, [onDevicesLoaded]); // Empty dependency array since it doesn't depend on any props/state

  // Create a memoized function to fetch extended details
  // Use a ref to track the last IP address we fetched for
  const lastFetchedIpRef = useRef<string | null>(null);

  // Use a ref to track if a fetch is currently in progress
  const isFetchingRef = useRef<boolean>(false);

  // Use a ref to store permittedDevices to avoid recreating fetchExtendedDetails when array reference changes
  const permittedDevicesRef = useRef<HostAlias[]>(permittedDevices);
  useEffect(() => {
    permittedDevicesRef.current = permittedDevices;
  }, [permittedDevices]);

  // Lightweight function to refresh ONLY the last operation field without loading states
  const refreshLastOperationOnly = useCallback(async () => {
    // Only refresh if we're in side-by-side mode and have a selected device
    if (layoutMode !== 'side-by-side' || !selectedDeviceUuid) {
      return;
    }

    // Find the selected device from permittedDevices using the ref
    const selectedDevice = permittedDevicesRef.current.find(d => d.uuid === selectedDeviceUuid);
    if (!selectedDevice || !selectedDevice.content) {
      return;
    }

    try {
      // Fetch only the last assignment data
      const lastAssignmentResponse = await fetch(`/api/opnsense/host-alias-last-assignment?ipAddress=${selectedDevice.content}`);

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
  }, [layoutMode, selectedDeviceUuid]);

  // Function to refresh both graph instances
  // IMPORTANT: Refresh device data first to ensure currentGroups prop is up-to-date
  const refreshGraphs = useCallback(async () => {
    try {
      // First, refresh the device list to get the latest group memberships
      await fetchPermittedDevices();

      // Then refresh the graphs with the updated data
      await Promise.all([
        graphRefCard.current?.refresh(),
        graphRefModal.current?.refresh()
      ].filter(Boolean));
    } catch (error) {
      logger.error('Error refreshing graphs:', error);
    }
  }, [fetchPermittedDevices]);

  const fetchExtendedDetails = useCallback(async (forceRefresh = false) => {
    // Skip if already fetching
    if (isFetchingRef.current) {
      return;
    }

    // Set flag immediately to prevent race conditions
    isFetchingRef.current = true;

    // Only fetch if we're in side-by-side mode and have a selected device
    if (layoutMode !== 'side-by-side' || !selectedDeviceUuid) {
      setExtendedDetails(null);
      lastFetchedIpRef.current = null;
      isFetchingRef.current = false; // Reset flag before returning
      return;
    }

    // Find the selected device from permittedDevices using the ref
    const selectedDevice = permittedDevicesRef.current.find(d => d.uuid === selectedDeviceUuid);
    if (!selectedDevice || !selectedDevice.content) {
      setExtendedDetails(null);
      lastFetchedIpRef.current = null;
      isFetchingRef.current = false; // Reset flag before returning
      return;
    }

    // Skip fetch if we already fetched for this IP address (unless forceRefresh is true)
    if (!forceRefresh && lastFetchedIpRef.current === selectedDevice.content) {
      isFetchingRef.current = false; // Reset flag before returning
      return;
    }

    lastFetchedIpRef.current = selectedDevice.content;
    setIsLoadingExtendedDetails(true);

    try {
      // Fetch both host alias details and last assignment in parallel
      const [hostAliasResponse, lastAssignmentResponse] = await Promise.all([
        fetch(`/api/opnsense/host-alias-management?ipAddress=${selectedDevice.content}`),
        fetch(`/api/opnsense/host-alias-last-assignment?ipAddress=${selectedDevice.content}`)
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
  }, [layoutMode, selectedDeviceUuid]); // REMOVED permittedDevices - using ref instead

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

  useEffect(() => {
    fetchPermittedDevices();
  }, [fetchPermittedDevices]); // Add fetchPermittedDevices as dependency

  // Use refs to avoid dependency issues with focus event handlers
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentControllerRef = useRef<AbortController | null>(null);

  // Store current function references to avoid stale closures
  const refreshFunctionsRef = useRef({
    fetchPermittedDevices,
    refetchVpnStatuses,
    refreshGroups,
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
      fetchPermittedDevices,
      refetchVpnStatuses,
      refreshGroups,
      fetchExtendedDetails,
      refreshLastOperationOnly,
      refreshGraphs,
      createController,
      isAbortError,
      shouldSuppressError,
      createFocusSafeFetch
    };
  }, [fetchPermittedDevices, refetchVpnStatuses, refreshGroups, fetchExtendedDetails, refreshLastOperationOnly, refreshGraphs, createController, isAbortError, shouldSuppressError, createFocusSafeFetch]);

  // Effect to refresh data when the window gains focus (e.g., switching tabs back)
  useEffect(() => {
    const handleFocus = async () => {
      const currentSelectedDeviceUuid = selectedDeviceUuid; // Capture current value
      logger.debug('Window focused, refreshing device data...', { selectedDeviceUuid: currentSelectedDeviceUuid });

      // Abort any previous focus-triggered requests
      if (currentControllerRef.current && !currentControllerRef.current.signal.aborted) {
        logger.debug('Aborting previous device management focus refresh requests');
        currentControllerRef.current.abort('New focus event triggered');
      }

      // Clear any existing timeout
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }

      // Increased delay to reduce collision probability with page reloads
      focusTimeoutRef.current = setTimeout(async () => {
        if (currentSelectedDeviceUuid) {
          // Create new abort controller for this refresh cycle
          currentControllerRef.current = refreshFunctionsRef.current.createController(30000); // 30 second timeout

          // Create focus-safe fetch that will be cancelled during page reload
          const restoreFetch = refreshFunctionsRef.current.createFocusSafeFetch();

          try {
            logger.debug('Starting device management focus refresh with abort controller');

            // Refresh device data, VPN statuses, groups, and last operation in parallel
            const refreshPromises = [
              refreshFunctionsRef.current.fetchPermittedDevices(),
              refreshFunctionsRef.current.refetchVpnStatuses(true, true), // Refresh VPN statuses in-place with force refresh
              refreshFunctionsRef.current.refreshLastOperationOnly() // Lightweight refresh of last operation only (no spinner)
            ];

            // Only refresh groups if the function is provided
            if (refreshFunctionsRef.current.refreshGroups) {
              refreshPromises.push(refreshFunctionsRef.current.refreshGroups(true)); // Refresh groups in-place
            }

            await Promise.all(refreshPromises);

            logger.debug('Device management focus refresh completed successfully');
          } catch (error) {
            // Only log errors that aren't due to abort or page reload
            if (!refreshFunctionsRef.current.isAbortError(error) && !refreshFunctionsRef.current.shouldSuppressError(error, 'device management focus refresh')) {
              logger.error('Error during device management focus refresh:', error);
            } else {
              logger.debug('Device management focus refresh cancelled or suppressed:', error);
            }
          } finally {
            // Always restore original fetch
            restoreFetch();
          }
        }
      }, 500); // Increased delay to reduce collision with page reloads
    };

    // Add both focus and visibility change listeners for better reliability
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        logger.debug('Page became visible, triggering device management focus refresh');
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
        logger.debug('Aborting device management focus refresh requests due to component cleanup');
        currentControllerRef.current.abort('Component cleanup');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to prevent event listener churn - functions are accessed via refs

  // Expose functions via useImperativeHandle
  useImperativeHandle(ref, () => ({
    refreshPermittedDevices: fetchPermittedDevices,
    updateDeviceMembership: (uuid, newMemberOfGroups) => {
      setPermittedDevices(prevDevices => {
        const updatedDevices = prevDevices.map(device => {
          if (device.uuid === uuid) {
            return { ...device, memberOfGroups: newMemberOfGroups };
          }
          return device;
        });
        return updatedDevices;
      });
    },
    refreshLastOperationOnly,
    refreshGraphs,
  }), [fetchPermittedDevices, refreshLastOperationOnly, refreshGraphs]); // Add dependency array

  const prevSelectedDeviceUuidRef = useRef<string | null>(null);

  // Use a ref to store the latest onDeviceSelect callback to avoid recreating the effect
  const onDeviceSelectRef = useRef(onDeviceSelect);
  useEffect(() => {
    onDeviceSelectRef.current = onDeviceSelect;
  }, [onDeviceSelect]);

  // Only call onDeviceSelect when selectedDeviceUuid changes, NOT when permittedDevices changes
  // This prevents infinite loops caused by permittedDevices getting new array references
  useEffect(() => {
    // Only proceed if selectedDeviceUuid actually changed
    if (selectedDeviceUuid === prevSelectedDeviceUuidRef.current) {
      return;
    }

    prevSelectedDeviceUuidRef.current = selectedDeviceUuid;

    if (selectedDeviceUuid) {
      const updatedSelectedDevice = permittedDevices.find(device => device.uuid === selectedDeviceUuid) || null;
      onDeviceSelectRef.current(updatedSelectedDevice);
    } else {
      onDeviceSelectRef.current(null);
    }
  }, [selectedDeviceUuid, permittedDevices]); // Keep permittedDevices to get latest data, but only act on UUID changes

  const selectedDevice = useMemo(() => {
    return permittedDevices.find(device => device.uuid === selectedDeviceUuid) || null;
  }, [permittedDevices, selectedDeviceUuid]);



  const generateSummary = () => {
    let summary = "## Device Management\n";
    if (selectedDevice) {
      summary += `- **Host Alias:** ${selectedDevice.name || 'N/A'}\n`;

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
      } else if (layoutMode === 'side-by-side' && selectedDevice.content) {
        // Even if extendedDetails aren't loaded yet, show a placeholder for Last Operation in side-by-side mode
        summary += `- **Last Operation:** Loading...\n`;
      }

      summary += `- **IP Address:** \`${selectedDevice.content || 'N/A'}\``;
      if (selectedDevice.isDhcpReserved) {
        summary += ` (DHCP Reserved)`;
      }
      if (selectedDevice.hasIpConflict) {
        summary += ` (IP Conflict)`;
      }
      if (selectedDevice.hasMacConflict) {
        summary += ` (MAC Conflict)`;
      }
      summary += `\n`;

      if (detectedHostname) {
        summary += `- **Hostname:** ${detectedHostname}\n`;
      }

      if (selectedDevice?.detectedMac) {
        summary += `- **MAC Address:** \`${selectedDevice.detectedMac}\`\n`;
        if (selectedDevice.detectedVendor) {
          summary += `- **MAC Vendor:** ${selectedDevice.detectedVendor}\n`;
        }
      } else {
        summary += `- **MAC Address:** Not Online\n`;
      }

      if (selectedDeviceMemberOfGroups && selectedDeviceMemberOfGroups.length > 0) {
        // Count total VPNs
        const totalVpns = selectedDeviceMemberOfGroups.filter(group => {
          const vpnUuid = groupVpnMap.get(group.uuid);
          return vpnUuid && vpnConnectionStatuses.has(vpnUuid);
        }).length;

        summary += `- **Group:** ${selectedDeviceMemberOfGroups.length} Groups (${totalVpns} VPNs)\n`;

        // Group Breakdown
        const groupDetails = selectedDeviceMemberOfGroups.map(group => {
          const name = group.friendlyName || group.name;
          const groupType = (group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType;
          // Only include group type text if Group Types are enabled
          const groupTypeText = enableGroupTypes && groupType ? (groupType === 'SingleSelect' ? singleSelectName : multiSelectName) : '';

          const vpnUuid = groupVpnMap.get(group.uuid);
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

          // Only include group type in display if Group Types are enabled
          if (enableGroupTypes && groupTypeText) {
            return vpnInfo && vpnStatusText ? `${name} - ${groupTypeText} (${vpnStatusText})` : `${name} - ${groupTypeText}`;
          } else {
            return vpnInfo && vpnStatusText ? `${name} (${vpnStatusText})` : `${name}`;
          }
        }).join(' - ');
        summary += `- **Group Breakdown:** ${groupDetails}\n`;
      } else {
        summary += `- **Group:** None\n`;
      }
    } else {
      summary += "No device selected.\n";
    }
    return summary;
  };

  const handleCopySummary = async () => {
    const summary = generateSummary();
    const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
    const success = await safeClipboardCopy(summary);
    if (success) {
      toast({
        title: "Copied!",
        description: "Device information summary copied to clipboard.",
        variant: "success",
      });
    } else {
      toast({
        title: "Copy Failed",
        description: getClipboardErrorDescription(),
        variant: "destructive",
      });
    }
  };

  // Collect all VPNs from all assigned groups
  const allVpnInfos: Array<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }> = (() => {
    const vpns: Array<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }> = [];

    for (const g of selectedDeviceMemberOfGroups) {
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

  // Extracted conditional logic for VPN restart button rendering
  const shouldRenderVpnRestartButton = useMemo(() => {
    if (!relevantVpnInfo) return false;
    return relevantVpnInfo.status === 'disconnected' && (
      relevantVpnInfo.type === 'OpenVPN' ||
      (relevantVpnInfo.type === 'WireGuard' && relevantVpnInfo.enabled === '1') ||
      relevantVpnInfo.type === 'IPsec'
    );
  }, [relevantVpnInfo]);

  const deviceOptions: SearchableSelectOption[] = permittedDevices.map(device => {
    const isPrivacyMac = (device.detectedMac && checkMacRandomization(device.detectedMac).isRandomized) ||
      (device.isDhcpReserved && device.dhcpReservedMac && checkMacRandomization(device.dhcpReservedMac).isRandomized);

    const searchableText = [
      device.name,
      device.content,
      device.detectedMac,
      device.detectedVendor,
      device.detectedHostname,
      device.description,
      device.isDhcpReserved ? 'dhcp' : '',
      device.hasIpConflict ? 'dhcp-conflict' : '',
      device.hasMacConflict ? 'dhcp-conflict' : '',
      isPrivacyMac ? 'privacy' : '', // Add 'privacy' keyword
      isPrivacyMac ? 'dhcp-privacy-mac' : '', // Add 'dhcp-privacy-mac' keyword
      device.enabled !== '1' ? 'disabled' : '',
      device.detectedMac ? 'arp' : '',
      device.detectedMac ? 'online' : 'offline',
      ...(device.memberOfGroups || []).map(g => g.name),
      ...(device.memberOfGroups || []).map(g => g.friendlyName),
    ].filter(Boolean).join(' ').toLowerCase();

    return {
      value: device.uuid,
      label: `${device.name} (${device.content})`,
      detectedMac: device.detectedMac || null,
      detectedVendor: device.detectedVendor || null,
      isDhcpReserved: device.isDhcpReserved || false, // Pass DHCP reservation status
      dhcpReservedMac: device.dhcpReservedMac || null, // Pass DHCP reserved MAC
      dhcpReservedVendor: device.dhcpReservedVendor || null, // Pass DHCP reserved Vendor
      aliasDescription: device.description || null, // Pass alias description
      memberOfGroups: device.memberOfGroups, // Pass group memberships
      vpnInfo: (() => { // Determine VPN status for the device
        if (device.memberOfGroups && device.memberOfGroups.length > 0) {
          for (const group of device.memberOfGroups) {
            const vpnUuidRaw = groupVpnMap.get(group.uuid);
            if (vpnUuidRaw) {
              const vpnUuid = vpnUuidRaw.trim(); // Trim here
              const info = vpnConnectionStatuses.get(vpnUuid);
              if (info) {
                return info;
              }
            }
          }
        }
        return null;
      })(),
      isDisabled: device.enabled !== '1', // Disable only if device itself is disabled
      hasIpConflict: device.hasIpConflict || false, // Pass IP conflict status
      hasMacConflict: device.hasMacConflict || false, // Pass MAC conflict status
      searchableText: searchableText, // Add searchableText
    };
  });

  const renderDeviceOption = useCallback((option: SearchableSelectOption, vpnConnectionStatuses: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>, groupVpnMap: Map<string, string>) => {
    // Collect all VPNs from all assigned groups for this option
    const allOptionVpns: Array<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }> = [];

    if (option.memberOfGroups && option.memberOfGroups.length > 0) {
      for (const group of option.memberOfGroups) {
        const vpnUuidRaw = groupVpnMap.get(group.uuid);
        if (vpnUuidRaw) {
          const vpnUuid = vpnUuidRaw.trim();
          // Check if we already have this VPN (avoid duplicates)
          const existingVpn = allOptionVpns.find(vpn => vpn.vpnUuid === vpnUuid);
          if (!existingVpn) {
            const info = vpnConnectionStatuses.get(vpnUuid);
            if (info) {
              allOptionVpns.push({ vpnUuid: vpnUuid, status: info.status, type: info.type, enabled: info.enabled });
            }
          }
        }
      }
    }

    // Calculate overall VPN status for badge display
    const deviceVpnInfo: { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string; isMultiple?: boolean; connectedCount?: number; totalCount?: number } | null = (() => {
      if (allOptionVpns.length === 0) return null;

      if (allOptionVpns.length === 1) {
        // Single VPN - return as-is
        return allOptionVpns[0];
      }

      // Multiple VPNs - determine overall status
      const connectedCount = allOptionVpns.filter(vpn => vpn.status === 'connected').length;
      const totalCount = allOptionVpns.length;

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
        ...allOptionVpns[0],
        status: overallStatus,
        isMultiple: true,
        connectedCount,
        totalCount
      };
    })();

    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <StatusDotWithTooltip
            color={getHostAliasStatusColor(
              !option.isDisabled, // isEnabled = !isDisabled
              !!option.detectedMac // hasArpEntry = has detected MAC
            )}
            tooltip={
              <div>
                <p>Status: {!option.isDisabled ? (option.detectedMac ? 'Online' : 'Offline') : 'Disabled'}</p>
                {option.detectedMac && <p>MAC: {option.detectedMac}</p>}
                {option.detectedVendor && <p>Vendor: {option.detectedVendor}</p>}
                {option.aliasDescription && <p>Description: {option.aliasDescription}</p>}
              </div>
            }
            size="sm"
          />
          <span className="break-words whitespace-normal">{option.label}</span>
        </div>
        <div className="flex-grow flex items-center gap-1 mt-1 sm:mt-0 sm:ml-2 flex-wrap max-w-full justify-end">
          {option.isDhcpReserved && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={cn(
                    "h-4 w-auto px-1 text-xs",
                    (() => {
                      const isConflict = option.hasIpConflict || option.hasMacConflict;
                      const isPrivacyMac = option.isDhcpReserved && option.dhcpReservedMac &&
                        checkMacRandomization(option.dhcpReservedMac).isRandomized;



                      if (isConflict) {
                        return "bg-orange-500 hover:bg-orange-600 text-white"; // Conflict (highest priority)
                      } else if (isPrivacyMac) {
                        return "bg-yellow-600 hover:bg-yellow-700 text-white"; // Privacy MAC (medium priority)
                      } else {
                        return "bg-blue-500 hover:bg-blue-600 text-white"; // Normal (lowest priority)
                      }
                    })()
                  )}>
                    DHCP
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {(() => {
                    const isConflict = option.hasIpConflict || option.hasMacConflict;
                    const isPrivacyMac = option.isDhcpReserved && option.dhcpReservedMac &&
                      checkMacRandomization(option.dhcpReservedMac).isRandomized;

                    if (isConflict) {
                      return (
                        <>
                          <p>DHCP Conflict: Reserved for a different MAC address.</p>
                          {option.dhcpReservedMac && <p>Reserved MAC: {option.dhcpReservedMac}</p>}
                          {option.dhcpReservedVendor && <p>Reserved Vendor: {option.dhcpReservedVendor}</p>}
                          {option.detectedMac && <p>Active MAC: {option.detectedMac}</p>}
                        </>
                      );
                    } else if (isPrivacyMac) {
                      return (
                        <>
                          <p>Reserved but Privacy MAC Address detected.</p>
                          {option.dhcpReservedMac && <p>Reserved MAC: {option.dhcpReservedMac}</p>}
                          {option.dhcpReservedVendor && <p>Reserved Vendor: {option.dhcpReservedVendor}</p>}
                        </>
                      );
                    } else {
                      return (
                        <>
                          <p>DHCP Reserved</p>
                          {option.dhcpReservedMac && <p>MAC: {option.dhcpReservedMac}</p>}
                          {option.dhcpReservedVendor && <p>Vendor: {option.dhcpReservedVendor}</p>}
                        </>
                      );
                    }
                  })()}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {deviceVpnInfo && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={cn(
                    "h-4 w-auto px-1 text-xs",
                    // Updated status logic to handle multiple VPNs and mixed states
                    deviceVpnInfo.status === 'connected' ? "bg-darker-green hover:bg-darker-green/80 text-white" :
                      deviceVpnInfo.status === 'disabled' ? (deviceVpnInfo.isMultiple ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-gray-500 hover:bg-gray-600 text-white") :
                        "bg-darker-red hover:bg-darker-red/80 text-white"
                  )}>
                    {deviceVpnInfo.isMultiple ? (
                      `${deviceVpnInfo.totalCount} VPNs`
                    ) : (
                      deviceVpnInfo.type === 'openvpn' ? 'OpenVPN' :
                        deviceVpnInfo.type === 'wireguard' ? 'WireGuard' :
                          deviceVpnInfo.type === 'ipsec' ? 'IPsec' :
                            deviceVpnInfo.type
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {deviceVpnInfo.isMultiple ? (
                    <div className="space-y-1">
                      <p className="font-medium">VPN Status Summary:</p>
                      <p>✓ {deviceVpnInfo.connectedCount} Connected</p>
                      <p>✗ {deviceVpnInfo.totalCount! - deviceVpnInfo.connectedCount!} Disconnected/Disabled</p>
                      <div className="border-t pt-1 mt-2">
                        <p className="font-medium">VPNs:</p>
                        {allOptionVpns.map((vpn, index) => (
                          <p key={index} className="text-sm">
                            {vpn.type === 'openvpn' ? 'OpenVPN' :
                              vpn.type === 'wireguard' ? 'WireGuard' :
                                vpn.type === 'ipsec' ? 'IPsec' :
                                  vpn.type} - {vpn.status === 'connected' ? 'Connected' : vpn.status === 'disabled' ? 'Disabled' : 'Disconnected'}
                          </p>
                        ))}
                      </div>
                      {option.memberOfGroups && option.memberOfGroups.length > 0 && (
                        <div className="border-t pt-1 mt-2">
                          <p className="font-medium">Groups:</p>
                          {option.memberOfGroups.map((g, index) => (
                            <p key={index} className="text-sm">{g.friendlyName || g.name}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {deviceVpnInfo.type === 'openvpn' && (
                        <p>OpenVPN {deviceVpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                      )}
                      {deviceVpnInfo.type === 'wireguard' && (
                        <p>WireGuard {deviceVpnInfo.status === 'connected' ? 'Connected' : deviceVpnInfo.status === 'disabled' ? 'Disabled' : 'Disconnected'}</p>
                      )}
                      {deviceVpnInfo.type === 'ipsec' && (
                        <p>IPsec {deviceVpnInfo.status === 'connected' ? 'Connected' : 'Disconnected'}</p>
                      )}
                      {option.memberOfGroups && option.memberOfGroups.length > 0 && (
                        option.memberOfGroups.length === 1 ? (
                          <p>Group Association: {option.memberOfGroups[0].friendlyName || option.memberOfGroups[0].name}{enableGroupTypes ? ` (${option.memberOfGroups[0].groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                        ) : (
                          <div>
                            <p>Group Association:</p>
                            {option.memberOfGroups.map((g, index) => (
                              <p key={index} className="text-sm">{g.friendlyName || g.name}{enableGroupTypes ? ` (${g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                            ))}
                          </div>
                        )
                      )}
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.memberOfGroups && option.memberOfGroups.length > 0 && ( // Check if there are any memberOfGroups
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className={cn(
                    "h-4 w-auto px-1 text-xs",
                    option.memberOfGroups.length === 1
                      ? "bg-amber-700 hover:bg-amber-700/80 text-white"
                      : hasAnyGroupError(option.memberOfGroups, enableGroupTypes)
                        ? "bg-orange-500 hover:bg-orange-600 text-white"
                        : "bg-red-600 hover:bg-red-700 text-white"
                  )}>
                    {option.memberOfGroups.length === 1 ? 'InGroup' : `${option.memberOfGroups.length} Groups`}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {hasAnyGroupError(option.memberOfGroups || [], enableGroupTypes) ? (
                    <div>
                      <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(option.memberOfGroups || [], enableGroupTypes))}</p>
                      <p className="text-sm mt-1">Member of:</p>
                      {option.memberOfGroups?.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name}{enableGroupTypes ? ` (${g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                      ))}
                    </div>
                  ) : enableGroupTypes ? (
                    <div>
                      <p className="text-sm">Member of:</p>
                      {option.memberOfGroups?.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name} ({g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})</p>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm">Member of:</p>
                      {option.memberOfGroups?.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name}</p>
                      ))}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.detectedMac && checkMacRandomization(option.detectedMac).isRandomized && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="h-4 w-auto px-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white">
                    Privacy
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Privacy MAC Address detected.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.detectedMac && ( // New ARP badge
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="h-4 w-auto px-1 text-xs bg-purple-500 hover:bg-purple-600 text-white">
                    ARP
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Device detected online via ARP.</p>
                  {option.detectedMac && <p>MAC: {option.detectedMac}</p>}
                  {option.detectedVendor && <p>Vendor: {option.detectedVendor}</p>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    );
  }, [multiSelectName, singleSelectName, enableGroupTypes]);

  const renderSelectedDevice = useCallback((option: SearchableSelectOption) => {
    return (
      <div className="flex items-center gap-2">
        <StatusDotWithTooltip
          color={getHostAliasStatusColor(
            !option.isDisabled,
            !!option.detectedMac
          )}
          tooltip={
            <div>
              <p>Status: {!option.isDisabled ? (option.detectedMac ? 'Online' : 'Offline') : 'Disabled'}</p>
            </div>
          }
          size="sm"
        />
        <span className="truncate">{option.label}</span>
      </div>
    );
  }, []);

  // Removed useEffect for selectWidth calculation as it's no longer needed

  return (
    <>
      <Card className={cn("w-full shadow-lg", layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0" : "")}>
        <CardHeader className={`flex flex-row items-center justify-between ${isMobile ? 'p-3' : ''}`}>
          <div className="flex-grow">
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <Laptop size={isMobile ? 22 : 28} className="mr-2 text-primary" />
              Device Management
            </CardTitle>
            <CardDescription className={`mt-1 ${isMobile ? 'text-xs' : ''}`}>
              Select a device to manage its access.
            </CardDescription>
          </div>
          <ClientOnly fallback={<Skeleton className={`h-6 w-6 rounded-full ${isMobile ? 'h-5 w-5' : ''}`} />}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-6 w-6 ml-1.5",
                      isMobile ? "h-5 w-5" : "",
                      selectedDevice ? "" : "cursor-not-allowed opacity-50"
                    )}
                    onClick={async () => {
                      if (selectedDevice && !isLoading) {
                        try {
                          // Refresh device data, VPN statuses, groups, and last operation in parallel
                          const refreshPromises = [
                            fetchPermittedDevices(),
                            refetchVpnStatuses(true, true), // Refresh VPN statuses in-place with force refresh
                            refreshLastOperationOnly() // Lightweight refresh of last operation only (no spinner)
                          ];

                          // Only refresh groups if the function is provided
                          if (refreshGroups) {
                            refreshPromises.push(refreshGroups(true)); // Refresh groups in-place
                          }

                          await Promise.all(refreshPromises);
                        } catch (error) {
                          logger.error('Error during manual refresh:', error);
                        }
                      }
                    }}
                    disabled={!selectedDevice || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw size={isMobile ? 18 : 22} />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh device information</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Copy
                    size={isMobile ? 18 : 22}
                    className={cn(
                      "ml-1.5 transition-colors",
                      selectedDevice ? "text-muted-foreground cursor-copy hover:text-primary" : "text-gray-500 cursor-not-allowed"
                    )}
                    onClick={() => selectedDevice && handleCopySummary()}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy device information summary</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Graph Modal Button - Visible in all modes when device is selected */}
            {/* Graph Modal Button - Always visible, disabled if no device selected */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!selectedDevice}
                    className={cn(
                      "h-6 w-6 ml-1.5",
                      isMobile ? "h-5 w-5" : "",
                      !selectedDevice ? "opacity-50 cursor-not-allowed" : ""
                    )}
                    onClick={() => selectedDevice && setIsGraphModalOpen(true)}
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
                      "h-6 w-6 ml-1.5",
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
                  <p>{isCollapsed ? "Expand" : "Collapse"} device information</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </ClientOnly>
        </CardHeader>
        <CardContent className={cn(layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "")}>
          {error ? (
            <Alert variant="destructive">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className={cn("space-y-4", layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0" : "")}>
            <TooltipProvider>
              <div>
                <Label htmlFor="device-select">Select a Device</Label>
                <SearchableSelect
                  id="device-select"
                  options={deviceOptions}
                  onValueChange={(value) => {
                    const selectedOption = permittedDevices.find(device => device.uuid === value);
                    onDeviceSelect(selectedOption || null);
                  }}
                  value={selectedDeviceUuid}
                  placeholder="Select a Device"
                  emptyValueLabel="Select a Device"
                  style={{ width: '100%' }} // Set width to 100% to allow shrinking
                  className="w-full md:w-[600px]"
                  renderOption={(option) => renderDeviceOption(option, vpnConnectionStatuses, groupVpnMap)}
                  renderSelectedOption={renderSelectedDevice}
                  onRefresh={async () => {
                    try {
                      // Refresh device data, VPN statuses, groups, and last operation in parallel
                      const refreshPromises = [
                        fetchPermittedDevices(),
                        refetchVpnStatuses(true, true), // Refresh VPN statuses in-place with force refresh
                        refreshLastOperationOnly() // Lightweight refresh of last operation only (no spinner)
                      ];

                      // Only refresh groups if the function is provided
                      if (refreshGroups) {
                        refreshPromises.push(refreshGroups(true)); // Refresh groups in-place
                      }

                      await Promise.all(refreshPromises);
                    } catch (error) {
                      logger.error('Error during searchable select refresh:', error);
                    }
                  }} // Pass the refresh function
                  isRefreshLoading={isLoading} // Pass the loading state
                  open={isDropdownOpen} // Pass open state
                  onOpenChange={setIsDropdownOpen} // Pass onOpenChange handler
                  // Always enable progressive loading to avoid switching between modes
                  enableVirtualScrolling={true}
                  initialLoadCount={100}
                  loadMoreCount={50}
                  searchDebounceMs={300}
                  onShowSearchHelp={() => (
                    <>
                      <p>Search terms:</p>
                      <ul className="list-disc list-inside">
                        <li><code className="font-mono">{`<IP>`}</code>: e.g. 192.168.1.1</li>
                        <li><code className="font-mono">{`<MAC>`}</code>: e.g. 00:11:22:33:44:55</li>
                        <li><code className="font-mono">{`<MAC Vendor>`}</code>: e.g. samsung</li>
                        <li><code className="font-mono">{`<Hostname>`}</code>: e.g. mydevice.local</li>
                        <li><code className="font-mono">{`<Host Alias>`}</code>: Search by Alias Name</li>
                        <li><code className="font-mono">{`<Group>`}</code>: Search by Group Name</li>
                        <li><code className="font-mono">single-select</code>: Devices in {singleSelectName} groups</li>
                        <li><code className="font-mono">multi-select</code>: Devices in {multiSelectName} groups</li>
                        <li><code className="font-mono">vpn</code>: Devices in any VPN</li>
                        <li><code className="font-mono">openvpn</code>: Devices using OpenVPN</li>
                        <li><code className="font-mono">wireguard</code>: Devices using WireGuard</li>
                        <li><code className="font-mono">ipsec</code>: Devices using IPsec</li>
                        <li><code className="font-mono">ingroup</code>: Devices associated to a group</li>
                        <li><code className="font-mono">ingroup-error</code>: Devices with group assignment errors (multiple groups when disabled, or multiple single-select when enabled)</li>
                        <li><code className="font-mono">dhcp</code>: Devices with DHCP reservations</li>
                        <li><code className="font-mono">dhcp-conflict</code>: Devices with DHCP MAC conflicts</li>
                        <li><code className="font-mono">dhcp-privacy-mac</code>: Devices with Privacy MAC DHCP reservations</li>
                        <li><code className="font-mono">privacy</code>: Devices with Privacy MAC addresses (from ARP or DHCP)</li>
                        <li><code className="font-mono">vpn-connected</code>: Devices with connected VPNs</li>
                        <li><code className="font-mono">vpn-disconnected</code>: Devices with disconnected VPNs</li>
                        <li><code className="font-mono">online</code>: Devices detected via ARP</li>
                        <li><code className="font-mono">offline</code>: Devices not detected via ARP</li>
                        <li><code className="font-mono">disabled</code>: Disabled host aliases</li>
                        <li><code className="font-mono">arp</code>: Devices detected via ARP (online)</li>
                      </ul>
                    </>
                  )}
                />
              </div>

              <div className={cn("space-y-2", layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0" : "")}>
                {!selectedDevice ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-muted-foreground space-y-2 animate-in fade-in duration-500">
                    <MousePointerClick className="w-12 h-12 animate-bounce opacity-50" />
                    <p className="text-lg font-medium">Select a device to view details</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      <strong className={cn(isMobile ? "text-sm" : "")}>Host Alias:</strong>
                      {selectedDevice && selectedDevice?.enabled !== '1' ? (
                        <>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "font-mono rounded-md inline-block transition-colors cursor-not-allowed bg-gray-400 dark:bg-gray-700 opacity-60 px-2.5 py-0.5 text-white",
                                    isMobile ? "text-sm" : "text-base"
                                  )}
                                >
                                  {selectedDevice?.name || 'Please select'}
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
                            "font-mono rounded-md inline-block transition-colors",
                            deviceManagementRenamingEnabled && selectedDevice?.name
                              ? "cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
                              : (selectedDevice?.name
                                ? "cursor-copy bg-primary text-primary-foreground hover:bg-primary/90"
                                : "cursor-copy hover:bg-gray-500 dark:hover:bg-gray-600 bg-gray-400 dark:bg-gray-700"),
                            "px-2.5 py-0.5",
                            !selectedDevice?.name ? "text-white" : "", // Only add text-white if no selection (gray background)
                            isMobile ? "text-sm" : "text-base"
                          )}
                          onClick={async () => {
                            if (selectedDevice && selectedDevice?.enabled !== '1') return;
                            if (deviceManagementRenamingEnabled && selectedDevice?.name) {
                              setIsRenameDialogOpen(true);
                            } else if (!deviceManagementRenamingEnabled && selectedDevice?.name) {
                              // Copy functionality when renaming is disabled
                              const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                              const success = await safeClipboardCopy(selectedDevice.name);
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
                          title={
                            deviceManagementRenamingEnabled && selectedDevice?.name
                              ? "Click to rename Host Alias"
                              : (!deviceManagementRenamingEnabled && selectedDevice?.name
                                ? "Click to copy Host Alias"
                                : undefined)
                          }
                        >
                          {selectedDevice?.name || 'Please select'}
                        </span>
                      )}
                      {selectedDevice && (
                        <Badge className={cn("ml-1.5 px-1.5 py-0.5 text-white", isMobile ? "text-[0.7rem]" : "text-xs",
                          selectedDevice.enabled !== '1' ? "bg-gray-400 hover:bg-gray-400" :
                            selectedDevice.detectedMac ? "bg-green-500 hover:bg-green-500" : "bg-red-500 hover:bg-red-500"
                        )}>
                          {selectedDevice.enabled !== '1' ? "Disabled" :
                            selectedDevice.detectedMac ? "Online" : "Offline"}
                        </Badge>
                      )}
                    </div>
                    {!isCollapsed && (
                      <>
                        <div className="flex items-center gap-1">
                          <strong className={cn(isMobile ? "text-sm" : "")}>IP Address:</strong>
                          <span
                            className={cn(
                              "font-mono rounded-md inline-block",
                              selectedDevice?.enabled !== '1'
                                ? "bg-gray-400 dark:bg-gray-700 opacity-60 cursor-not-allowed text-white"
                                : !selectedDevice?.detectedMac
                                  ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-copy transition-colors" // Enabled but offline
                                  : selectedDevice?.content
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-copy transition-colors"
                                    : "bg-gray-400 dark:bg-gray-700 cursor-copy transition-colors hover:bg-gray-500 dark:hover:bg-gray-600 text-white",
                              "px-2.5 py-0.5",
                              isMobile ? "text-sm" : "text-base"
                            )}
                            onClick={async () => {
                              if (selectedDevice?.content) {
                                const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                                const success = await safeClipboardCopy(selectedDevice.content);
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
                            title={selectedDevice?.content ? "Click to copy IP Address" : undefined}
                          >
                            {selectedDevice?.content || 'Not available'}
                          </span>
                          {selectedDevice?.isDhcpReserved && (selectedDevice.hasIpConflict || selectedDevice.hasMacConflict) ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className={cn("ml-1.5 bg-orange-500 hover:bg-orange-600 text-white cursor-help px-1.5 py-0.5", isMobile ? "text-[0.7rem]" : "text-xs")}>
                                  DHCP Conflict
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>DHCP Conflict: Reserved for a different MAC address.</p>
                                {selectedDevice.dhcpReservedMac && <p>Reserved MAC: {selectedDevice.dhcpReservedMac}</p>}
                                {selectedDevice.dhcpReservedVendor && selectedDevice.dhcpReservedMac && !checkMacRandomization(selectedDevice.dhcpReservedMac).isRandomized && <p>Reserved Vendor: {selectedDevice.dhcpReservedVendor}</p>}
                                {selectedDevice.detectedMac && <p>Active MAC: {selectedDevice.detectedMac}</p>}
                              </TooltipContent>
                            </Tooltip>
                          ) : selectedDevice?.isDhcpReserved ? (
                            (() => {
                              const isPrivacyMac = selectedDevice.dhcpReservedMac &&
                                checkMacRandomization(selectedDevice.dhcpReservedMac).isRandomized;
                              return isPrivacyMac ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className={cn("ml-1.5 bg-yellow-600 hover:bg-yellow-700 text-white cursor-help px-1.5 py-0.5", isMobile ? "text-[0.7rem]" : "text-xs")}>
                                      DHCP
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>DHCP (Privacy MAC)</p>
                                    {selectedDevice.dhcpReservedMac && <p>Reserved MAC: {selectedDevice.dhcpReservedMac}</p>}
                                    {selectedDevice.dhcpReservedVendor && selectedDevice.dhcpReservedMac && !checkMacRandomization(selectedDevice.dhcpReservedMac).isRandomized && <p>Reserved Vendor: {selectedDevice.dhcpReservedVendor}</p>}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
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
                            })()
                          ) : null}
                        </div>

                        {detectedHostname && (
                          <div className="flex items-center gap-1">
                            <strong className={cn(isMobile ? "text-sm" : "")}>Hostname:</strong>
                            <span
                              className={cn(
                                "font-mono bg-muted rounded-md inline-block",
                                detectedHostname ? "cursor-copy transition-colors hover:bg-primary/90" : "hover:bg-gray-500 dark:hover:bg-gray-600",
                                detectedHostname ? "bg-primary" : "bg-gray-400 dark:bg-gray-700",
                                "px-2.5 py-0.5 text-white",
                                isMobile ? "text-sm" : "text-base"
                              )}

                            >
                              {detectedHostname}
                            </span>
                          </div>
                        )}

                        {selectedDevice?.detectedMac && (
                          <div className="flex items-center gap-1">
                            <strong className={cn(isMobile ? "text-sm" : "")}>MAC Address:</strong>
                            <Tooltip delayDuration={200}>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "font-mono rounded-md inline-block",
                                    selectedDevice?.enabled !== '1'
                                      ? "bg-gray-400 dark:bg-gray-700 opacity-60 cursor-not-allowed text-white"
                                      : !selectedDevice?.detectedMac
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-copy transition-colors" // Enabled but offline (shouldn't happen for MAC usually if offline means no MAC, but for consistency)
                                        : "bg-primary text-primary-foreground hover:bg-primary/90 cursor-copy transition-colors",
                                    "px-2.5 py-0.5",
                                    isMobile ? "text-sm" : "text-base"
                                  )}
                                  onClick={async () => {
                                    if (selectedDevice?.detectedMac) {
                                      const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                                      const success = await safeClipboardCopy(selectedDevice.detectedMac);
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
                                  title={selectedDevice?.detectedMac ? "Click to copy MAC Address" : undefined}
                                >
                                  {selectedDevice.detectedMac || 'Not Online'}
                                </span>
                              </TooltipTrigger>
                              {selectedDevice.detectedVendor && (
                                <TooltipContent>
                                  {checkMacRandomization(selectedDevice.detectedMac).isRandomized && <p>Privacy Mac Address</p>}
                                  {!checkMacRandomization(selectedDevice.detectedMac).isRandomized && (
                                    <>
                                      <p>MAC Vendor: {selectedDevice.detectedVendor}</p>
                                      {selectedDevice.detectedVendorSource && <p className="text-xs text-muted-foreground mt-1">Source: {selectedDevice.detectedVendorSource === 'OPNsense' ? 'OPNsense ARP Table' : 'Local Vendor Database'}</p>}
                                    </>
                                  )}
                                </TooltipContent>
                              )}
                            </Tooltip>
                            {selectedDevice.detectedMac && checkMacRandomization(selectedDevice.detectedMac).isRandomized && (
                              <Badge className={cn("ml-1.5 bg-yellow-600 hover:bg-yellow-700 text-white px-1.5 py-0.5", isMobile ? "text-[0.7rem]" : "text-xs")}>
                                Privacy
                              </Badge>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1 flex-wrap">
                          <strong className={cn(isMobile ? "text-sm" : "")}>Group:</strong>
                          {selectedDevice && selectedDevice.enabled !== '1' && selectedDeviceMemberOfGroups && selectedDeviceMemberOfGroups.length > 0 ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={cn(
                                    "font-mono px-1.5 py-0.5 rounded-md inline-flex items-center gap-1",
                                    "bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700 cursor-not-allowed",
                                    isMobile ? "text-sm" : "text-base"
                                  )}>
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    {enableGroupTypes && selectedDeviceMemberOfGroups.length > 1 ? (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex items-center">
                                              {selectedDeviceMemberOfGroups.length} Groups
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div className="space-y-1">
                                              {selectedDeviceMemberOfGroups.map((group) => (
                                                <div key={group.uuid} className="flex items-center gap-2">
                                                  <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                    {getGroupIcon(group.uuid)}
                                                  </ClientOnly>
                                                  <span>
                                                    {group.friendlyName || group.name}
                                                    {enableGroupTypes && (group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? ` (${((group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : hasAnyGroupError(selectedDeviceMemberOfGroups, enableGroupTypes) ? (
                                      // Show error for multiple groups (when disabled) or multiple single-select groups (when enabled)
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex items-center">
                                              {selectedDeviceMemberOfGroups.length} Groups
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div>
                                              <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(selectedDeviceMemberOfGroups, enableGroupTypes))}</p>
                                              <p className="text-sm mt-1">Member of:</p>
                                              {selectedDeviceMemberOfGroups.map((group) => (
                                                <div key={group.uuid} className="flex items-center gap-2">
                                                  <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                    {getGroupIcon(group.uuid)}
                                                  </ClientOnly>
                                                  <span className="text-sm">
                                                    {group.friendlyName || group.name}
                                                  </span>
                                                </div>
                                              ))}
                                              <div className="border-t pt-2 mt-2">
                                                <p className="text-xs text-gray-400">
                                                  To resolve: Assign this device to a single group using the controls below.
                                                </p>
                                              </div>
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
                                                {getGroupIcon(selectedDeviceMemberOfGroups[0].uuid)}
                                              </ClientOnly>
                                              {selectedDeviceMemberOfGroups[0].friendlyName || selectedDeviceMemberOfGroups[0].name}
                                              {enableGroupTypes && (selectedDeviceMemberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? ` (${((selectedDeviceMemberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                  {getGroupIcon(selectedDeviceMemberOfGroups[0].uuid)}
                                                </ClientOnly>
                                                <span>
                                                  {selectedDeviceMemberOfGroups[0].friendlyName || selectedDeviceMemberOfGroups[0].name}
                                                  {enableGroupTypes && (selectedDeviceMemberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? ` (${((selectedDeviceMemberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                </span>
                                              </div>
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Group Membership is Inactive</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : selectedDevice && selectedDevice.enabled !== '1' && (!selectedDeviceMemberOfGroups || selectedDeviceMemberOfGroups.length === 0) ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={cn(
                                    "font-mono px-1.5 py-0.5 rounded-md inline-flex items-center gap-1",
                                    "bg-gray-400 dark:bg-gray-700 text-white border border-gray-400 dark:border-gray-700 cursor-not-allowed opacity-60",
                                    isMobile ? "text-sm" : "text-base"
                                  )}>
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {"No Membership"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>This device is currently not a member of any group!</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className={cn(
                              "font-mono px-1.5 py-0.5 rounded-md inline-flex items-center gap-1",
                              selectedDeviceMemberOfGroups && selectedDeviceMemberOfGroups.length > 0
                                ? hasAnyGroupError(selectedDeviceMemberOfGroups, enableGroupTypes)
                                  ? "bg-orange-100 text-orange-800 border border-orange-700"
                                  : "bg-green-100 text-green-800 border border-green-700"
                                : "bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700",
                              isMobile ? "text-sm" : "text-base"
                            )}>
                              {selectedDeviceMemberOfGroups && selectedDeviceMemberOfGroups.length > 0 ? (
                                <>
                                  {hasAnyGroupError(selectedDeviceMemberOfGroups, enableGroupTypes) ? (
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                  ) : (
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                  )}
                                  {hasAnyGroupError(selectedDeviceMemberOfGroups, enableGroupTypes) ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center">
                                            {selectedDeviceMemberOfGroups.length} Groups
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div>
                                            <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(selectedDeviceMemberOfGroups, enableGroupTypes))}</p>
                                            <p className="text-sm mt-1">Member of:</p>
                                            {selectedDeviceMemberOfGroups.map((group) => (
                                              <div key={group.uuid} className="flex items-center gap-2">
                                                <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                  {getGroupIcon(group.uuid)}
                                                </ClientOnly>
                                                <span className="text-sm">
                                                  {group.friendlyName || group.name}
                                                  {enableGroupTypes && (group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? ` (${((group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
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
                                  ) : enableGroupTypes && selectedDeviceMemberOfGroups.length > 1 ? (
                                    // When group types are enabled and multiple groups but no error, show normal tooltip
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center">
                                            {selectedDeviceMemberOfGroups.length} Groups
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="space-y-1">
                                            {selectedDeviceMemberOfGroups.map((group) => (
                                              <div key={group.uuid} className="flex items-center gap-2">
                                                <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                  {getGroupIcon(group.uuid)}
                                                </ClientOnly>
                                                <span>
                                                  {group.friendlyName || group.name}
                                                  {enableGroupTypes && (group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? ` (${((group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
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
                                              {getGroupIcon(selectedDeviceMemberOfGroups[0].uuid)}
                                            </ClientOnly>
                                            {selectedDeviceMemberOfGroups[0].friendlyName || selectedDeviceMemberOfGroups[0].name}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                                                {getGroupIcon(selectedDeviceMemberOfGroups[0].uuid)}
                                              </ClientOnly>
                                              <span>
                                                {selectedDeviceMemberOfGroups[0].friendlyName || selectedDeviceMemberOfGroups[0].name}
                                                {enableGroupTypes && (selectedDeviceMemberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? ` (${((selectedDeviceMemberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                              </span>
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex items-center">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  {"No Membership"}
                                </span>
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
                                {shouldRenderVpnRestartButton && (
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
                                            disabled={isVpnRestarting || relevantVpnInfo.status === 'disabled'}
                                          >
                                            {isVpnRestarting ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <RefreshCcw className="h-4 w-4" />
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {relevantVpnInfo.status === 'disabled' ? (
                                            <p>WireGuard is disabled and cannot be restarted.</p>
                                          ) : (
                                            <p>Restart VPN service</p>
                                          )}
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

                    {layoutMode === 'side-by-side' && selectedDevice && (extendedDetails || isLoadingExtendedDetails || (selectedDeviceMemberOfGroups && selectedDeviceMemberOfGroups.length >= 2)) && (
                      <div className={cn("mt-3 pt-3 border-t border-gray-200 dark:border-gray-700", layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "")}>
                        {/* Flexible height container in side-by-side, normal in stacked */}

                        <ScrollArea className="h-full w-full pr-2">
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
                                {selectedDeviceMemberOfGroups && selectedDeviceMemberOfGroups.length >= 2 && (
                                  <div className="flex items-start gap-1 flex-wrap">
                                    <strong className={cn(isMobile ? "text-sm" : "")}>Group Breakdown:</strong>
                                    <span className={cn("text-muted-foreground", isMobile ? "text-sm" : "")}>
                                      {/* Sort groups: Single-Select first, then Multi-Select */}
                                      {[...selectedDeviceMemberOfGroups]
                                        .sort((a, b) => {
                                          const aType = (a as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType;
                                          const bType = (b as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType;
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
                                                {getGroupIcon(group.uuid)}
                                              </ClientOnly>
                                              <span>
                                                {group.friendlyName || group.name}
                                                {enableGroupTypes && (group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? (
                                                  <span className="ml-0.5 text-xs opacity-70">
                                                    ({((group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})
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

                                {/* Group Assignment History Graph */}
                                <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
                                <div className="mt-4">
                                  <div className="h-[250px] w-full">
                                    <DeviceGroupHistoryGraph
                                      ref={graphRefCard}
                                      ipAddress={selectedDevice.content}
                                      hostAliasName={selectedDevice.name}
                                      currentGroups={selectedDeviceMemberOfGroups.map(g => ({
                                        id: g.uuid,
                                        uuid: g.uuid,
                                        name: g.name,
                                        friendlyName: g.friendlyName,
                                        groupType: g.groupType
                                      }))}
                                      isSelfService={false}
                                      className="h-full"
                                    />
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </>
                )}
              </div>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
      {selectedDevice && selectedDevice.uuid && selectedDevice.content && (
        <RenameHostAliasDialog
          isOpen={isRenameDialogOpen}
          onClose={() => setIsRenameDialogOpen(false)}
          currentAliasName={selectedDevice!.name || ''}
          detectedHostname={selectedDevice!.detectedHostname}
          ipAddress={selectedDevice!.content}
          macAddress={selectedDevice!.detectedMac}
          isDeviceOnline={!!selectedDevice!.detectedMac}
          hasDhcpReservation={selectedDevice!.isDhcpReserved || false}
          deviceUuid={selectedDevice!.uuid}
          isAuthenticated={true} // DeviceManagementCard is always authenticated
          onRenameSubmit={async (newAliasName, _shouldCreateDhcpReservation, nameChanged, dhcpCreated) => {
            // Progress modal already shows success, no need for toast notifications

            // Manually refresh the device list after a successful operation
            // Add a small delay to allow OPNsense to process any changes
            setTimeout(async () => {
              await fetchPermittedDevices();
            }, 1000); // 1 second delay

            // Update the selected device with the new name and DHCP status if changed
            if (nameChanged || dhcpCreated) {
              const updatedSelectedDevice = {
                ...selectedDevice!,
                name: newAliasName,
                // Update DHCP status if reservation was created successfully
                isDhcpReserved: dhcpCreated ? true : selectedDevice!.isDhcpReserved,
                dhcpReservedMac: dhcpCreated ? selectedDevice!.detectedMac : selectedDevice!.dhcpReservedMac,
              };

              // Clear the device cache to force fresh data load
              if (onClearDeviceCache) {
                onClearDeviceCache(selectedDevice!.uuid);
              }

              // Force update the parent component with the new name
              onDeviceSelect(updatedSelectedDevice);
            }
          }}
        />
      )}

      {selectedDevice && (
        <Dialog open={isGraphModalOpen} onOpenChange={setIsGraphModalOpen}>
          <DialogContent className="max-w-4xl w-[90vw]">
            <DialogHeader>
              <DialogTitle className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                <span>Group Assignment History</span>
                <span className="hidden md:inline">&nbsp;-&nbsp;</span>
                <span className="text-sm md:text-lg font-normal md:font-semibold text-muted-foreground md:text-foreground">
                  Host Alias: {selectedDevice.name || selectedDevice.content}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="h-[350px] w-full mt-2">
              <DeviceGroupHistoryGraph
                ref={graphRefModal}
                ipAddress={selectedDevice.content}
                hostAliasName={selectedDevice.name}
                currentGroups={selectedDeviceMemberOfGroups.map(g => ({
                  id: g.uuid,
                  uuid: g.uuid,
                  name: g.name,
                  friendlyName: g.friendlyName,
                  groupType: g.groupType
                }))}
                isSelfService={false}
                hideTitle={true}
                className="border-0 shadow-none p-0 h-full"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

    </>
  );
});

export default DeviceManagementCard;