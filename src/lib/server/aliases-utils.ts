import { logger } from '@/lib/logger';
import { 
  getHostAliases, 
  getHostAliasesByIp, 
  addAliasItem, 
  reconfigureAliases, 
  exportAliases, 
  OpnsenseAliasDetailFromExport 
} from '@/lib/opnsense-api';
import { getFilteredHostAliases } from '@/lib/host-alias-filtering';

/**
 * Server-side utility to get host aliases by IP address
 */
export async function getHostAliasByIpServer(ipAddress: string) {
  try {
    logger.debug('getHostAliasByIpServer called', { ipAddress });

    const hostAliases = await getHostAliases();
    const matchingAlias = hostAliases.find(alias =>
      alias.content.split('\n').includes(ipAddress) && alias.type === 'host'
    );

    if (matchingAlias) {
      return { 
        success: true, 
        data: {
          name: matchingAlias.name, 
          uuid: matchingAlias.uuid,
          type: matchingAlias.type,
          content: matchingAlias.content,
          description: matchingAlias.description,
        }
      };
    } else {
      return { success: true, data: { name: null, uuid: null } };
    }
  } catch (error) {
    logger.error('Error in getHostAliasByIpServer:', error);
    return { success: false, error: 'Failed to fetch alias' };
  }
}

/**
 * Server-side utility to get all host aliases and network groups
 */
export async function getAllAliasesServer() {
  try {
    const { displayableHostAliases, filteredCount } = await getFilteredHostAliases();
    
    // Get all network groups for enrichment
    const allAliasesResponse = await exportAliases();
    const networkGroups = Object.entries(allAliasesResponse.aliases.alias)
      .filter(([, alias]: [string, OpnsenseAliasDetailFromExport]) => alias.type === 'networkgroup')
      .map(([uuid, alias]: [string, OpnsenseAliasDetailFromExport]) => ({
        uuid,
        name: alias.name,
        description: alias.description,
        enabled: alias.enabled,
        content: alias.content,
        type: alias.type
      }));
    
    logger.debug(`getAllAliasesServer: Returning ${displayableHostAliases.length} host aliases and ${networkGroups.length} network groups`);
    
    return {
      success: true,
      data: {
        hostAliases: displayableHostAliases,
        networkGroups: networkGroups,
        totalCount: filteredCount,
        allAliases: allAliasesResponse.aliases.alias, // Include all aliases for internal use
      }
    };
  } catch (error) {
    logger.error('Error in getAllAliasesServer:', error);
    return { success: false, error: 'Failed to fetch aliases' };
  }
}

/**
 * Server-side utility to create a host alias
 */
export async function createHostAliasServer(name: string, content: string, description?: string) {
  try {
    if (!name || !content) {
      return { success: false, error: 'Name and content are required' };
    }

    const payload = {
      alias: {
        enabled: '1',
        name: name,
        type: 'host',
        content: content,
        description: description || 'Created via server utility',
      }
    };

    const result = await addAliasItem(payload);
    
    if (result.result === 'saved') {
      await reconfigureAliases();
      return { success: true, data: { uuid: result.uuid } };
    } else {
      return { success: false, error: 'Failed to create alias' };
    }
  } catch (error) {
    logger.error('Error creating host alias via server utility:', error);
    return { success: false, error: 'Failed to create host alias' };
  }
}

/**
 * Creates a host alias for an IP address if it doesn't already exist
 * @param ipAddress The IP address to create a host alias for
 * @param description Optional description for the host alias
 * @returns The name of the created or existing host alias
 */
export async function createHostAliasForIp(ipAddress: string, description?: string): Promise<string> {
  try {
    logger.debug(`createHostAliasForIp: Checking if host alias exists for IP ${ipAddress}`);
    
    // First, check if a host alias already exists for this IP
    const existingAliases = await getHostAliasesByIp(ipAddress);
    
    if (existingAliases.length > 0) {
      // Use the first existing alias
      const existingAlias = existingAliases[0];
      logger.debug(`createHostAliasForIp: Found existing host alias ${existingAlias.name} for IP ${ipAddress}`);
      return existingAlias.name;
    }
    
    // Create a new host alias with format HOST_X_X_X_X
    const aliasName = `HOST_${ipAddress.replace(/\./g, '_')}`;
    logger.debug(`createHostAliasForIp: Creating new host alias ${aliasName} for IP ${ipAddress}`);
    
    const payload = {
      alias: {
        enabled: '1',
        name: aliasName,
        type: 'host',
        content: ipAddress,
        description: description || `Auto-created host alias for IP ${ipAddress}`,
        proto: '',
        interface: '',
        counters: '0',
        updatefreq: '',
        categories: ''
      }
    };
    
    const result = await addAliasItem(payload);
    
    if (result.result !== 'saved' || !result.uuid) {
      logger.error(`createHostAliasForIp: Failed to create host alias for IP ${ipAddress}:`, result);
      throw new Error(`Failed to create host alias: ${JSON.stringify(result)}`);
    }
    
    // Reconfigure aliases to apply changes
    const reconfigResult = await reconfigureAliases();
    logger.debug(`createHostAliasForIp: reconfigureAliases result:`, reconfigResult);
    
    if (reconfigResult.status !== 'ok') {
      logger.warn(`createHostAliasForIp: Reconfigure returned non-ok status:`, reconfigResult);
    }
    
    logger.debug(`createHostAliasForIp: Successfully created host alias ${aliasName} for IP ${ipAddress}`);
    return aliasName;
  } catch (error) {
    logger.error(`createHostAliasForIp: Error creating host alias for IP ${ipAddress}:`, error);
    throw error;
  }
} 