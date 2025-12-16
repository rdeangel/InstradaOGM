'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
// Removed unused imports NetworkGroup, NetworkObject, AppUserType
import { Role } from '@/types/opnsense';
import { useAuth } from '@/context/AuthContext'; // Use the refactored useAuth hook
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';

import type { UnmanagedGroupResult } from '@/lib/unmanaged-group-utils';



import { AppFooter } from '@/components/layout/AppFooter';
import { AppHeader } from '@/components/layout/AppHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

import { ClientOnly } from '@/components/util/ClientOnly';
import { Loader2 } from 'lucide-react';
import { useOpnsenseData } from '@/hooks/useOpnsenseData';
import { useIpDetection } from '@/hooks/useIpDetection';
import { useIpGroupActions } from '@/hooks/useIpGroupActions';
import { logger } from '@/lib/logger';

import SelfServiceCard from '@/components/SelfServiceCard';
import NetworkGroupsCard from '@/components/NetworkGroupsCard';
import ConnectionErrorModal from '@/components/ConnectionErrorModal';

export default function SelfServicePageClient() {
  const { data: session, status: authStatus } = useAuth(); // Use the refactored useAuth hook
  const router = useRouter();
  const isMobile = useIsMobile();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'side-by-side' | 'stacked'>('side-by-side');
  const [isViewUnsupported, setIsViewUnsupported] = useState(false);
  const [isVpnRestarting, setIsVpnRestarting] = useState(false);
  const [mainHeight, setMainHeight] = useState<number | string>('auto');
  const { toast } = useToast();

  // Global settings state
  const [isLoadingGlobalSettings, setIsLoadingGlobalSettings] = useState(true);
  const [isSelfServiceAllowed, setIsSelfServiceAllowed] = useState(false);

  // Unmanaged group detection state
  const [unmanagedGroupResult, setUnmanagedGroupResult] = useState<UnmanagedGroupResult | null>(null);

  // State to store fetchExtendedDetails callback from SelfServiceCard
  const [fetchExtendedDetails, setFetchExtendedDetails] = useState<((forceRefresh?: boolean) => Promise<void>) | undefined>(undefined);

  // State to store refreshLastOperationOnly callback from SelfServiceCard
  const [refreshLastOperationOnly, setRefreshLastOperationOnly] = useState<(() => Promise<void>) | undefined>(undefined);

  // State to store refreshGraphs callback from SelfServiceCard
  const [refreshGraphs, setRefreshGraphs] = useState<(() => Promise<void>) | undefined>(undefined);

  // Refs for header, main, and footer
  const headerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  // Refs for the two main cards
  const selfServiceCardRef = useRef<HTMLDivElement>(null);
  const networkGroupsCardRef = useRef<HTMLDivElement>(null);

  // State for card dimensions
  const [networkGroupsCardWidth, setNetworkGroupsCardWidth] = useState<number | undefined>(undefined);

  // ResizeObserver effect for networkGroupsCard width tracking
  useEffect(() => {
    if (!networkGroupsCardRef.current) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setNetworkGroupsCardWidth(entries[0].contentRect.width);
      }
    });

    observer.observe(networkGroupsCardRef.current);

    return () => observer.disconnect();
  }, []);

  // Calculate main height based on header and footer heights
  useEffect(() => {
    const calculateMainHeight = (forceReflow = false) => {
      if (headerRef.current && footerRef.current && mainRef.current) {
        const headerHeight = headerRef.current.offsetHeight;
        const footerHeight = footerRef.current.offsetHeight;
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const targetHeight = viewportHeight - headerHeight - footerHeight;

        if (forceReflow) {
          // Simulate a micro-rotation by setting height slightly off, then correcting it
          // This forces the browser to invalidate layout caches
          setMainHeight(targetHeight - 1);
          requestAnimationFrame(() => {
            setMainHeight(targetHeight);
          });
        } else {
          setMainHeight(targetHeight);
        }
      }
    };

    // Initial calculation
    calculateMainHeight();

    // ResizeObserver for header and footer to handle dynamic size changes
    const resizeObserver = new ResizeObserver(() => {
      calculateMainHeight();
    });

    if (headerRef.current) resizeObserver.observe(headerRef.current);
    if (footerRef.current) resizeObserver.observe(footerRef.current);

    // Event listeners
    const handleResize = () => calculateMainHeight();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize); // Add scroll listener for mobile address bar
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }

    // Force recalculation with reflow at intervals to handle initial load instability
    // The last two attempts use 'true' to force the 1px toggle
    const timers = [
      setTimeout(() => calculateMainHeight(false), 100),
      setTimeout(() => calculateMainHeight(false), 300),
      setTimeout(() => calculateMainHeight(true), 600),  // Force reflow
      setTimeout(() => calculateMainHeight(true), 1000) // Force reflow
    ];

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
      timers.forEach(clearTimeout);
    };
  }, []);

  // Determine if buttons should be compact based on layout mode and container width
  const areButtonsCompact = useMemo(() => {
    // Buttons are compact on mobile in stacked view, or in side-by-side view if container width is below a threshold
    return isMobile || (layoutMode === 'side-by-side' && networkGroupsCardWidth !== undefined && networkGroupsCardWidth < 600);
  }, [isMobile, layoutMode, networkGroupsCardWidth]);

  // Fetch global settings on mount (direct API call for proper unauthenticated validation)
  useEffect(() => {
    const fetchGlobalSettings = async () => {
      try {
        const response = await fetch('/api/ui/config');
        if (!response.ok) {
          throw new Error(`Failed to fetch UI config: ${response.statusText}`);
        }
        const data = await response.json();
        setIsSelfServiceAllowed(data.selfServiceEnabled);
      } catch (error) {
        logger.error("Error fetching global settings:", error);
        setIsSelfServiceAllowed(false); // Default to false on error
      } finally {
        setIsLoadingGlobalSettings(false);
      }
    };

    // Only fetch if mounted
    if (mounted) {
      fetchGlobalSettings();
    }
  }, [mounted]);

  // Use useOpnsenseData to fetch groups and mappings
  const {
    groups,
    isLoadingGroups,
    showConnectionErrorModal,
    setShowConnectionErrorModal,
    isIpNotAllowed, // Destructure IP not allowed state
    isRefreshing, // Destructure isRefreshing state
    refreshData: refreshOpnsenseData,
    refreshVpnStatuses, // Destructure new function to refresh only VPN statuses
    refreshGroupsInPlace, // Destructure new function for in-place group refresh
    vpnConnectionStatuses, // Destructure from useOpnsenseData
    isLoadingVpnStatuses, // Destructure from useOpnsenseData
    groupVpnMap, // Destructure from useOpnsenseData
    allEmojiValues, // Destructure allEmojiValues
    allFlagValues, // Destructure allFlagValues
  } = useOpnsenseData(mounted && (authStatus === 'authenticated' || isSelfServiceAllowed), 'public'); // Only fetch when authenticated or self-service is allowed

  const isUserAdmin = session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN; // Updated to use Role

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

  const handleVpnRestart = useCallback(async (vpnUuid: string, vpnType: string) => {
    setIsVpnRestarting(true);
    try {
      let endpoint = '';
      if (vpnType === 'OpenVPN') {
        // Always use safe-restart for OpenVPN from the self-service page
        endpoint = '/api/vpn/safe-restart';
      } else if (vpnType === 'WireGuard') {
        if (!isUserAdmin) {
          // For non-admin users, use safe-restart for WireGuard
          endpoint = '/api/vpn/safe-restart';
        } else {
          // For WireGuard, always use safe-restart for all users from this page.
          // The safe-restart API handles unauthenticated access and checks for disabled/connected states.
          endpoint = '/api/vpn/safe-restart';
        }
      } else {
        throw new Error(`Unsupported VPN type for restart: ${vpnType}`);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vpnUuid, vpnType }), // Pass vpnType in body
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
      refreshVpnStatuses(); // Refresh only VPN statuses after restart
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
  }, [toast, refreshVpnStatuses, isUserAdmin]); // Add isUserAdmin to dependencies

  // Use useIpDetection to get IP detection data
  const {
    detectedIp,
    detectedMac,
    detectedVendor,
    detectedVendorSource,
    detectedHostname,
    hostAlias,
    hostAliasUuid,
    hostAliasEnabled,
    isIpDetecting,
    ipDetectionError,
    hasDhcpReservation,
    hasIpConflict,
    hasMacConflict,
    dhcpReservedMac,
    dhcpReservedVendor,
    refreshHostAlias,
  } = useIpDetection(mounted, !isSelfServiceAllowed); // Disable when self-service functionality is not allowed

  // Use useIpGroupActions to get IP group action logic
  const {
    userIpMemberOfGroups,
    hasLoadedMembership,
    isAssigningIp,
    isUnassigningDetected,
    handleRemoveFromGroup,
    handleUnassignAll,
    handleSmartAssign,
    refreshUserIpGroupMembership,
  } = useIpGroupActions({
    mounted,
    detectedIp,
    hostAlias, // Pass hostAlias
    groups,
    user: session?.user || null, // Pass the user from session
    isUserAdmin,
    selectedGroupId,
    setSelectedGroupId,
    refreshHostAlias,
    refreshGroups: refreshGroupsInPlace, // Pass the in-place refresh function
    fetchExtendedDetails: fetchExtendedDetails, // Pass the fetchExtendedDetails callback
    refreshLastOperationOnly: refreshLastOperationOnly, // Pass the refreshLastOperationOnly callback
    refreshGraphs: refreshGraphs, // Pass the refreshGraphs callback
    isDeviceManagementPage: false, // This is the self-service page
  });

  // Check for unmanaged groups when userIpMemberOfGroups changes
  const checkUnmanagedGroups = useCallback(async () => {
    if (!mounted || !userIpMemberOfGroups || userIpMemberOfGroups.length === 0) {
      setUnmanagedGroupResult(null);
      return;
    }

    try {
      // Call API endpoint to check unmanaged status
      const response = await fetch('/api/self-service/check-unmanaged-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hostGroups: userIpMemberOfGroups,
          userId: session?.user?.id || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to check unmanaged groups: ${response.statusText}`);
      }

      const result: UnmanagedGroupResult = await response.json();
      setUnmanagedGroupResult(result);
    } catch (error) {
      logger.error('Error checking unmanaged groups:', error);
      // Fail open - if we can't check, assume managed
      setUnmanagedGroupResult(null);
    }
  }, [mounted, userIpMemberOfGroups, session?.user?.id]);

  // Check unmanaged status when userIpMemberOfGroups changes
  useEffect(() => {
    checkUnmanagedGroups();
  }, [checkUnmanagedGroups]);



  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect authenticated users when self-service is disabled (using useEffect to avoid render errors)
  useEffect(() => {
    if (!isLoadingGlobalSettings && !isSelfServiceAllowed && authStatus === 'authenticated') {
      router.push('/devices');
    }
  }, [isLoadingGlobalSettings, isSelfServiceAllowed, authStatus, router]);

  // Redirect unauthenticated users to login when self-service is disabled
  useEffect(() => {
    if (!isLoadingGlobalSettings && !isSelfServiceAllowed && authStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [isLoadingGlobalSettings, isSelfServiceAllowed, authStatus, router]);

  // All IP group action logic (isIpInGroup, handleAssignIp, handleRemoveIp, handleUnassignAll, userIpMemberOfGroups, refreshUserIpGroupMembership)
  // and related states (isAssigningIp, isUnassigningDetected) are now managed by useIpGroupActions.
  // The useEffect for refreshUserIpGroupMembership is also inside the hook.

  // Removed unused handleCopy function

  // Compute effective self-service allowed: false if host alias is disabled or host is in unmanaged groups
  const effectiveIsSelfServiceAllowed = isSelfServiceAllowed &&
    (hostAliasEnabled === undefined || hostAliasEnabled === null || hostAliasEnabled === '1') &&
    (!unmanagedGroupResult || !unmanagedGroupResult.isUnmanaged);

  // Add comprehensive loading state to prevent flickering
  const isDataFullyLoaded = useMemo(() => {
    // We're fully loaded when:
    // 1. Global settings are loaded
    // 2. IP detection is complete (either success or error)
    // 3. If we have an IP, we have determined the host alias status
    // 4. Groups are loaded
    // Note: We exclude isLoadingVpnStatuses because VPN status refreshes should be in-place
    // and not trigger the skeleton loader
    if (isLoadingGlobalSettings) return false;
    if (isIpDetecting) return false;
    if (detectedIp && hostAliasEnabled === undefined) return false;
    if (isLoadingGroups) return false;
    return true;
  }, [isLoadingGlobalSettings, isIpDetecting, detectedIp, hostAliasEnabled, isLoadingGroups]);

  // Handle window resize to determine layout mode
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

    handleResize(); // Set initial layout mode
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Show loading state for authenticated users when self-service is disabled
  if (!isLoadingGlobalSettings && !isSelfServiceAllowed && authStatus === 'authenticated') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader ref={headerRef} />
        <main ref={mainRef} className="flex-grow container-responsive py-4 flex items-center justify-center">
          <div className="text-center">
            <ClientOnly fallback={<Skeleton className="h-12 w-12 rounded-full mx-auto" />}>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            </ClientOnly>
            <p className="mt-4 text-muted-foreground">Redirecting to Device Management...</p>
          </div>
        </main>
        <AppFooter ref={footerRef} pageTitle="Redirecting" />
      </div>
    );
  }

  // Show loading state for unauthenticated users when self-service is disabled (while redirecting)
  if (!isLoadingGlobalSettings && !isSelfServiceAllowed && authStatus === 'unauthenticated') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader ref={headerRef} />
        <main ref={mainRef} className="flex-grow container-responsive py-4 flex items-center justify-center">
          <div className="text-center">
            <ClientOnly fallback={<Skeleton className="h-12 w-12 rounded-full mx-auto" />}>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            </ClientOnly>
            <p className="mt-4 text-muted-foreground">Self-service is disabled. Redirecting to login...</p>
          </div>
        </main>
        <AppFooter ref={footerRef} pageTitle="Redirecting" />
      </div>
    );
  }

  // Show loading skeleton while data is loading
  if (!mounted || !isDataFullyLoaded) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader ref={headerRef} />
        <main ref={mainRef} className="flex-grow container-responsive py-4 flex items-center justify-center">
          <div className="text-center">
            <ClientOnly fallback={<Skeleton className="h-12 w-12 rounded-full mx-auto" />}>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            </ClientOnly>
            <p className="mt-4 text-muted-foreground">Loading authentication status...</p>
          </div>
        </main>
        <AppFooter ref={footerRef} pageTitle="Self-Service" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
      <AppHeader ref={headerRef} layoutMode={layoutMode} setLayoutMode={setLayoutMode} />
      <main ref={mainRef} className={`flex flex-1 overflow-y-auto container-responsive pt-4 pb-4 ${window.innerWidth < 1024 || layoutMode === 'stacked' || (layoutMode === 'side-by-side' && networkGroupsCardWidth !== undefined && networkGroupsCardWidth < 300) ? 'flex-col space-y-4' : 'flex-row space-x-4'}`} style={{ height: mainHeight, maxHeight: mainHeight }}>
        <ConnectionErrorModal
          isOpen={showConnectionErrorModal}
          onOpenChange={setShowConnectionErrorModal}
        />

        {isViewUnsupported ? (
          <div className="flex flex-col items-center justify-center w-full h-full text-center text-lg text-muted-foreground p-4">
            <p>Unsupported View</p>
            <p>Switch to Portrait Orientation</p>
          </div>
        ) : (
          <>
            {/* Adjust width based on layoutMode */}
            <div ref={selfServiceCardRef} className={`${window.innerWidth < 1024 || layoutMode === 'stacked' ? 'w-full md:w-[600px] mx-auto' : 'flex flex-col flex-grow min-h-0 w-1/2 h-full'}`}>
              <SelfServiceCard
                detectedIp={detectedIp}
                detectedMac={detectedMac}
                detectedVendor={detectedVendor}
                detectedVendorSource={detectedVendorSource}
                detectedHostname={detectedHostname}
                hostAlias={hostAlias}
                hostAliasUuid={hostAliasUuid}
                hostAliasEnabled={hostAliasEnabled}
                isIpDetecting={isIpDetecting}
                ipDetectionError={ipDetectionError}
                hasDhcpReservation={hasDhcpReservation}
                hasIpConflict={hasIpConflict}
                hasMacConflict={hasMacConflict}
                dhcpReservedMac={dhcpReservedMac}
                dhcpReservedVendor={dhcpReservedVendor}
                refreshHostAlias={refreshHostAlias}
                isSelfServiceAllowed={effectiveIsSelfServiceAllowed}
                userIpMemberOfGroups={userIpMemberOfGroups}
                refreshIpData={async () => { }} // Placeholder function
                isAuthenticated={authStatus === 'authenticated'}
                vpnConnectionStatuses={vpnConnectionStatuses}
                groupVpnMap={groupVpnMap}
                allEmojiValues={allEmojiValues}
                allFlagValues={allFlagValues}
                onVpnRestart={(vpnUuid, vpnType) => handleVpnRestart(vpnUuid, vpnType)}
                isVpnRestarting={isVpnRestarting}
                refreshUserIpGroupMembership={refreshUserIpGroupMembership}
                refetchVpnStatuses={refreshVpnStatuses}
                refreshGroups={refreshGroups}
                unmanagedGroupResult={unmanagedGroupResult}
                layoutMode={layoutMode}
                isRefreshing={isRefreshing}
                onFetchExtendedDetailsReady={(fetchFn) => { setFetchExtendedDetails(() => fetchFn); }}
                onRefreshLastOperationReady={(refreshFn) => { setRefreshLastOperationOnly(() => refreshFn); }}
                onRefreshGraphsReady={(refreshFn) => { setRefreshGraphs(() => refreshFn); }}
                className="w-full"
              />
            </div>


            {/* Container for NetworkGroupsCard to manage height and scrolling */}
            {/* Adjust width and scrolling based on layoutMode */}
            {/* Attach the ref to this container div */}
            <div ref={networkGroupsCardRef} className={`flex flex-col flex-grow ${window.innerWidth < 1024 || layoutMode === 'stacked' || (layoutMode === 'side-by-side' && networkGroupsCardWidth !== undefined && networkGroupsCardWidth < 300) ? 'w-full md:w-[600px] mx-auto flex-1 min-h-0' : 'w-1/2 h-full min-h-0'}`}>
              <NetworkGroupsCard
                userRole={session?.user?.role ?? undefined}
                groups={groups}
                isLoadingGroups={isLoadingGroups}
                selectedGroupId={selectedGroupId}
                setSelectedGroupId={setSelectedGroupId}
                detectedIp={detectedIp}
                isAssigningIp={isAssigningIp}
                isUnassigningDetected={isUnassigningDetected}
                handleUnassignAll={handleUnassignAll}
                handleRemoveFromGroup={handleRemoveFromGroup}
                handleSmartAssign={handleSmartAssign}
                userIpMemberOfGroups={userIpMemberOfGroups}
                hasLoadedMembership={hasLoadedMembership}
                isSelfServiceAllowed={effectiveIsSelfServiceAllowed}
                areButtonsCompact={areButtonsCompact}
                isDeviceManagementPage={false}
                isIpNotAllowed={isIpNotAllowed}
                isRefreshing={isRefreshing}
                vpnConnectionStatuses={vpnConnectionStatuses}
                isLoadingVpnStatuses={isLoadingVpnStatuses}
                groupVpnMap={groupVpnMap}
                refetchVpnStatuses={refreshVpnStatuses}
                allEmojiValues={allEmojiValues}
                allFlagValues={allFlagValues}
                hostAliasEnabled={hostAliasEnabled}
                isParentLoading={!isDataFullyLoaded}
                refreshGroups={refreshGroups}
                unmanagedGroupResult={unmanagedGroupResult}
              />
            </div>
          </>
        )}
      </main>
      <AppFooter ref={footerRef} pageTitle="Self-Service" />
    </div>
  );
}
