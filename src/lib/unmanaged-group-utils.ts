import { filterNetworkGroups } from './group-filter-utils';
import { prisma } from './prisma';
import { logger } from './logger';
import type { NetworkGroup } from '@/types/opnsense';
import type { GroupFilter } from '@/types/settings';
import type { GloballyDisabledGroup, GroupSpecificFilterSetting } from '@prisma/client';
import type { User } from 'next-auth';

export interface UnmanagedGroupResult {
  isUnmanaged: boolean;
  unmanagedGroups: NetworkGroup[];
  reason: 'globally_disabled' | 'filtered_out' | 'none';
  message: string;
}

/**
 * Determines if a host is associated with unmanaged groups by checking if any of its groups
 * would be filtered out by the existing network group filtering logic.
 * 
 * This function leverages the existing filterNetworkGroups logic to determine what groups
 * are "managed" (allowed for self-service), then checks if the host has any groups that
 * are not in the managed set.
 * 
 * @param hostGroups - Array of NetworkGroup objects that the host is a member of
 * @param globalFilters - Array of global filter settings (include/exclude patterns)
 * @param globallyDisabledGroups - Array of globally disabled group records
 * @param user - Optional user object for user-specific filters
 * @param userSpecificFilters - Optional user-specific filter settings
 * @returns Promise<UnmanagedGroupResult> - Result indicating if host is unmanaged and why
 */
export async function isHostInUnmanagedGroups(
  hostGroups: NetworkGroup[],
  globalFilters: GroupFilter[],
  globallyDisabledGroups: GloballyDisabledGroup[],
  user?: User | null,
  userSpecificFilters?: GroupSpecificFilterSetting[] | null
): Promise<UnmanagedGroupResult> {
  try {
    // If host has no groups, it's not unmanaged
    if (!hostGroups || hostGroups.length === 0) {
      return {
        isUnmanaged: false,
        unmanagedGroups: [],
        reason: 'none',
        message: 'Host is not associated with any network groups.'
      };
    }

    // Use existing filterNetworkGroups to determine what groups would be "managed"
    const managedGroups = await filterNetworkGroups(
      hostGroups,
      globalFilters,
      globallyDisabledGroups,
      user,
      userSpecificFilters
    );

    // Create a set of managed group IDs for efficient lookup
    const managedGroupIds = new Set(managedGroups.map(g => g.id));
    
    // Find groups that are not in the managed set (i.e., would be filtered out)
    const unmanagedGroups = hostGroups.filter(g => !managedGroupIds.has(g.id));

    // If no unmanaged groups found, host is fully managed
    if (unmanagedGroups.length === 0) {
      return {
        isUnmanaged: false,
        unmanagedGroups: [],
        reason: 'none',
        message: 'All host groups are available for self-service.'
      };
    }

    // Determine the primary reason for being unmanaged
    const globallyDisabledIds = new Set(globallyDisabledGroups.map(g => g.opnsenseUuid));
    const hasGloballyDisabled = unmanagedGroups.some(g => globallyDisabledIds.has(g.uuid));

    let reason: 'globally_disabled' | 'filtered_out';
    let message: string;

    if (hasGloballyDisabled) {
      reason = 'globally_disabled';
      message = 'Your device is associated with network groups that have been disabled by administrators. Self-service modifications are not allowed.';
    } else {
      reason = 'filtered_out';
      message = 'Your device is associated with network groups that are not available for self-service access. Please contact your network administrator for assistance.';
    }

    logger.debug(`Host has unmanaged groups: ${unmanagedGroups.map(g => g.name).join(', ')} (reason: ${reason})`);

    return {
      isUnmanaged: true,
      unmanagedGroups,
      reason,
      message
    };

  } catch (error) {
    logger.error('Error checking unmanaged group status:', error);
    
    // Fail open - if we can't determine the status, allow self-service
    // This ensures the feature degrades gracefully
    return {
      isUnmanaged: false,
      unmanagedGroups: [],
      reason: 'none',
      message: 'Unable to determine group management status. Self-service is available.'
    };
  }
}

/**
 * Convenience function to fetch filter data and check unmanaged status.
 * This function fetches the necessary filter data from the database.
 *
 * @param user - Optional user object for user-specific filters
 * @returns Promise with filter data needed for unmanaged group checking
 */
export async function fetchUnmanagedGroupFilterData(user?: User | null) {
  try {
    // Fetch global filters
    const globalFilters = (await prisma.groupFilterSetting.findMany({
      orderBy: { createdAt: 'asc' }
    })).map(filter => ({
      ...filter,
      type: filter.type as "include" | "exclude",
    }));

    // Fetch globally disabled groups
    const globallyDisabledGroups = await prisma.globallyDisabledGroup.findMany();

    // Fetch user-specific filters if user is provided
    let userSpecificFilters: GroupSpecificFilterSetting[] | null = null;
    if (user) {
      // Get user's local group IDs
      const userWithGroups = await prisma.user.findUnique({
        where: { id: user.id },
        include: { groups: true }
      });

      const allLocalGroupIds = userWithGroups?.groups.map(g => g.id) || [];

      if (allLocalGroupIds.length > 0) {
        userSpecificFilters = (await prisma.groupSpecificFilterSetting.findMany({
          where: {
            groupId: {
              in: allLocalGroupIds,
            },
          },
        })).map(f => ({
          ...f,
          type: f.type as 'include' | 'exclude',
        }));
      }
    }

    return {
      globalFilters,
      globallyDisabledGroups,
      userSpecificFilters
    };

  } catch (error) {
    logger.error('Error fetching unmanaged group filter data:', error);

    // Return empty data on error
    return {
      globalFilters: [],
      globallyDisabledGroups: [],
      userSpecificFilters: null
    };
  }
}

/**
 * Helper function to generate user-friendly error messages for API responses
 * when self-service operations are blocked due to unmanaged groups.
 * 
 * @param result - UnmanagedGroupResult from isHostInUnmanagedGroups
 * @returns Object with error details suitable for API responses
 */
export function generateUnmanagedGroupError(result: UnmanagedGroupResult) {
  return {
    error: 'Self-service restricted for unmanaged groups',
    details: {
      reason: result.reason,
      message: result.message,
      unmanagedGroups: result.unmanagedGroups.map(g => g.friendlyName || g.name),
      contactAdmin: true
    }
  };
}
