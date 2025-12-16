'use client';

/* eslint-disable security/detect-object-injection */
// This hook uses bracket notation with typed keys from objects. All uses are safe.
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';
import {
  isPermissionCacheValid,
  createPermissionCacheEntry,
  getPermissionCache,
  setPermissionCache,
  clearPermissionCache
} from '@/lib/group-permissions-cache';

/**
 * Fetches current group timestamps from the API for cache validation
 */
async function fetchGroupTimestamps(userId: string): Promise<Record<string, Date>> {
  try {

    const response = await fetch('/api/user/group-timestamps', {
      cache: 'no-store',
    });

    if (!response.ok) {
      logger.error(`[fetchGroupTimestamps] API call failed with status ${response.status}`);
      throw new Error(`API call failed: ${response.status}`);
    }

    const data = await response.json();

    const timestamps: Record<string, Date> = {};

    // Convert ISO strings back to Date objects
    for (const [groupId, isoString] of Object.entries(data.timestamps)) {
      timestamps[groupId] = new Date(isoString as string);
    }
    return timestamps;
  } catch (error) {
    logger.error(`[fetchGroupTimestamps] Error fetching timestamps for user ${userId}:`, error);
    return {}; // Return empty object on error - will force cache invalidation
  }
}

/**
 * Fetches current global settings timestamp from the API for cache validation
 */
async function fetchGlobalSettingsTimestamp(): Promise<Date | null> {
  try {
    const response = await fetch('/api/user/global-settings-timestamp', {
      cache: 'no-store',
    });

    if (!response.ok) {
      logger.error(`[fetchGlobalSettingsTimestamp] API call failed with status ${response.status}`);
      throw new Error(`API call failed: ${response.status}`);
    }

    const data = await response.json();
    return new Date(data.timestamp);
  } catch (error) {
    logger.error(`[fetchGlobalSettingsTimestamp] Error fetching global settings timestamp:`, error);
    return null; // Return null on error - will force cache invalidation
  }
}

interface SelfServiceValidationResult {
  selfServiceEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}



/**
 * Hook that performs self-service access validation.
 * For authenticated users: Performs device scope validation with fallback to unauthenticated rules
 * For unauthenticated users: Checks IP-based network restrictions
 *
 * This ensures proper menu visibility and access control for all user types.
 */
export function useSelfServiceValidation(): SelfServiceValidationResult {
  const { data: session, status: authStatus } = useAuth();
  const [selfServiceEnabled, setSelfServiceEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateSelfServiceAccess = async () => {
      // Wait for auth status to be determined
      if (authStatus === 'loading') {
        return; // Still loading, wait
      }

      // Run validation for both authenticated and unauthenticated users
      const isAuthenticated = authStatus === 'authenticated' && session?.user?.id;

      try {
        setIsLoading(true);
        setError(null);

        if (isAuthenticated) {
          const userId = session.user?.id;
          if (!userId) {
            setSelfServiceEnabled(false);
            setIsLoading(false);
            setError(null);
            return;
          }

          logger.info(`[useSelfServiceValidation] Starting cached validation for authenticated user ${userId}`);

          // Try to use cached result first
          const cachedEntry = getPermissionCache(userId);
          let shouldUseCache = false;

          if (cachedEntry) {
            logger.info(`[useSelfServiceValidation] Found cached entry for user ${userId}, cached at: ${cachedEntry.cachedAt}, expires at: ${cachedEntry.expiresAt}`);

            try {
              // Get current group timestamps and global settings timestamp to validate cache
              const [currentTimestamps, currentGlobalSettingsTimestamp] = await Promise.all([
                fetchGroupTimestamps(userId),
                fetchGlobalSettingsTimestamp()
              ]);

              if (isPermissionCacheValid(cachedEntry, currentTimestamps, currentGlobalSettingsTimestamp || undefined)) {
                logger.info(`[useSelfServiceValidation] ✅ CACHE HIT: Using cached result for user ${userId}: ${cachedEntry.selfServiceEnabled}`);
                setSelfServiceEnabled(cachedEntry.selfServiceEnabled);



                shouldUseCache = true;
              } else {
                logger.info(`[useSelfServiceValidation] ❌ CACHE INVALID: Cache expired or timestamps changed for user ${userId}`);
                clearPermissionCache(); // Clear invalid cache
              }
            } catch (cacheError) {
              logger.error(`[useSelfServiceValidation] Error validating cache for user ${userId}:`, cacheError);
              clearPermissionCache(); // Clear corrupted cache
            }
          }

          // If cache is invalid or doesn't exist, perform full validation
          if (!shouldUseCache) {
            logger.info(`[useSelfServiceValidation] Performing full device scope validation for user ${userId}`);

            // Call API for authenticated user validation (includes device scope + fallback)
            const response = await fetch('/api/ui/config', {
              cache: 'no-store',
            });

            if (!response.ok) {
              throw new Error(`API call failed: ${response.status}`);
            }

            const data = await response.json();
            const enabled = data.selfServiceEnabled ?? false;

            setSelfServiceEnabled(enabled);



            logger.info(`[useSelfServiceValidation] Full validation result for user ${userId}: ${enabled}`);

            // Cache the result for future use
            try {
              const [currentTimestamps, currentGlobalSettingsTimestamp] = await Promise.all([
                fetchGroupTimestamps(userId),
                fetchGlobalSettingsTimestamp()
              ]);
              const newCacheEntry = createPermissionCacheEntry(userId, enabled, currentTimestamps, currentGlobalSettingsTimestamp || undefined);
              setPermissionCache(newCacheEntry);
              logger.info(`[useSelfServiceValidation] ✅ CACHED: Stored validation result for user ${userId}`);
            } catch (cacheError) {
              logger.error(`[useSelfServiceValidation] Error caching result for user ${userId}:`, cacheError);
              // Don't fail the main operation if caching fails
            }
          }
        } else {
          // For unauthenticated users, check IP-based access
          logger.info(`[useSelfServiceValidation] Performing IP-based validation for unauthenticated user`);

          const response = await fetch('/api/ui/config', {
            cache: 'no-store',
          });

          if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
          }

          const data = await response.json();
          const enabled = data.selfServiceEnabled ?? false;

          setSelfServiceEnabled(enabled);

          logger.info(`[useSelfServiceValidation] Unauthenticated user validation result: ${enabled}`);
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`[useSelfServiceValidation] Error during validation:`, err);
        setError(errorMessage);
        setSelfServiceEnabled(false); // Fail closed
      } finally {
        setIsLoading(false);
      }
    };

    validateSelfServiceAccess();
  }, [authStatus, session?.user?.id]);

  return {
    selfServiceEnabled,
    isLoading,
    error
  };
}


