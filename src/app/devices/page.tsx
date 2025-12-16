'use client';

import { LogIn } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { NetworkGroup } from '@/types/opnsense';
import { Role } from '@/types/opnsense';
import { VpnClientType } from '@prisma/client'; // Import VpnClientType
import { useAuth } from '@/context/AuthContext';
import { useGroupType } from '@/context/GroupTypeContext';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import useResizeObserver from '@/hooks/useResizeObserver'; // Import the new hook
import { logger } from '@/lib/logger'; // Import logger

import { AppFooter } from '@/components/layout/AppFooter';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from "@/components/ui/button"; // Import Button
import { useToast } from '@/hooks/use-toast';
import { useOpnsenseData } from '@/hooks/useOpnsenseData';
import { usePageReloadDetection } from '@/hooks/usePageReloadDetection';
import { useAbortController } from '@/hooks/useAbortController';

import NetworkGroupsCard from '@/components/NetworkGroupsCard';
import DeviceManagementCard, { HostAlias, DeviceManagementCardHandles } from '@/components/DeviceManagementCard'; // Import the new card and HostAlias

// Removed unused imports for modal components


interface SelectedDevice {
  uuid: string;
  name: string;
  type: string; // e.g., 'host', 'network', 'port'
  content: string; // IP address for 'host' type
  description?: string;
  groupIds: string[]; // Assuming we'll fetch and store the local group IDs the alias belongs to
  detectedMac: string | null; // Added
  detectedVendor: string | null; // Added
  detectedHostname: string | null;
  hasDhcpReservation: boolean; // New field for DHCP reservation status
  hasIpConflict: boolean; // New field for IP conflict status
  hasMacConflict: boolean; // New field for MAC conflict status
  memberOfGroups: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[]; // Made non-optional
  enabled?: string | null; // Added for enabled status
}



export default function UserDeviceAccessPage() {
  const { data: session, status: authStatus } = useAuth();
  const { enableGroupTypes } = useGroupType();
  const router = useRouter();
  const isMobile = useIsMobile();

  const { toast } = useToast();

  // Add page reload detection and abort controller hooks
  const { shouldSuppressError, showErrorIfNotSuppressed } = usePageReloadDetection();
  const { createController, isAbortError } = useAbortController();

  const [layoutMode, setLayoutMode] = useState<'stacked' | 'side-by-side'>('side-by-side');
  const [isViewUnsupported, setIsViewUnsupported] = useState(false); // New state for unsupported view

  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainHeight, setMainHeight] = useState<number | string>('auto');

  const networkGroupsCardRef = useRef<HTMLDivElement>(null);
  const networkGroupsCardWidth = useResizeObserver(networkGroupsCardRef);

  // Add a ref for DeviceManagementCard to call its internal refresh function
  const deviceManagementCardRef = useRef<DeviceManagementCardHandles>(null);

  // State to store fetchExtendedDetails callback from DeviceManagementCard
  const fetchExtendedDetailsRef = useRef<((forceRefresh?: boolean) => Promise<void>) | null>(null);

  // Determine if buttons should be compact based on layout mode and container width
  const areButtonsCompact = useMemo(() => {
    // Buttons are compact on mobile in stacked view, or in side-by-side view if container container width is below a threshold
    return isMobile || (layoutMode === 'side-by-side' && networkGroupsCardWidth !== undefined && networkGroupsCardWidth < 600);
  }, [isMobile, layoutMode, networkGroupsCardWidth]);

  useEffect(() => {
    let rafId: number | null = null;

    const calculateMainHeight = () => {
      if (headerRef.current && footerRef.current && mainRef.current) {
        const headerHeight = headerRef.current.offsetHeight;
        const footerHeight = footerRef.current.offsetHeight;
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const newMainHeight = viewportHeight - headerHeight - footerHeight;
        setMainHeight(newMainHeight);
      }
    };

    const handleViewportChange = () => {
      // Cancel any pending frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      // Schedule recalculation on next frame for smooth updates
      rafId = requestAnimationFrame(calculateMainHeight);
    };

    calculateMainHeight();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const newIsViewUnsupported = window.innerWidth < 1024 && window.innerHeight < 500 && window.innerWidth > window.innerHeight;
      setIsViewUnsupported(newIsViewUnsupported);

      if (window.innerWidth >= 1024) {
        setLayoutMode('side-by-side');
      } else {
        setLayoutMode('stacked');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // State for the selected device from the DeviceManagementCard
  const [selectedDevice, setSelectedDevice] = useState<SelectedDevice | null>(null);

  // NEW: Per-device UI state tracking using maps
  const [deviceAssigningStates, setDeviceAssigningStates] = useState<Map<string, boolean>>(new Map());
  const [deviceUnassigningStates, setDeviceUnassigningStates] = useState<Map<string, boolean>>(new Map());
  const [deviceSelectedGroupIds, setDeviceSelectedGroupIds] = useState<Map<string, string | null>>(new Map());
  const [deviceGroupIds, setDeviceGroupIds] = useState<Map<string, string[]>>(new Map());
  const [devicePreservedHostnames, setDevicePreservedHostnames] = useState<Map<string, string | null>>(new Map());

  // NEW: Store fetched device details to avoid unnecessary API calls
  const [deviceDetailsCache, setDeviceDetailsCache] = useState<Map<string, SelectedDevice>>(new Map());

  // NEW: Track the current operation ID to prevent stale updates
  const currentOperationIdRef = useRef<string>('');
  const currentSelectedDeviceRef = useRef<string | null>(null);

  // Refs for focus event handling
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentControllerRef = useRef<AbortController | null>(null);

  // NEW: Ref to store the latest refresh functions for stable event listeners
  const refreshFunctionsRef = useRef({
    refreshPermittedDevices: () => Promise.resolve(),
    refreshSelectedDeviceDetails: (_device: HostAlias) => { void _device; return Promise.resolve(); },
    refreshGroups: (_inPlace?: boolean) => { void _inPlace; return Promise.resolve(); },
    refreshVpnStatuses: (_inPlace?: boolean) => { void _inPlace; return Promise.resolve(); },
    refreshGraphs: () => Promise.resolve(),
  });

  // Helper functions to manage per-device states
  const setDeviceAssigning = useCallback((deviceUuid: string, isAssigning: boolean) => {
    setDeviceAssigningStates(prev => new Map(prev).set(deviceUuid, isAssigning));
  }, []);

  const setDeviceUnassigning = useCallback((deviceUuid: string, isUnassigning: boolean) => {
    setDeviceUnassigningStates(prev => new Map(prev).set(deviceUuid, isUnassigning));
  }, []);

  const setDeviceSelectedGroupId = useCallback((deviceUuid: string, groupId: string | null) => {
    setDeviceSelectedGroupIds(prev => new Map(prev).set(deviceUuid, groupId));
  }, []);

  const setDeviceGroupIdsState = useCallback((deviceUuid: string, groupIds: string[]) => {
    setDeviceGroupIds(prev => new Map(prev).set(deviceUuid, groupIds));
  }, []);

  const setDevicePreservedHostname = useCallback((deviceUuid: string, hostname: string | null) => {
    setDevicePreservedHostnames(prev => new Map(prev).set(deviceUuid, hostname));
  }, []);

  // Helper functions to manage device details cache
  const setDeviceDetails = useCallback((deviceUuid: string, details: SelectedDevice) => {
    setDeviceDetailsCache(prev => new Map(prev).set(deviceUuid, details));
  }, []);

  const getDeviceDetails = useCallback((deviceUuid: string): SelectedDevice | undefined => {
    return deviceDetailsCache.get(deviceUuid);
  }, [deviceDetailsCache]);

  const clearDeviceDetails = useCallback((deviceUuid: string) => {
    setDeviceDetailsCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(deviceUuid);
      return newCache;
    });
  }, []);

  // NEW: Update current device state when device changes
  useEffect(() => {
    if (selectedDevice) {
      // Initialize device states if they don't exist
      if (!deviceGroupIds.has(selectedDevice.uuid)) {
        const groupIds = selectedDevice.memberOfGroups?.map(g => g.uuid) || [];
        setDeviceGroupIdsState(selectedDevice.uuid, groupIds);
      }
      if (!devicePreservedHostnames.has(selectedDevice.uuid)) {
        setDevicePreservedHostname(selectedDevice.uuid, selectedDevice.detectedHostname || null);
      }

      // Clear operation ID when device changes
      currentOperationIdRef.current = '';
      currentSelectedDeviceRef.current = selectedDevice.uuid;

    } else {
      // Clear operation ID when no device is selected
      currentOperationIdRef.current = '';
      currentSelectedDeviceRef.current = null;
    }
  }, [selectedDevice, deviceGroupIds, devicePreservedHostnames, setDeviceGroupIdsState, setDevicePreservedHostname, setDeviceDetails]);

  // NEW: Get current UI state values for the selected device
  const currentDeviceState = useMemo(() => {
    if (!selectedDevice?.uuid) {
      return {
        isAssigning: false,
        isUnassigning: false,
        selectedGroupId: null,
        groupIds: [],
        preservedHostname: null,
      };
    }

    const state = {
      isAssigning: deviceAssigningStates.get(selectedDevice.uuid) || false,
      isUnassigning: deviceUnassigningStates.get(selectedDevice.uuid) || false,
      selectedGroupId: deviceSelectedGroupIds.get(selectedDevice.uuid) || null,
      groupIds: deviceGroupIds.get(selectedDevice.uuid) || [],
      preservedHostname: devicePreservedHostnames.get(selectedDevice.uuid) || null,
    };

    return state;
  }, [selectedDevice?.uuid, deviceAssigningStates, deviceUnassigningStates, deviceSelectedGroupIds, deviceGroupIds, devicePreservedHostnames]);

  // State for assignment/unassignment loading - now derived from device-specific state
  const isAssigning = currentDeviceState.isAssigning;
  const isUnassigning = currentDeviceState.isUnassigning;
  const selectedDeviceGroupIds = currentDeviceState.groupIds;
  const selectedGroupId = currentDeviceState.selectedGroupId;
  const preservedHostname = currentDeviceState.preservedHostname;



  // State for Device Management status
  const [hasDeviceAccess, setHasDeviceAccess] = useState(false);
  const [isLoadingAccess, setIsLoadingAccess] = useState(true);

  // Use useOpnsenseData to fetch groups and mappings
  const {
    groups,
    isLoadingGroups,
    // Removed unused isLoadingMappings
    isIpNotAllowed, // Destructure IP not allowed state
    refreshData: refreshOpnsenseData, // Get the refreshData function
    refreshVpnStatuses, // New function to refresh only VPN statuses
    refreshGroupsInPlace, // New function for in-place group refresh
    allEmojiValues,   // Get all emoji values
    allFlagValues,    // Get all flag values
    vpnConnectionStatuses, // Get VPN connection statuses
    isLoadingVpnStatuses, // Get VPN loading status
    groupVpnMap, // Get group VPN map
  } = useOpnsenseData(authStatus === 'authenticated', 'user'); // Only fetch data when authenticated

  // Create a wrapper function for refreshing groups that supports in-place refresh
  const refreshGroups = useCallback(async (inPlace?: boolean) => {
    if (inPlace) {
      // Use the new in-place refresh function that doesn't trigger loading states
      await refreshGroupsInPlace();
    } else {
      // Use the full refresh function for complete reloads
      await refreshOpnsenseData();
    }
  }, [refreshGroupsInPlace, refreshOpnsenseData]);

  // Add comprehensive loading state to prevent flickering
  const isDataFullyLoaded = useMemo(() => {
    // We're fully loaded when:
    // 1. Access check is complete
    // 2. Groups are loaded
    // Note: We exclude isLoadingVpnStatuses because VPN status refreshes should be in-place
    // and not trigger the skeleton loader
    // 3. If a device is selected, we have its details
    if (isLoadingAccess) return false;
    if (isLoadingGroups) return false;
    if (selectedDevice && !selectedDevice.enabled && selectedDevice.enabled !== null) return false; // Wait for device enabled status
    return true;
  }, [isLoadingAccess, isLoadingGroups, selectedDevice]);

  // Removed unused isUserAdmin variable

  const [isVpnRestarting, setIsVpnRestarting] = useState(false);

  const handleVpnRestart = useCallback(async (vpnUuid: string, vpnType: string) => {
    setIsVpnRestarting(true);
    try {
      let endpoint = '';
      if (vpnType === VpnClientType.OpenVPN) {
        endpoint = '/api/vpn/safe-restart';
      } else if (vpnType === VpnClientType.WireGuard) {
        endpoint = '/api/vpn/safe-restart';
      } else if (vpnType === VpnClientType.IPsec) {
        endpoint = '/api/vpn/safe-restart';
      } else {
        throw new Error(`Unsupported VPN type for restart: ${vpnType}`);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vpnUuid, vpnType }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to restart VPN service');
      }

      toast({
        title: "VPN Restart Initiated",
        description: "The VPN service restart command has been sent. Please allow some time for the service to come back online.",
        variant: "default",
      });
      // Keep spinning for 10 seconds, then refetch
      await new Promise(resolve => setTimeout(resolve, 10000));
      logger.debug("handleVpnRestart: Calling refreshVpnStatuses after timeout.");
      refreshVpnStatuses(true); // In-place refresh: do not trigger skeleton loader
      // VPN status changes are handled through props, so no need to refresh the device list
      // The DeviceManagementCard will automatically update based on the new vpnConnectionStatuses
    } catch (error: unknown) {
      logger.error("Error restarting VPN service:", error);
      toast({
        title: "VPN Restart Failed",
        description: error instanceof Error ? error.message : "Could not restart VPN service.",
        variant: "destructive",
      });
    } finally {
      setIsVpnRestarting(false);
    }
  }, [toast, refreshVpnStatuses]);

  // Fetch Device Management status on component mount
  useEffect(() => {
    if (authStatus === 'authenticated') {
      const checkDeviceAccess = async () => {
        try {
          setIsLoadingAccess(true);
          const response = await fetch('/api/user/has-device-access');
          if (!response.ok) {
            throw new Error('Failed to fetch Device Management status');
          }
          const data = await response.json();
          setHasDeviceAccess(data.hasAccess);
        } catch (error) {
          logger.error("Error fetching Device Management status:", error);
          setHasDeviceAccess(false); // Assume no access on error
        } finally {
          setIsLoadingAccess(false);
        }
      };
      checkDeviceAccess();
    } else if (authStatus === 'unauthenticated') {
      // If unauthenticated, set access to false and stop loading immediately
      setHasDeviceAccess(false);
      setIsLoadingAccess(false);
    }
    // No action needed for 'loading' status, as initial state handles it
  }, [authStatus]); // Rerun effect when authStatus changes

  // New function to refresh details of a specific device, including group memberships
  const refreshSelectedDeviceDetails = useCallback(async (deviceToRefresh: HostAlias) => {
    if (!deviceToRefresh?.content) {
      return; // No device or no IP to fetch details for
    }

    // Skip refresh if this device is not currently selected (to avoid unnecessary API calls)
    if (currentSelectedDeviceRef.current !== deviceToRefresh.uuid) {
      logger.debug('Skipping refresh for non-selected device:', deviceToRefresh.uuid);
      return;
    }

    try {
      // Fetch all data in parallel for better performance
      const [membershipResponse, networkDetailsResponse, hostAliasResponse] = await Promise.all([
        fetch(`/api/opnsense/ip-group-membership?ip=${deviceToRefresh.content}`),
        fetch(`/api/ip?ip=${deviceToRefresh.content}`),
        fetch(`/api/opnsense/host-alias-management?ipAddress=${deviceToRefresh.content}`)
      ]);

      // Process group memberships
      if (!membershipResponse.ok) {
        throw new Error('Failed to fetch device group memberships');
      }
      const memberGroups: NetworkGroup[] = await membershipResponse.json();

      // Process network details
      if (!networkDetailsResponse.ok) {
        throw new Error('Failed to fetch device network details');
      }
      const networkDetails = await networkDetailsResponse.json();

      // Process host alias status
      let updatedHostAliasEnabled = deviceToRefresh.enabled;
      if (hostAliasResponse.ok) {
        const hostAliasData = await hostAliasResponse.json();
        updatedHostAliasEnabled = hostAliasData.enabled || null;
      } else {
        logger.warn(`Failed to fetch updated host alias status for IP ${deviceToRefresh.content}: ${hostAliasResponse.statusText}`);
      }

      // Fetch DHCP reservation status (depends on network details, so must be sequential)
      let ipConflict = false;
      let macConflict = false;

      if (networkDetails.ip && networkDetails.mac) {
        const dhcpResponse = await fetch(`/api/opnsense/dhcp?action=search_reservation&ip=${networkDetails.ip}&mac=${networkDetails.mac}`);
        if (dhcpResponse.ok) {
          const dhcpData = await dhcpResponse.json();
          ipConflict = dhcpData.ipConflict || false;
          macConflict = dhcpData.macConflict || false;
        } else if (dhcpResponse.status === 403 && session?.user?.role === Role.USER) {
          logger.warn(`DHCP reservation lookup forbidden for IP ${networkDetails.ip} (expected for USER role on non-own device).`);
          ipConflict = false;
          macConflict = false;
        } else {
          logger.warn(`Failed to fetch DHCP reservation for IP ${networkDetails.ip} and MAC ${networkDetails.mac}: ${dhcpResponse.statusText}`);
          ipConflict = false;
          macConflict = false;
        }
      }

      // Update the selected device state with the fetched details
      const newSelectedDevice: SelectedDevice = {
        uuid: deviceToRefresh.uuid,
        name: deviceToRefresh.name,
        type: deviceToRefresh.type,
        content: deviceToRefresh.content,
        description: deviceToRefresh.description,
        groupIds: memberGroups.map(group => group.id),
        detectedMac: networkDetails.mac || null,
        detectedVendor: networkDetails.vendor || null,
        // Only preserve hostname during in-place updates, otherwise use new hostname
        detectedHostname: networkDetails.hostname || null,
        hasDhcpReservation: networkDetails.hasDhcpReservation || false,
        hasIpConflict: ipConflict,
        hasMacConflict: macConflict,
        memberOfGroups: memberGroups.map(group => ({
          uuid: group.id,
          name: group.name,
          friendlyName: group.friendlyName,
          iconIdentifier: group.iconIdentifier
        })),
        enabled: updatedHostAliasEnabled === '1' ? '1' : (updatedHostAliasEnabled === '0' ? '0' : null) // Use updated enabled status
      };

      // Store the fetched details in cache for future use
      setDeviceDetails(deviceToRefresh.uuid, newSelectedDevice);

      // Only update the UI state if this device is still the currently selected one
      // This prevents visual flickering when switching devices during refresh
      const isStillSelected = currentSelectedDeviceRef.current === deviceToRefresh.uuid;

      if (isStillSelected) {
        logger.debug('Updating selected device state - device is still selected');
        setSelectedDevice(newSelectedDevice);

        // Update device UI state with new group memberships
        if (deviceToRefresh?.uuid) {
          setDeviceGroupIdsState(deviceToRefresh.uuid, memberGroups.map(group => group.id));
          setDevicePreservedHostname(deviceToRefresh.uuid, networkDetails.hostname || null);
        }
      } else {
        logger.debug('Skipping selected device state update - device is no longer selected (current:', currentSelectedDeviceRef.current, 'refreshed:', deviceToRefresh.uuid, ')');
      }

    } catch (error) {
      logger.error("Error refreshing selected device details:", error);

      // Use the new error suppression logic to prevent misleading messages during page reloads
      showErrorIfNotSuppressed(
        error,
        () => {
          toast({
            title: "Error",
            description: `Failed to refresh device details: ${(error as Error).message}`,
            variant: "destructive",
          });
        },
        'refreshSelectedDeviceDetails'
      );
    }
  }, [toast, session?.user?.role, setDeviceDetails, setDeviceGroupIdsState, setDevicePreservedHostname, showErrorIfNotSuppressed]);

  // Effect to refresh data when the window gains focus or visibility changes (e.g., switching tabs back)
  useEffect(() => {
    // Common refresh function used by both focus and visibilitychange events
    const refreshData = async (triggerSource: string) => {
      logger.debug(`🔍 FOCUS EVENT TRIGGERED! Source: ${triggerSource}`);

      // If no device is selected, only refresh groups and VPN statuses, not device-specific data
      if (!currentSelectedDeviceRef.current) {
        logger.debug('Skipping device-specific refresh as no device is selected.');
        // Still perform a general refresh for groups and VPN statuses
        const generalRefreshPromises = [];
        if (refreshFunctionsRef.current.refreshGroups) {
          generalRefreshPromises.push(refreshFunctionsRef.current.refreshGroups(true));
        }
        if (refreshFunctionsRef.current.refreshVpnStatuses) {
          generalRefreshPromises.push(refreshFunctionsRef.current.refreshVpnStatuses(true));
        }
        await Promise.all(generalRefreshPromises);
        logger.debug('✅ General focus refresh completed (no device selected)');
        return;
      }
      // If we get here, we have a selected device and should refresh device-specific data
      logger.debug('Device selected, proceeding with device-specific refresh');

      // Abort any previous focus-triggered requests
      if (currentControllerRef.current && !currentControllerRef.current.signal.aborted) {
        logger.debug('Aborting previous focus refresh requests');
        currentControllerRef.current.abort('New focus event triggered');
      }

      // Clear any existing timeout to prevent multiple rapid refreshes
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }

      // Increased delay from 100ms to 500ms to reduce collision probability with page reloads
      // Create new abort controller for this refresh cycle
      currentControllerRef.current = createController(30000); // 30 second timeout

      try {
        logger.debug('🚀 STARTING FOCUS REFRESH for device page');

        // Refresh device list, device details, and groups in parallel to avoid race conditions
        const refreshPromises = [];

        logger.debug('📡 CALLING REFRESH FUNCTIONS with function status:', {
          refreshPermittedDevices: !!refreshFunctionsRef.current.refreshPermittedDevices,
          refreshSelectedDeviceDetails: !!refreshFunctionsRef.current.refreshSelectedDeviceDetails,
          refreshGroups: !!refreshFunctionsRef.current.refreshGroups,
          refreshVpnStatuses: !!refreshFunctionsRef.current.refreshVpnStatuses
        });

        // Always refresh the device list to get updated host alias statuses
        // Access functions via the ref
        if (refreshFunctionsRef.current.refreshPermittedDevices) {
          refreshPromises.push(refreshFunctionsRef.current.refreshPermittedDevices());
        }

        // If a device is selected, also refresh its details
        // Use the ref to get the current selected device to avoid stale closures
        const currentSelectedDeviceUuid = currentSelectedDeviceRef.current;
        if (currentSelectedDeviceUuid && refreshFunctionsRef.current.refreshSelectedDeviceDetails) {
          // Find the device in the cache to pass to the refresh function
          const currentDeviceDetails = getDeviceDetails(currentSelectedDeviceUuid);
          if (currentDeviceDetails) {
            refreshPromises.push(refreshFunctionsRef.current.refreshSelectedDeviceDetails(currentDeviceDetails));
          } else {
            logger.debug('Could not find device details in cache for refresh:', currentSelectedDeviceUuid);
          }
        }

        // Refresh groups in-place
        if (refreshFunctionsRef.current.refreshGroups) {
          refreshPromises.push(refreshFunctionsRef.current.refreshGroups(true));
        }

        // Refresh VPN statuses in-place
        if (refreshFunctionsRef.current.refreshVpnStatuses) {
          refreshPromises.push(refreshFunctionsRef.current.refreshVpnStatuses(true));
        }

        // Refresh graphs to show any new data points
        if (refreshFunctionsRef.current.refreshGraphs) {
          refreshPromises.push(refreshFunctionsRef.current.refreshGraphs());
        }

        // Wait for all refreshes to complete
        await Promise.all(refreshPromises);

        logger.debug('✅ Focus refresh completed successfully');
      } catch (error) {
        // Only log errors that aren't due to abort or page reload
        if (!isAbortError(error) && !shouldSuppressError(error, 'focus refresh')) {
          logger.error('❌ Error during focus refresh:', error);
        } else {
          logger.debug('⚠️ Focus refresh cancelled or suppressed:', error);
        }
      }
    };

    // Handle window focus events
    const handleFocus = () => refreshData('window.focus');

    // Handle document visibility change events
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshData('document.visibilitychange');
      }
    };

    // Log when event listeners are attached
    logger.debug('🎯 ATTACHING FOCUS EVENT LISTENERS to window.focus and document.visibilitychange');

    // Add event listeners
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function to remove the event listeners, timeout, and abort any pending requests
    return () => {
      logger.debug('Removing focus event listeners');
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (currentControllerRef.current && !currentControllerRef.current.signal.aborted) {
        logger.debug('Aborting focus refresh requests due to component cleanup');
        currentControllerRef.current.abort('Component cleanup');
      }
    };
  }, [refreshFunctionsRef, createController, isAbortError, shouldSuppressError, showErrorIfNotSuppressed, getDeviceDetails]); // Removed currentSelectedDeviceRef from dependencies

  // Handle device selection and fetching group memberships
  const handleDeviceSelect = useCallback(async (device: HostAlias | null) => {


    // Update the ref immediately for operation tracking
    currentSelectedDeviceRef.current = device?.uuid || null;

    if (device) {
      // Check if we have cached details for this device
      const cachedDetails = getDeviceDetails(device.uuid);

      if (cachedDetails) {
        // Use cached details for immediate UI update

        setSelectedDevice(cachedDetails);

        // Update device UI states from cache
        setDeviceGroupIdsState(device.uuid, cachedDetails.groupIds);
        setDevicePreservedHostname(device.uuid, cachedDetails.detectedHostname);
      } else {
        // Set basic device info immediately and fetch details

        setSelectedDevice({
          uuid: device.uuid,
          name: device.name,
          type: device.type,
          content: device.content,
          description: device.description,
          groupIds: device.memberOfGroups?.map(g => g.uuid) || [], // Initialize with existing if available
          detectedMac: device.detectedMac || null,
          detectedVendor: device.detectedVendor || null,
          detectedHostname: device.detectedHostname || null, // Use hostname from device data
          hasDhcpReservation: device.isDhcpReserved || false, // Use isDhcpReserved from HostAlias
          hasIpConflict: false, // These will be updated by refreshSelectedDeviceDetails
          hasMacConflict: false, // These will be updated by refreshSelectedDeviceDetails
          memberOfGroups: device.memberOfGroups || [], // Initialize with existing if available
          enabled: device.enabled === '1' ? '1' : (device.enabled === '0' ? '0' : null) // Initialize with current enabled status
        });

        // Fetch full details in background
        setTimeout(() => {
          refreshSelectedDeviceDetails(device);
        }, 0);
      }
    } else {
      setSelectedDevice(null);
    }
  }, [refreshSelectedDeviceDetails, getDeviceDetails, setDeviceGroupIdsState, setDevicePreservedHostname]); // Device state is now managed by useEffect

  // NEW: Set selected group ID for current device
  const setSelectedGroupId = useCallback((groupId: string | null) => {
    if (selectedDevice?.uuid) {
      setDeviceSelectedGroupId(selectedDevice.uuid, groupId);
    }
  }, [selectedDevice?.uuid, setDeviceSelectedGroupId]);

  // Handle assigning the selected device to the selected group
  const handleAssignDeviceToGroup = useCallback(async () => {
    if (!selectedDevice) {
      toast({
        title: "Error",
        description: "No host alias selected to assign.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedGroupId) {
      toast({
        title: "Error",
        description: "No group selected to assign to.",
        variant: "destructive",
      });
      return;
    }

    // Generate operation ID to track this specific operation
    const operationId = `${selectedDevice.uuid}-assign-${Date.now()}`;
    currentOperationIdRef.current = operationId;

    // Update device UI state to show assigning
    setDeviceAssigning(selectedDevice.uuid, true);


    const selectedGroup = groups?.find(g => g.id === selectedGroupId);
    const selectedGroupName = selectedGroup?.friendlyName || selectedGroup?.name || selectedGroupId;

    try {
      logger.debug(`Attempting to assign device ${selectedDevice.uuid} (IP: ${selectedDevice.content}) to group ${selectedGroupId} (${selectedGroupName})`);

      const response = await fetch(`/api/opnsense/host-group-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'assign',
          ipAddress: selectedDevice.content,
          hostAliasName: selectedDevice.name,
          groupId: selectedGroupId,
          description: `Created by ${session?.user?.name || 'User'}`,
          moveFromExisting: !enableGroupTypes // When group types enabled, never use moveFromExisting (smart assignment handles moves). When disabled, use moveOnly behavior.
        }),
      });

      const result = await response.json();

      // Check if this operation is still relevant (device hasn't changed)
      const isStaleOperation = currentOperationIdRef.current !== operationId;

      if (isStaleOperation) {
        // Reset assigning state for stale operation
        setDeviceAssigning(selectedDevice.uuid, false);
        // Still show toast and update searchable select for completed operations
        if (response.ok && result.success) {
          // Show toast for successful operation even if device changed
          // Extract the actual host alias name from the API response message
          const hostAliasNameMatch = result.message.match(/Successfully added (\S+) to group/);
          const actualHostAliasName = hostAliasNameMatch ? hostAliasNameMatch[1] : selectedDevice.name;

          const targetGroup = groups?.find(g => g.id === selectedGroupId);
          const targetGroupName = targetGroup?.friendlyName || targetGroup?.name || 'Unknown Group';
          toast({
            title: "Assignment Completed",
            description: `Host alias "${actualHostAliasName}" was assigned to group "${targetGroupName}" (device was switched during operation).`,
            variant: "success",
          });

          // Update the device's group membership in the searchable select list
          if (deviceManagementCardRef.current) {
            const assignedGroup = groups?.find(g => g.id === selectedGroupId);
            if (assignedGroup) {
              const newMembership = [{
                uuid: assignedGroup.id,
                name: assignedGroup.name,
                friendlyName: assignedGroup.friendlyName || undefined,
                iconIdentifier: assignedGroup.iconIdentifier || null
              }];
              deviceManagementCardRef.current.updateDeviceMembership(selectedDevice.uuid, newMembership);

              // Update the cached device details for stale operations
              const updatedDeviceDetails = {
                ...selectedDevice,
                groupIds: newMembership.map(g => g.uuid),
                memberOfGroups: newMembership
              };
              setDeviceDetails(selectedDevice.uuid, updatedDeviceDetails);
            }
          }
        }
        return; // Don't update current device UI state for stale operation
      }

      if (response.ok && result.success) {
        logger.debug("Assignment successful:", result);
        logger.debug("About to update device UI state for device:", selectedDevice.uuid);

        // Use the API response message which contains the correct host alias name
        // The API already handles the correct name resolution and provides a proper message
        let toastDescription = result.message;

        // If the response includes removedFromGroups information, enhance the toast with move details
        if (result.removedFromGroups && result.removedFromGroups.length > 0) {
          const targetGroup = groups?.find(g => g.id === selectedGroupId);
          const targetGroupName = targetGroup?.friendlyName || targetGroup?.name || 'Unknown Group';

          const removedGroups = result.removedFromGroups.map((group: { friendlyName?: string; name: string }) =>
            group.friendlyName || group.name
          ).join(', ');

          // Extract the host alias name from the API response message instead of using selectedDevice.name
          // The API message format is: "Successfully added {hostAliasName} to group {groupName}"
          const hostAliasNameMatch = result.message.match(/Successfully added (\S+) to group/);
          const actualHostAliasName = hostAliasNameMatch ? hostAliasNameMatch[1] : selectedDevice.name;

          if (result.removedFromGroups.length === 1) {
            toastDescription = `Host alias "${actualHostAliasName}" moved from "${removedGroups}" to "${targetGroupName}"`;
          } else {
            toastDescription = `Host alias "${actualHostAliasName}" moved from "${removedGroups}" to "${targetGroupName}"`;
          }
        }
        // For direct assignments, use the API message as-is since it already contains the correct name

        logger.debug("About to show success toast:", toastDescription);
        toast({
          title: "Assignment Successful",
          description: toastDescription,
          variant: "success",
        });

        // Update device UI state to reflect the new group membership and reset assigning state
        const assignedGroup = groups?.find(g => g.id === selectedGroupId);
        if (assignedGroup) {
          let newMembership;

          if (!enableGroupTypes) {
            // Move-only behavior: always replace all groups (moveFromExisting=true)
            newMembership = [{
              uuid: assignedGroup.id,
              name: assignedGroup.name,
              friendlyName: assignedGroup.friendlyName || undefined,
              iconIdentifier: assignedGroup.iconIdentifier || null
            }];
          } else {
            // Modern behavior: add to existing groups (moveFromExisting=false)
            const currentMembership: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[] = [];

            // Add existing groups
            for (const groupId of selectedDeviceGroupIds) {
              const group = groups?.find(g => g.id === groupId);
              if (group) {
                currentMembership.push({
                  uuid: group.id,
                  name: group.name,
                  friendlyName: group.friendlyName,
                  iconIdentifier: group.iconIdentifier
                });
              }
            }

            // Add the new group if not already present
            if (!currentMembership.some(g => g.uuid === assignedGroup.id)) {
              currentMembership.push({
                uuid: assignedGroup.id,
                name: assignedGroup.name,
                friendlyName: assignedGroup.friendlyName,
                iconIdentifier: assignedGroup.iconIdentifier
              });
            }

            newMembership = currentMembership;
          }

          // Update device UI state to reflect the new group membership
          setDeviceGroupIdsState(selectedDevice.uuid, newMembership.map(g => g.uuid));
          setDeviceAssigning(selectedDevice.uuid, false);

          // Update the device's group membership in the searchable select list in-place
          if (deviceManagementCardRef.current && selectedDevice) {
            // Update the device in the searchable select list in-place
            deviceManagementCardRef.current.updateDeviceMembership(selectedDevice.uuid, newMembership);
          }

          // Update the cached device details with new group membership
          const updatedDeviceDetails = {
            ...selectedDevice,
            groupIds: newMembership.map(g => g.uuid),
            memberOfGroups: newMembership
          };
          setDeviceDetails(selectedDevice.uuid, updatedDeviceDetails);

          // Refresh only the Last Operation field without loading states
          if (deviceManagementCardRef.current) {
            deviceManagementCardRef.current.refreshLastOperationOnly().catch(err =>
              logger.error('Failed to refresh last operation after assignment:', err)
            );
            // Refresh the graph to show the new assignment
            deviceManagementCardRef.current.refreshGraphs().catch(err =>
              logger.error('Failed to refresh graph after assignment:', err)
            );
          }

          // Background refresh removed to prevent state conflicts
          // The UI is already updated with the correct state above
        } else {
          // If we can't find the assigned group, still reset the assigning state
          setDeviceAssigning(selectedDevice.uuid, false);

        }
      } else {
        logger.error("Assignment failed:", result);
        const targetGroup = groups?.find(g => g.id === selectedGroupId);
        const targetGroupName = targetGroup?.friendlyName || targetGroup?.name || 'Unknown Group';

        // Show toast for failed operation even if device changed
        if (isStaleOperation) {
          toast({
            title: "Assignment Failed",
            description: `Host alias "${selectedDevice.name}": ${result.message || `Failed to assign to group "${targetGroupName}"`} (device was switched during operation).`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Assignment Failed",
            description: `Host alias "${selectedDevice.name}": ${result.message || `Failed to assign to group "${targetGroupName}"`}`,
            variant: "destructive",
          });
        }

        // Reset assigning state on failure
        setDeviceAssigning(selectedDevice.uuid, false);

      }
    } catch (error) {
      logger.error("Error during assignment API call:", error);

      // Check if this was a stale operation
      const isStaleOperation = currentOperationIdRef.current !== operationId;

      if (isStaleOperation) {
        toast({
          title: "Assignment Error",
          description: `An error occurred while assigning host alias "${selectedDevice.name}" (device was switched during operation).`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Assignment Error",
          description: `An error occurred while assigning host alias "${selectedDevice.name}".`,
          variant: "destructive",
        });
      }

      // Reset assigning state on error
      setDeviceAssigning(selectedDevice.uuid, false);

    }
  }, [selectedDevice, selectedGroupId, groups, toast, session?.user?.name, setDeviceAssigning, setDeviceDetails, setDeviceGroupIdsState, enableGroupTypes, selectedDeviceGroupIds]);

  // Handle removing the selected device from a specific group
  const handleRemoveDeviceFromGroup = useCallback(async (groupId: string) => {
    if (!selectedDevice) {
      toast({
        title: "Error",
        description: "No host alias selected to remove from group.",
        variant: "destructive",
      });
      return;
    }

    const targetGroup = groups?.find(g => g.id === groupId || g.uuid === groupId);
    if (!targetGroup) {
      toast({
        title: "Error",
        description: "Selected group not found.",
        variant: "destructive",
      });
      return;
    }

    // Check if the device is actually in this group
    const isInGroup = selectedDeviceGroupIds.includes(groupId);
    if (!isInGroup) {
      toast({
        title: "Not in Group",
        description: `Device "${selectedDevice.name}" is not currently assigned to "${targetGroup.friendlyName || targetGroup.name}".`,
        variant: "default",
      });
      return;
    }

    setDeviceUnassigning(selectedDevice.uuid, true);

    try {
      const response = await fetch('/api/opnsense/host-group-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'unassign',
          ipAddress: selectedDevice.content,
          hostAliasName: selectedDevice.name,
          groupId: groupId // Specify the group to unassign from
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Success",
          description: `Device "${selectedDevice.name}" removed from group "${targetGroup.friendlyName || targetGroup.name}".`,
          variant: "success",
        });

        // Update UI state to remove the group from the device's membership
        const updatedGroupIds = selectedDeviceGroupIds.filter(id => id !== groupId);
        setDeviceGroupIdsState(selectedDevice.uuid, updatedGroupIds);

        // Update the searchable select with the new membership
        if (deviceManagementCardRef.current && selectedDevice) {
          const newMembership: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[] = [];

          for (const remainingGroupId of updatedGroupIds) {
            const group = groups?.find(g => g.id === remainingGroupId);
            if (group) {
              newMembership.push({
                uuid: group.id,
                name: group.name,
                friendlyName: group.friendlyName,
                iconIdentifier: group.iconIdentifier
              });
            }
          }

          deviceManagementCardRef.current.updateDeviceMembership(selectedDevice.uuid, newMembership);

          // Update the cached device details with new group membership
          const updatedDeviceDetails = {
            ...selectedDevice,
            groupIds: newMembership.map(g => g.uuid),
            memberOfGroups: newMembership
          };
          setDeviceDetails(selectedDevice.uuid, updatedDeviceDetails);
        }

        // Refresh only the Last Operation field without loading states
        if (deviceManagementCardRef.current) {
          deviceManagementCardRef.current.refreshLastOperationOnly().catch(err =>
            logger.error('Failed to refresh last operation after removing from group:', err)
          );
          // Refresh the graph to show the unassignment
          deviceManagementCardRef.current.refreshGraphs().catch(err =>
            logger.error('Failed to refresh graph after unassignment:', err)
          );
        }
      } else {
        throw new Error(result.message || 'Failed to remove device from group');
      }
    } catch (error) {
      logger.error('Error removing device from group:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove device from group.",
        variant: "destructive",
      });
    } finally {
      setDeviceUnassigning(selectedDevice.uuid, false);
    }
  }, [selectedDevice, selectedDeviceGroupIds, groups, toast, setDeviceUnassigning, setDeviceDetails, setDeviceGroupIdsState]);

  // Handle unassigning the selected device from all groups
  const handleUnassignDevice = useCallback(async () => {
    if (!selectedDevice) {
      toast({
        title: "Error",
        description: "No host alias selected to unassign.",
        variant: "destructive",
      });
      return;
    }
    if (selectedDeviceGroupIds.length === 0) {
      toast({
        title: "Info",
        description: `Host alias "${selectedDevice.name}" is not currently assigned to any groups.`,
        variant: "default",
      });
      return;
    }

    // Generate operation ID to track this specific operation
    const operationId = `${selectedDevice.uuid}-unassign-${Date.now()}`;
    currentOperationIdRef.current = operationId;

    // Update device UI state to show unassigning
    setDeviceUnassigning(selectedDevice.uuid, true);


    const deviceName = selectedDevice.name;
    const deviceIp = selectedDevice.content;



    try {
      // Use the host-group-management API for unassign from all groups
      const response = await fetch('/api/opnsense/host-group-management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'unassign',
          ipAddress: deviceIp,
          hostAliasName: deviceName
          // No groupId means unassign from all groups
        }),
      });

      const result = await response.json();

      // Check if this operation is still relevant (device hasn't changed)
      const isStaleOperation = currentOperationIdRef.current !== operationId;

      if (isStaleOperation) {
        // Reset unassigning state for stale operation
        setDeviceUnassigning(selectedDevice.uuid, false);
        // Still show toast and update searchable select for completed operations
        if (response.ok && result.success) {
          // Show toast for successful operation even if device changed
          toast({
            title: "Unassignment Completed",
            description: `Host alias "${deviceName}" was unassigned from all groups (device was switched during operation).`,
            variant: "success",
          });

          // Update the device's group membership in the searchable select list
          if (deviceManagementCardRef.current) {
            const newMembership: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[] = [];
            deviceManagementCardRef.current.updateDeviceMembership(selectedDevice.uuid, newMembership);

            // Update the cached device details for stale operations
            const updatedDeviceDetails = {
              ...selectedDevice,
              groupIds: [],
              memberOfGroups: []
            };
            setDeviceDetails(selectedDevice.uuid, updatedDeviceDetails);
          }
        }
        return; // Don't update current device UI state for stale operation
      }

      if (response.ok && result.success) {
        // Clear the local state immediately for better UI responsiveness
        setDeviceGroupIdsState(selectedDevice.uuid, []);
        setDeviceUnassigning(selectedDevice.uuid, false);


        toast({
          title: "Unassignment Complete",
          description: `Host alias "${deviceName}" has been unassigned from all groups.`,
          variant: "success",
        });

        // Update the cached device details with empty group membership
        const updatedDeviceDetails = {
          ...selectedDevice,
          groupIds: [],
          memberOfGroups: []
        };
        setDeviceDetails(selectedDevice.uuid, updatedDeviceDetails);

        // Refresh only the Last Operation field without loading states
        if (deviceManagementCardRef.current) {
          deviceManagementCardRef.current.refreshLastOperationOnly().catch(err =>
            logger.error('Failed to refresh last operation after unassignment:', err)
          );
          // Refresh the graph to show the unassignment
          deviceManagementCardRef.current.refreshGraphs().catch(err =>
            logger.error('Failed to refresh graph after unassign all:', err)
          );
        }

        // Background refresh removed to prevent state conflicts
        // The UI is already updated with the correct state above
      } else {
        // Show toast for failed operation even if device changed
        if (isStaleOperation) {
          toast({
            title: "Unassignment Failed",
            description: `Host alias "${deviceName}": ${result.message || "Failed to unassign from all groups."} (device was switched during operation).`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Unassignment Failed",
            description: `Host alias "${deviceName}": ${result.message || "Failed to unassign from all groups."}`,
            variant: "destructive",
          });
        }

        // Reset unassigning state on failure
        setDeviceUnassigning(selectedDevice.uuid, false);

      }
    } catch (error) {
      logger.error("Error during unassignment API call:", error);

      // Check if this was a stale operation
      const isStaleOperation = currentOperationIdRef.current !== operationId;

      if (isStaleOperation) {
        toast({
          title: "Unassignment Error",
          description: `An error occurred while unassigning host alias "${deviceName}" (device was switched during operation).`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Unassignment Error",
          description: `An error occurred while unassigning host alias "${deviceName}".`,
          variant: "destructive",
        });
      }

      // Reset unassigning state on error
      setDeviceUnassigning(selectedDevice.uuid, false);

    }

    // Update the device's group membership in the searchable select list in-place
    if (deviceManagementCardRef.current && selectedDevice) {
      // Since we're unassigning from all groups, clear the entire membership
      const newMembership: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[] = [];
      // Update the device in the searchable select list in-place
      deviceManagementCardRef.current.updateDeviceMembership(selectedDevice.uuid, newMembership);
    }

  }, [selectedDevice, selectedDeviceGroupIds, toast, setDeviceDetails, setDeviceGroupIdsState, setDeviceUnassigning]);

  // Smart assignment function that handles SingleSelect moves with proper spinner management
  const handleSmartAssignDevice = useCallback(async (targetGroupId: string) => {
    if (!selectedDevice) {
      toast({
        title: "Error",
        description: "No host alias selected to assign.",
        variant: "destructive",
      });
      return;
    }

    const targetGroup = groups?.find(g => g.id === targetGroupId || g.uuid === targetGroupId);
    if (!targetGroup) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Selected group not found.",
      });
      return;
    }

    if (!enableGroupTypes) {
      // When group types are disabled, use moveOnly behavior
      await handleAssignDeviceToGroup();
      return;
    }

    // Device management always uses full group type functionality when enableGroupTypes is true

    const currentSingleSelectGroups = selectedDeviceGroupIds
      .map(groupId => groups?.find(g => g.id === groupId))
      .filter(Boolean)
      .filter(group => group?.groupType === 'SingleSelect');

    if (targetGroup.groupType === 'SingleSelect' && currentSingleSelectGroups.length > 0) {
      // For SingleSelect groups with existing assignments: unified move operation
      // Start assign spinner immediately and keep it running throughout the entire operation
      setDeviceAssigning(selectedDevice.uuid, true);

      try {
        // Perform SingleSelect move in a single batch call, preserving MultiSelect memberships
        const response = await fetch('/api/opnsense/host-group-management', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'batch',
            operationType: 'assign',
            hostAliases: [{ ipAddress: selectedDevice.content, hostAliasName: selectedDevice.name }],
            groups: [
              targetGroup.friendlyName
                ? { groupFriendlyName: targetGroup.friendlyName }
                : { groupName: targetGroup.name }
            ],
            description: `Assigned by ${session?.user?.name || 'User'}`,
            moveFromExisting: true,
            restrictRemovalToSingleSelect: true
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Update UI with final state: remove old SingleSelect groups and add new one
          const finalGroupIds = selectedDeviceGroupIds
            .filter(groupId => {
              const groupInfo = groups?.find(g => g.id === groupId);
              return groupInfo?.groupType === 'MultiSelect'; // Keep only MultiSelect groups
            })
            .concat([targetGroupId]); // Add the new SingleSelect group

          setDeviceGroupIdsState(selectedDevice.uuid, finalGroupIds);

          // Update the searchable select with the new membership
          if (deviceManagementCardRef.current && selectedDevice) {
            const newMembership: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[] = [];

            for (const groupId of finalGroupIds) {
              const group = groups?.find(g => g.id === groupId);
              if (group) {
                newMembership.push({
                  uuid: group.id,
                  name: group.name,
                  friendlyName: group.friendlyName,
                  iconIdentifier: group.iconIdentifier
                });
              }
            }

            deviceManagementCardRef.current.updateDeviceMembership(selectedDevice.uuid, newMembership);

            // Update the cached device details with new group membership
            const updatedDeviceDetails = {
              ...selectedDevice,
              groupIds: newMembership.map(g => g.uuid),
              memberOfGroups: newMembership
            };
            setDeviceDetails(selectedDevice.uuid, updatedDeviceDetails);
          }

          // Stop the spinner
          setDeviceAssigning(selectedDevice.uuid, false);

          // Build richer success message using removedFromGroups when present
          let toastDescription = `Host alias "${selectedDevice.name}" moved to "${targetGroup.friendlyName || targetGroup.name}".`;
          if (result.removedFromGroups && Array.isArray(result.removedFromGroups) && result.removedFromGroups.length > 0) {
            const removedGroups = result.removedFromGroups
              .map((g: { friendlyName?: string; name?: string }) => g.friendlyName || g.name)
              .filter(Boolean)
              .join(', ');
            toastDescription = `Host alias "${selectedDevice.name}" moved from "${removedGroups}" to "${targetGroup.friendlyName || targetGroup.name}"`;
          }

          toast({
            title: "Success",
            description: toastDescription,
            variant: "success",
          });

          // Refresh only the Last Operation field without loading states
          if (deviceManagementCardRef.current) {
            deviceManagementCardRef.current.refreshLastOperationOnly().catch(err =>
              logger.error('Failed to refresh last operation after smart assignment:', err)
            );
            // Refresh the graph to show the move operation
            deviceManagementCardRef.current.refreshGraphs().catch(err =>
              logger.error('Failed to refresh graph after smart assignment:', err)
            );
          }

          // Background refresh removed to prevent double UI updates
          // The UI is already updated with the correct final state above

        } else {
          throw new Error(result.message || 'Assignment failed');
        }

      } catch (error) {
        setDeviceAssigning(selectedDevice.uuid, false);
        toast({
          variant: "destructive",
          title: "Assignment Failed",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
      }
    } else {
      // For MultiSelect groups or SingleSelect without existing assignments: simple assignment
      await handleAssignDeviceToGroup();
    }
  }, [selectedDevice, groups, enableGroupTypes, selectedDeviceGroupIds, session?.user?.name, toast, handleAssignDeviceToGroup, setDeviceAssigning, setDeviceGroupIdsState, setDeviceDetails]);

  // NEW: Effect to update the refresh functions ref whenever they change
  useEffect(() => {
    logger.debug('Updating refresh functions ref with latest function references');
    refreshFunctionsRef.current = {
      refreshPermittedDevices: () => {
        logger.debug('Calling refreshPermittedDevices via ref');
        return deviceManagementCardRef.current?.refreshPermittedDevices() || Promise.resolve();
      },
      refreshSelectedDeviceDetails: (device: HostAlias) => {
        logger.debug('Calling refreshSelectedDeviceDetails via ref for device:', device.uuid);
        return refreshSelectedDeviceDetails(device);
      },
      refreshGroups: (inPlace?: boolean) => {
        logger.debug('Calling refreshGroups via ref, inPlace:', inPlace);
        return refreshGroups(inPlace);
      },
      refreshVpnStatuses: (inPlace?: boolean) => {
        logger.debug('Calling refreshVpnStatuses via ref, inPlace:', inPlace);
        return refreshVpnStatuses(inPlace);
      },
      refreshGraphs: () => {
        logger.debug('Calling refreshGraphs via ref');
        return deviceManagementCardRef.current?.refreshGraphs() || Promise.resolve();
      },
    };

    // Log that the functions have been updated
    logger.debug('✅ Refresh functions updated in ref');
  }, [refreshSelectedDeviceDetails, refreshGroups, refreshVpnStatuses, deviceManagementCardRef]); // Add deviceManagementCardRef to dependencies

  // Show loading state while authentication status is being determined or access is being checked
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const timer = setTimeout(() => {
        router.push('/login'); // Redirect to login page
      }, 10000); // 10 seconds

      return () => clearTimeout(timer);
    }
  }, [authStatus, router]);
  if (authStatus === 'loading' || isLoadingAccess) {
    return (
      <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
        <AppHeader ref={headerRef} />
        <main ref={mainRef} className="flex-grow container mx-auto p-4 md:p-8 flex items-center justify-center" style={{ height: mainHeight, maxHeight: mainHeight }}>
          <div className="text-center">
            <p className="mt-4 text-muted-foreground">Loading access priviledges...</p>
          </div>
        </main>
        <AppFooter ref={footerRef} pageTitle="Device Management" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
        <AppHeader ref={headerRef} />
        <main ref={mainRef} className="flex-grow container-responsive py-4 flex flex-col items-center justify-center space-y-4" style={{ height: mainHeight, maxHeight: mainHeight }}>
          <ClientOnly><LogIn className="h-16 w-16 text-primary" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Not Authenticated</h1>
          <p className="text-muted-foreground">Please log in to access your devices.</p>
          {/* Added additional message */}
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
        <AppFooter ref={footerRef} pageTitle="Device Management" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
      <AppHeader ref={headerRef} layoutMode={layoutMode} setLayoutMode={setLayoutMode} />
      <main ref={mainRef} className={`flex flex-1 overflow-y-auto container-responsive pt-4 pb-4 ${window.innerWidth < 1024 || layoutMode === 'stacked' || (layoutMode === 'side-by-side' && networkGroupsCardWidth !== undefined && networkGroupsCardWidth < 300) ? 'flex-col space-y-4' : 'flex-row space-x-4'}`} style={{ height: mainHeight, maxHeight: mainHeight }}>
        {isViewUnsupported ? (
          <div className="flex flex-col items-center justify-center w-full h-full text-center text-lg text-muted-foreground p-4">
            <p>Unsupported View</p>
            <p>Switch to Portrait Orientation</p>
          </div>
        ) : (
          !hasDeviceAccess ? (
            // Display message if user has no associated devices
            <div className="flex items-center justify-center flex-grow">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-muted-foreground">No Devices Found</h1>
                <p className="text-muted-foreground">Your account is not associated with any devices.</p>
              </div>
            </div>
          ) : (
            // Render content if user has associated devices
            <>
              {/* Top Card: Device Management */}
              {/* Adjust width based on layoutMode */}
              <div className={`${window.innerWidth < 1024 || layoutMode === 'stacked' ? 'w-full md:w-[600px] mx-auto' : 'flex flex-col flex-grow min-h-0 w-1/2 h-full'}`}>
                <DeviceManagementCard
                  ref={deviceManagementCardRef} // Attach the ref here
                  onDeviceSelect={handleDeviceSelect}
                  selectedDeviceUuid={selectedDevice?.uuid || null}
                  onClearDeviceCache={clearDeviceDetails} // Pass the cache clearing function
                  selectedDeviceMemberOfGroups={
                    selectedDeviceGroupIds
                      .map(opnsenseNetworkGroupId => {
                        const opnsenseNetworkGroup = groups?.find(g => g.id === opnsenseNetworkGroupId);
                        return opnsenseNetworkGroup ? { uuid: opnsenseNetworkGroup.id, name: opnsenseNetworkGroup.name, friendlyName: opnsenseNetworkGroup.friendlyName, iconIdentifier: opnsenseNetworkGroup.iconIdentifier, groupType: opnsenseNetworkGroup.groupType } : undefined;
                      })
                      .filter(Boolean) as { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }[]
                  }
                  allEmojiValues={allEmojiValues} // Pass all emoji values
                  allFlagValues={allFlagValues}   // Pass all flag values
                  detectedMac={selectedDevice?.detectedMac || null}
                  detectedVendor={selectedDevice?.detectedVendor || null}
                  detectedHostname={preservedHostname || selectedDevice?.detectedHostname || null}
                  hasDhcpReservation={selectedDevice?.hasDhcpReservation || false} // Pass DHCP reservation status
                  hasIpConflict={selectedDevice?.hasIpConflict || false} // Pass IP conflict status
                  hasMacConflict={selectedDevice?.hasMacConflict || false} // Pass MAC conflict status
                  vpnConnectionStatuses={vpnConnectionStatuses} // Pass VPN statuses
                  groupVpnMap={groupVpnMap} // Pass group VPN map
                  onVpnRestart={(vpnUuid, vpnType) => handleVpnRestart(vpnUuid, vpnType as VpnClientType)}
                  isVpnRestarting={isVpnRestarting} // Pass the new prop
                  refetchVpnStatuses={refreshVpnStatuses} // Pass the refetchVpnStatuses function
                  refreshGroups={refreshGroups} // Pass the refreshGroups function
                  layoutMode={layoutMode}
                  onFetchExtendedDetailsReady={(fetchFn) => { fetchExtendedDetailsRef.current = fetchFn; }}
                />
              </div>

              {/* Container for NetworkGroupsCard to manage height and scrolling */}
              {/* Adjust width and scrolling based on layoutMode */}
              {/* Attach the ref to this container div */}
              <div ref={networkGroupsCardRef} className={`flex flex-col flex-grow ${window.innerWidth < 1024 || layoutMode === 'stacked' || (layoutMode === 'side-by-side' && networkGroupsCardWidth !== undefined && networkGroupsCardWidth < 300) ? 'w-full md:w-[600px] mx-auto flex-1 min-h-0' : 'w-1/2 h-full min-h-0'}`}>
                <NetworkGroupsCard
                  userRole={session?.user?.role ?? undefined} // Pass the user role from the session, handle null
                  groups={groups}
                  isLoadingGroups={isLoadingGroups}
                  selectedGroupId={selectedGroupId}
                  setSelectedGroupId={setSelectedGroupId}
                  detectedIp={selectedDevice?.content || null} // Use selected device's IP
                  isAssigningIp={isAssigning} // Pass assignment loading state
                  isUnassigningDetected={isUnassigning} // Pass unassignment loading state
                  handleUnassignAll={handleUnassignDevice} // Use new handler for selected device
                  handleRemoveFromGroup={handleRemoveDeviceFromGroup} // Use new handler for removing from specific group
                  handleSmartAssign={handleSmartAssignDevice} // Use new smart assignment handler
                  userIpMemberOfGroups={
                    selectedDeviceGroupIds.map(groupId => groups?.find(g => g.id === groupId)).filter(Boolean) as NetworkGroup[]
                  } // Pass groups the selected device is a member of
                  hasLoadedMembership={selectedDevice ? deviceGroupIds.has(selectedDevice.uuid) : false} // Only loaded if device group IDs have been initialized
                  isSelfServiceAllowed={true} // Assuming Device Management page implies Self-Service is allowed for these devices
                  areButtonsCompact={areButtonsCompact} // Pass the new prop
                  isDeviceManagementPage={true} // Explicitly set for Device Management page
                  isIpNotAllowed={isIpNotAllowed} // Pass IP not allowed state
                  vpnConnectionStatuses={vpnConnectionStatuses} // Pass VPN statuses
                  isLoadingVpnStatuses={isLoadingVpnStatuses} // Pass VPN loading status
                  groupVpnMap={groupVpnMap} // Pass group VPN map
                  refetchVpnStatuses={refreshVpnStatuses} // Pass the refreshVpnStatuses function
                  allEmojiValues={allEmojiValues} // Pass all emoji values
                  allFlagValues={allFlagValues}   // Pass all flag values
                  hostAliasEnabled={selectedDevice?.enabled} // Pass the enabled status of the selected device
                  isParentLoading={!isDataFullyLoaded}
                  refreshGroups={refreshGroups} // Pass the new refreshGroups function
                />
              </div>
            </>
          )
        )}
      </main>
      <AppFooter ref={footerRef} pageTitle="Device Management" />
    </div>
  );
}
