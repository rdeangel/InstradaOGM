'use client';

/* eslint-disable security/detect-object-injection */
// This component uses bracket notation with typed keys from objects. All uses are safe.
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ClientOnly } from '@/components/util/ClientOnly';
import { logger } from '@/lib/logger';
import { usePageReloadDetection } from '@/hooks/usePageReloadDetection';
import { useAbortController } from '@/hooks/useAbortController';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge'; // Import Badge
import { Search, Loader2, Check, ListX, AlertCircle, ShieldCheck, ShieldQuestion, Network as NetworkIconLucide, RefreshCw, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import * as LucideIcons from 'lucide-react'; // Import all Lucide icons
import type { LucideIcon } from 'lucide-react';
import type { NetworkGroup, IconName } from '@/types/opnsense';
// import type { OpnsenseGroupDisplay } from '@/types/settings'; // Removed
import { Role } from '@/types/opnsense';
import { useIsMobile } from '@/hooks/use-mobile';
import { flags, generalEmojis } from '@/components/ui/icon-picker'; // Import comprehensive lists and new Sets
import { VpnClientType } from '@prisma/client'; // Import VpnClientType
import { useGroupType } from '@/context/GroupTypeContext';
import type { UnmanagedGroupResult } from '@/lib/unmanaged-group-utils';

const iconMap: Record<IconName, LucideIcon> = {
  'ShieldCheck': ShieldCheck,
  'ShieldQuestion': ShieldQuestion,
  'Network': NetworkIconLucide,
};

interface NetworkGroupsCardProps {
  userRole: Role | undefined;
  mode?: 'host' | 'networkAlias';
  groups: NetworkGroup[];
  isLoadingGroups: boolean;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  detectedIp: string | null;
  isAssigningIp: boolean;
  isUnassigningDetected: boolean;
  handleUnassignAll: () => Promise<void>;
  handleRemoveFromGroup: (groupId: string, showSpinner?: boolean) => Promise<void>;
  handleSmartAssign: (targetGroupId: string) => Promise<void>;
  userIpMemberOfGroups: NetworkGroup[];
  hasLoadedMembership: boolean; // New prop to track if membership data has been loaded
  // opnsenseGroupDisplays: OpnsenseGroupDisplay[]; // Removed as friendlyName and iconIdentifier are now on NetworkGroup
  isSelfServiceAllowed: boolean;
  areButtonsCompact?: boolean;
  isDeviceManagementPage?: boolean; // New prop to differentiate
  isIpNotAllowed?: boolean; // New prop for IP not in allowed networks
  isRefreshing?: boolean; // New prop for global refresh state
  vpnConnectionStatuses: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>; // New prop for VPN statuses
  isLoadingVpnStatuses: boolean; // New prop for VPN loading status
  groupVpnMap: Map<string, string>; // New prop for networkGroupId to vpnUuid map
  refetchVpnStatuses: (inPlace?: boolean, forceRefresh?: boolean) => Promise<void>; // New prop to refetch VPN statuses with forceRefresh support
  allEmojiValues: string[]; // New prop for all emoji values
  allFlagValues: string[]; // New prop for all flag values
  hostAliasEnabled?: string | null; // New prop for host alias enabled status
  isParentLoading?: boolean; // New prop to indicate when parent is still loading
  refreshGroups?: (inPlace?: boolean) => Promise<void>; // New prop to refresh groups in-place
  unmanagedGroupResult?: UnmanagedGroupResult | null; // New prop for unmanaged group status
}

import React, { memo } from 'react'; // Import memo directly

export default memo(function NetworkGroupsCard({ // Wrap the component in memo
  userRole,
  groups,
  isLoadingGroups,
  selectedGroupId,
  setSelectedGroupId,
  detectedIp,
  isAssigningIp,
  isUnassigningDetected,
  handleUnassignAll,
  handleRemoveFromGroup,
  handleSmartAssign,
  userIpMemberOfGroups,
  hasLoadedMembership,
  isSelfServiceAllowed,
  areButtonsCompact = false,
  isDeviceManagementPage = false,
  isIpNotAllowed = false, // Destructure new prop
  vpnConnectionStatuses,
  isLoadingVpnStatuses,
  groupVpnMap,
  refetchVpnStatuses,
  allEmojiValues,
  allFlagValues,
  hostAliasEnabled,
  isParentLoading,
  refreshGroups,
  unmanagedGroupResult,
}: NetworkGroupsCardProps) {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const { enableGroupTypes, enableSelfServiceMultiSelect, singleSelectName, multiSelectName, singleSelectIcon, multiSelectIcon } = useGroupType();

  // Add page reload detection and abort controller hooks
  const { shouldSuppressError, createFocusSafeFetch } = usePageReloadDetection();
  const { createController, isAbortError } = useAbortController();

  const [isRestartingVpn, setIsRestartingVpn] = useState<string | null>(null);
  const [isSearchHelpOpen, setIsSearchHelpOpen] = useState(false);

  // Compute effective group type behavior for UI display (indicators, filtering)
  // Device management: always respects enableGroupTypes
  // Self-service: requires both enableGroupTypes AND enableSelfServiceMultiSelect
  const effectiveGroupTypesEnabledForUI = enableGroupTypes && (isDeviceManagementPage || enableSelfServiceMultiSelect);

  // Remove local assigning state since it's now managed by parent
  // const [isLocalAssigning, setIsLocalAssigning] = useState(false); // New state for local assign button spinner

  const isUserAdmin = userRole === Role.SUPER_ADMIN; // Only SUPER_ADMIN should use the full restart API
  const isHostAliasDisabled = hostAliasEnabled !== undefined && hostAliasEnabled !== null && hostAliasEnabled !== '1';
  const isUnmanagedGroup = Boolean(unmanagedGroupResult && unmanagedGroupResult.isUnmanaged);

  // Add state to track if we're determining host alias status
  const isDeterminingHostAliasStatus = useMemo(() => {
    // We're determining status if:
    // 1. We have an IP address (so we should have a host alias)
    // 2. But we don't know the enabled status yet (hostAliasEnabled is undefined)
    return detectedIp && hostAliasEnabled === undefined;
  }, [detectedIp, hostAliasEnabled]);

  const memoizedAllGeneralEmojiValues = useMemo(() => new Set([...generalEmojis.map(e => e.value.normalize('NFC')), ...allEmojiValues.map(e => e.normalize('NFC'))]), [allEmojiValues]);
  const memoizedAllFlagValues = useMemo(() => new Set([...flags.map(f => f.value.normalize('NFC')), ...allFlagValues.map(f => f.normalize('NFC'))]), [allFlagValues]);

  const filteredGroups = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const sortedAndFiltered = groups
      .filter(group => {
        // Only apply self-service restrictions on the self-service page
        if (!isDeviceManagementPage) {
          // Filter out MultiSelect groups when group types are enabled AND self-service multi-select is disabled
          if (enableGroupTypes && !enableSelfServiceMultiSelect && group.groupType === 'MultiSelect') {
            return false;
          }
        }
        // Device management page: show all groups regardless of self-service settings

        // Get VPN type for this group
        const vpnUuid = groupVpnMap.get(group.id);
        const vpnInfo = vpnUuid ? vpnConnectionStatuses.get(vpnUuid.trim()) : undefined;
        const vpnType = vpnInfo?.type?.toLowerCase() || '';

        // Check VPN status for keyword matching
        const isVpnDown = vpnInfo && (vpnInfo.status === 'disconnected' || vpnInfo.status === 'disabled');
        const isVpnConnected = vpnInfo && vpnInfo.status === 'connected';

        // Match status keywords (using vpn-connected and vpn-disconnected)
        const matchesRestart = lowerCaseSearchTerm.includes('restart') && isVpnDown;
        const matchesVpnDisconnected = lowerCaseSearchTerm.includes('vpn-disconnected') && isVpnDown;
        const matchesVpnConnected = lowerCaseSearchTerm.includes('vpn-connected') && isVpnConnected;

        // Match group type keywords
        const matchesSingleSelect = lowerCaseSearchTerm.includes('single-select') && group.groupType === 'SingleSelect';
        const matchesMultiSelect = lowerCaseSearchTerm.includes('multi-select') && group.groupType === 'MultiSelect';

        // Search filter - include VPN type, status keywords, and group type in search
        return (
          group.name.toLowerCase().includes(lowerCaseSearchTerm) ||
          (group.description && group.description.toLowerCase().includes(lowerCaseSearchTerm)) ||
          (group.friendlyName && group.friendlyName.toLowerCase().includes(lowerCaseSearchTerm)) ||
          vpnType.includes(lowerCaseSearchTerm) || // Search by VPN type (openvpn, wireguard, ipsec)
          matchesRestart || // Search by 'restart' keyword for down VPNs
          matchesVpnDisconnected || // Search by 'vpn-disconnected' keyword for down VPNs
          matchesVpnConnected || // Search by 'vpn-connected' keyword for active VPNs
          matchesSingleSelect || // Search by 'single-select' keyword for SingleSelect groups
          matchesMultiSelect // Search by 'multi-select' keyword for MultiSelect groups
        );
      })
      .sort((a, b) => {
        const nameA = a.friendlyName || a.name; // Use friendlyName directly
        const nameB = b.friendlyName || b.name; // Use friendlyName directly
        return nameA.localeCompare(nameB);
      });
    return sortedAndFiltered;
  }, [groups, searchTerm, enableSelfServiceMultiSelect, isDeviceManagementPage, enableGroupTypes, groupVpnMap, vpnConnectionStatuses]); // Added groupVpnMap and vpnConnectionStatuses dependencies

  const getGroupIcon = useCallback((group: NetworkGroup): React.ReactNode => {
    const mappedIconIdentifier = group.iconIdentifier;

    if (mappedIconIdentifier) {
      const normalizedIconIdentifier = mappedIconIdentifier.normalize('NFC');
      const isEmoji = memoizedAllGeneralEmojiValues.has(normalizedIconIdentifier);
      const isFlag = memoizedAllFlagValues.has(normalizedIconIdentifier);

      if (isEmoji || isFlag) {
        return <span className={cn("text-xl mr-1.5", { "flag-icon": isFlag })}>{mappedIconIdentifier}</span>;
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
    if (group.name.toLowerCase().includes('high security')) return <ShieldCheck size={18} className="mr-1.5 text-primary opacity-80" />;
    if (group.name.toLowerCase().includes('vpn')) return <ShieldQuestion size={18} className="mr-1.5 text-primary opacity-80" />;
    return <NetworkIconLucide size={18} className="mr-1.5 text-primary opacity-80" />;
  }, [memoizedAllGeneralEmojiValues, memoizedAllFlagValues]); // Removed opnsenseGroupDisplays from dependency array

  const handleRestartVpn = useCallback(async (vpnUuid: string, vpnType: VpnClientType) => {
    setIsRestartingVpn(vpnUuid);
    logger.debug(`NetworkGroupsCard: handleRestartVpn called with vpnUuid: ${vpnUuid}, vpnType: ${vpnType}`);
    try {
      const endpoint = '/api/vpn/safe-restart';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vpnUuid, vpnType }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to restart VPN service');
      }
      toast({
        title: 'VPN Restart Initiated',
        description: 'The VPN service restart command has been sent. Please allow some time for the service to come back online.',
        variant: 'default',
      });
      await new Promise(resolve => setTimeout(resolve, 10000));
      logger.debug("NetworkGroupsCard: Calling refetchVpnStatuses after timeout for in-place update.");
      await refetchVpnStatuses(true, true); // Force refresh after VPN restart
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : `An unexpected error occurred while trying to restart the ${vpnType} service.`;
      logger.error('Failed to Restart VPN:', error);
      toast({
        title: `Failed to Restart ${vpnType}`,
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsRestartingVpn(null);
    }
  }, [toast, refetchVpnStatuses]);

  // Effect to refresh data when the window gains focus (e.g., switching tabs back)
  useEffect(() => {
    let focusTimeout: NodeJS.Timeout;
    let currentController: AbortController | null = null;

    const handleFocus = async () => {
      logger.debug('Window focused, refreshing VPN statuses and groups...');

      // Abort any previous focus-triggered requests
      if (currentController && !currentController.signal.aborted) {
        logger.debug('Aborting previous network groups focus refresh requests');
        currentController.abort('New focus event triggered');
      }

      // Clear any existing timeout
      if (focusTimeout) {
        clearTimeout(focusTimeout);
      }

      // Increased delay to reduce collision probability with page reloads
      focusTimeout = setTimeout(async () => {
        // Create new abort controller for this refresh cycle
        currentController = createController(30000); // 30 second timeout

        // Create focus-safe fetch that will be cancelled during page reload
        const restoreFetch = createFocusSafeFetch();

        try {
          logger.debug('Starting network groups focus refresh with abort controller');

          // Refresh both VPN statuses and groups in-place in parallel
          const refreshPromises = [
            refetchVpnStatuses(true, true) // Refresh VPN statuses in-place with force refresh
          ];

          // Only refresh groups if the function is provided
          if (refreshGroups) {
            refreshPromises.push(refreshGroups(true)); // Refresh groups in-place
          }

          await Promise.all(refreshPromises);

          logger.debug('Network groups focus refresh completed successfully');
        } catch (error) {
          // Only log errors that aren't due to abort or page reload
          if (!isAbortError(error) && !shouldSuppressError(error, 'network groups focus refresh')) {
            logger.error('Error during network groups focus refresh:', error);
          } else {
            logger.debug('Network groups focus refresh cancelled or suppressed:', error);
          }
        } finally {
          // Always restore original fetch
          restoreFetch();
        }
      }, 500); // Increased delay to reduce collision with page reloads
    };

    // Add both focus and visibility change listeners for better reliability
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        logger.debug('Page became visible, triggering network groups focus refresh');
        handleFocus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function to remove the event listeners, timeout, and abort any pending requests
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (focusTimeout) {
        clearTimeout(focusTimeout);
      }
      if (currentController && !currentController.signal.aborted) {
        logger.debug('Aborting network groups focus refresh requests due to component cleanup');
        currentController.abort('Component cleanup');
      }
    };
  }, [refetchVpnStatuses, refreshGroups, createController, isAbortError, shouldSuppressError, createFocusSafeFetch]); // Add missing dependencies

  // Only show skeleton loader if groups, host alias, or VPN statuses are loading
  const isFullyLoaded = useMemo(() => {
    if (isParentLoading) return false;
    if (isLoadingGroups) return false;
    if (isLoadingVpnStatuses) return false; // Wait for VPN statuses to load before showing groups
    if (isDeterminingHostAliasStatus) return false;
    return true;
  }, [isParentLoading, isLoadingGroups, isLoadingVpnStatuses, isDeterminingHostAliasStatus]);



  // Swap the order of Assign and Unassign buttons for better UX
  return (
    <Card className={cn(`shadow-lg flex flex-col min-h-0 pb-0 ${isMobile ? '' : 'mx-auto'} w-full lg-only:flex-1 xl-plus:flex-1`)}>
      <CardHeader className={isMobile ? 'p-3' : ''}>
        <div className="flex flex-row justify-between items-center">
          <div className="flex-grow">
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly fallback={<Skeleton className={`h-7 w-7 mr-2 rounded-full ${isMobile ? 'h-5 w-5' : ''}`} />}><NetworkIconLucide size={isMobile ? 22 : 28} className="mr-2 text-primary" /></ClientOnly> Network Groups
            </CardTitle>
            <CardDescription className={`mt-1 ${isMobile ? 'text-xs' : ''}`}>
              {isUserAdmin ? "Select a group and assign your device to it." :
                <ClientOnly fallback="Select a group and assign your device to it.">
                  {isSelfServiceAllowed ?
                    `Select a group membership for ${detectedIp || 'Not Detected'}` :
                    `Self-Service group assignment is disabled for your IP address (${detectedIp || 'Not Detected'}). Please contact an administrator.`
                  }
                </ClientOnly>
              }
            </CardDescription>
          </div>
          <div className="flex space-x-2">
            {isSelfServiceAllowed && detectedIp && !isHostAliasDisabled && !isDeterminingHostAliasStatus && (
              <>
                {/* Unassign/Remove Button - Dynamic text based on selected group type */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;

                            if (enableGroupTypes) {
                              // When group types are enabled, ALWAYS use specific group unassignment
                              // This preserves MultiSelect groups even when self-service multi-select is disabled
                              if (selectedGroupId && selectedGroup?.groupType === 'MultiSelect') {
                                // Remove from specific MultiSelect group only
                                await handleRemoveFromGroup(selectedGroupId);
                              } else {
                                // Unassign from ALL SingleSelect groups (this is the "Unassign" behavior)
                                const singleSelectGroups = userIpMemberOfGroups.filter(group =>
                                  groups.find(g => g.id === group.id)?.groupType === 'SingleSelect'
                                );

                                if (singleSelectGroups.length > 0) {
                                  // Remove from all SingleSelect groups using specific group unassignment
                                  for (const group of singleSelectGroups) {
                                    await handleRemoveFromGroup(group.id);
                                  }
                                } else {
                                  // No SingleSelect groups to unassign from
                                  toast({
                                    variant: "destructive",
                                    title: "No SingleSelect Groups",
                                    description: "No SingleSelect groups to unassign from.",
                                  });
                                  return;
                                }
                              }
                            } else {
                              // When group types are disabled, unassign from all groups
                              await handleUnassignAll();
                            }

                            // After successful operation, refresh groups to update UI
                            if (refreshGroups) {
                              await refreshGroups(true);
                            }
                          } catch (error) {
                            logger.error("Error unassigning IP:", error);
                            toast({
                              variant: "destructive",
                              title: "Error",
                              description: "Failed to unassign IP from groups.",
                            });
                          }
                        }}
                        disabled={
                          isUnassigningDetected ||
                          isAssigningIp ||
                          userIpMemberOfGroups.length === 0 ||
                          (() => {
                            if (!effectiveGroupTypesEnabledForUI) {
                              // When group types are globally enabled but not enabled for Self-Service UI,
                              // enable Unassign only if the user has at least one membership in the currently displayed groups
                              const inAnyDisplayedGroup = userIpMemberOfGroups.some(g => filteredGroups.some(fg => fg.id === g.id));
                              return !inAnyDisplayedGroup;
                            }

                            const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;

                            if (selectedGroupId && selectedGroup?.groupType === 'MultiSelect') {
                              // For MultiSelect: only enable if user is actually in the selected group
                              return !userIpMemberOfGroups.some(group => group.id === selectedGroupId || group.uuid === selectedGroupId);
                            } else {
                              // For Unassign (SingleSelect): enable if user has any SingleSelect groups
                              const hasSingleSelectGroups = userIpMemberOfGroups.some(group =>
                                groups.find(g => g.id === group.id)?.groupType === 'SingleSelect'
                              );
                              return !hasSingleSelectGroups;
                            }
                          })() ||
                          !isSelfServiceAllowed ||
                          !detectedIp ||
                          isHostAliasDisabled ||
                          isDeterminingHostAliasStatus ||
                          isIpNotAllowed ||
                          isUnmanagedGroup
                        }
                        className={`${isMobile || areButtonsCompact ? '' : 'sm:w-auto sm:px-3'}`}
                        size={isMobile || areButtonsCompact ? 'icon' : 'default'}
                      >
                        <ClientOnly fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
                          {isUnassigningDetected ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                            (() => {
                              // For MultiSelect remove buttons, use minus sign (both compact and full-size)
                              if (effectiveGroupTypesEnabledForUI) {
                                const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;
                                if (selectedGroup?.groupType === 'MultiSelect') {
                                  return <span className="text-lg font-bold leading-none">−</span>; // Minus sign for MultiSelect remove
                                }
                              }
                              return <ListX className="h-4 w-4" />; // Default icon for SingleSelect or disabled group types
                            })()
                          )}
                        </ClientOnly>
                        <ClientOnly fallback={<span className={!isMobile && !areButtonsCompact ? 'hidden sm:inline sm:ml-2' : 'hidden'}>
                          {(() => {
                            if (!effectiveGroupTypesEnabledForUI) {
                              return 'Unassign'; // Simple behavior when group types are disabled
                            }

                            const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;
                            if (selectedGroupId && selectedGroup?.groupType === 'MultiSelect') {
                              return 'Remove'; // Remove from specific MultiSelect group with minus sign
                            } else {
                              return 'Unassign'; // Unassign from all SingleSelect groups
                            }
                          })()}
                        </span>}>
                          <span className={!isMobile && !areButtonsCompact ? 'hidden sm:inline sm:ml-2' : 'hidden'}>
                            {(() => {
                              if (!effectiveGroupTypesEnabledForUI) {
                                return 'Unassign'; // Simple behavior when group types are disabled
                              }

                              const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;
                              if (selectedGroupId && selectedGroup?.groupType === 'MultiSelect') {
                                return 'Remove'; // Remove from specific MultiSelect group with minus sign
                              } else {
                                return 'Unassign'; // Unassign from all SingleSelect groups
                              }
                            })()}
                          </span>
                        </ClientOnly>
                      </Button>
                    </TooltipTrigger>
                    {isUnmanagedGroup && (
                      <TooltipContent>
                        <p>Self-service is restricted for hosts in unmanaged groups</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>

                {/* Assign Button - Move this back to the right position */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        onClick={async () => {
                          if (!selectedGroupId) return;

                          try {
                            await handleSmartAssign(selectedGroupId);
                          } catch (error) {
                            logger.error("Error assigning IP:", error);
                            toast({
                              variant: "destructive",
                              title: "Error",
                              description: "Failed to assign IP to group.",
                            });
                          }
                        }}
                        disabled={
                          !selectedGroupId ||
                          isAssigningIp ||
                          isUnassigningDetected ||
                          // Disable if already in the selected group
                          (selectedGroupId !== null && userIpMemberOfGroups.some(group => group.id === selectedGroupId)) ||
                          (() => {
                            if (!effectiveGroupTypesEnabledForUI) {
                              return false; // When disabled, use simple logic
                            }

                            const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;

                            if (selectedGroup?.groupType === 'SingleSelect') {
                              // For SingleSelect: allow assignment even if in other SingleSelect groups (will move)
                              return false;
                            }

                            return false; // MultiSelect groups can always be added to (unless already in that specific group)
                          })() ||
                          (() => {
                            const selectedVpnUuid = selectedGroupId ? groupVpnMap.get(selectedGroupId) : undefined;
                            const selectedVpnInfo = selectedVpnUuid ? vpnConnectionStatuses.get(selectedVpnUuid.trim()) : undefined;
                            return (
                              selectedVpnInfo && (selectedVpnInfo.status === 'disconnected' || selectedVpnInfo.status === 'disabled') &&
                              (selectedVpnInfo.type === 'openvpn' || selectedVpnInfo.type === 'wireguard' || selectedVpnInfo.type === 'ipsec')
                            );
                          })() ||
                          !isSelfServiceAllowed ||
                          !detectedIp ||
                          isHostAliasDisabled ||
                          isDeterminingHostAliasStatus ||
                          isIpNotAllowed ||
                          isUnmanagedGroup
                        }
                        className={`${isMobile || areButtonsCompact ? '' : 'sm:w-auto sm:px-3'} bg-primary hover:bg-primary/90 text-white`}
                        size={isMobile || areButtonsCompact ? 'icon' : 'default'}
                      >
                        <ClientOnly fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
                          {isAssigningIp ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                            (() => {
                              // For MultiSelect add buttons, use plus sign (both compact and full-size)
                              if (effectiveGroupTypesEnabledForUI) {
                                const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;
                                if (selectedGroup?.groupType === 'MultiSelect') {
                                  return <span className="text-lg font-bold leading-none">+</span>; // Plus sign for MultiSelect add
                                }
                              }
                              return <Check className="h-4 w-4" />; // Default icon for SingleSelect or disabled group types
                            })()
                          )}
                        </ClientOnly>
                        <ClientOnly fallback={<span className={!isMobile && !areButtonsCompact ? 'hidden sm:inline sm:ml-2' : 'hidden'}>
                          {(() => {
                            if (!effectiveGroupTypesEnabledForUI) {
                              const inAnyGroup = (userIpMemberOfGroups?.length || 0) > 0;
                              return inAnyGroup ? 'Move' : 'Assign';
                            }
                            const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;
                            if (selectedGroup?.groupType === 'MultiSelect') return 'Add';
                            // SingleSelect: if currently in another SingleSelect group, show Move
                            const inAnySingleSelect = userIpMemberOfGroups.some(g => (groups.find(gg => gg.id === g.id)?.groupType) === 'SingleSelect');
                            return inAnySingleSelect ? 'Move' : 'Assign';
                          })()}
                        </span>}>
                          <span className={!isMobile && !areButtonsCompact ? 'hidden sm:inline sm:ml-2' : 'hidden'}>
                            {(() => {
                              if (selectedGroupId !== null && userIpMemberOfGroups.some(group => group.id === selectedGroupId)) {
                                return 'In Group';
                              }
                              const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId || g.uuid === selectedGroupId) : null;
                              if (!effectiveGroupTypesEnabledForUI) {
                                // When group types are globally enabled but not enabled for Self-Service UI,
                                // show 'Move' only if the user is already assigned to one of the currently displayed groups
                                const inAnyDisplayedGroup = userIpMemberOfGroups.some(g => filteredGroups.some(fg => fg.id === g.id));
                                return inAnyDisplayedGroup ? 'Move' : 'Assign';
                              }
                              if (selectedGroup?.groupType === 'MultiSelect') return 'Add';
                              const inAnySingleSelect = userIpMemberOfGroups.some(g => (groups.find(gg => gg.id === g.id)?.groupType) === 'SingleSelect');
                              return inAnySingleSelect ? 'Move' : 'Assign';
                            })()}
                          </span>
                        </ClientOnly>
                      </Button>
                    </TooltipTrigger>
                    {isUnmanagedGroup && (
                      <TooltipContent>
                        <p>Self-service is restricted for hosts in unmanaged groups</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn(`px-0 sm:px-6 sm:pt-4 py-0 relative flex flex-col flex-1 min-h-0 overflow-hidden`, { 'p-3 py-0': isMobile })}>        {!isFullyLoaded ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[150px] space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {isParentLoading ? 'Loading host information...' :
              isLoadingGroups ? 'Loading network groups...' :
                isLoadingVpnStatuses ? 'Loading VPN statuses...' :
                  isDeterminingHostAliasStatus ? 'Determining host alias status...' :
                    'Loading...'}
          </p>
          <Skeleton className="w-full h-10" />
          <Skeleton className="w-full h-10" />
          <Skeleton className="w-full h-10" />
        </div>
      ) : isHostAliasDisabled ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-muted-foreground text-center px-5">
          <ClientOnly fallback={<Skeleton className={`h-5 w-5 mb-2 rounded-full ${isMobile ? 'h-4 w-4' : ''}`} />}><AlertCircle className={`h-5 w-5 mb-2 ${isMobile ? 'h-4 w-4' : ''}`} /></ClientOnly>
          <p className={`font-medium ${isMobile ? 'text-sm' : 'text-base'}`}>Host Alias Disabled</p>
          <p className={`mt-1 ${isMobile ? 'text-xs' : 'text-sm'}`}>You cannot assign or unassign it to any group.</p>
        </div>
      ) : isIpNotAllowed ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-muted-foreground text-center px-5">
          <ClientOnly fallback={<Skeleton className={`h-5 w-5 mb-2 rounded-full ${isMobile ? 'h-4 w-4' : ''}`} />}><AlertCircle className={`h-5 w-5 mb-2 ${isMobile ? 'h-4 w-4' : ''}`} /></ClientOnly>
          <p className={`font-medium ${isMobile ? 'text-sm' : 'text-base'}`}>Network Access Restricted</p>
          <p className={`mt-1 ${isMobile ? 'text-xs' : 'text-sm'}`}>Your IP address is not in the allowed networks for self-service access.</p>
        </div>
      ) : (!isSelfServiceAllowed || !detectedIp) ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-muted-foreground text-center px-5">
          <ClientOnly fallback={<Skeleton className={`h-5 w-5 mb-2 rounded-full ${isMobile ? 'h-4 w-4' : ''}`} />}><AlertCircle className={`h-5 w-5 mb-2 ${isMobile ? 'h-4 w-4' : ''}`} /></ClientOnly>
          <p className={`font-medium ${isMobile ? 'text-sm' : 'text-base'}`}>
            {isDeviceManagementPage ? 'No Device Selected' : 'Self-Service Not Available'}
          </p>
          <p className={`mt-1 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            {isDeviceManagementPage
              ? 'Please select a device from the dropdown above.'
              : (unmanagedGroupResult && unmanagedGroupResult.isUnmanaged)
                ? 'Your device is associated with network groups that have been disabled by the administrator.'
                : 'Requesting IP Address Not Allowed.'
            }
          </p>
        </div>
      ) : (
        <>
          {/* Search Input for Network Groups */}
          <div className={cn("relative", isMobile ? 'my-2' : 'my-0')}>
            <ClientOnly fallback={<div className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 bg-muted-foreground rounded-full ${isMobile ? 'h-4 w-4 left-2.5' : ''}`} />}><Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground ${isMobile ? 'h-4 w-4 left-2.5' : ''}`} /></ClientOnly>
            <Input
              type="search"
              placeholder="Search groups..."
              className={`w-full ${isMobile ? 'pl-8 pr-10 text-sm h-9' : 'pl-10 pr-10'}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Dialog open={isSearchHelpOpen} onOpenChange={setIsSearchHelpOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground",
                    isMobile ? "h-7 w-7" : "h-8 w-8"
                  )}
                  onClick={() => setIsSearchHelpOpen(true)}
                >
                  <HelpCircle className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Search Help</DialogTitle>
                </DialogHeader>
                <div className="text-sm text-muted-foreground mb-4">
                  Tips and tricks for searching and filtering options.
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Search terms:</h4>
                    <ul className="space-y-1.5 text-sm">
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">Group Name</code>: Search by group name</li>
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">Description</code>: Search by group description</li>
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">Friendly Name</code>: Search by friendly name</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">VPN Type:</h4>
                    <ul className="space-y-1.5 text-sm">
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">openvpn</code>: Groups using OpenVPN</li>
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">wireguard</code>: Groups using WireGuard</li>
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">ipsec</code>: Groups using IPsec</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">VPN Status:</h4>
                    <ul className="space-y-1.5 text-sm">
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">vpn-connected</code>: Groups with connected VPNs</li>
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">vpn-disconnected</code>: Groups with disconnected VPNs</li>
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">restart</code>: Groups with VPNs that need restarting</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Group Type:</h4>
                    <ul className="space-y-1.5 text-sm">
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">single-select</code>: Single Select groups</li>
                      <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">multi-select</code>: Multi Select groups</li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Conditional Rendering Block */}
          {filteredGroups.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-full min-h-[150px] text-muted-foreground text-center px-4 ${isMobile} ? 'pt-0 pb-4' : 'pt-0 pb-4'}`}>
              <ClientOnly fallback={<Skeleton className={`h-5 w-5 mb-2 rounded-full ${isMobile ? 'h-4 w-4' : ''}`} />}><AlertCircle className={`h-5 w-5 mb-2 ${isMobile ? 'h-4 w-4' : ''}`} /></ClientOnly>
              <p className={`font-medium ${isMobile ? 'text-sm' : 'text-base'}`}>No Groups Found</p>
              <p className={`mt-1 ${isMobile ? 'text-xs' : 'text-sm'}`}>{searchTerm ? "No groups match your search or current mappings." : "No network groups configured match current filters and mappings."}</p>
            </div>
          ) : (
            <ScrollArea className={cn("flex-grow min-h-0 p-1", isMobile ? 'mt-1 pt-1 pb-1' : 'mt-4 pt-1 pb-1')}>
              {/* The RadioGroup's value should be the currently *selected* group for the outline */}
              <RadioGroup
                value={selectedGroupId ?? ""}
                onValueChange={(value) => setSelectedGroupId(value || null)}
                className={cn(isMobile ? 'space-y-2 pr-2' : 'space-y-3 pr-2')}
                disabled={Boolean(!isSelfServiceAllowed || !detectedIp || isHostAliasDisabled || isDeterminingHostAliasStatus || isUnmanagedGroup)}
              >
                {filteredGroups.map((group) => {
                  const renderedIcon = getGroupIcon(group);
                  const isCurrentDetectedIpMember = userIpMemberOfGroups.some(memberGroup => memberGroup.id === group.id || memberGroup.uuid === group.uuid || memberGroup.id === group.uuid || memberGroup.uuid === group.id);
                  const vpnUuid = groupVpnMap.get(group.id);
                  const vpnInfo = vpnUuid ? vpnConnectionStatuses.get(vpnUuid.trim()) : undefined;

                  // Check if this group has a down VPN
                  const hasDownVpn = vpnInfo && (vpnInfo.status === 'disconnected' || vpnInfo.status === 'disabled') && (vpnInfo.type === 'wireguard' || vpnInfo.type === 'openvpn' || vpnInfo.type === 'ipsec');



                  // Determine if the group should be functionally disabled for selection
                  // CONSERVATIVE APPROACH: Only disable if we're absolutely certain the user should not interact with this group
                  const isGroupFunctionallyDisabled =
                    !isSelfServiceAllowed ||
                    !detectedIp ||
                    isHostAliasDisabled ||
                    isDeterminingHostAliasStatus ||
                    isUnmanagedGroup ||
                    // Only disable VPN/disabled groups if membership data is loaded AND user is not assigned
                    ((hasDownVpn || !group.enabled) && hasLoadedMembership && !isCurrentDetectedIpMember);

                  // Determine if the group should be visually disabled (obscured)
                  // CONSERVATIVE APPROACH: Only visually disable if we're absolutely certain the user should not interact with this group
                  const isGroupVisuallyDisabled =
                    !isSelfServiceAllowed ||
                    !detectedIp ||
                    isUnmanagedGroup ||
                    // Only visually disable VPN/disabled groups if membership data is loaded AND user is not assigned
                    ((hasDownVpn || !group.enabled) && hasLoadedMembership && !isCurrentDetectedIpMember);

                  return (
                    <Card
                      key={group.id}
                      className={cn(
                        `transition-all hover:shadow-md`,
                        selectedGroupId === group.id ? 'border-primary ring-inset ring-2 ring-primary' : '', // Apply outline based on selectedGroupId
                        isMobile ? 'p-0' : '',
                        isGroupVisuallyDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer' // Use new visual disable variable
                      )}
                      onClick={() => {
                        if (isGroupFunctionallyDisabled) return; // Use functional disable for click prevention
                        // Toggle selection: if already selected, unselect; otherwise select
                        setSelectedGroupId(selectedGroupId === group.id ? null : group.id);
                      }}
                    >
                      <CardHeader className={`flex flex-row items-center justify-between ${isMobile ? 'p-1 space-x-1.5' : 'p-2.5 space-x-2'}`}>
                        <div className="flex items-center flex-grow space-x-2">
                          {/* Custom radio button that shows assignment status */}
                          <div
                            className={cn(
                              "rounded-full border-2 flex items-center justify-center transition-colors",
                              isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4',
                              isCurrentDetectedIpMember
                                ? 'bg-primary border-primary'
                                : isGroupVisuallyDisabled
                                  ? 'bg-background border-muted-foreground/40' // More prominent border for disabled groups
                                  : 'bg-background border-muted-foreground/60 hover:border-primary', // Stronger border for enabled groups
                              isGroupFunctionallyDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                            )}

                          >
                            {/* No inner dot - the full button is filled blue when assigned */}
                          </div>
                          {/* Hidden RadioGroupItem for form compatibility */}
                          <RadioGroupItem
                            value={group.id}
                            id={`radio-${group.id}`}
                            className="sr-only"
                            disabled={isGroupFunctionallyDisabled}
                          />
                          <div className={cn(
                            `cursor-pointer flex-grow`,
                            isGroupVisuallyDisabled ? 'cursor-not-allowed' : '' // Use new visual disable variable
                          )}>
                            <div className="flex items-center">
                              <ClientOnly fallback={<Skeleton className={`mr-1.5 rounded-full ${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />}>
                                {renderedIcon}
                              </ClientOnly>
                              <span className={`font-semibold ${isMobile ? 'text-xs' : 'text-sm'}`}>{group.friendlyName || group.name}</span>
                              {vpnInfo && (
                                <React.Fragment>
                                  <ClientOnly fallback={<Skeleton className="ml-2 h-3 w-14 rounded-full" />}>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Badge
                                            className={cn(
                                              "text-white px-1.5 py-0.5 ml-2 align-middle flex items-center",
                                              isMobile ? "text-[0.7rem]" : "text-xs",
                                              vpnInfo.status === 'connected' ? "bg-darker-green hover:bg-darker-green/80" :
                                                vpnInfo.status === 'disabled' ? "bg-gray-500 hover:bg-gray-600" :
                                                  "bg-darker-red hover:bg-darker-red/80"
                                            )}
                                          >
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
                                  </ClientOnly>
                                  {vpnInfo.status === 'disconnected' && (
                                    (vpnInfo.type === 'openvpn') ||
                                    (vpnInfo.type === 'wireguard' && vpnInfo.enabled === '1') ||
                                    (vpnInfo.type === 'ipsec') // Allow restart for IPsec when disconnected
                                  ) && (
                                      <ClientOnly fallback={<Skeleton className="ml-1.5 h-3 w-16 rounded-full" />}>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="ml-1.5 h-6 w-6 text-primary hover:text-primary/80"
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  if (vpnUuid && vpnInfo) { // Ensure vpnUuid and vpnInfo are defined before calling
                                                    // Convert lowercase type to proper VpnClientType
                                                    const vpnClientType = vpnInfo.type === 'openvpn' ? 'OpenVPN' :
                                                      vpnInfo.type === 'wireguard' ? 'WireGuard' :
                                                        vpnInfo.type === 'ipsec' ? 'IPsec' :
                                                          'OpenVPN' as VpnClientType;
                                                    await handleRestartVpn(vpnUuid.trim(), vpnClientType);
                                                  }
                                                }}
                                                disabled={isRestartingVpn === vpnUuid}
                                                title="Restart VPN Service"
                                              >
                                                {isRestartingVpn === vpnUuid ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <RefreshCw className="h-3 w-3" />
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
                                </React.Fragment>
                              )}
                              {/* Group Type Indicator - positioned on the far right - only show when group types are enabled */}
                              {enableGroupTypes && (isDeviceManagementPage || enableSelfServiceMultiSelect) && (
                                <ClientOnly fallback={<Skeleton className="ml-auto h-5 w-5 rounded-sm" />}>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="ml-auto">
                                          {group.groupType === 'MultiSelect' ? (
                                            // MultiSelect: Default CSS dots or custom Lucide icon
                                            <div className="w-5 h-5 border border-blue-400 rounded-sm bg-blue-50 relative flex items-center justify-center">
                                              {multiSelectIcon === 'DEFAULT' ? (
                                                // Default CSS dots for MultiSelect (blue)
                                                <>
                                                  <div className="absolute top-1 left-1 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                  <div className="absolute top-1 right-1 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                  <div className="absolute bottom-1 left-1 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                  <div className="absolute bottom-1 right-1 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                </>
                                              ) : (
                                                // Custom Lucide icon with enhanced styling
                                                (() => {
                                                  const MultiSelectIconComponent = ((LucideIcons as Record<string, unknown>)[multiSelectIcon] as LucideIcon);
                                                  return MultiSelectIconComponent ? (
                                                    <MultiSelectIconComponent
                                                      size={16}
                                                      className="text-blue-700 drop-shadow-sm"
                                                      strokeWidth={2.5}
                                                    />
                                                  ) : (
                                                    // Fallback to CSS dots if icon doesn't exist
                                                    <>
                                                      <div className="absolute top-1 left-1 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                      <div className="absolute top-1 right-1 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                      <div className="absolute bottom-1 left-1 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                      <div className="absolute bottom-1 right-1 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                    </>
                                                  );
                                                })()
                                              )}
                                            </div>
                                          ) : (
                                            // SingleSelect: Default CSS dot or custom Lucide icon
                                            <div className="w-5 h-5 border border-blue-400 rounded-sm bg-blue-50 relative flex items-center justify-center">
                                              {singleSelectIcon === 'DEFAULT' ? (
                                                // Default CSS dot for SingleSelect (blue to match MultiSelect)
                                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-blue-600 rounded-full"></div>
                                              ) : (
                                                // Custom Lucide icon with enhanced styling
                                                (() => {
                                                  const SingleSelectIconComponent = ((LucideIcons as Record<string, unknown>)[singleSelectIcon] as LucideIcon);
                                                  return SingleSelectIconComponent ? (
                                                    <SingleSelectIconComponent
                                                      size={16}
                                                      className="text-blue-700 drop-shadow-sm"
                                                      strokeWidth={2.5}
                                                    />
                                                  ) : (
                                                    // Fallback to CSS dot if icon doesn't exist (blue)
                                                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-blue-600 rounded-full"></div>
                                                  );
                                                })()
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{group.groupType === 'MultiSelect' ? `${multiSelectName} Assignment` : `${singleSelectName} Assignment`}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </ClientOnly>
                              )}
                            </div>
                            <p className={`text-muted-foreground ${isMobile ? 'text-[11px] ml-[22px]' : 'text-xs ml-[28px]'}`}>{group.description}</p>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </RadioGroup>
            </ScrollArea>
          )}
        </>
      )}
      </CardContent>
    </Card>
  );
});
