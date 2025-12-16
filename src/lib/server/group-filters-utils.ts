import { logger } from '@/lib/logger';
import { getGroupFilters } from '@/lib/server/group-filters';

/**
 * Server-side utility to get group filter settings
 * This function can only be imported by server-side code (API routes, server components, etc.)
 * and cannot be accessed from client-side code.
 */
export async function getGroupFiltersServer() {
  try {
    const responseFilters = await getGroupFilters();
    return { success: true, data: responseFilters };
  } catch (error) {
    logger.error('Failed to fetch group filter settings (server utility):', error);
    return { success: false, error: 'Failed to fetch settings' };
  }
} 