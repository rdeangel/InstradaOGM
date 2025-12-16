import { logger } from '@/lib/logger';
import { getHostAliases } from '@/lib/opnsense-api';

/**
 * Server-side utility to get all host aliases
 * This function can only be imported by server-side code (API routes, server components, etc.)
 * and cannot be accessed from client-side code.
 */
export async function getHostAliasesServer() {
  try {
    logger.info('getHostAliasesServer: Fetching all host aliases');
    
    const hostAliases = await getHostAliases();
    
    logger.info(`getHostAliasesServer: Successfully fetched ${hostAliases.length} host aliases`);
    
    return {
      success: true,
      data: {
        hostAliases: hostAliases,
        totalCount: hostAliases.length,
      }
    };
  } catch (error) {
    logger.error('Error in getHostAliasesServer:', error);
    return { success: false, error: 'Failed to fetch host aliases' };
  }
} 