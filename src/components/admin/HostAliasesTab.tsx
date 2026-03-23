'use client';

import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import type { OpnsenseAliasDetailFromExport, NetworkGroup, VpnMapping } from '@/types/opnsense';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SortableTable } from "@/components/ui/sortable-table";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ClientOnly } from '@/components/util/ClientOnly';
import { logger } from '@/lib/logger';
import { checkMacRandomization } from '@/lib/mac-utils';
import { Loader2, AlertCircle, Edit, Trash2, PlusCircle, Laptop, XCircle, CheckCircle, AlertTriangle, RefreshCcw, Info, ScanSearch } from 'lucide-react';
import { useIsMobile, useIsPhone } from '@/hooks/use-mobile';

import { sortIpAddresses, isValidIpAddress } from '@/lib/network-utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { StatusDotWithTooltip, getHostAliasStatusColor } from '@/components/ui/status-dot';

import type { OpnsenseGroupDisplay } from '@/types/settings';

import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flags, generalEmojis } from '@/components/ui/icon-picker';
import { useGroupType } from '@/context/GroupTypeContext';
import { hasAnyGroupError, getGroupErrorType, getGroupErrorMessage } from '@/utils/groupErrorDetection';

import { AddHostAliasDialog } from './host-alias-manager/AddHostAliasDialog';
import { EditHostAliasDialog } from './host-alias-manager/EditHostAliasDialog';
import { DeleteHostAliasDialog } from './host-alias-manager/DeleteHostAliasDialog';
import { DuplicateAliasesModal } from './host-alias-manager/DuplicateAliasesModal';
import type { HostAliasFormState, DuplicateResult } from './host-alias-manager/types';
import { Input } from '@/components/ui/input';

import { PaginationControls } from '@/components/ui/pagination-controls';

// Extend OpnsenseAliasDetailFromExport to include detectedMac and detectedVendor
interface EnrichedHostAlias {
  uuid: string;
  name: string;
  type: string;
  content: string;
  description?: string;
  detectedMac?: string | null;
  detectedVendor?: string | null;
  isDhcpReserved?: boolean;
  dhcpReservedMac?: string | null;
  dhcpReservedVendor?: string | null;
  memberOfGroups?: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[];
  enabled?: string | null;
  hasIpConflict?: boolean;
  hasMacConflict?: boolean;
  hasHiddenGroupMemberships?: boolean;
  vpnUuid?: string | null;
  vpnType?: string | null;
  vpnStatus?: 'connected' | 'disconnected' | 'disabled' | null; // Updated to include 'disabled'
  vpnEnabled?: string | null;
  vpnName?: string | null;
  allVpns?: Array<{
    uuid: string;
    name: string;
    status: string | null;
    type: string | null;
    enabled: string | null;
  }>; // All VPNs from all assigned groups
  friendlyName?: string | null;
}

interface HostAliasesTabProps {
  vpnConnectionStatuses: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>; // Updated to include 'disabled'
  groupVpnMap: Map<string, string>;
  vpnMappings: VpnMapping[];
  opnsenseGroupDisplays: OpnsenseGroupDisplay[];
  hostAliases: EnrichedHostAlias[]; // Host aliases data from parent
  isLoadingInitialData: boolean; // Loading state from parent (like NetworkGroupsTab)
  isRefreshing: boolean; // In-place refresh spinner
  hostAliasesError: string | null; // Error state from parent
  onRefreshHostAliases: () => Promise<void>; // Refresh function from parent
  onVpnStatusRefresh?: () => Promise<void>; // Add VPN status refresh function
  // onConnectionError?: (show: boolean) => void; // Add connection error handler
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
  allEmojiValues?: string[]; // Add custom emoji values
  allFlagValues?: string[]; // Add custom flag values
}

export function HostAliasesTab({
  vpnConnectionStatuses,
  groupVpnMap,
  vpnMappings,
  opnsenseGroupDisplays,
  hostAliases,
  isLoadingInitialData,
  isRefreshing,
  hostAliasesError,
  onRefreshHostAliases,
  onVpnStatusRefresh,
  sortBy,
  sortDirection,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchTermChange,
  allEmojiValues = [],
  allFlagValues = [],
}: HostAliasesTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const { enableGroupTypes, singleSelectName, multiSelectName } = useGroupType();
  // Initialize state with the initial data from props (like NetworkGroupsTab)
  const [, setAllHostAliases] = useState<EnrichedHostAlias[]>(hostAliases);
  const latestAllHostAliases = useRef(hostAliases); // Ref to hold the latest allHostAliases
  const [rawOpnsenseAliases, setRawOpnsenseAliases] = useState<OpnsenseAliasDetailFromExport[]>([]); // New state for raw aliases
  const latestRawOpnsenseAliases = useRef(rawOpnsenseAliases); // Ref to hold the latest raw aliases
  const [displayableHostAliases, setDisplayableHostAliases] = useState<EnrichedHostAlias[]>(hostAliases);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(hostAliases.length > 0); // Track if initial data has been loaded
  const latestVpnConnectionStatuses = useRef(vpnConnectionStatuses);
  const latestGroupVpnMap = useRef(groupVpnMap);
  const latestVpnMappings = useRef(vpnMappings);
  const latestOpnsenseGroupDisplays = useRef(opnsenseGroupDisplays);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);
  const [newAliasForm, setNewAliasForm] = useState<HostAliasFormState>({
    name: '',
    content: '',
    description: '',
    enabled: true,
  });
  const [restartingVpnUuid, setRestartingVpnUuid] = useState<string | null>(null);
  const [isBulkVpnRestarting, setIsBulkVpnRestarting] = useState<boolean>(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<DuplicateResult[]>([]);

  // State for sorting
  // const [sortBy, setSortBy] = useState<string | undefined>("name"); // Default sort by name
  // const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc"); // Default sort ascending

  // const handleSortChange = useCallback((newSortBy: string, newSortDirection: "asc" | "desc") => {
  //   setSortBy(newSortBy);
  //   setSortDirection(newSortDirection);
  // }, []);

  const memoizedAllGeneralEmojiValues = useMemo(() => new Set([...generalEmojis.map(e => e.value.normalize('NFC')), ...allEmojiValues.map(e => e.normalize('NFC'))]), [allEmojiValues]);
  const memoizedAllFlagValues = useMemo(() => new Set([...flags.map(f => f.value.normalize('NFC')), ...allFlagValues.map(f => f.normalize('NFC'))]), [allFlagValues]);

  // Update refs directly - no need for useEffect since refs don't trigger re-renders
  latestVpnConnectionStatuses.current = vpnConnectionStatuses;
  latestGroupVpnMap.current = groupVpnMap;
  latestVpnMappings.current = vpnMappings;
  latestOpnsenseGroupDisplays.current = opnsenseGroupDisplays;

  // Use parent loading and error states directly instead of local state to prevent re-renders
  // Remove local state updates that cause unnecessary re-renders

  // Track when initial data has been loaded - make this stable and not reactive to VPN changes
  useEffect(() => {
    // Only mark as loaded when we have host aliases and are not in initial loading state
    // Don't make this dependent on VPN data sizes to prevent background VPN updates from triggering refreshes
    const hasHostAliases = hostAliases.length > 0;

    if (!isLoadingInitialData && hasHostAliases && !hasInitialDataLoaded) {
      setHasInitialDataLoaded(true);
    }
  }, [isLoadingInitialData, hostAliases.length, hasInitialDataLoaded]);

  // Update local state when hostAliases prop changes - same pattern as NetworkGroupsTab
  useEffect(() => {
    setAllHostAliases(hostAliases);
    latestAllHostAliases.current = hostAliases;
    setDisplayableHostAliases(hostAliases);
  }, [hostAliases]);

  const getGroupIcon = useCallback((group: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null }): React.ReactNode => {
    const mappedIconIdentifier = group.iconIdentifier;

    if (mappedIconIdentifier) {
      const normalizedIconIdentifier = mappedIconIdentifier.normalize('NFC');
      const isEmoji = memoizedAllGeneralEmojiValues.has(normalizedIconIdentifier);
      const isFlag = memoizedAllFlagValues.has(normalizedIconIdentifier);

      if (isEmoji || isFlag) {
        return <span className="text-xl leading-none mr-1.5">{mappedIconIdentifier}</span>;
      }

      const IconComponent = LucideIcons[mappedIconIdentifier as keyof typeof LucideIcons] as LucideIcon;
      if (IconComponent) {
        return <IconComponent size={12} className="mr-1" />;
      }
    }
    return null;
  }, [memoizedAllGeneralEmojiValues, memoizedAllFlagValues]);

  const handleVpnRestart = useCallback(async (vpnUuid: string, vpnType: string) => {
    logger.debug('VPN Restart called with:', { vpnUuid, vpnType });
    setRestartingVpnUuid(vpnUuid);
    try {
      // Convert lowercase type to proper VpnClientType
      const vpnClientType = vpnType === 'openvpn' ? 'OpenVPN' :
        vpnType === 'wireguard' ? 'WireGuard' :
          vpnType === 'ipsec' ? 'IPsec' :
            'OpenVPN';

      logger.debug('Converted VPN type:', vpnClientType);

      // Always use safe-restart endpoint for all users
      const response = await fetch('/api/vpn/safe-restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vpnUuid, vpnType: vpnClientType }),
      });

      logger.debug('VPN restart response status:', response.status);
      const result = await response.json();
      logger.debug('VPN restart response:', result);

      // Check if the response is OK and the message indicates successful initiation
      if (response.ok && result.message === 'VPN restart initiated successfully') {
        toast({ title: "VPN restart initiated successfully", variant: "success" });

        // Wait for the restart process to complete (10 seconds)
        setTimeout(async () => {
          try {
            // Trigger in-place refresh when restart spinner stops (same as NetworkGroupsTab)
            // Refresh VPN data first, then host aliases - both should be in-place refreshes
            if (onVpnStatusRefresh) {
              await onVpnStatusRefresh();
            }
            if (onRefreshHostAliases) {
              await onRefreshHostAliases();
            }
          } finally {
            setRestartingVpnUuid(null); // Reset the state after refresh completes
          }
        }, 10000); // Wait 10 seconds for restart to complete
      } else {
        toast({ variant: "destructive", title: "VPN Restart Failed", description: result.message || "Could not restart VPN." });
        setRestartingVpnUuid(null);
      }
    } catch (err) {
      logger.error("Error restarting VPN:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ variant: "destructive", title: "VPN Restart Error", description: errorMessage });
      setRestartingVpnUuid(null);
    }
  }, [toast, onVpnStatusRefresh, onRefreshHostAliases]);

  // Restart only disconnected VPNs from a list, sequentially
  const handleBulkVpnRestart = useCallback(async (vpns: { uuid: string; type: string | null; status: string | null; enabled?: string | null }[]) => {
    try {
      const toRestart = vpns.filter(v => v.status === 'disconnected' && v.type);
      if (toRestart.length === 0) return;
      setIsBulkVpnRestarting(true);
      for (const v of toRestart) {
        await handleVpnRestart(v.uuid, (v.type as string));
        // small delay between restarts to avoid hammering
        await new Promise(res => setTimeout(res, 300));
      }
    } finally {
      setIsBulkVpnRestarting(false);
    }
  }, [handleVpnRestart]);

  const handleCheckDuplicates = useCallback(() => {
    const ipMap = new Map<string, typeof hostAliases>();
    const nameMap = new Map<string, typeof hostAliases>();

    for (const alias of hostAliases) {
      const nameLower = alias.name.toLowerCase();
      if (!nameMap.has(nameLower)) nameMap.set(nameLower, []);
      nameMap.get(nameLower)!.push(alias);

      const ips = alias.content.split('\n').map(ip => ip.trim()).filter(Boolean);
      for (const ip of ips) {
        if (!ipMap.has(ip)) ipMap.set(ip, []);
        ipMap.get(ip)!.push(alias);
      }
    }

    const toEntry = (a: EnrichedHostAlias) => ({
      uuid: a.uuid,
      name: a.name,
      content: a.content,
      description: a.description,
      enabled: a.enabled,
      memberOfGroups: (a.memberOfGroups ?? []).map(g => ({ uuid: g.uuid, name: g.name, friendlyName: g.friendlyName })),
      hasHiddenGroups: a.hasHiddenGroupMemberships ?? false,
    });

    const results: DuplicateResult[] = [];

    for (const [nameLower, aliases] of nameMap) {
      if (aliases.length > 1) {
        results.push({ type: 'name', value: nameLower, aliases: aliases.map(toEntry) });
      }
    }

    for (const [ip, aliases] of ipMap) {
      if (aliases.length > 1) {
        results.push({ type: 'ip', value: ip, aliases: aliases.map(toEntry) });
      }
    }

    setDuplicateResults(results);
    setIsDuplicateModalOpen(true);
  }, [hostAliases]);

  const handleRemoveAlias = useCallback(async (
    uuid: string,
    name: string,
    memberOfGroups: { uuid: string; name: string }[],
    deleteAfterUnassign: boolean,
  ) => {
    // Step 1: unassign from all managed groups
    if (memberOfGroups.length > 0) {
      const unassignResponse = await fetch('/api/opnsense/host-group-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'batch',
          operationType: 'unassign',
          hostAliases: [{ hostAliasName: name }],
          groups: memberOfGroups.map(g => ({ groupId: g.uuid })),
        }),
      });
      if (!unassignResponse.ok) {
        const err = await unassignResponse.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to unassign alias from groups');
      }
    }

    // Step 2: only delete if the alias has no hidden group memberships outside InstradaOGM's control
    if (deleteAfterUnassign) {
      const deleteResponse = await fetch(`/api/opnsense/host-alias-management?uuid=${uuid}`, {
        method: 'DELETE',
      });
      const deleteResult = await deleteResponse.json().catch(() => ({}));
      if (!deleteResponse.ok || !deleteResult.success) {
        throw new Error(deleteResult.message || 'Failed to delete alias');
      }

      // Remove from local state only when deleted
      const updated = latestAllHostAliases.current.filter(a => a.uuid !== uuid);
      latestAllHostAliases.current = updated;
      setAllHostAliases(updated);
      setDisplayableHostAliases(updated);
    } else {
      // Alias was only unassigned — it still exists in OPNsense (assigned to unmanaged groups)
      // Refresh the alias list so the UI reflects the new state
      await onRefreshHostAliases();
    }
  }, [onRefreshHostAliases]);

  // Memoize columns definition to prevent unnecessary re-renders of SortableTable
  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (alias: EnrichedHostAlias) => (
        <div className="flex items-center gap-2">
          <StatusDotWithTooltip
            color={getHostAliasStatusColor(
              alias.enabled === '1', // isEnabled
              !!alias.detectedMac // hasArpEntry
            )}
            tooltip={alias.enabled === '1' ? (alias.detectedMac ? 'Online' : 'Offline') : 'Disabled'}
            size="sm"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={alias.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>{alias.name}</span>
              </TooltipTrigger>
              {alias.description && (
                <TooltipContent>
                  <p>{alias.description}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      key: 'content',
      label: 'Content',
      sortable: true,
      render: (alias: EnrichedHostAlias) => <span className={alias.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>{alias.content}</span>,
      compareFn: (a: EnrichedHostAlias, b: EnrichedHostAlias) => sortIpAddresses(a.content, b.content),
    },
    {
      key: 'group_membership',
      label: 'Group',
      sortable: true,
      render: (alias: EnrichedHostAlias) => (
        <div className={alias.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>
          {alias.memberOfGroups && (alias.memberOfGroups ?? []).length > 0 ? (
            alias.enabled !== '1' ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center text-xs bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700 cursor-not-allowed px-1.5 py-0.5 rounded-md">
                      {enableGroupTypes && (alias.memberOfGroups ?? []).length > 1 ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center">
                                {(alias.memberOfGroups ?? []).length} Groups
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1">
                                {(alias.memberOfGroups ?? []).map((group) => (
                                  <div key={group.uuid} className="flex items-center gap-2">
                                    <ClientOnly>
                                      {group.iconIdentifier ? getGroupIcon(group) : null}
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
                      ) : !enableGroupTypes && (alias.memberOfGroups ?? []).length > 1 ? (
                        // When group types are disabled, show "X Groups" with tooltip
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {(alias.memberOfGroups ?? []).length} Groups
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div>
                                <p className="text-orange-400 font-semibold">Multi Group Error</p>
                                <p className="text-sm mt-1">Member of:</p>
                                {(alias.memberOfGroups ?? []).map((group) => (
                                  <div key={group.uuid} className="flex items-center gap-2">
                                    <ClientOnly>
                                      {group.iconIdentifier ? getGroupIcon(group) : null}
                                    </ClientOnly>
                                    <span className="text-sm">
                                      {group.friendlyName || group.name}
                                    </span>
                                  </div>
                                ))}
                                <div className="border-t pt-2 mt-2">
                                  <p className="text-xs text-gray-400">
                                    To resolve: Use the group assignment controls to assign to a single group.
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
                              <span className="flex items-center">
                                <ClientOnly>
                                  {(alias.memberOfGroups ?? [])[0]?.iconIdentifier ? getGroupIcon((alias.memberOfGroups ?? [])[0]) : null}
                                </ClientOnly>
                                {(alias.memberOfGroups ?? [])[0]?.friendlyName || (alias.memberOfGroups ?? [])[0]?.name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <ClientOnly>
                                    {(alias.memberOfGroups ?? [])[0]?.iconIdentifier ? getGroupIcon((alias.memberOfGroups ?? [])[0]) : null}
                                  </ClientOnly>
                                  <span>
                                    {(alias.memberOfGroups ?? [])[0]?.friendlyName || (alias.memberOfGroups ?? [])[0]?.name}
                                    {enableGroupTypes && ((alias.memberOfGroups ?? [])[0] as { groupType?: 'SingleSelect' | 'MultiSelect' })?.groupType ? ` (${(((alias.memberOfGroups ?? [])[0] as { groupType?: 'SingleSelect' | 'MultiSelect' })?.groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
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
            ) : (
              <span className={`flex items-center text-xs px-1.5 py-0.5 rounded-md ${hasAnyGroupError(alias.memberOfGroups ?? [], enableGroupTypes)
                ? 'bg-orange-100 text-orange-800 border border-orange-700'
                : 'bg-green-100 text-green-800 border border-green-700'
                }`}>
                {hasAnyGroupError(alias.memberOfGroups ?? [], enableGroupTypes) ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center">
                          {(alias.memberOfGroups ?? []).length} Groups
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div>
                          <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(alias.memberOfGroups ?? [], enableGroupTypes))}</p>
                          <p className="text-sm mt-1">Member of:</p>
                          {(alias.memberOfGroups ?? []).map((group) => (
                            <div key={group.uuid} className="flex items-center gap-2">
                              <ClientOnly>
                                {group.iconIdentifier ? getGroupIcon(group) : null}
                              </ClientOnly>
                              <span className="text-sm">
                                {group.friendlyName || group.name}
                                {enableGroupTypes && (group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? ` (${((group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                              </span>
                            </div>
                          ))}
                          <div className="border-t pt-2 mt-2">
                            <p className="text-xs text-gray-400">
                              To resolve: Assign this device to a single group.
                            </p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : enableGroupTypes && (alias.memberOfGroups ?? []).length > 1 ? (
                  // When group types are enabled and multiple groups but no error, show normal tooltip
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center">
                          {(alias.memberOfGroups ?? []).length} Groups
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1">
                          {(alias.memberOfGroups ?? []).map((group) => (
                            <div key={group.uuid} className="flex items-center gap-2">
                              <ClientOnly>
                                {group.iconIdentifier ? getGroupIcon(group) : null}
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
                        <span className="flex items-center">
                          <ClientOnly>
                            {(alias.memberOfGroups ?? [])[0]?.iconIdentifier ? getGroupIcon((alias.memberOfGroups ?? [])[0]) : null}
                          </ClientOnly>
                          {(alias.memberOfGroups ?? [])[0]?.friendlyName || (alias.memberOfGroups ?? [])[0]?.name}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <ClientOnly>
                              {(alias.memberOfGroups ?? [])[0]?.iconIdentifier ? getGroupIcon((alias.memberOfGroups ?? [])[0]) : null}
                            </ClientOnly>
                            <span>
                              {(alias.memberOfGroups ?? [])[0]?.friendlyName || (alias.memberOfGroups ?? [])[0]?.name}
                              {enableGroupTypes && ((alias.memberOfGroups ?? [])[0] as { groupType?: 'SingleSelect' | 'MultiSelect' })?.groupType ? ` (${(((alias.memberOfGroups ?? [])[0] as { groupType?: 'SingleSelect' | 'MultiSelect' })?.groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                            </span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </span>
            )
          ) : (
            '-'
          )}
        </div>
      ),
      compareFn: (a: EnrichedHostAlias, b: EnrichedHostAlias) => {
        const groupNamesA = (a.memberOfGroups ?? []).map(g => g.friendlyName || g.name).join(', ');
        const groupNamesB = (b.memberOfGroups ?? []).map(g => g.friendlyName || g.name).join(', ');
        return groupNamesA.localeCompare(groupNamesB);
      },
    },
    {
      key: 'vpn_status',
      label: 'VPN',
      sortable: true,
      render: (alias: EnrichedHostAlias) => {
        const allVpns = alias.allVpns || [];

        if (allVpns.length === 0) {
          return <span className="text-muted-foreground">-</span>;
        }

        if (allVpns.length === 1) {
          // Single VPN - use existing logic
          const vpn = allVpns[0];
          return (
            <div className={alias.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>
              {vpn.status === 'connected' ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center text-darker-green">
                        <LucideIcons.ShieldCheck className="h-4 w-4 mr-1" />
                        {vpn.name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{vpn.type === 'openvpn' ? 'OpenVPN' :
                        vpn.type === 'wireguard' ? 'WireGuard' :
                          vpn.type === 'ipsec' ? 'IPsec' :
                            vpn.type} VPN Connected ({vpn.name})</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : vpn.status === 'disconnected' ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleVpnRestart(vpn.uuid, vpn.type!)}
                        disabled={restartingVpnUuid === vpn.uuid || (vpn.type === 'WireGuard' && vpn.enabled === '0')}
                        className={cn(
                          "p-0 m-0 bg-transparent hover:bg-transparent flex items-center",
                          (vpn.type === 'WireGuard' && vpn.enabled === '0') ? "text-gray-400" : "text-red-500"
                        )}
                      >
                        {restartingVpnUuid === vpn.uuid ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <LucideIcons.ShieldX className="h-4 w-4 mr-1" />
                        )}
                        {vpn.name}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{vpn.type === 'openvpn' ? 'OpenVPN' :
                        vpn.type === 'wireguard' ? 'WireGuard' :
                          vpn.type === 'ipsec' ? 'IPsec' :
                            vpn.type} VPN Disconnected ({vpn.name})</p>
                      {vpn.type === 'wireguard' && vpn.enabled === '0' ? (
                        <p>WireGuard is disabled and cannot be restarted.</p>
                      ) : (
                        <p>Click to restart VPN</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : vpn.status === 'disabled' ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center text-gray-500">
                        <LucideIcons.ShieldX className="h-4 w-4 mr-1" />
                        {vpn.name} (Disabled)
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{vpn.type} VPN is Disabled</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : vpn.name ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground">
                        {vpn.name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{vpn.type ? `${vpn.type} VPN Status Unknown` : 'VPN Status Unknown'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          );
        }

        // Multiple VPNs - show count with status-based color
        const connectedCount = allVpns.filter(vpn => vpn.status === 'connected').length;
        const disconnectedCount = allVpns.filter(vpn => vpn.status === 'disconnected').length;
        const disabledCount = allVpns.filter(vpn => vpn.status === 'disabled').length;
        const unknownCount = allVpns.length - connectedCount - disconnectedCount - disabledCount;

        // Determine overall status color
        let statusColor = 'text-darker-green'; // All connected
        let StatusIcon = LucideIcons.ShieldCheck;

        if (connectedCount === 0) {
          // No connections - red
          statusColor = 'text-red-500';
          StatusIcon = LucideIcons.ShieldX;
        } else if (disconnectedCount > 0 || unknownCount > 0) {
          // Some disconnected/unknown - orange
          statusColor = 'text-orange-500';
          StatusIcon = LucideIcons.ShieldAlert;
        }

        return (
          <div className={alias.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`flex items-center ${statusColor} p-0 m-0 bg-transparent hover:bg-transparent`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBulkVpnRestart(allVpns as { uuid: string; type: string | null; status: string | null; enabled?: string | null }[]);
                    }}
                    disabled={isBulkVpnRestarting}
                    title={isBulkVpnRestarting ? 'Restarting VPNs...' : 'Restart disconnected VPNs'}
                  >
                    {isBulkVpnRestarting ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <StatusIcon className="h-4 w-4 mr-1" />
                    )}
                    {`${allVpns.length} VPN${allVpns.length > 1 ? 's' : ''}`}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-medium">VPN Status Summary:</p>
                    {connectedCount > 0 && <p className="text-green-600">✓ {connectedCount} Connected</p>}
                    {disconnectedCount > 0 && <p className="text-red-600">✗ {disconnectedCount} Disconnected</p>}
                    {disabledCount > 0 && <p className="text-gray-600">⊘ {disabledCount} Disabled</p>}
                    {unknownCount > 0 && <p className="text-yellow-600">? {unknownCount} Unknown</p>}
                    <div className="border-t pt-1 mt-2">
                      <p className="font-medium">VPNs:</p>
                      {allVpns.map((vpn, index) => (
                        <p key={index} className="text-sm">
                          {vpn.name} ({vpn.type}) - {vpn.status || 'Unknown'}
                        </p>
                      ))}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
      compareFn: (a: EnrichedHostAlias, b: EnrichedHostAlias) => {
        const nameA = a.vpnName || '';
        const nameB = b.vpnName || '';
        return nameA.localeCompare(nameB);
      },
    },
    {
      key: 'mac_address',
      label: 'MAC Address',
      sortable: true,
      render: (alias: EnrichedHostAlias) => (
        <div className={alias.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>
          {alias.detectedMac && alias.detectedMac.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="default" className={cn(
                    "h-4 w-auto px-1 text-xs",
                    checkMacRandomization(alias.detectedMac).isRandomized
                      ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                      : "bg-primary hover:bg-primary/90 text-white"
                  )}>
                    {alias.detectedMac}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    {checkMacRandomization(alias.detectedMac).isRandomized && (
                      <p>Privacy Mac Address</p>
                    )}
                    {alias.detectedVendor && (
                      <p>Vendor: {alias.detectedVendor}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ),
      compareFn: (a: EnrichedHostAlias, b: EnrichedHostAlias) => {
        const macA = a.detectedMac || '';
        const macB = b.detectedMac || '';
        return macA.localeCompare(macB);
      },
    },
    {
      key: 'dhcp_reserved',
      label: 'DHCP',
      sortable: true,
      headerClassName: "text-center",
      render: (alias: EnrichedHostAlias) => (
        <div className={`flex justify-center ${alias.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}`}>
          {alias.isDhcpReserved !== undefined ? (
            alias.hasMacConflict ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-5 w-5 text-yellow-500 animate-pulse" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>DHCP reservation exists, but MAC address conflicts with detected MAC.</p>
                    <p>Reserved MAC: {alias.dhcpReservedMac}</p>
                    <p>Detected MAC: {alias.detectedMac}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              alias.isDhcpReserved ? (
                (() => {
                  const isPrivacyMac = alias.dhcpReservedMac && checkMacRandomization(alias.dhcpReservedMac).isRandomized;
                  return isPrivacyMac ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertCircle className="h-5 w-5 text-yellow-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          DHCP (Privacy MAC)
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <CheckCircle className="h-5 w-5 text-darker-green" />
                  );
                })()
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )
            )
          ) : (
            '-'
          )}
        </div>
      ),
      compareFn: (a: EnrichedHostAlias, b: EnrichedHostAlias) => {
        if (a.hasMacConflict && !b.hasMacConflict) return -1;
        if (!a.hasMacConflict && b.hasMacConflict) return 1;
        if (a.isDhcpReserved && !b.isDhcpReserved) return -1;
        if (!a.isDhcpReserved && b.isDhcpReserved) return 1;
        return 0;
      },
    },
    {
      key: 'enabled',
      label: 'Enabled',
      sortable: true,
      headerClassName: "text-center",
      render: (alias: EnrichedHostAlias) => (
        <div className="flex justify-center">
          <span className={alias.enabled !== '1' ? 'opacity-50 text-muted-foreground' : ''}>{alias.enabled === '1' ? 'Yes' : 'No'}</span>
        </div>
      ),
      compareFn: (a: EnrichedHostAlias, b: EnrichedHostAlias) => {
        const valA = a.enabled === '1' ? 1 : 0;
        const valB = b.enabled === '1' ? 1 : 0;
        return valA - valB;
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (alias: EnrichedHostAlias) => (
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={() => handleEdit(alias)} disabled={isProcessingAction}>
            <Edit className="h-3 w-3 mr-1" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => handleDelete(alias)} disabled={isProcessingAction}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      ),
    },
  ], [isProcessingAction, getGroupIcon, restartingVpnUuid, handleVpnRestart, enableGroupTypes, handleBulkVpnRestart, isBulkVpnRestarting, singleSelectName, multiSelectName]);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAlias, setEditingAlias] = useState<OpnsenseAliasDetailFromExport | null>(null);
  const [editAliasForm, setEditAliasForm] = useState<HostAliasFormState>({
    name: '',
    content: '',
    description: '',
    enabled: true,
  });
  const [originalEditAliasForm, setOriginalEditAliasForm] = useState<HostAliasFormState>({
    name: '',
    content: '',
    description: '',
    enabled: true,
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [aliasToDelete, setAliasToDelete] = useState<OpnsenseAliasDetailFromExport | null>(null);
  // searchTerm is now managed by parent component and passed as prop
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);

  // Pagination state
  // const [currentPage, setCurrentPage] = useState(1);
  // const [pageSize, setPageSize] = useState<number | 'ALL'>(5); // Default to 5 entries

  // Enhanced search function with keyword support
  const matchesSearchTerm = useCallback((alias: EnrichedHostAlias, term: string): boolean => {
    const lowerTerm = term.toLowerCase();

    // Handle special keywords
    switch (lowerTerm) {
      case 'openvpn':
        return alias.vpnType?.toLowerCase() === 'openvpn';

      case 'wireguard':
        return alias.vpnType?.toLowerCase() === 'wireguard';

      case 'ipsec':
        return alias.vpnType?.toLowerCase() === 'ipsec';

      case 'vpn':
        // Return any host alias that has a VPN connection (any VPN type)
        return Boolean(alias.vpnStatus);

      case 'ingroup':
        // Return any host alias that is a member of any network group
        return Boolean(alias.memberOfGroups && alias.memberOfGroups.length > 0);

      case 'dhcp':
        // Return any host alias that has DHCP reservation
        return Boolean(alias.isDhcpReserved);

      case 'arp':
        // Return any host alias that has a detected MAC address
        return Boolean(alias.detectedMac && alias.detectedMac.length > 0);

      case 'disabled':
        // Return any host alias that is disabled
        return alias.enabled !== '1';

      case 'dhcp-conflict':
        // Return any host alias that has DHCP MAC conflicts (orange DHCP badges)
        return Boolean(alias.hasMacConflict);

      case 'dhcp-privacy-mac':
        // Return any host alias that has DHCP reservation with privacy MAC (yellow DHCP badges)
        return Boolean(alias.isDhcpReserved && alias.dhcpReservedMac &&
          checkMacRandomization(alias.dhcpReservedMac).isRandomized);

      case 'vpn-disconnected':
        // Return any host alias with disconnected VPNs (red VPN badges, or orange for mixed states)
        if (!alias.allVpns || alias.allVpns.length === 0) return false;
        return alias.allVpns.some(vpn => vpn.status === 'disconnected');

      case 'vpn-connected':
        // Return any host alias with connected VPNs (green VPN badges)
        if (!alias.allVpns || alias.allVpns.length === 0) return false;
        return alias.allVpns.some(vpn => vpn.status === 'connected');

      case 'online':
        // Return any host alias that has an ARP entry (detected MAC address)
        return Boolean(alias.detectedMac && alias.detectedMac.length > 0);

      case 'offline':
        // Return any host alias that does NOT have an ARP entry (no detected MAC address)
        return !alias.detectedMac || alias.detectedMac.length === 0;

      case 'single-select':
      case 'singleselect':
        // Return any host alias that is a member of SingleSelect groups
        return Boolean(alias.memberOfGroups && alias.memberOfGroups.some(group =>
          group.groupType === 'SingleSelect'
        ));

      case 'multi-select':
      case 'multiselect':
        // Return any host alias that is a member of MultiSelect groups
        return Boolean(alias.memberOfGroups && alias.memberOfGroups.some(group =>
          group.groupType === 'MultiSelect'
        ));

      case 'ingroup-error':
      case 'ingroup-errors':
        // Return any host alias that has group assignment errors (multi-group when disabled, or multiple single-select when enabled)
        return Boolean(alias.memberOfGroups && hasAnyGroupError(alias.memberOfGroups, enableGroupTypes));

      default:
        // Regular text search
        return Boolean(
          alias.name.toLowerCase().includes(lowerTerm) ||
          (alias.description && alias.description.toLowerCase().includes(lowerTerm)) ||
          (alias.content && alias.content.toLowerCase().includes(lowerTerm)) ||
          (alias.detectedVendor && alias.detectedVendor.toLowerCase().includes(lowerTerm)) ||
          (alias.detectedMac && alias.detectedMac.toLowerCase().includes(lowerTerm)) ||
          (alias.isDhcpReserved !== undefined && (alias.isDhcpReserved ? 'yes' : 'no').includes(lowerTerm)) ||
          (alias.hasMacConflict !== undefined && (alias.hasMacConflict ? 'conflict' : 'no conflict').includes(lowerTerm)) ||
          (alias.memberOfGroups && alias.memberOfGroups.some(group =>
            group.name.toLowerCase().includes(lowerTerm) ||
            Boolean(group.friendlyName && group.friendlyName.toLowerCase().includes(lowerTerm))
          )) ||
          (alias.vpnStatus && alias.vpnStatus.toLowerCase().includes(lowerTerm)) ||
          (alias.vpnName && alias.vpnName.toLowerCase().includes(lowerTerm)) ||
          (alias.vpnType && alias.vpnType.toLowerCase().includes(lowerTerm)) ||
          (lowerTerm === 'privacy' && ((alias.detectedMac && checkMacRandomization(alias.detectedMac).isRandomized) || (alias.isDhcpReserved && alias.dhcpReservedMac && checkMacRandomization(alias.dhcpReservedMac).isRandomized)))
        );
    }
  }, [enableGroupTypes]);

  // Memoize filtered data to prevent unnecessary re-renders and sort resets
  const filteredHostAliases = useMemo(() => {
    return displayableHostAliases.filter(alias =>
      searchTerm === "" || matchesSearchTerm(alias, searchTerm)
    );
  }, [displayableHostAliases, searchTerm, matchesSearchTerm]);

  // Pagination logic
  const totalItems = filteredHostAliases.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize);

  // Reset to first page when search term changes or when current page is greater than total pages
  // Use useRef to track previous values to avoid unnecessary resets on component remount
  const prevSearchTermRef = useRef(searchTerm);
  const prevTotalItemsRef = useRef(totalItems);
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    const searchTermChanged = prevSearchTermRef.current !== searchTerm;
    const totalItemsChanged = prevTotalItemsRef.current !== totalItems;

    // Skip all pagination resets on initial mount to preserve state across tab switches
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevSearchTermRef.current = searchTerm;
      prevTotalItemsRef.current = totalItems;
      return;
    }

    prevSearchTermRef.current = searchTerm;
    prevTotalItemsRef.current = totalItems;

    // Only reset pagination in specific cases:
    if (searchTermChanged && searchTerm !== "") {
      // Reset when search term actually changes (not on initial mount)
      onPageChange(1);
    } else if (totalPages === 0 && currentPage !== 1) {
      // Reset when no data and not on page 1
      onPageChange(1);
    } else if (currentPage > totalPages && totalPages > 0 && totalItemsChanged && !isRefreshing) {
      // Only reset when current page exceeds total pages AND the data actually changed
      // AND we're not currently refreshing (which happens during tab switches)
      // This prevents resets during tab switches that trigger data refreshes
      onPageChange(1);
    }
  }, [searchTerm, currentPage, totalPages, totalItems, onPageChange, isRefreshing]);

  // Get paginated data
  const paginatedHostAliases = useMemo(() => {
    if (pageSize === 'ALL') {
      return filteredHostAliases;
    }

    if (isPhone) {
      return filteredHostAliases.slice(0, currentPage * (typeof pageSize === 'number' ? pageSize : 10000));
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredHostAliases.slice(startIndex, endIndex);
  }, [filteredHostAliases, currentPage, pageSize, isPhone]);

  // Handle page size change
  const handlePageSizeChange = (value: number | 'ALL') => {
    onPageSizeChange(value);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  const enrichHostAlias = useCallback((
    fetchedHostAliases: OpnsenseAliasDetailFromExport[],
    allAliases: OpnsenseAliasDetailFromExport[],
  ): EnrichedHostAlias[] => {
    const currentVpnConnectionStatuses = latestVpnConnectionStatuses.current;
    const currentGroupVpnMap = latestGroupVpnMap.current;
    const currentVpnMappings = latestVpnMappings.current;
    const currentOpnsenseGroupDisplays = latestOpnsenseGroupDisplays.current;

    logger.debug('enrichHostAlias input:', {
      fetchedHostAliases: fetchedHostAliases.length,
      allAliases: allAliases.length,
      vpnConnectionStatuses: currentVpnConnectionStatuses.size,
      groupVpnMap: currentGroupVpnMap.size,
      vpnMappings: currentVpnMappings.length,
      opnsenseGroupDisplays: currentOpnsenseGroupDisplays.length
    });

    // Log network groups
    const networkGroups = allAliases.filter(alias => alias.type === 'networkgroup');
    logger.debug('Network Groups:', networkGroups.map(group => ({
      uuid: group.uuid,
      name: group.name,
      content: group.content,
      type: group.type
    })));

    const opnsenseGroupDisplayMap = new Map<string, OpnsenseGroupDisplay>();
    currentOpnsenseGroupDisplays.forEach(display => {
      opnsenseGroupDisplayMap.set(display.opnsenseUuid, display);
    });

    // Create a map of host alias names to their IP addresses
    const hostNameToIpMap = new Map<string, string>();
    allAliases.forEach(alias => {
      if (alias.type === 'host' && alias.name && alias.content) {
        hostNameToIpMap.set(alias.name, alias.content);
      }
    });
    logger.debug('Host Name to IP Map:', Object.fromEntries(hostNameToIpMap.entries()));

    // Create a map of IP addresses to their groups
    const ipToGroupsMap = new Map<string, { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[]>();

    // Process network groups to build the ipToGroupsMap
    allAliases.forEach(alias => {
      if (alias.type === 'networkgroup' && alias.content && alias.uuid) {
        const displayMapping = opnsenseGroupDisplayMap.get(alias.uuid);
        const networkGroup: NetworkGroup = {
          id: alias.uuid!,
          uuid: alias.uuid!,
          name: alias.name,
          description: alias.description,
          enabled: alias.enabled === '1',
          members: [], // We'll handle members differently
          friendlyName: displayMapping?.friendlyName || alias.friendlyName,
          iconIdentifier: displayMapping?.iconIdentifier || alias.iconIdentifier,
        };

        // Parse the content of the network group (contains hostnames or IPs)
        const members = alias.content.split('\n').filter(member => member.trim() !== '');

        members.forEach(memberName => {
          // If the member is a host alias name, get its IP address
          const ipAddress = hostNameToIpMap.get(memberName) || memberName;

          // Add this group to the IP's groups list
          const currentGroups = ipToGroupsMap.get(ipAddress) || [];
          ipToGroupsMap.set(ipAddress, [...currentGroups, {
            uuid: networkGroup.uuid,
            name: networkGroup.name,
            friendlyName: networkGroup.friendlyName,
            iconIdentifier: networkGroup.iconIdentifier,
            groupType: displayMapping?.groupType === 'MultiSelect' ? 'MultiSelect' : displayMapping?.groupType === 'SingleSelect' ? 'SingleSelect' : undefined,
          }]);
        });
      }
    });

    const result = fetchedHostAliases.map((alias: OpnsenseAliasDetailFromExport) => {
      // Get groups that this alias's IP address belongs to
      const groupsForAlias = ipToGroupsMap.get(alias.content) || [];

      // Also check if the alias name is directly referenced in any network group
      const groupsByName = ipToGroupsMap.get(alias.name) || [];

      // Combine both sets of groups (by IP and by name)
      const allGroupsForAlias = [...groupsForAlias];
      groupsByName.forEach(group => {
        if (!allGroupsForAlias.some(g => g.uuid === group.uuid)) {
          allGroupsForAlias.push(group);
        }
      });

      let vpnStatus: 'connected' | 'disconnected' | 'disabled' | null = null;
      let vpnName: string | null = null;
      let vpnUuid: string | null = null;
      let vpnType: string | null = null;
      let vpnEnabled: string | null = null;

      // Collect all VPNs from all groups instead of just the first connected one
      const allVpns: Array<{
        uuid: string;
        name: string;
        status: string | null;
        type: string | null;
        enabled: string | null;
      }> = [];

      for (const group of allGroupsForAlias) {
        const mappedVpnUuid = currentGroupVpnMap.get(group.uuid);
        if (mappedVpnUuid) {
          // Check if we already have this VPN (avoid duplicates)
          const existingVpn = allVpns.find(vpn => vpn.uuid === mappedVpnUuid);
          if (!existingVpn) {
            const vpnInfoFromStatus = currentVpnConnectionStatuses.get(mappedVpnUuid);
            const matchingVpnMapping = currentVpnMappings.find(vpn => vpn.vpnUuid === mappedVpnUuid);
            const groupDisplay = currentOpnsenseGroupDisplays.find(display => display.opnsenseUuid === group.uuid);
            const resolvedName = matchingVpnMapping?.friendlyName
              ?? matchingVpnMapping?.vpnName
              ?? groupDisplay?.friendlyName
              ?? group.name
              ?? mappedVpnUuid;

            allVpns.push({
              uuid: mappedVpnUuid,
              name: resolvedName,
              status: vpnInfoFromStatus?.status || null,
              type: vpnInfoFromStatus?.type || null,
              enabled: vpnInfoFromStatus?.enabled || null
            });
          }
        }
      }

      // For backward compatibility, set the primary VPN fields to the first VPN or best status
      if (allVpns.length > 0) {
        // Prioritize connected VPNs, then disconnected, then others
        const sortedVpns = allVpns.sort((a, b) => {
          if (a.status === 'connected' && b.status !== 'connected') return -1;
          if (b.status === 'connected' && a.status !== 'connected') return 1;
          if (a.status === 'disconnected' && b.status !== 'disconnected' && b.status !== 'connected') return -1;
          if (b.status === 'disconnected' && a.status !== 'disconnected' && a.status !== 'connected') return 1;
          return 0;
        });

        const primaryVpn = sortedVpns[0];
        vpnUuid = primaryVpn.uuid;
        vpnStatus = primaryVpn.status as 'connected' | 'disconnected' | 'disabled' | null;
        vpnType = primaryVpn.type;
        vpnEnabled = primaryVpn.enabled;
        vpnName = primaryVpn.name;
      }

      const enrichedAlias = {
        ...alias,
        uuid: alias.uuid ?? '',
        name: alias.name ?? '',
        type: alias.type ?? '',
        content: alias.content ?? '',
        description: alias.description ?? '',
        enabled: alias.enabled ?? '0',
        memberOfGroups: allGroupsForAlias,
        vpnStatus: vpnStatus,
        vpnName: vpnName,
        vpnUuid: vpnUuid,
        vpnType: vpnType,
        vpnEnabled: vpnEnabled,
        allVpns: allVpns, // Add all VPNs for multi-VPN display
        friendlyName: alias.friendlyName ?? undefined,
        hasMacConflict: (alias as OpnsenseAliasDetailFromExport & { hasMacConflict?: boolean }).hasMacConflict ?? false,
      };
      return enrichedAlias;
    });

    return result;
  }, []);

  // Add allVpns property to existing enriched host aliases from props
  useEffect(() => {
    if (hostAliases.length > 0) {

      const enhancedAliases = hostAliases.map(alias => {
        // Use the existing group membership data from the parent
        const allGroupsForAlias = alias.memberOfGroups || [];

        // Collect all VPNs from all groups for this alias
        const allVpns: Array<{
          uuid: string;
          name: string;
          status: string | null;
          type: string | null;
          enabled: string | null;
        }> = [];

        for (const group of allGroupsForAlias) {
          const mappedVpnUuid = groupVpnMap.get(group.uuid);
          if (mappedVpnUuid) {
            // Check if we already have this VPN (avoid duplicates)
            const existingVpn = allVpns.find(vpn => vpn.uuid === mappedVpnUuid);
            if (!existingVpn) {
              const vpnInfoFromStatus = vpnConnectionStatuses.get(mappedVpnUuid);
              const matchingVpnMapping = vpnMappings.find(vpn => vpn.vpnUuid === mappedVpnUuid);
              const groupDisplay = opnsenseGroupDisplays.find(display => display.opnsenseUuid === group.uuid);
              const resolvedName = matchingVpnMapping?.friendlyName
                ?? matchingVpnMapping?.vpnName
                ?? groupDisplay?.friendlyName
                ?? group.name
                ?? mappedVpnUuid;

              allVpns.push({
                uuid: mappedVpnUuid,
                name: resolvedName,
                status: vpnInfoFromStatus?.status || null,
                type: vpnInfoFromStatus?.type || null,
                enabled: vpnInfoFromStatus?.enabled || null
              });
            }
          }
        }

        // Return the alias with the allVpns property added
        return {
          ...alias,
          allVpns: allVpns
        };
      });

      setDisplayableHostAliases(enhancedAliases);

    } else {
      setDisplayableHostAliases([]);
    }
  }, [hostAliases, vpnConnectionStatuses, groupVpnMap, vpnMappings, opnsenseGroupDisplays]);

  const handleRefresh = useCallback(() => {
    onRefreshHostAliases();
  }, [onRefreshHostAliases]);

  // Host aliases data is now managed by parent component
  // useEffect(() => {
  //   fetchData(true);
  // }, [fetchData]);

  // Duplicate useEffect blocks removed - already handled at the top of the component

  const handleAdd = () => {
    setNewAliasForm({ name: '', content: '', description: '', enabled: true });
    setIsAddDialogOpen(true);
  };

  const handleNewAliasFormChange = (e: React.ChangeEvent<HTMLInputElement> | boolean, name?: string) => {
    if (typeof e === 'boolean' && name) {
      setNewAliasForm(prev => ({ ...prev, [name]: e }));
    } else if (typeof e !== 'boolean') {
      const { name: inputName, value } = e.target;
      setNewAliasForm(prev => ({ ...prev, [inputName]: value }));
    }
  };

  const handleCreateNewAlias = async () => {
    if (!newAliasForm.name.trim() || !newAliasForm.content.trim()) {
      toast({ variant: "destructive", title: "Validation Error", description: "Name and IP Address/FQDN (Content) are required." });
      return;
    }

    const ipAddresses = newAliasForm.content.split('\n').filter(ip => ip.trim() !== '');
    if (ipAddresses.length !== 1 || !isValidIpAddress(ipAddresses[0])) {
      toast({ variant: "destructive", title: "Validation Error", description: "Content must be a single valid IP address." });
      return;
    }

    if (/\s|-/.test(newAliasForm.name.trim())) {
      toast({ variant: "destructive", title: "Validation Error", description: "Host Alias Name cannot contain spaces or hyphens." });
      return;
    }

    const newIp = newAliasForm.content.trim();
    const conflictingAlias = hostAliases.find(a => a.content.trim() === newIp);
    if (conflictingAlias) {
      toast({
        variant: "destructive",
        title: "Duplicate IP Address",
        description: `A host alias named "${conflictingAlias.name}" already exists with IP ${newIp}. If a rename is needed, edit the existing host alias instead.`,
      });
      return;
    }

    setIsProcessingAction(true);
    try {
      const payload = {
        alias: {
          name: newAliasForm.name.trim(),
          type: 'host',
          content: newAliasForm.content.trim(),
          description: newAliasForm.description.trim(),
          enabled: newAliasForm.enabled ? '1' : '0',
        }
      };
      const response = await fetch('/api/opnsense/host-alias-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.ok) {
        const successMessage = result.message || `Host alias "${newAliasForm.name}" created successfully.`;
        toast({ variant: "success", title: "Success", description: successMessage });
        setIsAddDialogOpen(false); // Re-add this line to close the dialog
        // Dynamically update the state instead of refetching all data
        const newAlias: OpnsenseAliasDetailFromExport = {
          uuid: result.uuid, // Assuming the API returns the UUID of the new alias
          name: newAliasForm.name.trim(),
          type: 'host',
          content: newAliasForm.content.trim(),
          description: newAliasForm.description.trim(),
          enabled: newAliasForm.enabled ? '1' : '0',
          proto: "", // Initialize
          interface: "", // Initialize
          counters: "", // Initialize
          updatefreq: "", // Initialize
          categories: "", // Initialize
        };

        // Update raw aliases with the new alias
        const updatedRawOpnsenseAliases = [...latestRawOpnsenseAliases.current, newAlias];
        latestRawOpnsenseAliases.current = updatedRawOpnsenseAliases; // Update the ref
        setRawOpnsenseAliases(updatedRawOpnsenseAliases);

        // Enrich the new alias using the updated raw aliases
        const enrichedNewAlias = enrichHostAlias([newAlias], updatedRawOpnsenseAliases)[0];

        const updatedAllHostAliases = [...latestAllHostAliases.current, enrichedNewAlias];
        latestAllHostAliases.current = updatedAllHostAliases; // Update the ref
        setAllHostAliases(updatedAllHostAliases);
        setDisplayableHostAliases(updatedAllHostAliases);
      } else {
        if (result && result.validations && result.validations['alias.name']) {
          toast({ variant: "destructive", title: "Validation Failed", description: result.validations['alias.name'] });
        } else {
          toast({ variant: "destructive", title: "Creation Failed", description: result.message || "Could not create host alias." });
        }
      }
    } catch (err) {
      logger.error("Error creating host alias:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ variant: "destructive", title: "Creation Error", description: errorMessage });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleEdit = (alias: EnrichedHostAlias) => {
    // Create a synthetic original alias from the enriched alias data
    const syntheticOriginalAlias: OpnsenseAliasDetailFromExport = {
      uuid: alias.uuid,
      name: alias.name,
      type: alias.type,
      content: alias.content,
      description: alias.description || '',
      enabled: alias.enabled || '0',
      proto: "",
      interface: "",
      counters: "",
      updatefreq: "",
      categories: "",
    };

    setEditingAlias(syntheticOriginalAlias);
    const formData = {
      name: alias.name ?? '',
      content: alias.content ?? '',
      description: alias.description ?? '',
      enabled: alias.enabled === '1',
    };
    setEditAliasForm(formData);
    setOriginalEditAliasForm(formData);
    setIsEditDialogOpen(true);
  };

  const hasEditAliasChanges = () => {
    return (
      editAliasForm.name !== originalEditAliasForm.name ||
      editAliasForm.content !== originalEditAliasForm.content ||
      editAliasForm.description !== originalEditAliasForm.description ||
      editAliasForm.enabled !== originalEditAliasForm.enabled
    );
  };

  const handleEditAliasFormChange = (e: React.ChangeEvent<HTMLInputElement> | boolean, name?: string) => {
    if (typeof e === 'boolean' && name) {
      setEditAliasForm(prev => ({ ...prev, [name]: e }));
    } else if (typeof e !== 'boolean') {
      const { name: inputName, value } = e.target;
      setEditAliasForm(prev => ({ ...prev, [inputName]: value }));
    }
  };

  const handleUpdateAlias = async () => {
    if (!editingAlias || !editAliasForm.name.trim() || !editAliasForm.content.trim()) {
      toast({ variant: "destructive", title: "Validation Error", description: "Name and IP Address/FQDN (Content) are required for editing." });
      return;
    }

    const ipAddresses = editAliasForm.content.split('\n').filter(ip => ip.trim() !== '');
    if (ipAddresses.length !== 1 || !isValidIpAddress(ipAddresses[0])) {
      toast({ variant: "destructive", title: "Validation Error", description: "Content must be a single valid IP address." });
      return;
    }

    if (/\s|-/.test(editAliasForm.name.trim())) {
      toast({ variant: "destructive", title: "Validation Error", description: "Host Alias Name cannot contain spaces or hyphens." });
      return;
    }
    setIsProcessingAction(true);
    try {
      // Use editingAlias directly since it's now a synthetic alias with all necessary data
      const payload = {
        alias: {
          name: editAliasForm.name.trim(),
          type: 'host',
          content: editAliasForm.content.trim(),
          description: editAliasForm.description.trim(),
          enabled: editAliasForm.enabled ? '1' : '0',
          proto: editingAlias!.proto || "",
          interface: editingAlias!.interface || "",
          counters: editingAlias!.counters || "",
          updatefreq: editingAlias!.updatefreq || "",
          categories: editingAlias!.categories || "",
        }
      };
      const response = await fetch(`/api/opnsense/aliases/${editingAlias.uuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        toast({ title: "Success", description: `Host alias "${editAliasForm.name}" updated successfully.`, variant: "success" });
        setIsEditDialogOpen(false); // Re-add this line to close the dialog

        // Trigger refresh when edit dialog closes after a successful save
        if (onRefreshHostAliases) {
          await onRefreshHostAliases();
        }

        // Dynamically update the state instead of refetching all data
        const updatedAlias: OpnsenseAliasDetailFromExport = {
          ...editingAlias!, // Keep existing properties
          name: editAliasForm.name.trim(),
          content: editAliasForm.content.trim(),
          description: editAliasForm.description.trim(),
          enabled: editAliasForm.enabled ? '1' : '0',
          proto: editingAlias!.proto || "", // Ensure all properties are present
          interface: editingAlias!.interface || "",
          counters: editingAlias!.counters || "",
          updatefreq: editingAlias!.updatefreq || "",
          categories: editingAlias!.categories || "",
        };

        // Update raw aliases with the updated alias
        const updatedRawOpnsenseAliases = latestRawOpnsenseAliases.current.map(alias =>
          alias.uuid === updatedAlias.uuid ? updatedAlias : alias
        );
        latestRawOpnsenseAliases.current = updatedRawOpnsenseAliases; // Update the ref
        setRawOpnsenseAliases(updatedRawOpnsenseAliases);

        // Enrich the single updated alias using the updated raw aliases
        const enrichedUpdatedAlias = enrichHostAlias([updatedAlias], updatedRawOpnsenseAliases)[0];

        const updatedAllHostAliases = latestAllHostAliases.current.map(alias =>
          alias.uuid === enrichedUpdatedAlias.uuid ? enrichedUpdatedAlias : alias
        );
        latestAllHostAliases.current = updatedAllHostAliases; // Update the ref
        setAllHostAliases(updatedAllHostAliases);
        setDisplayableHostAliases(updatedAllHostAliases);
      } else {
        if (result && result.validations && result.validations['alias.name']) {
          toast({ variant: "destructive", title: "Validation Failed", description: result.validations['alias.name'] });
        } else {
          toast({ variant: "destructive", title: "Update Failed", description: result.message || "Could not update host alias." });
        }
      }
    } catch (err) {
      logger.error("Error updating host alias:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ variant: "destructive", title: "Update Error", description: errorMessage });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDelete = (alias: EnrichedHostAlias) => {
    // Create a synthetic original alias from the enriched alias data
    const syntheticOriginalAlias: OpnsenseAliasDetailFromExport = {
      uuid: alias.uuid,
      name: alias.name,
      type: alias.type,
      content: alias.content,
      description: alias.description || '',
      enabled: alias.enabled || '0',
      proto: "",
      interface: "",
      counters: "",
      updatefreq: "",
      categories: "",
    };

    setAliasToDelete(syntheticOriginalAlias);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteAlias = async () => {
    if (!aliasToDelete) return;
    setIsProcessingAction(true);
    try {
      const response = await fetch(`/api/opnsense/host-alias-management?uuid=${aliasToDelete.uuid}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (response.ok && result.success) {
        toast({ title: "Success", description: `Host alias "${aliasToDelete.name}" deleted successfully.`, variant: "success" });
        // Dynamically update the state instead of refetching all data
        const updatedAllHostAliases = latestAllHostAliases.current.filter(alias => alias.uuid !== aliasToDelete.uuid);
        latestAllHostAliases.current = updatedAllHostAliases; // Update the ref
        setAllHostAliases(updatedAllHostAliases);
        setDisplayableHostAliases(updatedAllHostAliases);
      } else {
        toast({ variant: "destructive", title: "Deletion Failed", description: result.message || "Could not delete host alias." });
      }
    } catch (err) {
      logger.error("Error deleting host alias:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ variant: "destructive", title: "Deletion Error", description: errorMessage });
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <>
      <Card className="shadow-lg w-full flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly><Laptop size={28} className="mr-2 text-primary" /></ClientOnly> Host Alias Management
            </CardTitle>
            {!isMobile && <CardDescription>View, create, edit, and delete OPNsense host aliases.</CardDescription>}
          </div>
          <div className="flex w-full items-center justify-between md:w-auto md:gap-4">
            <Button
              onClick={handleCheckDuplicates}
              variant="outline"
              className={cn(isMobile && "size-9 p-0")}
              disabled={isLoadingInitialData || hostAliases.length === 0}
            >
              <ClientOnly>
                <ScanSearch className={cn("h-4 w-4", !isMobile && "mr-2")} />
              </ClientOnly>
              {!isMobile && "Check Duplicates"}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                variant="outline"
                className={cn(isMobile && "size-9 p-0")}
                disabled={isLoadingInitialData || isRefreshing}
              >
                <ClientOnly>
                  {isRefreshing ? (
                    <Loader2 className={cn("h-4 w-4 animate-spin", !isMobile && "mr-2")} />
                  ) : (
                    <RefreshCcw className={cn("h-4 w-4", !isMobile && "mr-2")} />
                  )}
                </ClientOnly>
                {!isMobile && "Refresh"}
              </Button>
              <Button onClick={handleAdd} className={cn(isMobile && "size-9 p-0")}>
                <ClientOnly>
                  <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
                </ClientOnly>
                {!isMobile && "Add Host Alias"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
          {(isLoadingInitialData && !hasInitialDataLoaded) || (!hasInitialDataLoaded && displayableHostAliases.length === 0) ? ( // Show skeleton until we have displayable data on initial load
            <div className="space-y-2 mt-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : hostAliasesError ? (
            <Alert variant="destructive" className="mt-4">
              <ClientOnly><AlertCircle className="h-4 w-4" /></ClientOnly>
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{hostAliasesError}</AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Search Input for Host Aliases */}
              <div className="mb-4 relative max-w-sm">
                <div className="relative">
                  <Input
                    type="search"
                    placeholder="Search host aliases..."
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchTermChange(e.target.value)}
                    className="pr-16"
                  />
                  <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    {searchTerm && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onSearchTermChange("")}
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    <Dialog open={searchHelpOpen} onOpenChange={setSearchHelpOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => setSearchHelpOpen(true)}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Search Help</DialogTitle>
                          <DialogDescription>
                            Learn how to search for host aliases using various keywords and filters.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-96 overflow-y-auto">
                          <div className="space-y-3">
                            <p className="font-medium">Search terms:</p>
                            <ul className="text-sm space-y-1">
                              <li><strong>&lt;IP&gt;:</strong> e.g. 192.168.1.1</li>
                              <li><strong>&lt;MAC&gt;:</strong> e.g. 00:11:22:33:44:55</li>
                              <li><strong>&lt;MAC Vendor&gt;:</strong> e.g. samsung</li>
                              <li><strong>&lt;Hostname&gt;:</strong> e.g. mydevice.local</li>
                              <li><strong>&lt;Host Alias&gt;:</strong> Search by Alias Name</li>
                              <li><strong>&lt;Group&gt;:</strong> Search by Group Name</li>
                              <li><strong>single-select:</strong> Devices in {singleSelectName} groups</li>
                              <li><strong>multi-select:</strong> Devices in {multiSelectName} groups</li>
                              <li><strong>vpn:</strong> Devices in any VPN</li>
                              <li><strong>openvpn:</strong> Devices using OpenVPN</li>
                              <li><strong>wireguard:</strong> Devices using WireGuard</li>
                              <li><strong>ipsec:</strong> Devices using IPsec</li>
                              <li><strong>ingroup:</strong> Devices associated to a group</li>
                              <li><strong>ingroup-error:</strong> Devices with group assignment errors (multiple groups when disabled, or multiple single-select when enabled)</li>
                              <li><strong>dhcp:</strong> Devices with DHCP reservations</li>
                              <li><strong>dhcp-conflict:</strong> Devices with DHCP MAC conflicts</li>
                              <li><strong>dhcp-privacy-mac:</strong> Devices with Privacy MAC DHCP</li>
                              <li><strong>privacy:</strong> Devices with Privacy MAC addresses (from ARP or DHCP)</li>
                              <li><strong>vpn-connected:</strong> Devices with connected VPNs</li>
                              <li><strong>vpn-disconnected:</strong> Devices with disconnected VPNs</li>
                              <li><strong>online:</strong> Devices detected via ARP</li>
                              <li><strong>offline:</strong> Devices not detected via ARP</li>
                              <li><strong>disabled:</strong> Disabled host aliases</li>
                              <li><strong>arp:</strong> Devices detected via ARP (online)</li>
                            </ul>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>



              {paginatedHostAliases.length === 0 && searchTerm === "" && hasInitialDataLoaded ? (
                <p className="text-muted-foreground text-center mt-4">No host aliases found.</p>
              ) : paginatedHostAliases.length === 0 && searchTerm !== "" ? (
                <p className="text-muted-foreground text-center mt-4">No aliases found matching your search.</p>
              ) : isMobile ? (
                // Mobile View: Render as Cards
                <ScrollArea className="flex-1 pr-4 -mr-4">
                  <div className="space-y-4">
                    {paginatedHostAliases.map(alias => (
                      <Card key={alias.uuid}>
                        <CardHeader className="pb-2">
                          <CardTitle className={isMobile ? 'text-base' : 'text-lg'}>{alias.name}</CardTitle>
                          {alias.description && <CardDescription>{alias.description}</CardDescription>}
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Content:</span>
                            <span>{alias.content}</span>
                          </div>
                          {alias.detectedMac && alias.detectedMac.length > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">MAC Address:</span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="default" className={cn(
                                      "h-4 w-auto px-1 text-xs",
                                      checkMacRandomization(alias.detectedMac).isRandomized
                                        ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                                        : "bg-primary hover:bg-primary/90 text-white"
                                    )}>
                                      {alias.detectedMac}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="space-y-1">
                                      {checkMacRandomization(alias.detectedMac).isRandomized && (
                                        <p>Privacy Mac Address</p>
                                      )}
                                      {alias.detectedVendor && (
                                        <p>Vendor: {alias.detectedVendor}</p>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}
                          {/* New DHCP Reserved Status for Mobile */}
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">DHCP Reserved:</span>
                            <span>
                              {alias.isDhcpReserved !== undefined ? (
                                alias.hasMacConflict ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertTriangle className="h-5 w-5 text-yellow-500 animate-pulse" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>DHCP reservation exists, but MAC address conflicts with detected MAC.</p>
                                        <p>Reserved MAC: {alias.dhcpReservedMac}</p>
                                        <p>Detected MAC: {alias.detectedMac}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  alias.isDhcpReserved ? (
                                    (() => {
                                      const isPrivacyMac = alias.dhcpReservedMac && checkMacRandomization(alias.dhcpReservedMac).isRandomized;
                                      return isPrivacyMac ? (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <AlertCircle className="h-5 w-5 text-yellow-500" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              Reserved but Privacy MAC Address detected.
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      ) : (
                                        <CheckCircle className="h-5 w-5 text-darker-green" />
                                      );
                                    })()
                                  ) : (
                                    <XCircle className="h-5 w-5 text-red-500" />
                                  )
                                )
                              ) : (
                                '-'
                              )}
                            </span>
                          </div>
                          {/* Group Membership for Mobile */}
                          {alias.memberOfGroups && alias.memberOfGroups.length > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">Group:</span>
                              {alias.enabled !== '1' ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex flex-wrap gap-1 bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700 cursor-not-allowed px-1.5 py-0.5 rounded-md">
                                        {enableGroupTypes && alias.memberOfGroups.length > 1 ? (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="flex items-center text-xs">
                                                  {alias.memberOfGroups.length} Groups
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <div className="space-y-1">
                                                  {alias.memberOfGroups.map((group) => (
                                                    <div key={group.uuid} className="flex items-center gap-2">
                                                      <ClientOnly>
                                                        {group.iconIdentifier ? getGroupIcon(group) : null}
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
                                        ) : !enableGroupTypes && alias.memberOfGroups.length > 1 ? (
                                          // When group types are disabled, show "X Groups" with tooltip
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="flex items-center gap-1 text-xs">
                                                  <AlertTriangle className="h-3 w-3" />
                                                  {alias.memberOfGroups.length} Groups
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <div>
                                                  <p className="text-orange-400 font-semibold">Multi Group Error</p>
                                                  <p className="text-sm mt-1">Member of:</p>
                                                  {alias.memberOfGroups.map((group) => (
                                                    <div key={group.uuid} className="flex items-center gap-2">
                                                      <ClientOnly>
                                                        {group.iconIdentifier ? getGroupIcon(group) : null}
                                                      </ClientOnly>
                                                      <span className="text-sm">
                                                        {group.friendlyName || group.name}
                                                      </span>
                                                    </div>
                                                  ))}
                                                  <div className="border-t pt-2 mt-2">
                                                    <p className="text-xs text-gray-400">
                                                      To resolve: Use the group assignment controls to assign to a single group.
                                                    </p>
                                                  </div>
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        ) : (
                                          <span className="flex items-center text-xs">
                                            <ClientOnly>
                                              {alias.memberOfGroups[0]?.iconIdentifier ? getGroupIcon(alias.memberOfGroups[0]) : null}
                                            </ClientOnly>
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span className="flex items-center">
                                                    {alias.memberOfGroups[0]?.friendlyName || alias.memberOfGroups[0]?.name}
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                      <ClientOnly>
                                                        {alias.memberOfGroups[0]?.iconIdentifier ? getGroupIcon(alias.memberOfGroups[0]) : null}
                                                      </ClientOnly>
                                                      <span>
                                                        {alias.memberOfGroups[0]?.friendlyName || alias.memberOfGroups[0]?.name}
                                                        {enableGroupTypes && (alias.memberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' })?.groupType ? ` (${((alias.memberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' })?.groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          </span>
                                        )}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Group Membership is Inactive</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className={`flex flex-wrap gap-1 px-1.5 py-0.5 rounded-md ${hasAnyGroupError(alias.memberOfGroups, enableGroupTypes)
                                  ? 'bg-orange-100 text-orange-800 border border-orange-700'
                                  : 'bg-green-100 text-green-800 border border-green-700'
                                  }`}>
                                  {hasAnyGroupError(alias.memberOfGroups, enableGroupTypes) ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center text-xs">
                                            {alias.memberOfGroups.length} Groups
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div>
                                            <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(alias.memberOfGroups, enableGroupTypes))}</p>
                                            <p className="text-sm mt-1">Member of:</p>
                                            {alias.memberOfGroups.map((group) => (
                                              <div key={group.uuid} className="flex items-center gap-2">
                                                <ClientOnly>
                                                  {group.iconIdentifier ? getGroupIcon(group) : null}
                                                </ClientOnly>
                                                <span className="text-sm">
                                                  {group.friendlyName || group.name}
                                                  {enableGroupTypes && (group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType ? ` (${((group as { groupType?: 'SingleSelect' | 'MultiSelect' }).groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                </span>
                                              </div>
                                            ))}
                                            <div className="border-t pt-2 mt-2">
                                              <p className="text-xs text-gray-400">
                                                To resolve: Assign this device to a single group.
                                              </p>
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : enableGroupTypes && alias.memberOfGroups.length > 1 ? (
                                    // When group types are enabled and multiple groups but no error, show normal tooltip
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center text-xs">
                                            {alias.memberOfGroups.length} Groups
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="space-y-1">
                                            {alias.memberOfGroups.map((group) => (
                                              <div key={group.uuid} className="flex items-center gap-2">
                                                <ClientOnly>
                                                  {group.iconIdentifier ? getGroupIcon(group) : null}
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
                                    <span className="flex items-center text-xs">
                                      <ClientOnly>
                                        {alias.memberOfGroups[0]?.iconIdentifier ? getGroupIcon(alias.memberOfGroups[0]) : null}
                                      </ClientOnly>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="flex items-center">
                                              {alias.memberOfGroups[0]?.friendlyName || alias.memberOfGroups[0]?.name}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                <ClientOnly>
                                                  {alias.memberOfGroups[0]?.iconIdentifier ? getGroupIcon(alias.memberOfGroups[0]) : null}
                                                </ClientOnly>
                                                <span>
                                                  {alias.memberOfGroups[0]?.friendlyName || alias.memberOfGroups[0]?.name}
                                                  {enableGroupTypes && (alias.memberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' })?.groupType ? ` (${((alias.memberOfGroups[0] as { groupType?: 'SingleSelect' | 'MultiSelect' })?.groupType) === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                                                </span>
                                              </div>
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                          {/* VPN Status for Mobile */}
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">VPN:</span>
                            <span>
                              {(() => {
                                const allVpns = alias.allVpns || [];

                                if (allVpns.length === 0) {
                                  return <span className="text-muted-foreground">-</span>;
                                }

                                if (allVpns.length === 1) {
                                  const vpn = allVpns[0];
                                  return vpn.status === 'connected' ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center text-darker-green">
                                            <LucideIcons.ShieldCheck className="h-4 w-4 mr-1" />
                                            {vpn.name}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{vpn.type === 'openvpn' ? 'OpenVPN' :
                                            vpn.type === 'wireguard' ? 'WireGuard' :
                                              vpn.type === 'ipsec' ? 'IPsec' :
                                                vpn.type} VPN Connected ({vpn.name})</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : vpn.status === 'disconnected' ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            onClick={() => handleVpnRestart(vpn.uuid, vpn.type!)}
                                            disabled={restartingVpnUuid === vpn.uuid || (vpn.type === 'WireGuard' && vpn.enabled === '0')}
                                            className={cn(
                                              "p-0 m-0 bg-transparent hover:bg-transparent flex items-center",
                                              (vpn.type === 'WireGuard' && vpn.enabled === '0') ? "text-gray-400" : "text-red-500"
                                            )}
                                          >
                                            {restartingVpnUuid === vpn.uuid ? (
                                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                            ) : (
                                              <LucideIcons.ShieldX className="h-4 w-4 mr-1" />
                                            )}
                                            {vpn.name}
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{vpn.type === 'openvpn' ? 'OpenVPN' :
                                            vpn.type === 'wireguard' ? 'WireGuard' :
                                              vpn.type === 'ipsec' ? 'IPsec' :
                                                vpn.type} VPN Disconnected ({vpn.name})</p>
                                          {vpn.type === 'wireguard' && vpn.enabled === '0' ? (
                                            <p>WireGuard is disabled and cannot be restarted.</p>
                                          ) : (
                                            <p>Click to restart VPN</p>
                                          )}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : vpn.status === 'disabled' ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center text-gray-500">
                                            <LucideIcons.ShieldX className="h-4 w-4 mr-1" />
                                            {vpn.name} (Disabled)
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{vpn.type} VPN is Disabled</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : vpn.name ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-muted-foreground">
                                            {vpn.name}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{vpn.type ? `${vpn.type} VPN Status Unknown` : 'VPN Status Unknown'}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  );
                                }

                                // Multiple VPNs - show count with status-based color
                                const connectedCount = allVpns.filter(vpn => vpn.status === 'connected').length;
                                const disconnectedCount = allVpns.filter(vpn => vpn.status === 'disconnected').length;
                                const disabledCount = allVpns.filter(vpn => vpn.status === 'disabled').length;
                                const unknownCount = allVpns.length - connectedCount - disconnectedCount - disabledCount;

                                // Determine overall status color
                                let statusColor = 'text-darker-green'; // All connected
                                let StatusIcon = LucideIcons.ShieldCheck;

                                if (connectedCount === 0) {
                                  // No connections - red
                                  statusColor = 'text-red-500';
                                  StatusIcon = LucideIcons.ShieldX;
                                } else if (disconnectedCount > 0 || unknownCount > 0) {
                                  // Some disconnected/unknown - orange
                                  statusColor = 'text-orange-500';
                                  StatusIcon = LucideIcons.ShieldAlert;
                                }

                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className={`flex items-center ${statusColor}`}>
                                          <StatusIcon className="h-4 w-4 mr-1" />
                                          {`${allVpns.length} VPN${allVpns.length > 1 ? 's' : ''}`}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="space-y-1">
                                          <p className="font-medium">VPN Status Summary:</p>
                                          {connectedCount > 0 && <p className="text-green-600">✓ {connectedCount} Connected</p>}
                                          {disconnectedCount > 0 && <p className="text-red-600">✗ {disconnectedCount} Disconnected</p>}
                                          {disabledCount > 0 && <p className="text-gray-600">⊘ {disabledCount} Disabled</p>}
                                          {unknownCount > 0 && <p className="text-yellow-600">? {unknownCount} Unknown</p>}
                                          <div className="border-t pt-1 mt-2">
                                            <p className="font-medium">VPNs:</p>
                                            {allVpns.map((vpn, index) => (
                                              <p key={index} className="text-sm">
                                                {vpn.name} ({vpn.type}) - {vpn.status || 'Unknown'}
                                              </p>
                                            ))}
                                          </div>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Enabled:</span>
                            <span>{alias.enabled === "1" ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="flex space-x-2 mt-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(alias)} disabled={isProcessingAction} className="flex-grow">
                              <Edit className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(alias)} disabled={isProcessingAction} className="flex-grow">
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                // Desktop View: Render as Table
                <ScrollArea className="flex-1 pr-4 -mr-4">
                  <div> {/* Added a div wrapper */}
                    <SortableTable<EnrichedHostAlias>
                      key="host-alias-table" // Add a stable key here
                      data={paginatedHostAliases}
                      columns={columns} // Use the memoized columns array
                      sortBy={sortBy} // Pass sortBy prop
                      sortDirection={sortDirection} // Pass sortDirection prop
                      onSortChange={onSortChange} // Pass the handler prop

                    />
                  </div> {/* Close div wrapper */}
                </ScrollArea>
              )}

              {/* Pagination Controls */}
              {(isLoadingInitialData && !hasInitialDataLoaded) || (!hasInitialDataLoaded && displayableHostAliases.length === 0) ? (
                <div className="mt-4">
                  <Skeleton className="h-6 w-32" />
                </div>
              ) : (
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={totalItems}
                  filteredCount={totalItems}
                  pageSize={pageSize}
                  onPageChange={async (page) => {
                    setIsButtonRefreshing(true);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    handlePageChange(page);
                    setIsButtonRefreshing(false);
                  }}
                  onPageSizeChange={handlePageSizeChange}
                  isLoading={isLoadingInitialData || isButtonRefreshing}
                  isLoadMoreMode={isPhone}
                  pageSizeOptions={[5, 10, 50, 100, 500]}
                  showAllOption={true}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AddHostAliasDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        newAliasForm={newAliasForm}
        onFormChange={handleNewAliasFormChange}
        onCreateAlias={handleCreateNewAlias}
        isProcessingAction={isProcessingAction}
      />

      <EditHostAliasDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        editingAlias={editingAlias}
        editAliasForm={editAliasForm}
        onFormChange={handleEditAliasFormChange}
        onUpdateAlias={handleUpdateAlias}
        isProcessingAction={isProcessingAction}
        hasChanges={hasEditAliasChanges}
      />

      <DeleteHostAliasDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        aliasToDelete={aliasToDelete}
        onConfirmDelete={confirmDeleteAlias}
        isProcessingAction={isProcessingAction}
        onCancelDelete={() => {
          setIsDeleteDialogOpen(false);
          setAliasToDelete(null);
        }}
      />

      <DuplicateAliasesModal
        isOpen={isDuplicateModalOpen}
        onOpenChange={setIsDuplicateModalOpen}
        results={duplicateResults}
        onRemoveAlias={handleRemoveAlias}
      />
    </>
  );
}

// Wrap with memo to prevent unnecessary re-renders when props haven't meaningfully changed
export default memo(HostAliasesTab);