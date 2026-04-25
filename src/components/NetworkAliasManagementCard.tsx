'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Waypoints, RefreshCcw, Loader2, Terminal, ChevronUp, ChevronDown, Copy, Activity, AlertCircle, CheckCircle, Network as NetworkIconLucide } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { flags, generalEmojis } from '@/components/ui/icon-picker';
import { cn } from '@/lib/utils';
import { ClientOnly } from '@/components/util/ClientOnly';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logger } from '@/lib/logger';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { useGroupType } from '@/context/GroupTypeContext';
import { hasAnyGroupError, getGroupErrorType, getGroupErrorMessage } from '@/utils/groupErrorDetection';
import type { NetworkAlias } from '@/types/opnsense';
import { formatLastOperation, getLastOperationTooltip, type LastAssignmentData } from '@/lib/format-last-operation';
import { DeviceGroupHistoryGraph, DeviceGroupHistoryGraphHandles } from '@/components/DeviceGroupHistoryGraph';

export interface NetworkAliasManagementCardHandles {
  refreshNetworkAliases: () => Promise<void>;
  refreshLastOperationOnly: () => Promise<void>;
  refreshGraphs: () => Promise<void>;
}

interface NetworkAliasManagementCardProps {
  selectedAlias: NetworkAlias | null;
  onSelectAlias: (alias: NetworkAlias | null) => void;
  layoutMode?: 'stacked' | 'side-by-side';
  allEmojiValues?: string[];
  allFlagValues?: string[];
}

interface AliasSelectOption {
  value: string;
  label: string;
  aliasDescription: string | null;
  memberOfGroups: { uuid: string; name: string; friendlyName?: string; iconIdentifier?: string | null; groupType?: 'SingleSelect' | 'MultiSelect' }[];
  isDisabled: boolean;
  searchableText: string;
}

const NetworkAliasManagementCard = forwardRef<NetworkAliasManagementCardHandles, NetworkAliasManagementCardProps>(function NetworkAliasManagementCard({
  selectedAlias,
  onSelectAlias,
  layoutMode,
  allEmojiValues = [],
  allFlagValues = [],
}, ref) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { enableGroupTypes, singleSelectName, multiSelectName } = useGroupType();

  const [aliases, setAliases] = useState<NetworkAlias[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extendedDetails, setExtendedDetails] = useState<{
    lastAssignment: LastAssignmentData | null;
  } | null>(null);
  const [isLoadingExtendedDetails, setIsLoadingExtendedDetails] = useState(false);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const graphRefCard = useRef<DeviceGroupHistoryGraphHandles>(null);
  const graphRefModal = useRef<DeviceGroupHistoryGraphHandles>(null);

  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);

  const memoizedAllGeneralEmojiValues = useMemo(() => new Set([...generalEmojis.map(e => e.value.normalize('NFC')), ...allEmojiValues.map(e => e.normalize('NFC'))]), [allEmojiValues]);
  const memoizedAllFlagValues = useMemo(() => new Set([...flags.map(f => f.value.normalize('NFC')), ...allFlagValues.map(flag => flag.normalize('NFC'))]), [allFlagValues]);

  const getGroupIcon = useCallback((groupUuid: string): React.ReactNode => {
    const group = selectedAlias?.memberOfGroups?.find(g => g.uuid === groupUuid);
    const mappedIconIdentifier = group?.iconIdentifier;

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

    return <NetworkIconLucide size={18} className="mr-1.5 text-primary opacity-80" />;
  }, [selectedAlias?.memberOfGroups, memoizedAllGeneralEmojiValues, memoizedAllFlagValues]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    if (typeof window !== 'undefined') {
      handleResize();
      window.addEventListener('resize', handleResize);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  const calculateCollapsedState = useCallback((width: number, height: number) => {
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

  const isFetchingRef = useRef<boolean>(false);
  const lastFetchedUuidRef = useRef<string | null>(null);

  const fetchAliases = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const resp = await fetch('/api/user/network-aliases', { cache: 'no-store' });
      if (!resp.ok) {
        if (resp.status === 403) {
          setError('Network alias management is disabled.');
          return;
        }
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      const data: NetworkAlias[] = await resp.json();
      setAliases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load network aliases');
      logger.error('[NetworkAliasManagementCard] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshLastOperationOnly = useCallback(async () => {
    if (layoutMode !== 'side-by-side' || !selectedAlias?.uuid) return;

    try {
      const resp = await fetch(`/api/opnsense/network-alias-last-assignment?aliasUuid=${selectedAlias.uuid}`);
      if (resp.ok) {
        const assignmentData = await resp.json();
        const lastAssignment = assignmentData.timestamp ? (assignmentData as LastAssignmentData) : null;
        setExtendedDetails(prev => prev ? { ...prev, lastAssignment } : { lastAssignment });
      }
    } catch (error) {
      logger.error('Error refreshing last operation:', error);
    }
  }, [layoutMode, selectedAlias?.uuid]);

  const refreshGraphs = useCallback(async () => {
    try {
      await fetchAliases();
      await Promise.all([
        graphRefCard.current?.refresh(),
        graphRefModal.current?.refresh()
      ].filter(Boolean));
    } catch (error) {
      logger.error('Error refreshing graphs:', error);
    }
  }, [fetchAliases]);

  const fetchExtendedDetails = useCallback(async (forceRefresh = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (layoutMode !== 'side-by-side' || !selectedAlias?.uuid) {
      setExtendedDetails(null);
      lastFetchedUuidRef.current = null;
      isFetchingRef.current = false;
      return;
    }

    if (!forceRefresh && lastFetchedUuidRef.current === selectedAlias.uuid) {
      isFetchingRef.current = false;
      return;
    }

    lastFetchedUuidRef.current = selectedAlias.uuid;
    setIsLoadingExtendedDetails(true);

    try {
      const lastAssignmentResponse = await fetch(`/api/opnsense/network-alias-last-assignment?aliasUuid=${selectedAlias.uuid}`);

      let lastAssignment: LastAssignmentData | null = null;

      if (lastAssignmentResponse.ok) {
        const assignmentData = await lastAssignmentResponse.json();
        if (assignmentData.timestamp) {
          lastAssignment = assignmentData as LastAssignmentData;
        }
      } else {
        logger.warn(`Failed to fetch last assignment: ${lastAssignmentResponse.statusText}`);
      }

      setExtendedDetails({ lastAssignment });
    } catch (error) {
      logger.error('Error fetching extended alias details:', error);
      setExtendedDetails(null);
      lastFetchedUuidRef.current = null;
    } finally {
      setIsLoadingExtendedDetails(false);
      isFetchingRef.current = false;
    }
  }, [layoutMode, selectedAlias?.uuid]);

  useEffect(() => {
    fetchExtendedDetails();
  }, [fetchExtendedDetails]);

  useImperativeHandle(ref, () => ({
    refreshNetworkAliases: () => fetchAliases(),
    refreshLastOperationOnly,
    refreshGraphs,
  }), [fetchAliases, refreshLastOperationOnly, refreshGraphs]);

  useEffect(() => { fetchAliases(); }, [fetchAliases]);

  const aliasOptions: AliasSelectOption[] = useMemo(() => {
    return aliases.map(alias => {
      const searchableText = [
        alias.name,
        alias.content,
        alias.description,
        ...(alias.memberOfGroups || []).map(g => g.name),
        ...(alias.memberOfGroups || []).map(g => g.friendlyName),
        alias.enabled !== '1' ? 'disabled' : '',
      ].filter(Boolean).join(' ').toLowerCase();

      return {
        value: alias.uuid,
        label: `${alias.name} (${alias.content})`,
        aliasDescription: alias.description || null,
        memberOfGroups: alias.memberOfGroups || [],
        isDisabled: alias.enabled !== '1',
        searchableText,
      };
    });
  }, [aliases]);

  const renderAliasOption = useCallback((option: AliasSelectOption) => {
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <span className="break-words whitespace-normal">{option.label}</span>
        </div>
        <div className="flex-grow flex items-center gap-1 mt-1 sm:mt-0 sm:ml-2 flex-wrap max-w-full justify-end">
          {option.memberOfGroups.length > 0 && (
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
                  {hasAnyGroupError(option.memberOfGroups, enableGroupTypes) ? (
                    <div>
                      <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(option.memberOfGroups, enableGroupTypes))}</p>
                      <p className="text-sm mt-1">Member of:</p>
                      {option.memberOfGroups.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name}{enableGroupTypes ? ` (${g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})` : ''}</p>
                      ))}
                    </div>
                  ) : enableGroupTypes ? (
                    <div>
                      <p className="text-sm">Member of:</p>
                      {option.memberOfGroups.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name} ({g.groupType === 'MultiSelect' ? multiSelectName : singleSelectName})</p>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm">Member of:</p>
                      {option.memberOfGroups.map((g, index) => (
                        <p key={index} className="text-sm">{g.friendlyName || g.name}</p>
                      ))}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {option.isDisabled && (
            <Badge className="h-4 w-auto px-1 text-xs bg-gray-400 hover:bg-gray-400 text-white">
              Disabled
            </Badge>
          )}
        </div>
      </div>
    );
  }, [enableGroupTypes, singleSelectName, multiSelectName]);

  const renderSelectedAlias = useCallback((option: AliasSelectOption) => {
    return (
      <div className="flex items-center gap-2">
        <span className="truncate">{option.label}</span>
      </div>
    );
  }, []);

  const handleCopySummary = useCallback(async () => {
    if (!selectedAlias) return;
    const summary = [
      '## Network Alias',
      `- **Name:** ${selectedAlias.name}`,
      `- **Content:** \`${selectedAlias.content}\``,
      selectedAlias.description ? `- **Description:** ${selectedAlias.description}` : '',
      extendedDetails?.lastAssignment ? `- **Last Operation:** ${formatLastOperation(extendedDetails.lastAssignment, true)}` : '',
      selectedAlias.memberOfGroups && selectedAlias.memberOfGroups.length > 0
        ? `- **Groups:** ${selectedAlias.memberOfGroups.map(g => g.friendlyName || g.name).join(', ')}`
        : '- **Groups:** None',
    ].filter(Boolean).join('\n');

    const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
    const success = await safeClipboardCopy(summary);
    if (success) {
      toast({ title: "Copied!", description: "Alias information copied to clipboard.", variant: "success" });
    } else {
      toast({ title: "Copy Failed", description: getClipboardErrorDescription(), variant: "destructive" });
    }
  }, [selectedAlias, extendedDetails, toast]);

  const currentGroupsForGraph = useMemo(() => {
    return (selectedAlias?.memberOfGroups || []).map(g => ({
      id: g.uuid,
      uuid: g.uuid,
      name: g.name,
    }));
  }, [selectedAlias?.memberOfGroups]);

  const renderGroupsDisplay = useCallback(() => {
    const groups = selectedAlias?.memberOfGroups || [];
    if (groups.length === 0) {
      return (
        <span className={cn(
          "font-mono px-1.5 py-0.5 rounded-md inline-flex items-center gap-1",
          "bg-gray-400 dark:bg-gray-700 text-white opacity-60 border border-gray-400 dark:border-gray-700",
          isMobile ? "text-sm" : "text-base"
        )}>
          <AlertCircle className="h-3 w-3 mr-1" />
          No Membership
        </span>
      );
    }

    if (groups.length === 1) {
      const group = groups[0];
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(
                "font-mono px-1.5 py-0.5 rounded-md inline-flex items-center gap-1",
                "bg-green-100 text-green-800 border border-green-700",
                isMobile ? "text-sm" : "text-base"
              )}>
                <CheckCircle className="h-3 w-3 mr-1" />
                <ClientOnly fallback={<Skeleton className="h-4 w-4 mr-1.5 rounded-full" />}>
                  {getGroupIcon(group.uuid)}
                </ClientOnly>
                {group.friendlyName || group.name}
                {enableGroupTypes && group.groupType ? ` (${group.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                    {getGroupIcon(group.uuid)}
                  </ClientOnly>
                  <span>
                    {group.friendlyName || group.name}
                    {enableGroupTypes && group.groupType ? ` (${group.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                  </span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "font-mono px-1.5 py-0.5 rounded-md inline-flex items-center gap-1",
              hasAnyGroupError(groups, enableGroupTypes)
                ? "bg-orange-100 text-orange-800 border border-orange-600"
                : "bg-green-100 text-green-800 border border-green-700",
              isMobile ? "text-sm" : "text-base"
            )}>
              <CheckCircle className="h-3 w-3 mr-1" />
              {groups.length} Groups
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {hasAnyGroupError(groups, enableGroupTypes) ? (
              <div>
                <p className="text-orange-400 font-semibold">{getGroupErrorMessage(getGroupErrorType(groups, enableGroupTypes))}</p>
                <p className="text-sm mt-1">Member of:</p>
                {groups.map((group) => (
                  <div key={group.uuid} className="flex items-center gap-2">
                    <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                      {getGroupIcon(group.uuid)}
                    </ClientOnly>
                    <span className="text-sm">
                      {group.friendlyName || group.name}
                      {enableGroupTypes && group.groupType ? ` (${group.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="text-sm">Member of:</p>
                {groups.map((group) => (
                  <div key={group.uuid} className="flex items-center gap-2">
                    <ClientOnly fallback={<Skeleton className="h-3 w-3 rounded-full" />}>
                      {getGroupIcon(group.uuid)}
                    </ClientOnly>
                    <span className="text-sm">
                      {group.friendlyName || group.name}
                      {enableGroupTypes && group.groupType ? ` (${group.groupType === 'SingleSelect' ? singleSelectName : multiSelectName})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }, [selectedAlias?.memberOfGroups, enableGroupTypes, singleSelectName, multiSelectName, isMobile, getGroupIcon]);

  return (
    <>
      <Card className={cn("w-full shadow-lg", layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0" : "")}>
        <CardHeader className={`flex flex-row items-center justify-between ${isMobile ? 'p-3' : ''}`}>
          <div className="flex-grow">
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <Waypoints size={isMobile ? 22 : 28} className="mr-2 text-primary" />
              Network Aliases
            </CardTitle>
            <CardDescription className={`mt-1 ${isMobile ? 'text-xs' : ''}`}>
              Select a network alias to manage its group assignments.
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
                      selectedAlias ? "" : "cursor-not-allowed opacity-50"
                    )}
                    onClick={async () => {
                      if (selectedAlias && !isLoading) {
                        try {
                          await fetchAliases();
                        } catch (error) {
                          logger.error('Error during manual refresh:', error);
                        }
                      }
                    }}
                    disabled={!selectedAlias || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw size={isMobile ? 18 : 22} />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh alias information</p>
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
                      selectedAlias ? "text-muted-foreground cursor-copy hover:text-primary" : "text-gray-500 cursor-not-allowed"
                    )}
                    onClick={() => selectedAlias && handleCopySummary()}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy alias information summary</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!selectedAlias}
                    className={cn(
                      "h-6 w-6 ml-1.5",
                      isMobile ? "h-5 w-5" : "",
                      !selectedAlias ? "opacity-50 cursor-not-allowed" : ""
                    )}
                    onClick={() => selectedAlias && setIsGraphModalOpen(true)}
                  >
                    <Activity size={isMobile ? 18 : 22} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View Group Assignment History Graph</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-6 w-6 ml-1.5", isMobile ? "h-5 w-5" : "")}
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
                  <p>{isCollapsed ? "Expand" : "Collapse"} alias information</p>
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
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className={cn("space-y-4", layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0" : "")}>
            <TooltipProvider>
              <div>
                <Label htmlFor="alias-select">Select a Network Alias</Label>
                <SearchableSelect
                  id="alias-select"
                  options={aliasOptions}
                  onValueChange={(value) => {
                    const found = aliases.find(a => a.uuid === value);
                    onSelectAlias(found || null);
                  }}
                  value={selectedAlias?.uuid || ''}
                  placeholder="Select a Network Alias"
                  emptyValueLabel="Select a Network Alias"
                  style={{ width: '100%' }}
                  className="w-full md:w-[600px]"
                  renderOption={(option) => renderAliasOption(option as AliasSelectOption)}
                  renderSelectedOption={(option) => renderSelectedAlias(option as AliasSelectOption)}
                  onRefresh={async () => {
                    try {
                      await fetchAliases();
                    } catch (error) {
                      logger.error('Error during searchable select refresh:', error);
                    }
                  }}
                  isRefreshLoading={isLoading}
                  enableVirtualScrolling={true}
                  initialLoadCount={100}
                  loadMoreCount={50}
                  searchDebounceMs={300}
                  onShowSearchHelp={() => (
                    <>
                      <p>Search terms:</p>
                      <ul className="list-disc list-inside">
                        <li><code className="font-mono">{'<Alias Name>'}</code>: e.g. lan_network</li>
                        <li><code className="font-mono">{'<Content>'}</code>: e.g. 192.168.1.0/24</li>
                        <li><code className="font-mono">{'<Group>'}</code>: Search by Group Name</li>
                        <li><code className="font-mono">disabled</code>: Disabled aliases</li>
                      </ul>
                    </>
                  )}
                />
              </div>

              <div className={cn("space-y-2", layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0" : "")}>
                {!selectedAlias ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-muted-foreground space-y-2 animate-in fade-in duration-500">
                    <Waypoints className="w-12 h-12 animate-bounce opacity-50" />
                    <p className="text-lg font-medium">Select an alias to view details</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      <strong className={cn(isMobile ? "text-sm" : "")}>Alias Name:</strong>
                      <span
                        className={cn(
                          "font-mono rounded-md inline-block transition-colors bg-primary text-primary-foreground hover:bg-primary/90 cursor-copy px-2.5 py-0.5",
                          isMobile ? "text-sm" : "text-base"
                        )}
                        onClick={async () => {
                          if (selectedAlias?.name) {
                            const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                            const success = await safeClipboardCopy(selectedAlias.name);
                            if (success) {
                              toast({ title: "Copied!", description: "Alias name copied to clipboard.", variant: "success" });
                            } else {
                              toast({ title: "Copy Failed", description: getClipboardErrorDescription(), variant: "destructive" });
                            }
                          }
                        }}
                        title="Click to copy Alias Name"
                      >
                        {selectedAlias.name}
                      </span>
                      {selectedAlias && (
                        <Badge className={cn("ml-1.5 px-1.5 py-0.5 text-white", isMobile ? "text-[0.7rem]" : "text-xs",
                          selectedAlias.enabled !== '1' ? "bg-gray-400 hover:bg-gray-400" : "bg-green-500 hover:bg-green-500"
                        )}>
                          {selectedAlias.enabled !== '1' ? "Disabled" : "Enabled"}
                        </Badge>
                      )}
                    </div>
                    {!isCollapsed && (
                      <>
                        <div className="flex items-center gap-1">
                          <strong className={cn(isMobile ? "text-sm" : "")}>Content:</strong>
                          <span
                            className={cn(
                              "font-mono rounded-md inline-block bg-primary text-primary-foreground hover:bg-primary/90 cursor-copy transition-colors px-2.5 py-0.5",
                              isMobile ? "text-sm" : "text-base"
                            )}
                            onClick={async () => {
                              if (selectedAlias?.content) {
                                const { safeClipboardCopy, getClipboardErrorDescription } = await import('@/lib/clipboard-utils');
                                const success = await safeClipboardCopy(selectedAlias.content);
                                if (success) {
                                  toast({ title: "Copied!", description: "Content copied to clipboard.", variant: "success" });
                                } else {
                                  toast({ title: "Copy Failed", description: getClipboardErrorDescription(), variant: "destructive" });
                                }
                              }
                            }}
                            title="Click to copy Content"
                          >
                            {selectedAlias.content || 'N/A'}
                          </span>
                        </div>
                        {selectedAlias.description && (
                          <div className="flex items-start gap-1">
                            <strong className={cn(isMobile ? "text-sm" : "", "shrink-0")}>Description:</strong>
                            <span className={cn("text-muted-foreground", isMobile ? "text-sm" : "")}>{selectedAlias.description}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 flex-wrap">
                          <strong className={cn(isMobile ? "text-sm" : "")}>Groups:</strong>
                          {renderGroupsDisplay()}
                        </div>
                      </>
                    )}

                    {layoutMode === 'side-by-side' && selectedAlias && (
                      <div className={cn("mt-3 pt-3 border-t border-gray-200 dark:border-gray-700", layoutMode === 'side-by-side' ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "")}>
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
                                {(selectedAlias.description || extendedDetails?.lastAssignment) && (
                                  <>
                                    {selectedAlias.description && (
                                      <div className="flex items-start gap-1 flex-wrap">
                                        <strong className={cn(isMobile ? "text-sm" : "")}>Description:</strong>
                                        <span className={cn("text-muted-foreground", isMobile ? "text-sm" : "")}>
                                          {selectedAlias.description}
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

                                <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
                                  </>
                                )}
                                <div className="mt-4">
                                  <div className="h-[250px] w-full">
                                    <DeviceGroupHistoryGraph
                                      ref={graphRefCard}
                                      networkAliasUuid={selectedAlias.uuid}
                                      networkAliasName={selectedAlias.name}
                                      currentGroups={currentGroupsForGraph}
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

      {selectedAlias && (
        <Dialog open={isGraphModalOpen} onOpenChange={setIsGraphModalOpen}>
          <DialogContent className="max-w-4xl w-[90vw]">
            <DialogHeader>
              <DialogTitle className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                <span>Group Assignment History</span>
                <span className="hidden md:inline">&nbsp;-&nbsp;</span>
                <span className="text-sm md:text-lg font-normal md:font-semibold text-muted-foreground md:text-foreground">
                  Network Alias: {selectedAlias.name}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="h-[350px] w-full mt-2">
              <DeviceGroupHistoryGraph
                ref={graphRefModal}
                networkAliasUuid={selectedAlias.uuid}
                networkAliasName={selectedAlias.name}
                currentGroups={currentGroupsForGraph}
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

NetworkAliasManagementCard.displayName = 'NetworkAliasManagementCard';

export default NetworkAliasManagementCard;
