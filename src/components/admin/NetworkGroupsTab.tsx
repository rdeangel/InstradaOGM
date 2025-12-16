'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { NetworkGroup } from '@/types/opnsense';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Network as NetworkIconLucide, Edit, XCircle, RefreshCcw, ShieldCheck, ShieldQuestion, Info } from 'lucide-react';
import * as LucideIcons from 'lucide-react'; // Added for accessing specific Lucide icons
import type { LucideIcon } from 'lucide-react';
import { useGroupType } from '@/context/GroupTypeContext';

import { SortableTable } from "@/components/ui/sortable-table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { flags, generalEmojis } from '@/components/ui/icon-picker';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClientOnly } from '@/components/util/ClientOnly';

import type { OpnsenseGroupDisplay } from '@/types/settings';
import { NetworkGroupMembersManager } from '@/components/admin/NetworkGroupMembersManager';

import { useIsMobile, useIsPhone } from '@/hooks/use-mobile'; // Corrected import to useIsMobile hook

import { cn } from '@/lib/utils'; // Added for potential utility classes

import { PaginationControls } from '@/components/ui/pagination-controls';

// Define the type for enriched network groups with VPN data
interface EnrichedNetworkGroup extends NetworkGroup {
  displayName: string; // Made displayName a required property
  vpnStatus?: 'connected' | 'disconnected' | 'disabled' | null;
  vpnName?: string | null; // This will be friendlyName or vpnName
  vpnUuid?: string | null; // This will be the VPN ID
  vpnType?: string | null;
  vpnEnabled?: string | null; // Added vpnEnabled
}

// Define props interface for the component
interface NetworkGroupsTabProps {
  initialGroups?: NetworkGroup[];
  initialOpnsenseGroupDisplays?: OpnsenseGroupDisplay[];
  initialVpnConnectionStatuses?: Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>; // Add enabled
  initialGroupVpnMap?: Map<string, string>;
  isLoadingInitialData?: boolean;

  isRefreshing?: boolean;
  onRefresh?: () => void;
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

export function NetworkGroupsTab({
  initialGroups = [],
  initialOpnsenseGroupDisplays = [],
  initialVpnConnectionStatuses = new Map(),
  initialGroupVpnMap = new Map(),
  isLoadingInitialData = false,
  isRefreshing = false,
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
  allEmojiValues = [],
  allFlagValues = [],
}: NetworkGroupsTabProps) {
  const { toast } = useToast();
  const { enableGroupTypes, singleSelectName, multiSelectName, singleSelectIcon, multiSelectIcon } = useGroupType();

  // Memoized emoji and flag values for icon rendering (including custom symbols)
  const memoizedAllGeneralEmojiValues = useMemo(() => new Set([...generalEmojis.map(e => e.value.normalize('NFC')), ...allEmojiValues.map(e => e.normalize('NFC'))]), [allEmojiValues]);
  const memoizedAllFlagValues = useMemo(() => new Set([...flags.map(f => f.value.normalize('NFC')), ...allFlagValues.map(f => f.normalize('NFC'))]), [allFlagValues]);

  // Icon rendering function similar to NetworkGroupsCard
  const getGroupIcon = useCallback((group: EnrichedNetworkGroup): React.ReactNode => {
    const mappedIconIdentifier = group.iconIdentifier;

    if (mappedIconIdentifier) {
      const normalizedIconIdentifier = mappedIconIdentifier.normalize('NFC');
      const isEmoji = memoizedAllGeneralEmojiValues.has(normalizedIconIdentifier);
      const isFlag = memoizedAllFlagValues.has(normalizedIconIdentifier);

      if (isEmoji || isFlag) {
        return <span className="text-lg mr-1.5">{mappedIconIdentifier}</span>;
      }

      const IconComponent = LucideIcons[mappedIconIdentifier as keyof typeof LucideIcons] as LucideIcon;
      if (IconComponent) {
        return <IconComponent size={16} className="mr-1.5 text-primary opacity-80" />;
      }
    }

    // Fallback icons based on group name
    if (group.name.toLowerCase().includes('high security')) return <ShieldCheck size={16} className="mr-1.5 text-primary opacity-80" />;
    if (group.name.toLowerCase().includes('vpn')) return <ShieldQuestion size={16} className="mr-1.5 text-primary opacity-80" />;
    return <NetworkIconLucide size={16} className="mr-1.5 text-primary opacity-80" />;
  }, [memoizedAllGeneralEmojiValues, memoizedAllFlagValues]);

  // Group type indicator function
  const getGroupTypeIndicator = useCallback((group: EnrichedNetworkGroup): React.ReactNode => {
    if (!enableGroupTypes) return null;

    const isMultiSelect = group.groupType === 'MultiSelect';

    if (isMultiSelect) {
      // MultiSelect indicator
      if (multiSelectIcon === 'CSS_DOTS') {
        return (
          <span className="inline-flex items-center mr-1.5" title={multiSelectName}>
            <span className="w-2 h-2 bg-blue-500 rounded-full mr-0.5"></span>
            <span className="w-2 h-2 bg-blue-500 rounded-full mr-0.5"></span>
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
          </span>
        );
      } else {
        const IconComponent = LucideIcons[multiSelectIcon as keyof typeof LucideIcons] as LucideIcon;
        if (IconComponent) {
          return (
            <span title={multiSelectName}>
              <IconComponent size={14} className="mr-1.5 text-blue-500" />
            </span>
          );
        }
      }
    } else {
      // SingleSelect indicator
      if (singleSelectIcon === 'CSS_DOT') {
        return (
          <span className="inline-flex items-center mr-1.5" title={singleSelectName}>
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
          </span>
        );
      } else {
        const IconComponent = LucideIcons[singleSelectIcon as keyof typeof LucideIcons] as LucideIcon;
        if (IconComponent) {
          return (
            <span title={singleSelectName}>
              <IconComponent size={14} className="mr-1.5 text-blue-500" />
            </span>
          );
        }
      }
    }

    // Fallback to CSS indicators
    return isMultiSelect ? (
      <span className="inline-flex items-center mr-1.5" title={multiSelectName}>
        <span className="w-2 h-2 bg-blue-500 rounded-full mr-0.5"></span>
        <span className="w-2 h-2 bg-blue-500 rounded-full mr-0.5"></span>
        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
      </span>
    ) : (
      <span className="inline-flex items-center mr-1.5" title={singleSelectName}>
        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
      </span>
    );
  }, [enableGroupTypes, multiSelectIcon, multiSelectName, singleSelectIcon, singleSelectName]);
  // State for managing the admin panel
  const [aliases, setAliases] = useState<NetworkGroup[]>(initialGroups);
  const [isLoadingData, setIsLoadingData] = useState(false); // Don't show skeleton loading initially if we have data
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false); // Track if initial data has been loaded
  const [isButtonRefreshing, setIsButtonRefreshing] = useState(false);

  // State for Network Display Mappings
  const [opnsenseGroupDisplays, setOpnsenseGroupDisplays] = useState<OpnsenseGroupDisplay[]>(initialOpnsenseGroupDisplays);
  const [isLoadingMappings, setIsLoadingMappings] = useState(false); // Don't show loading initially if we have data

  // State for VPN Data
  const [vpnConnectionStatuses, setVpnConnectionStatuses] = useState<Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string; vpnName?: string; friendlyName?: string; }>>(initialVpnConnectionStatuses);
  const [groupVpnMap, setGroupVpnMap] = useState<Map<string, string>>(initialGroupVpnMap);

  // Refs for latest VPN data
  const latestVpnConnectionStatuses = useRef(vpnConnectionStatuses);
  const latestGroupVpnMap = useRef(groupVpnMap);
  const [restartingVpnUuid, setRestartingVpnUuid] = useState<string | null>(null); // State for tracking VPN restart status

  // Update refs in useEffect hooks
  useEffect(() => {
    latestVpnConnectionStatuses.current = vpnConnectionStatuses;
  }, [vpnConnectionStatuses]);

  useEffect(() => {
    latestGroupVpnMap.current = groupVpnMap;
  }, [groupVpnMap]);

  // Update local state when initial props change
  useEffect(() => {
    setAliases(initialGroups);
  }, [initialGroups]);

  useEffect(() => {
    setOpnsenseGroupDisplays(initialOpnsenseGroupDisplays);
  }, [initialOpnsenseGroupDisplays]);

  useEffect(() => {
    setVpnConnectionStatuses(initialVpnConnectionStatuses);
  }, [initialVpnConnectionStatuses]);

  useEffect(() => {
    setGroupVpnMap(initialGroupVpnMap);
  }, [initialGroupVpnMap]);

  // Update loading states when parent loading states change
  useEffect(() => {
    setIsLoadingData(isLoadingInitialData);
    setIsLoadingMappings(isLoadingInitialData);
  }, [isLoadingInitialData]);

  // Track when initial data has been loaded
  useEffect(() => {
    if (!isLoadingInitialData && initialGroups.length > 0 && !hasInitialDataLoaded) {
      setHasInitialDataLoaded(true);
    }
  }, [isLoadingInitialData, initialGroups.length, hasInitialDataLoaded]);

  // Only fetch data if we don't have initial data or if initial data is loading
  useEffect(() => {
    // Since we're using parent data, we don't need to fetch data here
    // The parent component (admin page) handles all data fetching
    if (isLoadingInitialData) {
      setIsLoadingData(true);
      setIsLoadingMappings(true);
    } else {
      // If not loading, ensure we show data even if some parts are still loading
      // But keep loading state if VPN data is not yet available
      const hasVpnData = initialVpnConnectionStatuses.size > 0 || initialGroupVpnMap.size > 0;
      setIsLoadingData(false);
      setIsLoadingMappings(false);

      // If we have groups but no VPN data, we might still be loading VPN data
      if (initialGroups.length > 0 && !hasVpnData) {
        setIsLoadingData(true);
      }
    }
  }, [isLoadingInitialData, initialGroups.length, initialVpnConnectionStatuses.size, initialGroupVpnMap.size]);

  const handleOpenEditDialog = (aliasToEdit: NetworkGroup) => {
    setEditingAlias(aliasToEdit);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingAlias(null);
    // Trigger refresh when edit dialog closes after a successful save
    if (onRefresh) {
      onRefresh();
    }
  };

  // Function to enrich network groups with VPN info
  const enrichNetworkGroupsWithVpnInfo = useCallback((groups: NetworkGroup[]): EnrichedNetworkGroup[] => {
    return groups.map(group => {
      const mappedVpnUuid = latestGroupVpnMap.current.get(group.uuid);
      let vpnStatus: 'connected' | 'disconnected' | 'disabled' | null = null;
      let vpnName: string | null = null;
      let vpnUuid: string | null = null;
      let vpnType: string | null = null;
      let vpnEnabled: string | null = null;

      if (mappedVpnUuid) {
        vpnUuid = mappedVpnUuid;
        const vpnInfoFromStatus = latestVpnConnectionStatuses.current.get(mappedVpnUuid);

        if (vpnInfoFromStatus) {
          vpnStatus = vpnInfoFromStatus.status;
          vpnType = vpnInfoFromStatus.type;
          vpnEnabled = vpnInfoFromStatus.enabled || null;
        }

        // Find the display mapping for this group
        const displayMapping = opnsenseGroupDisplays.find(d => d.opnsenseUuid === group.uuid);
        vpnName = displayMapping?.friendlyName ?? group.name ?? 'Unknown VPN';
      }

      return {
        ...group,
        displayName: group.friendlyName || group.name,
        vpnStatus,
        vpnName,
        vpnUuid,
        vpnType,
        vpnEnabled,
      };
    });
  }, [opnsenseGroupDisplays]);

  // State for the Edit Alias Dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAlias, setEditingAlias] = useState<NetworkGroup | null>(null);

  // State for the Search Help Dialog
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);

  // networkGroupSearchTerm is now managed by parent component and passed as prop

  const isMobile = useIsMobile(); // Corrected hook usage
  const isPhone = useIsPhone();

  // Helper function to normalize VPN type display
  const getNormalizedVpnType = (vpnType: string | null): string => {
    if (!vpnType) return 'Unknown';

    const normalizedType = vpnType.toLowerCase();
    switch (normalizedType) {
      case 'openvpn':
        return 'OpenVPN';
      case 'wireguard':
        return 'WireGuard';
      case 'ipsec':
        return 'IPsec';
      default:
        return vpnType; // Return original if not recognized
    }
  };

  // Helper function to get VPN status display
  const getVpnStatusDisplay = (vpnStatus: string | null): string => {
    if (!vpnStatus) return 'Unknown';

    const normalizedStatus = vpnStatus.toLowerCase();
    switch (normalizedStatus) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'disabled':
        return 'Disabled';
      default:
        return vpnStatus; // Return original if not recognized
    }
  };

  // Memoized list of aliases to display, applying mapping, filtering, and VPN enrichment
  const displayedAliases = useMemo(() => {
    // Show data if we have aliases, even if some parts are still loading
    if (aliases.length === 0 && (isLoadingData || isLoadingMappings)) {
      return [];
    }

    // If we have groups but no VPN data yet, still show the groups
    // The VPN data will be enriched when it becomes available

    const opnsenseAliasesMap = new Map(aliases.map(alias => [alias.uuid, alias]));
    const mappedAliases = new Map(opnsenseGroupDisplays.map(mapping => [mapping.opnsenseUuid, mapping.friendlyName]));

    // First, apply display name mapping
    const aliasesWithDisplayNames: EnrichedNetworkGroup[] = aliases
      .filter(alias => {
        const mapping = mappedAliases.get(alias.uuid);
        if (mapping && !opnsenseAliasesMap.has(alias.uuid)) {
          return false;
        }
        return true;
      })
      .map(alias => {
        const friendlyName = mappedAliases.get(alias.uuid);
        return {
          ...alias,
          displayName: friendlyName || alias.name,
        } as EnrichedNetworkGroup; // Explicitly cast to EnrichedNetworkGroup
      });

    // Then, enrich with VPN data (this will work even if VPN data is still loading)
    const enrichedAliases = enrichNetworkGroupsWithVpnInfo(
      aliasesWithDisplayNames,
    );

    // Finally, apply search filter to the enriched aliases
    const filteredAliases = enrichedAliases.filter((alias: EnrichedNetworkGroup) => {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();

      if (searchTerm === "") return true;

      // Basic text searches
      const displayNameMatches = alias.displayName.toLowerCase().includes(lowerCaseSearchTerm);
      const opnsenseNameMatches = alias.name.toLowerCase().includes(lowerCaseSearchTerm);
      const descriptionMatches = alias.description && alias.description.toLowerCase().includes(lowerCaseSearchTerm);
      const rawContentMatches = alias.rawContent && alias.rawContent.toLowerCase().includes(lowerCaseSearchTerm);
      const memberMatches = alias.members.some(member => member.ipAddress.toLowerCase().includes(lowerCaseSearchTerm));

      // VPN-related searches
      const vpnNameMatches = alias.vpnName && alias.vpnName.toLowerCase().includes(lowerCaseSearchTerm);
      const vpnStatusMatches = alias.vpnStatus && alias.vpnStatus.toLowerCase().includes(lowerCaseSearchTerm);
      const vpnTypeMatches = alias.vpnType && alias.vpnType.toLowerCase().includes(lowerCaseSearchTerm);

      // Special keyword searches
      const vpnConnectedSearch = lowerCaseSearchTerm === 'vpn-connected' && alias.vpnStatus === 'connected';
      const vpnDisconnectedSearch = lowerCaseSearchTerm === 'vpn-disconnected' && alias.vpnStatus === 'disconnected';
      const vpnDisabledSearch = lowerCaseSearchTerm === 'vpn-disabled' && alias.vpnStatus === 'disabled';
      const enabledSearch = lowerCaseSearchTerm === 'enabled' && alias.enabled;
      const disabledSearch = lowerCaseSearchTerm === 'disabled' && !alias.enabled;
      const openvpnSearch = lowerCaseSearchTerm === 'openvpn' && alias.vpnType === 'openvpn';
      const wireguardSearch = lowerCaseSearchTerm === 'wireguard' && alias.vpnType === 'wireguard';
      const ipsecSearch = lowerCaseSearchTerm === 'ipsec' && alias.vpnType === 'ipsec';

      // Group type searches (if group types are enabled)
      const singleSelectSearch = enableGroupTypes && lowerCaseSearchTerm === 'singleselect' && alias.groupType === 'SingleSelect';
      const multiSelectSearch = enableGroupTypes && lowerCaseSearchTerm === 'multiselect' && alias.groupType === 'MultiSelect';

      return displayNameMatches ||
        opnsenseNameMatches ||
        descriptionMatches ||
        rawContentMatches ||
        memberMatches ||
        vpnNameMatches ||
        vpnStatusMatches ||
        vpnTypeMatches ||
        vpnConnectedSearch ||
        vpnDisconnectedSearch ||
        vpnDisabledSearch ||
        enabledSearch ||
        disabledSearch ||
        openvpnSearch ||
        wireguardSearch ||
        ipsecSearch ||
        singleSelectSearch ||
        multiSelectSearch;
    });

    return filteredAliases;
  }, [
    aliases,
    opnsenseGroupDisplays,
    searchTerm,
    isLoadingData,
    isLoadingMappings,
    enrichNetworkGroupsWithVpnInfo,
    enableGroupTypes
  ]);

  // Pagination logic
  const totalItems = displayedAliases.length;
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
    } else if (currentPage > totalPages && totalPages > 0 && totalItemsChanged) {
      // Only reset when current page exceeds total pages AND the data actually changed
      // This prevents resets during component remounting with the same data
      onPageChange(1);
    }
  }, [searchTerm, currentPage, totalPages, totalItems, onPageChange]);

  // Get paginated data
  const paginatedAliases = useMemo(() => {
    if (pageSize === 'ALL') {
      return displayedAliases;
    }

    if (isPhone) {
      return displayedAliases.slice(0, currentPage * (typeof pageSize === 'number' ? pageSize : 10000));
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return displayedAliases.slice(startIndex, endIndex);
  }, [displayedAliases, currentPage, pageSize, isPhone]);



  const handleUpdateNetworkGroup = useCallback(async (updatedGroup: NetworkGroup, migrationOccurred: boolean, affectedGroupIds?: string[]) => {
    // Always perform an in-place refresh of the edited group row
    // Additionally re-fetch VPN statuses to keep badges accurate
    const vpnStatusResponse = await fetch('/api/vpn/status');
    let newVpnStatusesMap = latestVpnConnectionStatuses.current; // Use current ref value as fallback
    let newGroupVpnMap = latestGroupVpnMap.current; // Use current ref value as fallback

    if (vpnStatusResponse.ok) {
      const vpnData = await vpnStatusResponse.json();
      const vpnStatusesArray = vpnData.vpnStatuses || [];
      const fetchedGroupVpnMapObject = vpnData.groupVpnMap;

      newVpnStatusesMap = new Map();
      vpnStatusesArray.forEach((vpn: { id: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string; vpnName?: string; friendlyName?: string; }) => {
        newVpnStatusesMap.set(vpn.id, { status: vpn.status, type: vpn.type, enabled: vpn.enabled, vpnName: vpn.vpnName, friendlyName: vpn.friendlyName });
      });

      newGroupVpnMap = new Map();
      if (fetchedGroupVpnMapObject) {
        Object.entries(fetchedGroupVpnMapObject).forEach(([groupId, vpnUuid]) => {
          newGroupVpnMap.set(groupId, vpnUuid as string);
        });
      }
    } else {
      toast({
        variant: "destructive",
        title: "Error Refreshing VPN Status",
        description: "Could not retrieve VPN connection statuses after group update.",
      });
    }

    // Update the state for VPN data
    setVpnConnectionStatuses(newVpnStatusesMap);
    setGroupVpnMap(newGroupVpnMap);

    // Now, enrich the updatedGroup with the latest VPN info
    // We need to ensure updatedGroup has displayName before enriching
    const mappedAliases = new Map(opnsenseGroupDisplays.map(mapping => [mapping.opnsenseUuid, mapping.friendlyName]));

    const friendlyName = mappedAliases.get(updatedGroup.uuid);
    const groupWithDisplayName: EnrichedNetworkGroup = {
      ...updatedGroup,
      displayName: friendlyName || updatedGroup.name,
    };

    const enrichedUpdatedGroup = enrichNetworkGroupsWithVpnInfo(
      [groupWithDisplayName], // Pass as an array to enrichNetworkGroupsWithVpnInfo
    )[0]; // Get the first element as it's a single group

    // Update the aliases state with the fully enriched group
    setAliases(prevAliases =>
      prevAliases.map(alias =>
        alias.uuid === enrichedUpdatedGroup.uuid ? enrichedUpdatedGroup : alias
      )
    );

    // If other group rows were affected (e.g., SingleSelect removals), refresh them in-place too
    if (affectedGroupIds && affectedGroupIds.length > 0) {
      try {
        // Fetch latest groups (in place) and merge updated rows only
        const resp = await fetch('/api/opnsense/network-groups', { cache: 'no-store' });
        if (resp.ok) {
          const data = await resp.json();
          const latestGroups: NetworkGroup[] = Array.isArray(data.networkGroups) ? data.networkGroups : [];
          setAliases(prevAliases => {
            const byId = new Map(latestGroups.map(g => [g.uuid, g]));
            // Enrich each affected row before replacing
            const mappedAliases = new Map(opnsenseGroupDisplays.map(mapping => [mapping.opnsenseUuid, mapping.friendlyName]));
            const replaceSet = new Set(affectedGroupIds);
            return prevAliases.map(alias => {
              if (replaceSet.has(alias.uuid)) {
                const latest = byId.get(alias.uuid);
                if (latest) {
                  const friendlyName = mappedAliases.get(latest.uuid);
                  const groupWithDisplayName: EnrichedNetworkGroup = {
                    ...latest,
                    displayName: friendlyName || latest.name,
                  };
                  const enriched = enrichNetworkGroupsWithVpnInfo([groupWithDisplayName])[0];
                  return enriched;
                }
              }
              return alias;
            });
          });
        }
      } catch (err) {
        console.warn('Failed in-place refresh of affected rows:', err);
      }
    } else if (migrationOccurred && (!affectedGroupIds || affectedGroupIds.length === 0)) {
      // Handle migration case where affectedGroupIds is undefined (group types disabled + migration)
      // In this case, we need to refresh all groups since we don't know which ones were affected
      try {
        const resp = await fetch('/api/opnsense/network-groups', { cache: 'no-store' });
        if (resp.ok) {
          const data = await resp.json();
          const latestGroups: NetworkGroup[] = Array.isArray(data.networkGroups) ? data.networkGroups : [];

          // Enrich all groups with display names and VPN info
          const mappedAliases = new Map(opnsenseGroupDisplays.map(mapping => [mapping.opnsenseUuid, mapping.friendlyName]));
          const enrichedGroups = latestGroups.map(group => {
            const friendlyName = mappedAliases.get(group.uuid);
            const groupWithDisplayName: EnrichedNetworkGroup = {
              ...group,
              displayName: friendlyName || group.name,
            };
            return enrichNetworkGroupsWithVpnInfo([groupWithDisplayName])[0];
          });

          setAliases(enrichedGroups);
        }
      } catch (err) {
        console.warn('Failed full refresh after migration:', err);
      }
    }
  }, [opnsenseGroupDisplays, enrichNetworkGroupsWithVpnInfo, toast]);



  // Handle VPN Restart
  const handleVpnRestart = useCallback(async (vpnUuid: string, vpnType: string) => {

    const isRestarting = restartingVpnUuid === vpnUuid;
    if (isRestarting) return;
    setRestartingVpnUuid(vpnUuid);

    try {
      // Convert lowercase type to proper VpnClientType
      const vpnClientType = vpnType === 'openvpn' ? 'OpenVPN' :
        vpnType === 'wireguard' ? 'WireGuard' :
          vpnType === 'ipsec' ? 'IPsec' :
            'OpenVPN';

      // Always use safe-restart endpoint for all users
      const response = await fetch('/api/vpn/safe-restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vpnUuid, vpnType: vpnClientType }),
      });
      const result = await response.json();

      if (response.ok && result.message === 'VPN restart initiated successfully') {
        toast({ title: "VPN restart initiated successfully", variant: "success" });

        // Wait for the restart process to complete (10 seconds)
        setTimeout(async () => {
          try {
            // Trigger full refresh when restart spinner stops to ensure refresh spinner appears
            if (onRefresh) {
              onRefresh();
            }
          } finally {
            setRestartingVpnUuid(null); // Reset the state after refresh completes
          }
        }, 10000); // Wait 10 seconds for restart to complete
      } else {
        toast({ variant: "destructive", title: "VPN Restart Failed", description: result.message || "Could not restart VPN." });
        setRestartingVpnUuid(null); // Reset the state on failure
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ variant: "destructive", title: "VPN Restart Error", description: errorMessage });
      setRestartingVpnUuid(null); // Reset the state on error
    }
  }, [toast, restartingVpnUuid, onRefresh]);

  // Remove local sortBy, sortDirection, handleSortChange

  return (
    <>


      <Card className="shadow-lg flex flex-col flex-1 mb-0 min-h-0">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4">
          <div>
            <CardTitle className={`flex items-center ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              <ClientOnly><NetworkIconLucide size={28} className="mr-2 text-primary" /></ClientOnly> Network Group Management
            </CardTitle>
            {!isMobile && <CardDescription>View and manage OPNsense network group membership.</CardDescription>}
          </div>
          <div className="flex w-full justify-end md:w-auto">
            <Button
              onClick={onRefresh}
              variant="outline"
              className={cn("mr-2", isMobile && "size-9 p-0")}
              disabled={isLoadingData || isLoadingMappings || isRefreshing}
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
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 relative flex-1 overflow-hidden flex flex-col">
          {(isLoadingData || isLoadingMappings) && !hasInitialDataLoaded ? ( // Only show skeletons on initial load
            <div className="space-y-2 mt-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {/* Search Input for Network Groups */}
              <div className="mb-4 relative max-w-sm">
                <Input
                  type="search"
                  placeholder="Search by name, description, VPN, or use keywords..."
                  value={searchTerm}
                  onChange={(e) => onSearchTermChange(e.target.value)}
                  className={searchTerm ? "pr-16" : "pr-10"}
                />
                <Dialog open={searchHelpOpen} onOpenChange={setSearchHelpOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "absolute top-1/2 transform -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-primary",
                        searchTerm ? "right-9" : "right-2"
                      )}
                      onClick={() => setSearchHelpOpen(true)}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Search Help</DialogTitle>
                      <DialogDescription>
                        Learn how to search for network groups using various keywords and filters.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-96 overflow-y-auto">
                      <div className="space-y-3">
                        <p className="font-medium">Search terms:</p>
                        <ul className="text-sm space-y-1">
                          <li><strong>Name:</strong> Display name or OPNsense name</li>
                          <li><strong>Description:</strong> Group description</li>
                          <li><strong>IP Address:</strong> Member IP addresses</li>
                          <li><strong>VPN Name:</strong> Associated VPN name</li>
                        </ul>

                        <p className="font-medium mt-4">Special keywords:</p>
                        <ul className="text-sm space-y-1">
                          <li><code className="font-mono bg-muted px-1 rounded">vpn-connected</code>: Groups with connected VPNs</li>
                          <li><code className="font-mono bg-muted px-1 rounded">vpn-disconnected</code>: Groups with disconnected VPNs</li>
                          <li><code className="font-mono bg-muted px-1 rounded">vpn-disabled</code>: Groups with disabled VPNs</li>
                          <li><code className="font-mono bg-muted px-1 rounded">enabled</code>: Enabled groups</li>
                          <li><code className="font-mono bg-muted px-1 rounded">disabled</code>: Disabled groups</li>
                          <li><code className="font-mono bg-muted px-1 rounded">openvpn</code>: OpenVPN groups</li>
                          <li><code className="font-mono bg-muted px-1 rounded">wireguard</code>: WireGuard groups</li>
                          <li><code className="font-mono bg-muted px-1 rounded">ipsec</code>: IPsec groups</li>
                          {enableGroupTypes && (
                            <>
                              <li><code className="font-mono bg-muted px-1 rounded">singleselect</code>: SingleSelect groups</li>
                              <li><code className="font-mono bg-muted px-1 rounded">multiselect</code>: MultiSelect groups</li>
                            </>
                          )}
                        </ul>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
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
                <ScrollArea className="flex-1 pr-4 -mr-4">
                  <div className="space-y-4">
                    {paginatedAliases.length === 0 ? (
                      <p className="text-center text-muted-foreground">No groups found.</p>
                    ) : (
                      paginatedAliases.map(alias => {
                        const isDisabled = !alias.enabled;
                        return (
                          <Card key={alias.uuid} className={isDisabled ? 'opacity-50' : ''}>
                            <CardHeader className="pb-2">
                              <CardTitle className={`text-lg ${isDisabled ? 'text-muted-foreground' : ''}`}>
                                {alias.displayName}
                              </CardTitle>
                              {alias.description && <CardDescription>{alias.description}</CardDescription>}
                              {enableGroupTypes && (
                                <CardDescription className="text-xs">
                                  Type: {alias.groupType === 'MultiSelect' ? multiSelectName : singleSelectName}
                                </CardDescription>
                              )}
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">OPNsense Name:</span>
                                <span className={isDisabled ? 'text-muted-foreground' : ''}>{alias.name}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">Enabled:</span>
                                <span className={isDisabled ? 'text-muted-foreground' : ''}>{alias.enabled ? 'Yes' : 'No'}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">Member Count:</span>
                                <span className={isDisabled ? 'text-muted-foreground' : ''}>{alias.itemCount ?? 'N/A'}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">Last Updated:</span>
                                <span className={isDisabled ? 'text-muted-foreground' : ''}>{alias.lastUpdated ? format(new Date(alias.lastUpdated), 'PPpp') : 'N/A'}</span>
                              </div>
                              {/* VPN Info for Mobile */}
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">VPN:</span>
                                <span>
                                  {(alias.vpnName || alias.vpnUuid) ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          {alias.vpnStatus === 'connected' ? (
                                            <span className={`flex items-center text-darker-green ${isDisabled ? 'opacity-50' : ''}`}>
                                              <LucideIcons.ShieldCheck className="h-4 w-4 mr-1" />
                                              {alias.vpnName || alias.vpnUuid}
                                            </span>
                                          ) : alias.vpnStatus === 'disconnected' && !isDisabled ? (
                                            <button
                                              onClick={() => alias.vpnUuid && alias.vpnType && handleVpnRestart(alias.vpnUuid, alias.vpnType)}
                                              disabled={(alias.vpnUuid === restartingVpnUuid) || (alias.vpnType === 'wireguard' && alias.vpnEnabled === '0') || isDisabled}
                                              className={cn(
                                                "p-0 m-0 bg-transparent hover:bg-transparent flex items-center",
                                                (alias.vpnType === 'wireguard' && alias.vpnEnabled === '0') ? "text-gray-400" : "text-red-500"
                                              )}
                                            >
                                              {alias.vpnUuid === restartingVpnUuid ? (
                                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                              ) : (
                                                <LucideIcons.ShieldX className="h-4 w-4 mr-1" />
                                              )}
                                              {alias.vpnName || alias.vpnUuid}
                                            </button>
                                          ) : (
                                            <span className={`text-muted-foreground flex items-center ${isDisabled ? 'opacity-50' : ''}`}>
                                              <LucideIcons.Shield className="h-4 w-4 mr-1" />
                                              {alias.vpnName || alias.vpnUuid}
                                            </span>
                                          )}
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Status: {getVpnStatusDisplay(alias.vpnStatus || null)}</p>
                                          <p>Type: {getNormalizedVpnType(alias.vpnType || null)}</p>
                                          {isDisabled && <p>Group is disabled in OPNsense.</p>}
                                          {alias.vpnType === 'wireguard' && alias.vpnEnabled === '0' && alias.vpnStatus === 'disconnected' && (
                                            <p>WireGuard is disabled and cannot be restarted.</p>
                                          )}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <span className={isDisabled ? 'text-muted-foreground' : ''}>-</span>
                                  )}
                                </span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEditDialog(alias)}
                                disabled={isDisabled}
                                className="w-full mt-2"
                              >
                                <ClientOnly><Edit className="h-3 w-3 mr-1" /></ClientOnly> Edit Members
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              ) : (
                // Desktop View: Render as Table
                <ScrollArea className="flex-1 pr-4 -mr-4">
                  <SortableTable<EnrichedNetworkGroup>
                    data={paginatedAliases}
                    columns={[
                      {
                        key: 'displayName',
                        label: 'Name',
                        sortable: true,
                        render: (alias) => {
                          const isDisabled = !alias.enabled;
                          const renderedIcon = getGroupIcon(alias);
                          return (
                            <div className={`flex items-center font-medium ${isDisabled ? 'text-muted-foreground opacity-50' : ''}`}>
                              <ClientOnly fallback={<Skeleton className="h-4 w-4 mr-1.5 rounded-full" />}>
                                {renderedIcon}
                              </ClientOnly>
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>{alias.displayName}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs text-muted-foreground">OPNsense Name: {alias.name}</p>
                                    {alias.description && <p className="mt-1">{alias.description}</p>}
                                    {enableGroupTypes && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Type: {alias.groupType === 'MultiSelect' ? multiSelectName : singleSelectName}
                                      </p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          );
                        },
                        compareFn: (a, b) => a.displayName.localeCompare(b.displayName)
                      },
                      {
                        key: 'itemCount',
                        label: 'Member Count',
                        sortable: true,
                        render: (alias) => {
                          const isDisabled = !alias.enabled;
                          return (
                            <span className={isDisabled ? 'text-muted-foreground opacity-50' : ''}>
                              {alias.itemCount ?? 'N/A'}
                            </span>
                          );
                        },
                        compareFn: (a, b) => (a.itemCount ?? 0) - (b.itemCount ?? 0)
                      },
                      {
                        key: 'enabled',
                        label: 'Enabled',
                        sortable: true,
                        headerClassName: "text-center",
                        render: (alias) => {
                          const isDisabled = !alias.enabled;
                          return (
                            <div className="flex justify-center">
                              <span className={isDisabled ? 'text-muted-foreground opacity-50' : ''}>
                                {alias.enabled ? 'Yes' : 'No'}
                              </span>
                            </div>
                          );
                        },
                        compareFn: (a, b) => (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0)
                      },
                      // Conditionally include Group Type column only when group types are enabled
                      ...(enableGroupTypes ? [{
                        key: 'groupType',
                        label: 'Group Type',
                        sortable: true,
                        headerClassName: "text-center",
                        render: (alias: EnrichedNetworkGroup) => {
                          const isDisabled = !alias.enabled;
                          const isMultiSelect = alias.groupType === 'MultiSelect';
                          const typeName = isMultiSelect ? multiSelectName : singleSelectName;
                          const typeIndicator = getGroupTypeIndicator(alias);

                          return (
                            <div className="flex justify-center items-center">
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={`flex items-center ${isDisabled ? 'opacity-50' : ''}`}>
                                      {typeIndicator}
                                      <span className="text-sm">{typeName}</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{isMultiSelect ? 'Devices can be in multiple MultiSelect groups' : 'Devices can only be in one SingleSelect group'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          );
                        },
                        compareFn: (a: EnrichedNetworkGroup, b: EnrichedNetworkGroup) => {
                          const aType = a.groupType === 'MultiSelect' ? 1 : 0;
                          const bType = b.groupType === 'MultiSelect' ? 1 : 0;
                          return aType - bType;
                        }
                      }] : []),
                      {
                        key: 'vpnName',
                        label: 'VPN',
                        sortable: true,
                        render: (alias: EnrichedNetworkGroup) => {
                          const isGroupDisabled = !alias.enabled;

                          if (!alias.vpnName) {
                            return (
                              <span className={isGroupDisabled ? 'text-muted-foreground opacity-50' : ''}>
                                -
                              </span>
                            );
                          }

                          const isDisconnected = alias.vpnStatus === 'disconnected';
                          const isConnected = alias.vpnStatus === 'connected';

                          const statusColorClass = isConnected ? 'text-darker-green' : isDisconnected ?
                            ((alias.vpnType === 'wireguard' && alias.vpnEnabled === '0') ? 'text-gray-400' : 'text-red-500') : 'text-gray-500';
                          const ShieldIcon = isConnected ? LucideIcons.ShieldCheck : isDisconnected ? LucideIcons.ShieldX : LucideIcons.Shield; // Use Shield for unknown status

                          const handleRestartClick = () => {
                            if (alias.vpnUuid && alias.vpnType) {
                              handleVpnRestart(alias.vpnUuid, alias.vpnType);
                            }
                          };

                          const isRestartDisabled = (alias.vpnUuid === restartingVpnUuid) || (alias.vpnType === 'wireguard' && alias.vpnEnabled === '0') || isGroupDisabled;

                          return (
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {isDisconnected && !isGroupDisabled ? (
                                    <button
                                      onClick={handleRestartClick}
                                      disabled={isRestartDisabled}
                                      className={cn(
                                        "flex items-center font-medium p-0 m-0 bg-transparent hover:bg-transparent",
                                        statusColorClass
                                      )}
                                    >
                                      {alias.vpnUuid === restartingVpnUuid ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      ) : (
                                        <ShieldIcon className="h-4 w-4 mr-1" />
                                      )}
                                      {alias.vpnName}
                                    </button>
                                  ) : (
                                    <span className={cn("flex items-center font-medium", statusColorClass, isGroupDisabled ? 'opacity-50' : '')}>
                                      <ShieldIcon className="h-4 w-4 mr-1" />
                                      {alias.vpnName}
                                    </span>
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Status: {getVpnStatusDisplay(alias.vpnStatus || null)}</p>
                                  <p>Type: {getNormalizedVpnType(alias.vpnType || null)}</p>
                                  {isGroupDisabled && <p>Group is disabled in OPNsense.</p>}
                                  {alias.vpnType === 'wireguard' && alias.vpnEnabled === '0' && isDisconnected && (
                                    <p>WireGuard is disabled and cannot be restarted.</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        },
                        compareFn: (a: EnrichedNetworkGroup, b: EnrichedNetworkGroup) => {
                          const nameA = a.vpnName || '';
                          const nameB = b.vpnName || '';
                          return nameA.localeCompare(nameB);
                        },
                      },
                      {
                        key: 'lastUpdated',
                        label: 'Last Updated',
                        sortable: true,
                        render: (alias) => {
                          const isDisabled = !alias.enabled;
                          return (
                            <span className={isDisabled ? 'text-muted-foreground opacity-50' : ''}>
                              {alias.lastUpdated ? format(new Date(alias.lastUpdated), 'PPpp') : 'N/A'}
                            </span>
                          );
                        },
                        compareFn: (a, b) => new Date(a.lastUpdated || '').getTime() - new Date(b.lastUpdated || '').getTime()
                      },
                      {
                        key: 'actions',
                        label: 'Actions',
                        render: (alias: EnrichedNetworkGroup) => {
                          const isDisabled = !alias.enabled;
                          return (
                            <div className="text-left space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEditDialog(alias)}
                                disabled={isDisabled}
                                className={isDisabled ? 'opacity-50' : ''}
                              >
                                <ClientOnly><Edit className="h-3 w-3 mr-1" /></ClientOnly> Edit Members
                              </Button>
                              {/* Removed Restart VPN Button as per requirement */}
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

              {/* Pagination Controls and Record Count */}
              {(isLoadingData || isLoadingMappings) && !hasInitialDataLoaded ? ( // Only show skeleton on initial load
                <div className="mt-4">
                  <Skeleton className="h-6 w-32" />
                </div>
              ) : (
                <div className="mt-4">
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
                    isLoading={isLoadingData || isLoadingMappings || isButtonRefreshing}
                    pageSizeOptions={[5, 10, 50, 100, 500]}
                    showAllOption={true}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Alias Dialog (Now specifically for Network Group Members) */}
      <NetworkGroupMembersManager
        isOpen={isEditDialogOpen}
        onClose={handleCloseEditDialog}
        editingAlias={editingAlias}
        opnsenseGroupDisplays={opnsenseGroupDisplays}
        onSaveSuccess={handleUpdateNetworkGroup} // Pass the granular update handler
        enableGroupTypes={enableGroupTypes}
        groupTypeName={editingAlias?.groupType === 'MultiSelect' ? multiSelectName : singleSelectName}
      />


    </>
  );
}
