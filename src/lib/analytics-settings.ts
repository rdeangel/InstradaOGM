// src/lib/analytics-settings.ts
import { getGlobalSettings } from '@/lib/server/global-settings';
import { logger } from '@/lib/logger';

/**
 * Check if advanced analytics is enabled
 * This function can be used server-side to determine if session tracking should be active
 */
export async function isAdvancedAnalyticsEnabled(): Promise<boolean> {
  try {
    const settings = await getGlobalSettings();
    return settings.enableAdvancedAnalytics || false;
  } catch (error) {
    logger.error('Failed to check advanced analytics setting:', error);
    // Default to false (disabled) if we can't check the setting
    return false;
  }
}

/**
 * Client-side hook to check if advanced analytics is enabled
 * This will need to be implemented as a React hook that fetches the setting
 */
export function useAdvancedAnalyticsEnabled() {
  // This will be implemented when we need client-side checking
  // For now, we'll handle this through the SessionTrackingProvider
  return true; // Placeholder
}
