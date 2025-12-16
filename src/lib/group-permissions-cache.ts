/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with typed keys from database results. All uses are safe.
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';

/**
 * Updates the permissionsLastModified timestamp for a specific group.
 * This should be called whenever group permissions change (host alias assignments, etc.)
 * 
 * @param groupId - The ID of the group whose permissions changed
 */
export async function touchGroupPermissions(groupId: string): Promise<void> {
  try {
    await prisma.group.update({
      where: { id: groupId },
      data: { permissionsLastModified: new Date() }
    });

    logger.info(`[touchGroupPermissions] Updated permissionsLastModified for group ${groupId}`);
  } catch (error) {
    logger.error(`[touchGroupPermissions] Failed to update permissionsLastModified for group ${groupId}:`, error);
    // Don't throw - we don't want to break the main operation if timestamp update fails
  }
}

/**
 * Updates the permissionsLastModified timestamp for multiple groups.
 * This should be called when operations affect multiple groups simultaneously.
 * 
 * @param groupIds - Array of group IDs whose permissions changed
 */
export async function touchMultipleGroupPermissions(groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return;

  try {
    await prisma.group.updateMany({
      where: { id: { in: groupIds } },
      data: { permissionsLastModified: new Date() }
    });

    logger.info(`[touchMultipleGroupPermissions] Updated permissionsLastModified for ${groupIds.length} groups: ${groupIds.join(', ')}`);
  } catch (error) {
    logger.error(`[touchMultipleGroupPermissions] Failed to update permissionsLastModified for groups ${groupIds.join(', ')}:`, error);
    // Don't throw - we don't want to break the main operation if timestamp update fails
  }
}

/**
 * Gets the current permissionsLastModified timestamps for user's groups.
 * Used for cache validation in the client-side caching system.
 * 
 * @param userId - The user ID to get group timestamps for
 * @returns Object mapping group IDs to their permissionsLastModified timestamps
 */
export async function getUserGroupTimestamps(userId: string): Promise<Record<string, Date>> {
  try {
    // 1. Get direct group memberships
    const userWithDirectGroups = await prisma.user.findUnique({
      where: { id: userId },
      select: { groups: { select: { id: true } } },
    });

    const directLocalGroupIds = userWithDirectGroups?.groups.map(group => group.id) || [];

    // 2. Get user's accounts to find SSO provider info
    const userAccounts = await prisma.account.findMany({
      where: { userId: userId },
      select: { externalGroups: true, provider: true },
    });

    // 3. For each account, get external groups and find SSO mappings
    let ssoLocalGroupIds: string[] = [];

    for (const account of userAccounts) {
      if (account.externalGroups && Array.isArray(account.externalGroups)) {


        // Handle different formats of external groups
        const externalGroupNames: string[] = [];
        account.externalGroups.forEach((group: unknown) => {
          if (typeof group === 'string') {
            externalGroupNames.push(group);
          } else if (typeof group === 'object' && group !== null && 'name' in group && typeof (group as { name: unknown }).name === 'string') {
            externalGroupNames.push((group as { name: string }).name);
          }
        });



        if (externalGroupNames.length > 0) {
          // Find SSO mappings for this provider and these group names
          const mappings = await prisma.ssoGroupMapping.findMany({
            where: {
              ssoProvider: {
                equals: account.provider,
                ...getCaseInsensitiveMode(),
              },
              ssoGroupName: {
                in: externalGroupNames,
              },
            },
            select: { localGroupId: true, ssoGroupName: true },
          });

          const mappedIds = mappings.map(m => m.localGroupId);
          ssoLocalGroupIds = [...ssoLocalGroupIds, ...mappedIds];


        }
      }
    }

    // Remove duplicates from SSO mappings
    ssoLocalGroupIds = [...new Set(ssoLocalGroupIds)];

    // 4. Combine all group IDs
    const allLocalGroupIds = [...new Set([...directLocalGroupIds, ...ssoLocalGroupIds])];

    if (allLocalGroupIds.length === 0) {
      logger.info(`[getUserGroupTimestamps] User ${userId} has no group memberships (direct or SSO-mapped)`);
      return {};
    }

    // 5. Fetch timestamps for all groups the user has access to
    const groupsWithTimestamps = await prisma.group.findMany({
      where: {
        id: { in: allLocalGroupIds }
      },
      select: {
        id: true,
        name: true,
        permissionsLastModified: true
      }
    });

    const timestamps: Record<string, Date> = {};
    for (const group of groupsWithTimestamps) {
      timestamps[group.id] = group.permissionsLastModified;
    }

    logger.info(`[getUserGroupTimestamps] Retrieved timestamps for ${groupsWithTimestamps.length} groups for user ${userId}`);
    return timestamps;
  } catch (error) {
    logger.error(`[getUserGroupTimestamps] Failed to get group timestamps for user ${userId}:`, error);
    return {}; // Return empty object on error - will force cache invalidation
  }
}

/**
 * Cache entry structure for storing permission validation results
 */
export interface PermissionCacheEntry {
  userId: string;
  selfServiceEnabled: boolean;
  groupTimestamps: Record<string, string>; // ISO string timestamps for localStorage compatibility
  globalSettingsTimestamp: string; // ISO string timestamp for global settings lastModified
  cachedAt: string; // ISO string timestamp
  expiresAt: string; // ISO string timestamp (1 hour max cache duration)
}

/**
 * Validates if a cached permission entry is still valid by comparing timestamps
 *
 * @param cachedEntry - The cached permission entry from localStorage
 * @param currentTimestamps - Current group timestamps from database
 * @param currentGlobalSettingsTimestamp - Current global settings lastModified timestamp
 * @returns true if cache is valid, false if it needs to be invalidated
 */
export function isPermissionCacheValid(
  cachedEntry: PermissionCacheEntry,
  currentTimestamps: Record<string, Date>,
  currentGlobalSettingsTimestamp?: Date
): boolean {
  try {

    // Check if cache has expired (1 hour max duration)
    const now = new Date();
    const expiresAt = new Date(cachedEntry.expiresAt);
    if (now > expiresAt) {
      return false;
    }

    // Check if global settings timestamp has changed (if provided)
    if (currentGlobalSettingsTimestamp && cachedEntry.globalSettingsTimestamp) {
      const cachedGlobalTimestampISO = new Date(cachedEntry.globalSettingsTimestamp).toISOString();
      const currentGlobalTimestampISO = currentGlobalSettingsTimestamp.toISOString();

      if (cachedGlobalTimestampISO !== currentGlobalTimestampISO) {
        logger.info(`[isPermissionCacheValid] ❌ Global settings timestamp changed - invalidating cache for user ${cachedEntry.userId}`);
        return false;
      }
    }

    // Check if any group timestamp has changed
    for (const [groupId, currentTimestamp] of Object.entries(currentTimestamps)) {
      const cachedTimestamp = cachedEntry.groupTimestamps[groupId];
      if (!cachedTimestamp) {
        return false;
      }

      // Compare timestamps using ISO strings to avoid timezone issues
      const cachedTimestampISO = new Date(cachedTimestamp).toISOString();
      const currentTimestampISO = currentTimestamp.toISOString();

      if (cachedTimestampISO !== currentTimestampISO) {
        return false;
      }
    }

    // Check if any cached group no longer exists for the user
    for (const groupId of Object.keys(cachedEntry.groupTimestamps)) {
      if (!currentTimestamps[groupId]) {
        return false;
      }
    }

    logger.info(`[isPermissionCacheValid] ✅ Cache is valid for user ${cachedEntry.userId}`);
    return true;
  } catch (error) {
    logger.error(`[isPermissionCacheValid] Error validating cache:`, error);
    return false; // Invalid cache on error
  }
}

/**
 * Creates a new permission cache entry
 *
 * @param userId - User ID
 * @param selfServiceEnabled - Current self-service access status
 * @param groupTimestamps - Current group timestamps
 * @param globalSettingsTimestamp - Current global settings lastModified timestamp
 * @returns New cache entry ready for localStorage storage
 */
export function createPermissionCacheEntry(
  userId: string,
  selfServiceEnabled: boolean,
  groupTimestamps: Record<string, Date>,
  globalSettingsTimestamp?: Date
): PermissionCacheEntry {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

  // Convert Date objects to ISO strings for localStorage compatibility
  const groupTimestampsISO: Record<string, string> = {};
  for (const [groupId, timestamp] of Object.entries(groupTimestamps)) {
    groupTimestampsISO[groupId] = timestamp.toISOString();
  }

  return {
    userId,
    selfServiceEnabled,
    groupTimestamps: groupTimestampsISO,
    globalSettingsTimestamp: globalSettingsTimestamp?.toISOString() || now.toISOString(),
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

/**
 * localStorage key for permission cache
 */
export const PERMISSION_CACHE_KEY = 'instrada-ogm_permission_cache';

/**
 * Safely gets permission cache from localStorage
 * 
 * @param userId - User ID to get cache for
 * @returns Cached entry or null if not found/invalid
 */
export function getPermissionCache(userId: string): PermissionCacheEntry | null {
  try {
    if (typeof window === 'undefined') return null; // Server-side

    const cached = localStorage.getItem(PERMISSION_CACHE_KEY);
    if (!cached) return null;

    const entry: PermissionCacheEntry = JSON.parse(cached);
    if (entry.userId !== userId) return null; // Different user

    return entry;
  } catch (error) {
    logger.error(`[getPermissionCache] Error reading cache:`, error);
    return null;
  }
}

/**
 * Safely sets permission cache in localStorage
 * 
 * @param entry - Cache entry to store
 */
export function setPermissionCache(entry: PermissionCacheEntry): void {
  try {
    if (typeof window === 'undefined') return; // Server-side

    localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify(entry));
  } catch (error) {
    logger.error(`[setPermissionCache] Error writing cache:`, error);
    // Don't throw - caching is optional optimization
  }
}

/**
 * Clears permission cache from localStorage
 */
export function clearPermissionCache(): void {
  try {
    if (typeof window === 'undefined') return; // Server-side

    localStorage.removeItem(PERMISSION_CACHE_KEY);
  } catch (error) {
    logger.error(`[clearPermissionCache] Error clearing cache:`, error);
    // Don't throw - clearing cache is optional
  }
}
