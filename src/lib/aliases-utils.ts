import { logger } from '@/lib/logger';

/**
 * Creates a host alias for an IP address if it doesn't already exist
 * @param ipAddress The IP address to create a host alias for
 * @param description Optional description for the host alias
 * @returns The name of the created or existing host alias
 */
export async function createHostAlias(ipAddress: string, description?: string): Promise<string> {
  try {
    logger.debug(`createHostAlias: Checking if host alias exists for IP ${ipAddress}`);
    
    // Use server-side utility to create the host alias
    const { createHostAliasForIp } = await import('@/lib/server/aliases-utils');
    const aliasName = await createHostAliasForIp(ipAddress, description);
    
    logger.debug(`createHostAlias: Successfully created host alias ${aliasName} for IP ${ipAddress}`);
    return aliasName;
  } catch (error) {
    logger.error(`createHostAlias: Error creating host alias for IP ${ipAddress}:`, error);
    throw error;
  }
} 