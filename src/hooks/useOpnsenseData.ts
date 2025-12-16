'use client';

/* eslint-disable security/detect-object-injection */
// This hook uses bracket notation with typed keys from API responses. All uses are safe.
import { useEffect, useState, useCallback, useRef } from 'react';
import type { NetworkGroup, VpnMapping, FilteredAliasesResponse } from '@/types/opnsense';

import type { OpnsenseGroupDisplay, GroupFilter } from '@/types/settings';
import { useToast } from '@/hooks/use-toast';
import type { GroupSpecificFilterSetting, GloballyDisabledGroup } from '@prisma/client';
import { filterNetworkGroups } from '@/lib/group-filter-utils';
import { useSession } from 'next-auth/react';
import { logger } from '@/lib/logger';
import type { User as AppUserType } from '@/types/opnsense';

// VPN data cache duration in milliseconds (15 seconds)
const VPN_CACHE_DURATION = 15 * 1000;



// Helper for deep comparison of Arrays (shallow comparison of elements)
function areArraysEqual<T>(arr1: T[], arr2: T[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }

  // If elements are primitive, do a simple comparison
  if (arr1.length > 0 && (typeof arr1[0] !== 'object' || arr1[0] === null)) {
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) {
        return false;
      }
    }
    return true;
  }

  // If elements are objects, sort them by a stable key and then stringify for comparison
  const sortedArr1 = [...arr1].sort((a, b) => {
    const keyA = (a as Record<string, unknown>).uuid || (a as Record<string, unknown>).id || JSON.stringify(a);
    const keyB = (b as Record<string, unknown>).uuid || (b as Record<string, unknown>).id || JSON.stringify(b);
    return String(keyA).localeCompare(String(keyB));
  });
  const sortedArr2 = [...arr2].sort((a, b) => {
    const keyA = (a as Record<string, unknown>).uuid || (a as Record<string, unknown>).id || JSON.stringify(a);
    const keyB = (b as Record<string, unknown>).uuid || (b as Record<string, unknown>).id || JSON.stringify(b);
    return String(keyA).localeCompare(String(keyB));
  });

  for (let i = 0; i < sortedArr1.length; i++) {
    if (JSON.stringify(sortedArr1[i]) !== JSON.stringify(sortedArr2[i])) {
      return false;
    }
  }
  return true;
}

export function useOpnsenseData(shouldFetch: boolean, context: 'admin' | 'user' | 'public') {
  const [groups, setGroups] = useState<NetworkGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [opnsenseGroupDisplays, setOpnsenseGroupDisplays] = useState<OpnsenseGroupDisplay[]>([]);
  const [vpnMappings] = useState<VpnMapping[]>([]); // New state for VPN mappings
  const [isLoadingMappings, setIsLoadingMappings] = useState(true);
  const [vpnConnectionStatuses, setVpnConnectionStatuses] = useState<Map<string, { status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string }>>(new Map());
  const [isLoadingVpnStatuses, setIsLoadingVpnStatuses] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false); // Add state for in-place refresh
  const [groupVpnMap, setGroupVpnMap] = useState<Map<string, string>>(new Map());
  const [allEmojiValues, setAllEmojiValues] = useState<string[]>([]);
  const [allFlagValues, setAllFlagValues] = useState<string[]>([]);
  const [showConnectionErrorModal, setShowConnectionErrorModal] = useState(false);
  const [isIpNotAllowed, setIsIpNotAllowed] = useState(false);
  const { toast } = useToast();

  // Use refs to access current state values without causing re-renders
  const groupsRef = useRef(groups);
  const opnsenseGroupDisplaysRef = useRef(opnsenseGroupDisplays);
  const vpnMappingsRef = useRef(vpnMappings);
  const vpnConnectionStatusesRef = useRef(vpnConnectionStatuses);
  const groupVpnMapRef = useRef(groupVpnMap);
  const allEmojiValuesRef = useRef(allEmojiValues);
  const allFlagValuesRef = useRef(allFlagValues);

  // Update refs when state changes
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  useEffect(() => {
    opnsenseGroupDisplaysRef.current = opnsenseGroupDisplays;
  }, [opnsenseGroupDisplays]);
  useEffect(() => {
    vpnMappingsRef.current = vpnMappings;
  }, [vpnMappings]);
  useEffect(() => {
    vpnConnectionStatusesRef.current = vpnConnectionStatuses;
  }, [vpnConnectionStatuses]);
  useEffect(() => {
    groupVpnMapRef.current = groupVpnMap;
  }, [groupVpnMap]);
  useEffect(() => {
    allEmojiValuesRef.current = allEmojiValues;
  }, [allEmojiValues]);
  useEffect(() => {
    allFlagValuesRef.current = allFlagValues;
  }, [allFlagValues]);

  const { data: session } = useSession();
  logger.debug("useOpnsenseData: session user groups after useSession:", session?.user?.groups?.length);

  // Ref to hold the fetchVpnData function
  const fetchVpnDataRef = useRef<((inPlace?: boolean, forceRefresh?: boolean) => Promise<void>) | null>(null);

  interface VpnStatusApiResponse {
    vpnStatuses: Array<{
      id: string;
      status: 'connected' | 'disconnected' | 'disabled';
      enabled: string;
      opnsenseNetworkGroupId?: string;
      type?: string;
      vpnName?: string;
      friendlyName?: string;
      details?: { type: string };
    }>;
    groupVpnMap: Record<string, string>;
    totalCount: number;
    summary: {
      connected: number;
      disconnected: number;
      disabled: number;
    };
  }

  interface VpnDataCache {
    data: VpnStatusApiResponse;
    timestamp: number;
    context: string;
  }

  // Cache for VPN data to prevent redundant API calls
  const vpnDataCacheRef = useRef<VpnDataCache | null>(null);

  // fetchVpnData function to be made public with caching support
  const fetchVpnData = useCallback(async (inPlace: boolean = false, forceRefresh: boolean = false) => {
    logger.info(`fetchVpnData called (inPlace: ${inPlace}, forceRefresh: ${forceRefresh})`);

    // Check cache first if not forcing refresh
    if (!forceRefresh && vpnDataCacheRef.current) {
      const cache = vpnDataCacheRef.current;
      const now = Date.now();
      const isValidCache = (now - cache.timestamp) < VPN_CACHE_DURATION && cache.context === context;

      if (isValidCache) {
        logger.info('Using cached VPN data');
        // Use cached data
        const fetchedVpnStatuses = new Map(cache.data.vpnStatuses.map(vpn => [
          vpn.id,
          { status: vpn.status, type: (vpn.details?.type as string) || (vpn.type as string) || 'unknown', enabled: vpn.enabled }
        ]));
        const fetchedGroupVpnMap = new Map(Object.entries(cache.data.groupVpnMap));

        setVpnConnectionStatuses(fetchedVpnStatuses);
        setGroupVpnMap(fetchedGroupVpnMap);

        logger.info('VPN status loaded from cache successfully.');
        return;
      } else {
        logger.info('Cache expired or context mismatch, fetching fresh data');
      }
    }

    if (!inPlace) {
      setIsLoadingVpnStatuses(true);
    }
    try {
      // Use the main VPN endpoint which is now context-aware
      // Returns appropriate data based on authentication status
      const vpnEndpoint = '/api/vpn/status';

      const response = await fetch(vpnEndpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const errorData = await response.json();

          // Handle IP validation errors gracefully (403 Forbidden for self-service)
          if (response.status === 403 && errorData.error &&
            (errorData.error.includes('allowed networks') ||
              errorData.error.includes('only operate on their own IP'))) {
            logger.info('IP access restricted for VPN status self-service, clearing VPN data');
            setVpnConnectionStatuses(new Map()); // Clear VPN statuses
            setGroupVpnMap(new Map()); // Clear map
            return; // Don't throw error, just return
          }

          // Authentication or authorization error, handled by auth-middleware in route.ts
          logger.warn(`Failed to fetch VPN status: ${response.statusText}`);
          throw new Error(`Failed to fetch VPN status: ${response.statusText}`);
        } else {
          const errorData = await response.json();
          logger.error(`Failed to fetch VPN status: ${errorData.error || response.statusText}`);
          throw new Error(errorData.error || 'Failed to fetch VPN status');
        }
      }
      const vpnData: VpnStatusApiResponse = await response.json();

      // Ensure vpnData and its properties are valid
      if (!vpnData || !vpnData.vpnStatuses || !vpnData.groupVpnMap) {
        logger.error('Invalid VPN data structure received', vpnData);
        throw new Error('Invalid VPN data structure received');
      }

      const fetchedVpnStatuses = new Map(vpnData.vpnStatuses.map(vpn => [
        vpn.id,
        { status: vpn.status, type: (vpn.details?.type as string) || (vpn.type as string) || 'unknown', enabled: vpn.enabled }
      ]));
      const fetchedGroupVpnMap = new Map(Object.entries(vpnData.groupVpnMap));

      setVpnConnectionStatuses(fetchedVpnStatuses);
      setGroupVpnMap(fetchedGroupVpnMap);

      // Cache the successful response
      vpnDataCacheRef.current = {
        data: vpnData,
        timestamp: Date.now(),
        context: context
      };

      logger.info('VPN status fetched and cached successfully.');

    } catch (error) {
      logger.error('Error fetching VPN status:', error);
      // Clear cache on error to prevent serving stale data
      vpnDataCacheRef.current = null;
      // Consider how to handle errors gracefully in the UI, e.g., show a message
      setVpnConnectionStatuses(new Map()); // Clear statuses on error
      setGroupVpnMap(new Map()); // Clear map on error
    } finally {
      if (!inPlace) {
        setIsLoadingVpnStatuses(false);
      }
    }
  }, [context]);

  // This useEffect ensures fetchVpnDataRef is always up-to-date
  useEffect(() => {
    fetchVpnDataRef.current = fetchVpnData;
  }, [fetchVpnData]);

  // Clear VPN cache when context changes
  useEffect(() => {
    if (vpnDataCacheRef.current && vpnDataCacheRef.current.context !== context) {
      logger.info(`Context changed from ${vpnDataCacheRef.current.context} to ${context}, clearing VPN cache`);
      vpnDataCacheRef.current = null;
    }
  }, [context]);

  const fetchGroupsAndMappings = useCallback(async (inPlace: boolean = false) => {
    if (!shouldFetch) {
      logger.debug("fetchGroupsAndMappings: shouldFetch is false, skipping fetch.");
      setIsLoadingGroups(false); // Ensure loading state is false if not fetching
      setIsLoadingMappings(false); // Ensure loading state is false if not fetching
      return;
    }

    if (!inPlace) {
      setIsLoadingGroups(true);
    }
    try {
      // Determine which API endpoint to call based on context
      // The network-groups endpoint handles both authenticated and unauthenticated access
      // returning appropriate data based on authentication status (same as original behavior)
      const aliasesApiEndpoint = '/api/opnsense/network-groups';

      // Fetch global filters (requires authentication for admin contexts only)
      let globalFilters: GroupFilter[] = [];
      if (context === 'admin') {
        // For admin context, we need authentication and admin privileges
        const globalFiltersResponse = await fetch('/api/settings/group-filters', {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!globalFiltersResponse.ok) {
          const errorData = await globalFiltersResponse.json();
          throw new Error(errorData.error || `Failed to fetch global filters: ${globalFiltersResponse.statusText}`);
        }
        globalFilters = await globalFiltersResponse.json();
      } else {
        // For user/public contexts, we'll use empty filters
        // This maintains backward compatibility and proper access control
        globalFilters = [];
      }

      // Fetch OPNsense groups (aliases)
      const opnsenseGroupsResponse = await fetch(aliasesApiEndpoint);
      if (!opnsenseGroupsResponse.ok) {
        const errorData = await opnsenseGroupsResponse.json();

        // Handle IP validation errors gracefully (403 Forbidden for self-service)
        if (opnsenseGroupsResponse.status === 403 && errorData.error &&
          (errorData.error.includes('allowed networks') ||
            errorData.error.includes('only operate on their own IP'))) {
          logger.info('IP access restricted for self-service, setting appropriate state');
          setIsIpNotAllowed(true);
          setGroups([]); // Clear groups
          return; // Don't throw error, just return
        }

        throw new Error(errorData.error || `Failed to fetch OPNsense groups: ${opnsenseGroupsResponse.statusText}`);
      }

      // Since we're using network-groups endpoints, we always get the FilteredAliasesResponse structure
      const data: FilteredAliasesResponse = await opnsenseGroupsResponse.json();
      const fetchedGroups: NetworkGroup[] = data.networkGroups;

      // Reset IP not allowed state on successful fetch
      setIsIpNotAllowed(false);

      if (!areArraysEqual(allEmojiValuesRef.current, data.allEmojiValues)) {
        setAllEmojiValues(data.allEmojiValues);
      }
      if (!areArraysEqual(allFlagValuesRef.current, data.allFlagValues)) {
        setAllFlagValues(data.allFlagValues);
      }

      // Get user-specific filters for user context
      let userSpecificFilters: GroupSpecificFilterSetting[] | null = null;
      let userForFiltering: AppUserType | null = null;
      if (context === 'user') {
        try {
          const userFiltersResponse = await fetch('/api/user/group-filters');
          if (userFiltersResponse.ok) {
            const userFiltersData = await userFiltersResponse.json();
            userSpecificFilters = userFiltersData.filters || null;
            userForFiltering = userFiltersData.user || null;
          }
        } catch (error) {
          logger.warn("Failed to fetch user-specific filters, proceeding with global filters only:", error);
        }
      }

      // Get globally disabled groups for admin context
      let globallyDisabledGroups: GloballyDisabledGroup[] = [];
      if (context === 'admin') {
        const globallyDisabledGroupsResponse = await fetch('/api/settings/opnsense-group-display');
        if (!globallyDisabledGroupsResponse.ok) {
          const errorData = await globallyDisabledGroupsResponse.json();
          logger.error('Failed to fetch globally disabled groups for admin context:', errorData);
        } else {
          const fetchedOpnsenseGroupDisplays: OpnsenseGroupDisplay[] = await globallyDisabledGroupsResponse.json();
          globallyDisabledGroups = fetchedOpnsenseGroupDisplays
            .filter(d => d.isGloballyDisabled)
            .map(d => ({ id: d.id, opnsenseUuid: d.opnsenseUuid, createdAt: new Date(), updatedAt: new Date() }));
        }
      }

      // Filter groups based on global, globally disabled, and user-specific filters
      const processedGroups = await filterNetworkGroups(
        fetchedGroups,
        globalFilters,
        globallyDisabledGroups,
        userForFiltering,
        userSpecificFilters
      );
      // Only update groups if the content has actually changed
      if (!areArraysEqual(groupsRef.current, processedGroups)) {
        setGroups(processedGroups);
      }
      setShowConnectionErrorModal(false);

      // Populate opnsenseGroupDisplays based on context
      if (context === 'user' || context === 'public') {
        // For user/public contexts, opnsenseGroupDisplays are derived from the fetchedGroups
        const mappedDisplays: OpnsenseGroupDisplay[] = processedGroups.map(group => ({
          id: group.uuid,
          opnsenseUuid: group.uuid,
          friendlyName: group.friendlyName || group.name,
          icon: group.iconIdentifier || null,
          emoji: null, // Not available from NetworkGroup
          flag: null, // Not available from NetworkGroup
          isGloballyDisabled: false, // This is handled by filterNetworkGroups, not directly from alias
          createdAt: new Date(), // Placeholder
          updatedAt: new Date(), // Placeholder
        }));
        // Only update if the content has actually changed
        if (!areArraysEqual(opnsenseGroupDisplaysRef.current, mappedDisplays)) {
          setOpnsenseGroupDisplays(mappedDisplays);
        }
        setIsLoadingMappings(false); // Mappings are now loaded from aliases
      } else if (context === 'admin') {
        // For admin context, fetch group mappings from the dedicated endpoint
        setIsLoadingMappings(true);
        try {
          const response = await fetch('/api/settings/opnsense-group-display');
          if (!response.ok) {
            let errorMsg = `Failed to fetch group mappings. Status: ${response.status}`;
            try {
              const contentType = response.headers.get("content-type");
              if (contentType && contentType.indexOf("application/json") !== -1) {
                const errorData = await response.json();
                errorMsg = errorData.error || errorData.message || errorMsg;
              } else {
                errorMsg = await response.text() || errorMsg;
              }
            } catch {
              errorMsg = response.statusText || errorMsg;
            }
            throw new Error(errorMsg);
          }
          const fetchedMappings: OpnsenseGroupDisplay[] = await response.json();
          // Only update if the content has actually changed
          if (!areArraysEqual(opnsenseGroupDisplaysRef.current, fetchedMappings)) {
            setOpnsenseGroupDisplays(fetchedMappings);
          }
        } catch (error) {
          logger.error("Failed to load group mappings from API", error);
          const msg = error instanceof Error ? error.message : "Could not load group mappings from the server.";
          toast({
            title: "Error Loading Group Mappings",
            description: msg,
            variant: "destructive",
          });
          setOpnsenseGroupDisplays([]); // Clear mappings on error
        } finally {
          setIsLoadingMappings(false);
        }
      }
    } catch (error) {
      logger.error("Failed to fetch and filter groups:", error);
      const errorMsg = error instanceof Error ? error.message : "Could not load network groups.";
      toast({
        variant: "destructive",
        title: "Error Loading Groups",
        description: errorMsg,
      });
      setGroups([]);
      setShowConnectionErrorModal(true);
    } finally {
      if (!inPlace) {
        setIsLoadingGroups(false);
      }
    }
  }, [shouldFetch, context, toast]);

  // New function for in-place group refresh that doesn't trigger loading states
  const refreshGroupsInPlace = useCallback(async () => {
    if (!shouldFetch) {
      logger.debug("refreshGroupsInPlace: shouldFetch is false, skipping fetch.");
      return;
    }

    setIsRefreshing(true); // Set refreshing state for in-place refresh
    try {
      // Call fetchGroupsAndMappings with inPlace=true to avoid loading states
      await fetchGroupsAndMappings(true);
    } catch (error) {
      logger.error("Failed to refresh groups in-place:", error);
      // Don't show toast for in-place refresh to avoid interrupting user experience
    } finally {
      setIsRefreshing(false); // Clear refreshing state
    }
  }, [shouldFetch, fetchGroupsAndMappings]);

  // Combined refresh function for all data (groups, mappings, VPN data)
  const refreshOpnsenseData = useCallback(async (inPlace: boolean = false) => {
    logger.debug("refreshOpnsenseData: Initiating full data refresh.");

    if (inPlace) {
      setIsRefreshing(true); // Set refreshing state for in-place refresh
    }

    try {
      // Load VPN data first to ensure it's available when groups are rendered
      await fetchVpnData(inPlace); // Load VPN data first
      await fetchGroupsAndMappings(inPlace); // Then load groups and mappings
    } finally {
      if (inPlace) {
        setIsRefreshing(false); // Clear refreshing state
      }
    }
  }, [fetchGroupsAndMappings, fetchVpnData]);

  // Initial data fetch
  useEffect(() => {
    if (shouldFetch) {
      refreshOpnsenseData(); // Now call without arguments, as it's optional
    }
  }, [shouldFetch, refreshOpnsenseData]);

  return {
    groups,
    isLoadingGroups,
    opnsenseGroupDisplays,
    vpnMappings,
    isLoadingMappings,
    vpnConnectionStatuses,
    isLoadingVpnStatuses,
    groupVpnMap,
    allEmojiValues,
    allFlagValues,
    showConnectionErrorModal,
    setShowConnectionErrorModal,
    isIpNotAllowed, // Add IP not allowed state
    isRefreshing, // Add isRefreshing state
    refreshData: refreshOpnsenseData, // Full refresh including VPN
    refreshGroupsInPlace, // In-place group refresh
    refreshVpnData: fetchVpnData, // Export fetchVpnData for external use
    refreshVpnStatuses: (inPlace?: boolean, forceRefresh?: boolean) => fetchVpnData(inPlace, forceRefresh), // Alias for refreshVpnStatuses with forceRefresh support
  };
}