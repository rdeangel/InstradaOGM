'use client';

import { LogIn } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { NetworkAlias } from '@/types/opnsense';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import useResizeObserver from '@/hooks/useResizeObserver';
import { logger } from '@/lib/logger';
import { usePageReloadDetection } from '@/hooks/usePageReloadDetection';
import { useAbortController } from '@/hooks/useAbortController';

import { AppFooter } from '@/components/layout/AppFooter';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useOpnsenseData } from '@/hooks/useOpnsenseData';

import NetworkGroupsCard from '@/components/NetworkGroupsCard';
import NetworkAliasManagementCard, { type NetworkAliasManagementCardHandles } from '@/components/NetworkAliasManagementCard';

export default function NetworkManagementPage() {
  const { data: session, status: authStatus } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();

  const { toast } = useToast();

  const [layoutMode, setLayoutMode] = useState<'stacked' | 'side-by-side'>('side-by-side');
  const [isViewUnsupported, setIsViewUnsupported] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainHeight, setMainHeight] = useState<number | string>('auto');

  const networkGroupsCardRef = useRef<HTMLDivElement>(null);
  const networkGroupsCardWidth = useResizeObserver(networkGroupsCardRef);

  const aliasCardRef = useRef<NetworkAliasManagementCardHandles>(null);
  const selectedAliasRef = useRef<NetworkAlias | null>(null);
  const { createController, isAbortError } = useAbortController();
  const { shouldSuppressError } = usePageReloadDetection();
  const currentControllerRef = useRef<AbortController | null>(null);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const areButtonsCompact = useMemo(() => {
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
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
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

  const [selectedAlias, setSelectedAliasState] = useState<NetworkAlias | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isUnassigning, setIsUnassigning] = useState(false);

  // Persist selection to localStorage
  const setSelectedAlias = useCallback((alias: NetworkAlias | null) => {
    setSelectedAliasState(alias);
    try {
      if (alias) {
        localStorage.setItem('network-management-selected-alias-uuid', alias.uuid);
      } else {
        localStorage.removeItem('network-management-selected-alias-uuid');
      }
    } catch {}
  }, []);

  // Sync selectedAlias with fresh data after a fetch
  const syncSelectedAlias = useCallback((freshAliases: NetworkAlias[]) => {
    setSelectedAliasState(prev => {
      if (!prev?.uuid) return prev;
      const updated = freshAliases.find(a => a.uuid === prev.uuid);
      return updated || prev;
    });
  }, []);

  // Restore selection from localStorage after aliases are loaded
  const handleAliasesLoaded = useCallback((aliases: NetworkAlias[]) => {
    try {
      const savedUuid = localStorage.getItem('network-management-selected-alias-uuid');
      if (savedUuid) {
        const match = aliases.find(a => a.uuid === savedUuid);
        if (match) setSelectedAliasState(match);
      }
    } catch {}
  }, []);

  const [hasAccess, setHasAccess] = useState(false);
  const [isLoadingAccess, setIsLoadingAccess] = useState(true);

  const {
    groups,
    isLoadingGroups,
    refreshData: refreshOpnsenseData,
    refreshVpnStatuses,
    refreshGroupsInPlace,
    allEmojiValues,
    allFlagValues,
    vpnConnectionStatuses,
    isLoadingVpnStatuses,
    groupVpnMap,
  } = useOpnsenseData(authStatus === 'authenticated' && hasAccess === true, 'user');

  const refreshGroups = useCallback(async (inPlace?: boolean) => {
    if (inPlace) {
      await refreshGroupsInPlace();
    } else {
      await refreshOpnsenseData();
    }
  }, [refreshGroupsInPlace, refreshOpnsenseData]);

  // Keep a ref of current refresh functions to avoid stale closures in focus handlers
  const refreshFunctionsRef = useRef<{
    refreshAliasesSilent: () => Promise<NetworkAlias[]>;
    refreshGroups: (inPlace?: boolean) => Promise<void>;
    refreshVpnStatuses: (inPlace?: boolean) => Promise<void>;
    refreshLastOperationOnly: () => Promise<void>;
    refreshExtendedDetails: () => Promise<void>;
    refreshGraphs: () => Promise<void>;
  }>({
    refreshAliasesSilent: () => Promise.resolve([]),
    refreshGroups: () => Promise.resolve(),
    refreshVpnStatuses: () => Promise.resolve(),
    refreshLastOperationOnly: () => Promise.resolve(),
    refreshExtendedDetails: () => Promise.resolve(),
    refreshGraphs: () => Promise.resolve(),
  });

  useEffect(() => {
    refreshFunctionsRef.current = {
      refreshAliasesSilent: () => aliasCardRef.current?.refreshAliasesSilent() || Promise.resolve([]),
      refreshGroups: (inPlace?: boolean) => refreshGroups(inPlace),
      refreshVpnStatuses: (inPlace?: boolean) => refreshVpnStatuses(inPlace),
      refreshLastOperationOnly: () => aliasCardRef.current?.refreshLastOperationOnly() || Promise.resolve(),
      refreshExtendedDetails: () => aliasCardRef.current?.refreshExtendedDetails() || Promise.resolve(),
      refreshGraphs: () => aliasCardRef.current?.refreshGraphs() || Promise.resolve(),
    };
  }, [refreshGroups, refreshVpnStatuses]);

  // Keep selectedAliasRef in sync
  useEffect(() => {
    selectedAliasRef.current = selectedAlias;
  }, [selectedAlias]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      const checkAccess = async () => {
        try {
          setIsLoadingAccess(true);
          const response = await fetch('/api/user/has-network-alias-access');
          if (!response.ok) {
            throw new Error('Failed to fetch Network Management status');
          }
          const data = await response.json();
          setHasAccess(data.hasAccess);
        } catch (error) {
          logger.error("Error fetching Network Management status:", error);
          setHasAccess(false);
        } finally {
          setIsLoadingAccess(false);
        }
      };
      checkAccess();
    } else if (authStatus === 'unauthenticated') {
      setHasAccess(false);
      setIsLoadingAccess(false);
    }
  }, [authStatus]);

  const userIpMemberOfGroups = useMemo(() => {
    if (!selectedAlias?.memberOfGroups) return [];
    return groups.filter(g => selectedAlias.memberOfGroups!.some(m => m.uuid === g.uuid));
  }, [selectedAlias, groups]);

  const handleSmartAssign = useCallback(async (targetGroupId: string) => {
    if (!selectedAlias) return;
    setIsAssigning(true);
    try {
      const resp = await fetch('/api/opnsense/network-alias-group-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'assign', aliasUuid: selectedAlias.uuid, groupId: targetGroupId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to assign');

      if (data.removedFromGroups && data.removedFromGroups.length > 0) {
        const removedNames = data.removedFromGroups.map((g: { name: string; friendlyName?: string }) => g.friendlyName || g.name).join(', ');
        const targetGroup = groups.find(g => g.id === targetGroupId || g.uuid === targetGroupId);
        const targetName = targetGroup?.friendlyName || targetGroup?.name || 'group';
        toast({ title: 'Alias moved', description: `Moved from ${removedNames} to ${targetName}`, variant: 'success' });
      } else {
        toast({ title: 'Alias assigned to group', variant: 'success' });
      }

      if (data.memberOfGroups) {
        setSelectedAlias(selectedAlias ? { ...selectedAlias, memberOfGroups: data.memberOfGroups } : null);
        aliasCardRef.current?.updateAliasMembership(selectedAlias.uuid, data.memberOfGroups);
      }
      await Promise.all([
        refreshGroups(true),
        aliasCardRef.current?.refreshLastOperationOnly(),
        aliasCardRef.current?.refreshGraphs(),
      ]);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsAssigning(false);
    }
  }, [selectedAlias, toast, refreshGroups, groups, setSelectedAlias]);

  const handleRemoveFromGroup = useCallback(async (groupId: string) => {
    if (!selectedAlias) return;
    setIsUnassigning(true);
    try {
      const resp = await fetch('/api/opnsense/network-alias-group-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'unassign', aliasUuid: selectedAlias.uuid, groupId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to unassign');
      toast({ title: 'Alias removed from group', variant: 'success' });
      if (data.memberOfGroups) {
        setSelectedAlias(selectedAlias ? { ...selectedAlias, memberOfGroups: data.memberOfGroups } : null);
        aliasCardRef.current?.updateAliasMembership(selectedAlias.uuid, data.memberOfGroups);
      }
      await Promise.all([
        refreshGroups(true),
        aliasCardRef.current?.refreshLastOperationOnly(),
        aliasCardRef.current?.refreshGraphs(),
      ]);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsUnassigning(false);
    }
  }, [selectedAlias, toast, refreshGroups, setSelectedAlias]);

  const handleUnassignAll = useCallback(async () => {
    if (!selectedAlias?.memberOfGroups?.length) return;
    setIsUnassigning(true);
    try {
      const results = await Promise.allSettled(
        selectedAlias.memberOfGroups.map(g =>
          fetch('/api/opnsense/network-alias-group-management', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation: 'unassign', aliasUuid: selectedAlias.uuid, groupId: g.uuid }),
          }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
        )
      );
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        toast({ title: `Removed from ${results.length - failed.length} groups, ${failed.length} failed`, variant: 'destructive' });
      } else {
        toast({ title: 'Alias removed from all groups', variant: 'success' });
      }
      setSelectedAlias(selectedAlias ? { ...selectedAlias, memberOfGroups: [] } : null);
      aliasCardRef.current?.updateAliasMembership(selectedAlias.uuid, []);
      await Promise.all([
        refreshGroups(true),
        aliasCardRef.current?.refreshLastOperationOnly(),
        aliasCardRef.current?.refreshGraphs(),
      ]);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsUnassigning(false);
    }
  }, [selectedAlias, toast, refreshGroups, setSelectedAlias]);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const timer = setTimeout(() => {
        router.push('/login');
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [authStatus, router]);

  // Focus/visibility-based in-place refresh (mirrors /devices pattern)
  useEffect(() => {
    if (authStatus !== 'authenticated' || !hasAccess) return;

    const handleRefresh = async () => {
      // Abort any previous focus-triggered requests
      if (currentControllerRef.current && !currentControllerRef.current.signal.aborted) {
        currentControllerRef.current.abort('New focus event triggered');
      }

      const controller = createController(15000);
      currentControllerRef.current = controller;

      // Debounce to reduce collision with page reloads
      await new Promise(resolve => {
        if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = setTimeout(resolve, 500);
      });

      if (controller.signal.aborted) return;

      const fns = refreshFunctionsRef.current;
      const currentAlias = selectedAliasRef.current;

      try {
        if (currentAlias) {
          // Refresh aliases, groups, VPN, last operation, and extended details in parallel
          const [freshAliases] = await Promise.all([
            fns.refreshAliasesSilent(),
            fns.refreshGroups(true),
            fns.refreshVpnStatuses(true),
            fns.refreshLastOperationOnly(),
            fns.refreshExtendedDetails(),
          ]);

          if (controller.signal.aborted) return;

          // Sync selectedAlias with fresh data
          if (freshAliases?.length) syncSelectedAlias(freshAliases);

          // Refresh graphs (also fetches aliases internally but we already have fresh data)
          await fns.refreshGraphs();
        } else {
          // No alias selected — just refresh aliases, groups and VPN in-place
          await Promise.all([
            fns.refreshAliasesSilent(),
            fns.refreshGroups(true),
            fns.refreshVpnStatuses(true),
          ]);
        }
      } catch (error) {
        if (!isAbortError(error) && !shouldSuppressError(error, 'focus refresh')) {
          logger.error('[NetworkManagement] Focus refresh error:', error);
        }
      }
    };

    const handleFocus = () => handleRefresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleRefresh();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      if (currentControllerRef.current && !currentControllerRef.current.signal.aborted) {
        currentControllerRef.current.abort('Component unmounting');
      }
    };
  }, [authStatus, hasAccess, createController, isAbortError, shouldSuppressError, syncSelectedAlias]);

  if (authStatus === 'loading' || isLoadingAccess) {
    return (
      <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
        <AppHeader ref={headerRef} />
        <main ref={mainRef} className="flex-grow container mx-auto p-4 md:p-8 flex items-center justify-center" style={{ height: mainHeight, maxHeight: mainHeight }}>
          <div className="text-center">
            <p className="mt-4 text-muted-foreground">Loading access priviledges...</p>
          </div>
        </main>
        <AppFooter ref={footerRef} pageTitle="Network Management" />
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
          <p className="text-muted-foreground">Please log in to manage network aliases.</p>
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
        <AppFooter ref={footerRef} pageTitle="Network Management" />
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
          !hasAccess ? (
            <div className="flex items-center justify-center flex-grow">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-muted-foreground">Access Denied</h1>
                <p className="text-muted-foreground">Network Alias Management is not available.</p>
              </div>
            </div>
          ) : (
            <>
              <div className={`${window.innerWidth < 1024 || layoutMode === 'stacked' ? 'w-full md:w-[600px] mx-auto' : 'flex flex-col flex-grow min-h-0 w-1/2 h-full'}`}>
                <NetworkAliasManagementCard
                  ref={aliasCardRef}
                  selectedAlias={selectedAlias}
                  onSelectAlias={setSelectedAlias}
                  onAliasesLoaded={handleAliasesLoaded}
                  onAliasesSilentRefreshed={syncSelectedAlias}
                  layoutMode={layoutMode}
                  allEmojiValues={allEmojiValues}
                  allFlagValues={allFlagValues}
                  vpnConnectionStatuses={vpnConnectionStatuses}
                  groupVpnMap={groupVpnMap}
                />
              </div>

              <div ref={networkGroupsCardRef} className={`flex flex-col flex-grow ${window.innerWidth < 1024 || layoutMode === 'stacked' || (layoutMode === 'side-by-side' && networkGroupsCardWidth !== undefined && networkGroupsCardWidth < 300) ? 'w-full md:w-[600px] mx-auto flex-1 min-h-0' : 'w-1/2 h-full min-h-0'}`}>
                <NetworkGroupsCard
                  userRole={session?.user?.role ?? undefined}
                  mode="networkAlias"
                  groups={groups}
                  isLoadingGroups={isLoadingGroups}
                  selectedGroupId={selectedGroupId}
                  setSelectedGroupId={setSelectedGroupId}
                  detectedIp={selectedAlias ? `${selectedAlias.name} (${selectedAlias.content})` : null}
                  isAssigningIp={isAssigning}
                  isUnassigningDetected={isUnassigning}
                  handleUnassignAll={handleUnassignAll}
                  handleRemoveFromGroup={handleRemoveFromGroup}
                  handleSmartAssign={handleSmartAssign}
                  userIpMemberOfGroups={userIpMemberOfGroups}
                  hasLoadedMembership={!!selectedAlias}
                  isSelfServiceAllowed={!!selectedAlias}
                  areButtonsCompact={areButtonsCompact}
                  isDeviceManagementPage={true}
                  isIpNotAllowed={false}
                  vpnConnectionStatuses={vpnConnectionStatuses}
                  isLoadingVpnStatuses={isLoadingVpnStatuses}
                  groupVpnMap={groupVpnMap}
                  refetchVpnStatuses={refreshVpnStatuses}
                  allEmojiValues={allEmojiValues}
                  allFlagValues={allFlagValues}
                  hostAliasEnabled={selectedAlias?.enabled ?? null}
                  refreshGroups={refreshGroups}
                />
              </div>
            </>
          )
        )}
      </main>
      <AppFooter ref={footerRef} pageTitle="Network Management" />
    </div>
  );
}
