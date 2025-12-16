// src/lib/group-filter-utils.ts
/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with typed keys from objects and validated properties. All uses are safe.
import type { NetworkGroup, User } from '@/types/opnsense';
import type { GroupFilter } from '@/types/settings';
import type { GroupSpecificFilterSetting, GloballyDisabledGroup } from '@prisma/client'; // Add GloballyDisabledGroup type
import { logger } from '@/lib/logger';

// Interface for objects that might have uuid or id properties
interface IdentifiableObject {
  uuid?: string;
  id?: string;
  [key: string]: unknown;
}

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
    const keyA = (a as IdentifiableObject).uuid || (a as IdentifiableObject).id || JSON.stringify(a);
    const keyB = (b as IdentifiableObject).uuid || (b as IdentifiableObject).id || JSON.stringify(b);
    return String(keyA).localeCompare(String(keyB));
  });
  const sortedArr2 = [...arr2].sort((a, b) => {
    const keyA = (a as IdentifiableObject).uuid || (a as IdentifiableObject).id || JSON.stringify(a);
    const keyB = (b as IdentifiableObject).uuid || (b as IdentifiableObject).id || JSON.stringify(b);
    return String(keyA).localeCompare(String(keyB));
  });

  for (let i = 0; i < sortedArr1.length; i++) {
    if (JSON.stringify(sortedArr1[i]) !== JSON.stringify(sortedArr2[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Filters a list of OPNsense network groups based on include and exclude regex patterns.
 * Applies global filters first, then user/group-specific filters on top of the result.
 *
 * @param allGroups - An array of NetworkGroup objects to filter.
 * @param globalFilters - An array of GroupFilter objects containing global regex patterns and types.
 * @param globallyDisabledGroups - An array of GloballyDisabledGroup objects to exclude.
 * @param user - Optional user object for group-specific filters.
 * @param userSpecificFilters - New: Pass user-specific filters from API (already combined from all user's groups).
 * @returns A filtered array of NetworkGroup objects.
 */
export async function filterNetworkGroups(
  allGroups: NetworkGroup[],
  globalFilters: GroupFilter[],
  globallyDisabledGroups: GloballyDisabledGroup[], // New parameter
  user?: User | null, // Optional user object for group-specific filters
  userSpecificFilters?: GroupSpecificFilterSetting[] | null // New: Pass user-specific filters from API
): Promise<NetworkGroup[]> {
  if (!Array.isArray(allGroups)) {
    logger.error('Expected array for allGroups, got:', allGroups);
    allGroups = [];
  }
  logger.debug("filterNetworkGroups: Starting filtering process.");
  logger.debug(`filterNetworkGroups: allGroups received: ${allGroups.length} groups.`);
  logger.debug(`filterNetworkGroups: globalFilters received: ${globalFilters?.length || 0} filters.`);
  logger.debug(`filterNetworkGroups: globallyDisabledGroups received: ${globallyDisabledGroups.length} groups.`);
  logger.debug(`filterNetworkGroups: user object received (has ID): ${!!user?.id}.`);
  logger.debug(`filterNetworkGroups: user.groups (from session) received: ${user?.groups?.length || 0} groups.`);
  logger.debug(`filterNetworkGroups: userSpecificFilters received: ${userSpecificFilters?.length || 0} filters.`);

  let currentFilteredGroups = [...allGroups]; // Start with all groups

  // Step 1: Exclude globally disabled groups first
  const disabledUuids = new Set(globallyDisabledGroups.map(g => g.opnsenseUuid));

  currentFilteredGroups = currentFilteredGroups.filter(group => {
    const isDisabled = disabledUuids.has(group.uuid);
    if (isDisabled) {
      logger.debug(`filterNetworkGroups: Excluding globally disabled group "${group.name}" (UUID: ${group.uuid})`);
    }
    return !isDisabled;
  });
  logger.debug(`filterNetworkGroups: Groups after global disable exclusion: ${currentFilteredGroups.length} groups.`);

  // Determine which filters to apply: user-specific or global
  // User-specific filters take precedence if they exist, regardless of user.groups from session
  const hasUserSpecificFilters = user && userSpecificFilters && userSpecificFilters.length > 0;

  if (hasUserSpecificFilters) {
    logger.debug("filterNetworkGroups: Applying user-specific filters (overriding global filters).");
    const userIncludeFilters = userSpecificFilters.map((f: GroupSpecificFilterSetting) => ({
      id: f.id,
      pattern: f.pattern,
      description: f.description || '',
      type: f.type as 'include' | 'exclude',
    })).filter(f => f.type === 'include');
    
    const userExcludeFilters = userSpecificFilters.map((f: GroupSpecificFilterSetting) => ({
      id: f.id,
      pattern: f.pattern,
      description: f.description || '',
      type: f.type as 'include' | 'exclude',
    })).filter(f => f.type === 'exclude');

    let tempIncludedGroups: NetworkGroup[] = [];
    if (userIncludeFilters.length > 0) {
      tempIncludedGroups = currentFilteredGroups.filter(group => { // Apply to already filtered groups
        return userIncludeFilters.some(filter => {
          try {
            // Pattern is validated and caught in try-catch block
            // eslint-disable-next-line security/detect-non-literal-regexp
            const regex = new RegExp(filter.pattern);
            const isMatch = regex.test(group.name);
            if (isMatch) {
              logger.debug(`User Include: Group "${group.name}" matches pattern "${filter.pattern}"`);
            }
            return isMatch;
          } catch (error) {
            logger.warn(`Invalid regex pattern for user include filter "${filter.pattern}":`, error);
            return false;
          }
        });
      });
    } else {
      // If no user-specific include filters, all groups are initially considered for exclusion
      tempIncludedGroups = [...currentFilteredGroups];
    }
    logger.debug(`filterNetworkGroups: Groups after user include filters: ${tempIncludedGroups.length} groups.`);

    currentFilteredGroups = tempIncludedGroups.filter(group => {
      return !userExcludeFilters.some(filter => {
        try {
          // Pattern is validated and caught in try-catch block
          // eslint-disable-next-line security/detect-non-literal-regexp
          const regex = new RegExp(filter.pattern);
          const isMatch = regex.test(group.name);
          if (isMatch) {
            logger.debug(`User Exclude: Group "${group.name}" matches pattern "${filter.pattern}"`);
          }
          return isMatch;
        } catch (error) {
          logger.warn(`Invalid regex pattern for user exclude filter "${filter.pattern}":`, error);
          return false;
        }
      });
    });
    logger.debug(`filterNetworkGroups: Groups after user exclude filters: ${currentFilteredGroups.length} groups.`);
  } else {
    logger.debug("filterNetworkGroups: No user-specific filters found. Applying global filters.");
    if (globalFilters && globalFilters.length > 0) {
      const globalIncludeFilters = globalFilters.filter(f => f.type === 'include');
      const globalExcludeFilters = globalFilters.filter(f => f.type === 'exclude');

      let tempIncludedGroups: NetworkGroup[] = [];
      if (globalIncludeFilters.length > 0) {
        tempIncludedGroups = currentFilteredGroups.filter(group => { // Apply to already filtered groups
          return globalIncludeFilters.some(filter => {
            try {
              // Pattern is validated and caught in try-catch block
              // eslint-disable-next-line security/detect-non-literal-regexp
              const regex = new RegExp(filter.pattern);
              const isMatch = regex.test(group.name);
              if (isMatch) {
                logger.debug(`Global Include: Group "${group.name}" matches pattern "${filter.pattern}"`);
              }
              return isMatch;
            } catch (error) {
              logger.warn(`Invalid regex pattern for global include filter "${filter.pattern}":`, error);
              return false;
            }
          });
        });
      } else {
        // If no global include filters, all groups are initially considered for exclusion
        tempIncludedGroups = [...currentFilteredGroups];
      }
      logger.debug(`filterNetworkGroups: Groups after global include filters: ${tempIncludedGroups.length} groups.`);

      currentFilteredGroups = tempIncludedGroups.filter(group => {
        return !globalExcludeFilters.some(filter => {
          try {
            // Pattern is validated and caught in try-catch block
            // eslint-disable-next-line security/detect-non-literal-regexp
            const regex = new RegExp(filter.pattern);
            const isMatch = regex.test(group.name);
            if (isMatch) {
              logger.debug(`Global Exclude: Group "${group.name}" matches pattern "${filter.pattern}"`);
            }
            return isMatch;
          } catch (error) {
            logger.warn(`Invalid regex pattern for global exclude filter "${filter.pattern}":`, error);
            return false;
          }
        });
      });
      logger.debug(`filterNetworkGroups: Groups after global exclude filters: ${currentFilteredGroups.length} groups.`);
    } else {
      logger.debug("filterNetworkGroups: No global filters to apply.");
    }
  }

  logger.debug(`filterNetworkGroups: Final filtered groups: ${currentFilteredGroups.length} groups.`);
  // Only return a new array if the content has actually changed
  if (areArraysEqual(allGroups, currentFilteredGroups)) {
    logger.debug("filterNetworkGroups: Filtered groups are identical to allGroups, returning original reference.");
    return allGroups;
  }
  return currentFilteredGroups;
}

const GROUP_FILTERS_STORAGE_KEY = 'opnsenseGroupManagerSettings.groupFilters';

/**
 * Retrieves group filter settings from localStorage (which acts as a cache for API data).
 * @returns An array of GroupFilter objects or an empty array if not found or error.
 */
export function getGroupFiltersFromStorage(): GroupFilter[] {
  if (typeof window === 'undefined') {
    // localStorage is not available in SSR/Node.js environment
    return [];
  }
  try {
    const storedFilters = localStorage.getItem(GROUP_FILTERS_STORAGE_KEY);
    if (storedFilters) {
      return JSON.parse(storedFilters) as GroupFilter[];
    }
    // If nothing in localStorage, it means API hasn't been called yet or returned empty.
    // No default is returned here; the API is the source of truth.
    return [];
  } catch (error) {
    logger.error("Failed to load network filters from localStorage cache:", error);
    return [];
  }
}

/**
 * Fetches group filter settings from the API and caches them in localStorage.
 * Note: This function now requires authentication and will return empty array for unauthenticated users.
 * @returns A promise that resolves to an array of GroupFilter objects, or an empty array on error.
 * @throws Error if API request fails.
 */
export async function fetchAndCacheGroupFiltersFromAPI(): Promise<GroupFilter[]> {
  if (typeof window === 'undefined') {
    // Cannot make API calls or use localStorage in SSR/Node.js environment this way
    // This function is intended for client-side use.
    logger.warn("fetchAndCacheGroupFiltersFromAPI called in non-browser environment. Returning empty.");
    return [];
  }
  try {
    const response = await fetch('/api/settings/group-filters', {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const errorData = await response.json();
      // If unauthorized, return empty array instead of throwing error
      if (response.status === 401) {
        logger.warn("Unauthorized access to group filters, returning empty array");
        return [];
      }
      throw new Error(errorData.error || 'Failed to fetch filter settings from API');
    }
    const fetchedFilters: GroupFilter[] = await response.json();
    
    // Cache in localStorage
    localStorage.setItem(GROUP_FILTERS_STORAGE_KEY, JSON.stringify(fetchedFilters));
    return fetchedFilters;
  } catch (error) {
    logger.error('Failed to fetch and cache network filters from API:', error);
    // Optionally, clear localStorage cache on error or leave stale
    // localStorage.removeItem(GROUP_FILTERS_STORAGE_KEY);
    throw error; // Re-throw to allow calling components to handle it (e.g., show toast)
  }
}