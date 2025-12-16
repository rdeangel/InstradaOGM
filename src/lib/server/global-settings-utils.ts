import { getGlobalSettings } from '@/lib/server/global-settings';
import { logger } from '@/lib/logger';

/**
 * Server-side utility to get global settings
 * This function can only be imported by server-side code (API routes, server components, etc.)
 * and cannot be accessed from client-side code.
 */
export async function getGlobalSettingsServer(clientIp?: string | null) {
  try {
    const globalSettings = await getGlobalSettings(clientIp);
    return { success: true, data: globalSettings };
  } catch (error) {
    logger.error('Failed to fetch global settings:', error);
    return { success: false, error: 'Failed to fetch global settings' };
  }
} 