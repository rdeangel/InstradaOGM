/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with typed keys from API responses. All uses are safe.
import type { NetworkGroup, OpnsenseArpEntry, OpnsenseApiResponse, OpnsenseVpnSession, OpnsenseVpnEntry, OpnsenseWireguardClient, OpnsenseWireguardClientResponse, OpnsenseIpsecConnection, OpnsenseIpsecConnectionResponse, OpnsenseWireguardServiceResponse, OpnsenseWireguardServicePeer } from '@/types/opnsense';
// Lucide icons are not directly stored in data anymore, so direct import here isn't for data population.
// They will be mapped by name in the component.

import { Buffer } from 'buffer';
import { prisma } from '@/lib/prisma'; // Import Prisma client
import { logger } from '@/lib/logger'; // Import logger
import { VpnClientType } from '@prisma/client';
import { handleSSLError } from './opnsense-ssl-config';

// Module-level flag to track SSL bypass warning display (resets on application restart)
let sslWarningShown = false;

const OPNSENSE_URL = process.env.OPNSENSE_URL;
const API_KEY = process.env.OPNSENSE_API_KEY;
const API_SECRET = process.env.OPNSENSE_API_SECRET;
// SKIP_SSL_VERIFICATION is now handled in opnsense-ssl-config.ts

/**
 * Helper function to get the best host alias name for an IP address
 * Tries to detect hostname first with automatic deduplication, falls back to default HOST_X.X.X.X format
 */
export async function getBestHostAliasName(ipAddress: string): Promise<{ aliasName: string; detectedHostname: string | null }> {
  let aliasName = `HOST_${ipAddress.replace(/\./g, '_')}`; // Default name
  let detectedHostname: string | null = null;

  try {
    // Import the network utils function for hostname detection
    const { lookupNetworkDetails } = await import('@/lib/server/network-utils');
    const networkDetails = await lookupNetworkDetails(ipAddress);

    if (networkDetails.hostname) {
      detectedHostname = networkDetails.hostname;
      // Sanitize hostname for OPNsense alias compatibility
      const sanitizedHostname = sanitizeHostAliasName(detectedHostname);

      try {
        // Generate a unique host alias name with automatic deduplication
        aliasName = await generateUniqueHostAliasName(sanitizedHostname);
        logger.debug(`Detected hostname "${detectedHostname}" for IP ${ipAddress}, generated unique name "${aliasName}"`);
      } catch (deduplicationError) {
        // Fall back to default pattern if deduplication fails
        logger.warn(`Failed to generate unique name for detected hostname "${detectedHostname}", using default pattern:`, deduplicationError);
        aliasName = `HOST_${ipAddress.replace(/\./g, '_')}`;
      }
    } else {
      logger.debug(`No hostname detected for IP ${ipAddress}, using default name "${aliasName}"`);
    }
  } catch (hostnameError) {
    logger.warn(`Failed to detect hostname for IP ${ipAddress}, using default name:`, hostnameError);
    // Continue with default name if hostname detection fails
  }

  return { aliasName, detectedHostname };
}

/**
 * Generate a unique host alias name by checking for conflicts and adding numeric suffixes
 * @param baseName The base name to use (already sanitized)
 * @param maxAttempts Maximum number of attempts to find a unique name (default: 100)
 * @returns A unique host alias name
 */
async function generateUniqueHostAliasName(baseName: string, maxAttempts: number = 100): Promise<string> {
  // First, try the base name without any suffix
  const existingAliases = await getHostAliasesByName(baseName);
  if (existingAliases.length === 0) {
    logger.debug(`Host alias name "${baseName}" is available`);
    return baseName;
  }

  logger.debug(`Host alias name "${baseName}" already exists, trying with numeric suffixes`);

  // Try with numeric suffixes
  for (let i = 1; i <= maxAttempts; i++) {
    const candidateName = `${baseName}_${i}`;
    const existingWithSuffix = await getHostAliasesByName(candidateName);

    if (existingWithSuffix.length === 0) {
      logger.debug(`Found available host alias name: "${candidateName}"`);
      return candidateName;
    }
  }

  // If we couldn't find a unique name after maxAttempts, fall back to default pattern
  logger.warn(`Could not find unique name for "${baseName}" after ${maxAttempts} attempts, falling back to default pattern`);
  throw new Error(`Could not generate unique host alias name for "${baseName}" after ${maxAttempts} attempts`);
}

/**
 * Create host alias information from a hostname with automatic deduplication
 * This function handles hostname-based host alias creation with automatic IP resolution from OPNsense ARP table
 * and ensures unique naming by adding numeric suffixes when conflicts are detected
 */
export async function createHostAliasFromHostname(
  hostname: string,
  ipAddress?: string
): Promise<{ aliasName: string; originalHostname: string; ipAddress: string }> {
  // Sanitize hostname for OPNsense alias compatibility
  const sanitizedBaseName = sanitizeHostAliasName(hostname);

  let resolvedIpAddress = ipAddress;

  // If no IP address provided, try to find it in OPNsense ARP table
  if (!resolvedIpAddress) {
    try {
      logger.debug(`Attempting to find IP address for hostname "${hostname}" in OPNsense ARP table`);

      // Get ARP table from OPNsense
      const arpTable = await get_arpTable();

      // Look for an entry with matching hostname
      const matchingEntry = arpTable.find(entry =>
        entry.hostname && entry.hostname.toLowerCase() === hostname.toLowerCase()
      );

      if (matchingEntry) {
        resolvedIpAddress = matchingEntry.ip;
        logger.debug(`Found hostname "${hostname}" in OPNsense ARP table with IP "${resolvedIpAddress}"`);
      } else {
        throw new Error(`Hostname "${hostname}" not found in OPNsense ARP table`);
      }
    } catch (error) {
      logger.warn(`Failed to find IP address for hostname "${hostname}" in OPNsense ARP table:`, error);
      throw new Error(`Could not find IP address for hostname "${hostname}" in OPNsense ARP table. Please provide an IP address or ensure the device is active on the network.`);
    }
  }

  // Generate a unique host alias name with automatic deduplication
  let uniqueAliasName: string;
  try {
    uniqueAliasName = await generateUniqueHostAliasName(sanitizedBaseName);
    logger.debug(`Generated unique host alias name: "${uniqueAliasName}" from hostname "${hostname}"`);
  } catch (error) {
    // Fall back to default HOST_X_X_X_X pattern if deduplication fails
    logger.warn(`Failed to generate unique name for hostname "${hostname}", falling back to default pattern:`, error);
    uniqueAliasName = `HOST_${resolvedIpAddress.replace(/\./g, '_')}`;
    logger.debug(`Using fallback host alias name: "${uniqueAliasName}"`);
  }

  logger.debug(`Creating host alias from hostname "${hostname}", final name "${uniqueAliasName}" with IP "${resolvedIpAddress}"`);

  return {
    aliasName: uniqueAliasName,
    originalHostname: hostname,
    ipAddress: resolvedIpAddress
  };
}

/**
 * Sanitize hostname for OPNsense alias compatibility
 * OPNsense aliases have restrictions on allowed characters
 */
function sanitizeHostAliasName(hostname: string): string {
  return hostname
    // Replace hyphens with underscores
    .replace(/-/g, '_')
    // Replace any other potentially problematic characters with underscores
    .replace(/[^a-zA-Z0-9_]/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
    // Ensure it's not empty after sanitization
    .replace(/^$/, 'HOST');
}

// SSL configuration is now handled per-request via createOPNsenseHttpsAgent()
// This eliminates the security risk of global SSL bypass affecting all HTTPS connections

// Helper function for making authenticated API requests
// The credential check is now primarily within this function,
// as this module might be inadvertently imported client-side,
// but this function should only be executed server-side.
export async function fetchFromOpnsense<T = OpnsenseApiResponse>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: unknown): Promise<T> {
  if (!OPNSENSE_URL || !API_KEY || !API_SECRET) {
    throw new Error('OPNsense API credentials are not configured.');
  }

  const headers: HeadersInit = {
    // Content-Type will be set conditionally below
    'Authorization': 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
  };

  const config: RequestInit = {
    method,
    headers,
  };

  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    // Only set Content-Type and body for methods that typically send data.
    // OPNsense API might expect an empty JSON object {} for some POST/DELETE operations.
    // If 'body' is explicitly 'null' or 'undefined', we might send an empty JSON object.
    // If 'body' has content, stringify it.
    if (body) {
      config.body = JSON.stringify(body);
    } else {
      // For some OPNsense POST/DELETE endpoints, an empty JSON object might be required.
      // Example: Delete an Alias: JSON_DATA='{}'
      // If body is not provided, but it's a POST/PUT/DELETE, send '{}'
      config.body = JSON.stringify({});
    }
    (config.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  logger.debug(`OPNsense API Request: ${method} ${endpoint}`);
  if (body) {
    logger.debug(`Request body:`, JSON.stringify(body));
  }

  // Handle SSL verification bypass for OPNsense API calls only
  const skipSslVerification = process.env.SKIP_SSL_VERIFICATION === 'true';
  let originalTlsRejectUnauthorized: string | undefined;

  if (skipSslVerification && OPNSENSE_URL?.startsWith('https://')) {
    // Temporarily disable SSL verification for this request only
    originalTlsRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    // Display warning only once per application lifecycle to reduce log noise
    if (!sslWarningShown) {
      logger.warn(
        'WARNING: SSL certificate verification is DISABLED for all OPNsense API calls (SKIP_SSL_VERIFICATION="true"). ' +
        'This bypasses critical security checks and should ONLY be used in development/testing environments. ' +
        'You acknowledge the security risks associated with this configuration. ' +
        'For proper SSL validation, set SKIP_SSL_VERIFICATION="false" or remove it from your .env file.'
      );
      sslWarningShown = true;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${OPNSENSE_URL}${endpoint}`, config);
  } catch (error: unknown) {
    // Handle SSL-specific errors with helpful messages
    if (skipSslVerification) {
      // When SSL verification is disabled, log SSL errors as warnings instead of errors
      const errorCode = (error as { code?: string }).code;
      if (errorCode && ['ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_UNTRUSTED'].includes(errorCode)) {
        logger.warn(`OPNsense API SSL warning (bypassed): ${(error as Error).message || String(error)}`);
        // Still throw the error as SSL bypass didn't work as expected
        throw error;
      }
    }

    const enhancedError = handleSSLError(error);
    logger.error(`OPNsense API connection error: ${enhancedError.message}`);
    throw enhancedError;
  } finally {
    // Always restore the original SSL verification setting
    if (skipSslVerification && OPNSENSE_URL?.startsWith('https://')) {
      if (originalTlsRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsRejectUnauthorized;
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      }
    }
  }

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`OPNSense API request failed: ${method} ${endpoint}`);
    logger.error(`Status: ${response.status} ${response.statusText}`);
    logger.error(`Response Body:`, errorBody);

    try {
      // Try to parse the error body as JSON for more detailed error information
      const parsedError = JSON.parse(errorBody);
      logger.error(`Parsed error:`, parsedError);

      if (parsedError.validations) {
        logger.error(`Validation errors:`, parsedError.validations);
      }

      throw new Error(`OPNSense API error: ${response.status} ${response.statusText}. ${JSON.stringify(parsedError)}`);
    } catch {
      // If parsing fails, just return the raw error body
      throw new Error(`OPNSense API error: ${response.status} ${response.statusText}. ${errorBody}`);
    }
  }

  // Handle cases where the response might be empty (e.g., for some POST operations that return 200 OK with no body)
  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");

  if (response.status === 204) { // No Content
    return {} as T; // Return an empty object for 204 No Content
  }

  if (isJson) {
    const jsonResponse = await response.json();
    //logger.debug(`OPNsense API Response:`, jsonResponse);
    return jsonResponse as T;
  } else {
    // Attempt to read text even if not JSON, in case OPNsense sends plain text success messages
    const textResponse = await response.text();
    //logger.debug(`OPNsense API Response (text):`, textResponse);

    if (textResponse) {
      try {
        // Try parsing as JSON even if content-type header is missing or not application/json
        const jsonResponse = JSON.parse(textResponse);
        //logger.debug(`Parsed JSON from text response:`, jsonResponse);
        return jsonResponse as T;
      } catch {
        // If it's not JSON, and not empty, return a generic success or the text itself
        logger.warn(`OPNSense API response was not JSON, but status was OK. Endpoint: ${endpoint}. Response: ${textResponse}`);
        // Try parsing as JSON even if content-type header is missing or not application/json
        // If it's not JSON, and not empty, return a generic "ok" result or the text itself
        return { result: "ok", message: textResponse, status: response.status } as T;
      }
    } else {
      // If response is OK but no content, return a generic "ok" result
      return { result: "ok", status: response.status } as T;
    }
  }
}


// --- Real API Functions ---

// Interface for the response from /api/firewall/alias/listNetworkAliases
// Based on user description: "A json list of Aliases with name and description values"
// This might be an array of objects.
export interface OpnsenseListedAlias {
  name: string;
  description: string;
  // uuid might not be here, need to confirm API response structure
}
export type OpnsenseListNetworkAliasesResponse = OpnsenseListedAlias[];


export async function listNetworkAliases(): Promise<OpnsenseListNetworkAliasesResponse> {
  // Assuming it returns an array directly, adjust if it's an object with a property containing the array
  return fetchFromOpnsense<OpnsenseListNetworkAliasesResponse>('/api/firewall/alias/listNetworkAliases');
}

// Interfaces for /api/firewall/alias/export
export interface OpnsenseAliasDetailFromExport {
  enabled: string; // "1" or "0"
  name: string;
  uuid?: string; // Added optional uuid, as getHostAliases populates this
  type: string;
  proto: string;
  interface: string;
  counters: string;
  updatefreq: string;
  content: string; // Newline-separated string of member alias names for networkgroup type
  categories: string;
  description: string;
  last_updated?: string; // Timestamp from OPNsense (e.g., "2025-07-18T16:15:52.572794")
  // Add other fields if present in the actual API response
  current_items?: string; // Add this for OPNsense API compatibility
}

export interface OpnsenseExportResponse {
  aliases: {
    alias: {
      [uuid: string]: OpnsenseAliasDetailFromExport;
    };
  };
}

export async function exportAliases(): Promise<OpnsenseExportResponse> {
  return fetchFromOpnsense<OpnsenseExportResponse>('/api/firewall/alias/export');
}


export interface OpnsenseAliasTableSizeDetail { // Added export
  count: number;
  updated: string | null;
}

interface OpnsenseAliasTableSizeResponse {
  status: string;
  size: number;
  used: number;
  details: {
    [aliasName: string]: OpnsenseAliasTableSizeDetail;
  };
}

export async function getAliasTableSize(): Promise<OpnsenseAliasTableSizeResponse> {
  return fetchFromOpnsense<OpnsenseAliasTableSizeResponse>('/api/firewall/alias/getTableSize');
}

// Interface for the payload to update an alias
export interface OpnsenseSetAliasItemPayload {
  alias: {
    enabled: string; // "1" or "0"
    name: string;
    type: string; // e.g., "networkgroup"
    proto?: string;
    categories?: string;
    updatefreq?: string;
    content: string; // Newline-separated string of member alias names
    interface?: string;
    counters?: string; // OPNsense seems to manage this, but it's in the example
    description?: string;
    // Potentially other fields if the API supports them for setItem
  };
}

// Interface for the response of setItem (usually simple like {"result":"saved"})
export interface OpnsenseSetItemResponse {
  result: string; // e.g., "saved"
  message?: string; // Error message when result is not "saved"
  // Potentially other fields like "uuid" if returned on update
}

export async function setAliasItem(uuid: string, payload: OpnsenseSetAliasItemPayload | Record<string, unknown>): Promise<OpnsenseSetItemResponse> {
  logger.debug(`Attempting to set alias item for UUID: ${uuid}.`);
  logger.debug(`setAliasItem payload:`, JSON.stringify(payload, null, 2));

  try {
    // Normalize the payload to ensure it has the expected structure
    let normalizedPayload: OpnsenseSetAliasItemPayload;

    if ('alias' in payload && payload.alias) {
      // Payload already has the correct structure
      normalizedPayload = payload as OpnsenseSetAliasItemPayload;
    } else if ('name' in payload && 'type' in payload && payload.name && payload.type) {
      // Payload is flat, convert it to the expected structure
      const flatPayload = payload as Record<string, unknown>;
      normalizedPayload = {
        alias: {
          name: flatPayload.name as string,
          description: (flatPayload.description as string) || '',
          enabled: (flatPayload.enabled as string) || '1',
          content: (flatPayload.content as string) || '',
          type: flatPayload.type as string,
          proto: (flatPayload.proto as string) || '',
          interface: (flatPayload.interface as string) || '',
          counters: (flatPayload.counters as string) || '',
          updatefreq: (flatPayload.updatefreq as string) || '',
          categories: (flatPayload.categories as string) || ''
        }
      };
      logger.debug(`Normalized payload:`, JSON.stringify(normalizedPayload, null, 2));
    } else {
      logger.error(`setAliasItem validation error: Invalid payload structure`);
      return { result: 'failed', message: 'Invalid payload structure' };
    }

    const { alias } = normalizedPayload;

    if (!alias.name || typeof alias.name !== 'string') {
      logger.error(`setAliasItem validation error: name is required and must be a string`);
      return { result: 'failed', message: 'name is required and must be a string' };
    }

    if (!alias.type || typeof alias.type !== 'string') {
      logger.error(`setAliasItem validation error: type is required and must be a string`);
      return { result: 'failed', message: 'type is required and must be a string' };
    }

    if (!alias.enabled || (alias.enabled !== '0' && alias.enabled !== '1')) {
      logger.error(`setAliasItem validation error: enabled must be '0' or '1', got: ${alias.enabled}`);
      // Default to enabled
      alias.enabled = '1';
    }

    // Make sure content is a string
    if (typeof alias.content !== 'string') {
      logger.error(`setAliasItem validation error: content must be a string`);
      alias.content = String(alias.content || '');
    }

    // Ensure all optional string fields are strings
    if (alias.proto && typeof alias.proto !== 'string') alias.proto = String(alias.proto);
    if (alias.interface && typeof alias.interface !== 'string') alias.interface = String(alias.interface);
    if (alias.counters && typeof alias.counters !== 'string') alias.counters = String(alias.counters);
    if (alias.updatefreq && typeof alias.updatefreq !== 'string') alias.updatefreq = String(alias.updatefreq);
    if (alias.categories && typeof alias.categories !== 'string') alias.categories = String(alias.categories);
    if (alias.description && typeof alias.description !== 'string') alias.description = String(alias.description);

    // Call the OPNsense API
    const response = await fetchFromOpnsense<OpnsenseSetItemResponse>(`/api/firewall/alias/setItem/${uuid}`, 'POST', normalizedPayload);
    logger.debug(`Raw response from OPNsense setAliasItem for UUID ${uuid}: Status - ${response.result}.`);
    return response;
  } catch (error) {
    logger.error(`Error in setAliasItem for UUID ${uuid}:`, error);
    return { result: 'failed', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Interface for the payload to add a new alias
export interface OpnsenseAddAliasItemPayload {
  alias: {
    enabled: string; // "1" or "0"
    name: string;
    type: string; // e.g., "host", "networkgroup"
    proto?: string;
    categories?: string;
    updatefreq?: string;
    content: string; // IP address for 'host', newline-separated names for 'networkgroup'
    interface?: string;
    description?: string;
    // Potentially other fields
  };
}

// Interface for the response of addItem (usually includes the new UUID)
export interface OpnsenseAddItemResponse {
  result: string; // e.g., "saved"
  uuid: string; // The UUID of the newly created alias
  // Potentially other fields like validations
}

export async function addAliasItem(payload: OpnsenseAddAliasItemPayload): Promise<OpnsenseAddItemResponse> {
  logger.debug(`addAliasItem: Creating alias with payload:`, payload);
  const response = await fetchFromOpnsense<OpnsenseAddItemResponse>('/api/firewall/alias/addItem', 'POST', payload);
  logger.debug(`addAliasItem: OPNsense response:`, response);
  return response;
}


// Function to get all host type aliases
export async function getHostAliases(): Promise<(OpnsenseAliasDetailFromExport & { uuid: string })[]> {
  const allAliasesResponse = await exportAliases();
  const hostAliases: (OpnsenseAliasDetailFromExport & { uuid: string })[] = [];
  if (allAliasesResponse && allAliasesResponse.aliases && allAliasesResponse.aliases.alias) {
    for (const uuid in allAliasesResponse.aliases.alias) {
      const aliasDetail = allAliasesResponse.aliases.alias[uuid];
      // Ensure the alias is of type 'host' or 'network' and has a uuid
      if ((aliasDetail.type === 'host' || aliasDetail.type === 'network') && uuid) {
        hostAliases.push({ ...aliasDetail, uuid });
      }
    }
  }
  return hostAliases;
}

// Function to get host aliases by IP address
export async function getHostAliasesByIp(ipAddress: string): Promise<(OpnsenseAliasDetailFromExport & { uuid: string })[]> {
  const allAliases = await getHostAliases();
  return allAliases.filter(alias => alias.type === 'host' && alias.content.trim() === ipAddress);
}

// Function to get host alias information for multiple IPs efficiently
export async function getHostAliasesForIps(ipAddresses: string[]): Promise<Map<string, { aliases: string[]; hasConflict: boolean }>> {
  const allAliases = await getHostAliases();
  const result = new Map<string, { aliases: string[]; hasConflict: boolean }>();

  // Initialize the result map
  ipAddresses.forEach(ip => {
    result.set(ip, { aliases: [], hasConflict: false });
  });

  // Find aliases that contain each IP
  allAliases.forEach(alias => {
    if (alias.type === 'host') {
      const ipsInAlias = alias.content.split('\n').map(ip => ip.trim()).filter(ip => ip);

      ipsInAlias.forEach(ip => {
        if (ipAddresses.includes(ip)) {
          const current = result.get(ip);
          if (current) {
            current.aliases.push(alias.name);
            // Mark as conflict if more than one alias contains this IP
            if (current.aliases.length > 1) {
              current.hasConflict = true;
            }
          }
        }
      });
    }
  });

  return result;
}

// Interface for findReferences payload
export interface OpnsenseFindReferencesPayload {
  ip: string; // Can be an IP address or an alias name
}

// Interface for findReferences response
export interface OpnsenseFindReferencesResponse {
  status: string; // e.g., "ok"
  matches: string[]; // Array of alias names where the IP/alias is found
}

export async function findAliasReferences(payload: OpnsenseFindReferencesPayload): Promise<OpnsenseFindReferencesResponse> {
  return fetchFromOpnsense<OpnsenseFindReferencesResponse>('/api/firewall/alias_util/findReferences', 'POST', payload);
}

// Interface for reconfigure response (likely simple status)
export interface OpnsenseReconfigureResponse {
  status: string; // e.g., "ok" or "done"
  // Potentially other fields
}

export async function reconfigureAliases(): Promise<OpnsenseReconfigureResponse> {
  // This endpoint typically doesn't require a body, but OPNsense might expect an empty JSON object for POST.
  // Our fetchFromOpnsense handles sending {} for POST if body is undefined.
  return fetchFromOpnsense<OpnsenseReconfigureResponse>('/api/firewall/alias/reconfigure', 'POST');
}
// Interface for the response of delItem (usually simple like {"result":"deleted"})
export interface OpnsenseDeleteItemResponse {
  result: string; // e.g., "deleted"
  // Potentially other fields like status or message
}

export async function deleteAliasItem(uuid: string): Promise<OpnsenseDeleteItemResponse> {
  // OPNsense delItem endpoint typically requires a POST request with an empty JSON body '{}'
  // However, semantically a DELETE request might be expected by some frameworks/clients.
  // Let's stick to POST as per OPNsense documentation examples for `delItem`.
  // If DELETE method is preferred, ensure fetchFromOpnsense handles it correctly (it should send '{}' body).
  // Using POST based on typical OPNsense API patterns for delete actions.
  return fetchFromOpnsense<OpnsenseDeleteItemResponse>(`/api/firewall/alias/delItem/${uuid}`, 'POST', {});
}


export async function getNetworkGroups(): Promise<NetworkGroup[]> {
  const exported = await exportAliases();
  const sizes = await getAliasTableSize();
  const globallyDisabledGroups = await prisma.globallyDisabledGroup.findMany();
  const disabledUuids = new Set(globallyDisabledGroups.map(g => g.opnsenseUuid));

  return Object.entries(exported.aliases.alias)
    .filter(([uuid, alias]) => alias.type === 'networkgroup' && !disabledUuids.has(uuid))
    .map(([uuid, alias]) => ({
      id: uuid,
      uuid,
      name: alias.name,
      description: alias.description,
      enabled: alias.enabled === '1',
      members: [], // Will be populated by the route handler
      itemCount: sizes.details[alias.name]?.count ?? 0,
      lastUpdated: sizes.details[alias.name]?.updated ?? null,
      rawContent: alias.content,
      type: alias.type,
      proto: alias.proto,
      interface: alias.interface,
      counters: alias.counters,
      updatefreq: alias.updatefreq,
      categories: alias.categories
    }));
}

export async function getNetworkGroupById(groupId: string): Promise<NetworkGroup | null> {
  const groups = await getNetworkGroups();
  return groups.find(g => g.id === groupId) || null;
}

// New helper function to find network group by OPNsense group name
export async function getNetworkGroupByName(groupName: string): Promise<NetworkGroup | null> {
  const groups = await getNetworkGroups();
  return groups.find(g => g.name === groupName) || null;
}

// New helper function to find network group by friendly name
export async function getNetworkGroupByFriendlyName(friendlyName: string): Promise<NetworkGroup | null> {
  const groups = await getNetworkGroups();
  const opnsenseGroupDisplays = await prisma.opnsenseGroupDisplay.findMany();

  // Find the OpnsenseGroupDisplay entry with this friendly name
  const displayEntry = opnsenseGroupDisplays.find(d => d.friendlyName === friendlyName);
  if (!displayEntry) {
    return null;
  }

  // Find the group with matching UUID
  return groups.find(g => g.id.toLowerCase() === displayEntry.opnsenseUuid.toLowerCase()) || null;
}

// New helper function to find host aliases by name
export async function getHostAliasesByName(hostAliasName: string): Promise<(OpnsenseAliasDetailFromExport & { uuid: string })[]> {
  const allAliases = await getHostAliases();
  return allAliases.filter(alias => alias.name === hostAliasName);
}

// New helper function to resolve group identifier from various parameter types
export async function resolveGroupIdentifier(
  groupId?: string,
  groupName?: string,
  groupFriendlyName?: string
): Promise<{ groupId: string; group: NetworkGroup } | null> {
  // Priority: groupId > groupName > groupFriendlyName
  if (groupId) {
    const group = await getNetworkGroupById(groupId);
    if (group) {
      return { groupId: group.id, group };
    }
  }

  if (groupName) {
    const group = await getNetworkGroupByName(groupName);
    if (group) {
      return { groupId: group.id, group };
    }
  }

  if (groupFriendlyName) {
    const group = await getNetworkGroupByFriendlyName(groupFriendlyName);
    if (group) {
      return { groupId: group.id, group };
    }

    // Fallback: If friendly name lookup fails (e.g., friendly names are not set in OpnsenseGroupDisplay),
    // try using the groupFriendlyName value as a direct group name
    // This handles the case where group types are enabled but display names are empty,
    // causing the UI to send the OPNsense group name in the groupFriendlyName field
    logger.debug(`Friendly name lookup failed for "${groupFriendlyName}", falling back to group name lookup`);
    const groupByName = await getNetworkGroupByName(groupFriendlyName);
    if (groupByName) {
      logger.debug(`Successfully resolved "${groupFriendlyName}" as group name: ${groupByName.name}`);
      return { groupId: groupByName.id, group: groupByName };
    }
  }

  return null;
}

// New helper function to resolve host alias identifier from various parameter types
export async function resolveHostAliasIdentifier(
  ipAddress?: string,
  hostAliasName?: string,
  hostAliasHostName?: string
): Promise<{ ipAddress: string; hostAliasName: string } | null> {
  // Priority: ipAddress + hostAliasName > ipAddress only > hostAliasName only > hostAliasHostName only

  // Case 1: ipAddress with hostAliasName (validate they match)
  if (ipAddress && hostAliasName) {
    const hostAliases = await getHostAliasesByIp(ipAddress);
    const matchingAlias = hostAliases.find(alias => alias.name === hostAliasName);
    if (matchingAlias) {
      return { ipAddress, hostAliasName };
    }

    // If they don't match, it might be because the host alias was recently renamed
    // In this case, use the actual current name of the host alias for this IP
    if (hostAliases.length > 0) {
      const actualHostAlias = hostAliases[0]; // Use the first (and typically only) host alias for this IP
      logger.debug(`Host alias name mismatch for IP ${ipAddress}: provided "${hostAliasName}", actual "${actualHostAlias.name}". Using actual name.`);
      return { ipAddress, hostAliasName: actualHostAlias.name };
    }

    // If no host alias exists for this IP, return null so it can be created
    return null;
  }

  // Case 2: ipAddress only
  if (ipAddress && !hostAliasName && !hostAliasHostName) {
    const hostAliases = await getHostAliasesByIp(ipAddress);
    logger.debug(`resolveHostAliasIdentifier: Found ${hostAliases.length} existing host aliases for IP ${ipAddress}:`,
      hostAliases.map(alias => ({ name: alias.name, content: alias.content, uuid: alias.uuid }))
    );
    if (hostAliases.length > 0) {
      logger.debug(`resolveHostAliasIdentifier: Using existing host alias "${hostAliases[0].name}" for IP ${ipAddress}`);
      return { ipAddress, hostAliasName: hostAliases[0].name };
    }
    // No existing host alias found, return null so it can be created
    logger.debug(`resolveHostAliasIdentifier: No existing host alias found for IP ${ipAddress}, will create new one`);
    return null;
  }

  // Case 3: hostAliasName only
  if (hostAliasName && !ipAddress && !hostAliasHostName) {
    const hostAliases = await getHostAliasesByName(hostAliasName);
    if (hostAliases.length > 0) {
      const ip = hostAliases[0].content.trim();
      return { ipAddress: ip, hostAliasName };
    }
    return null;
  }

  // Case 4: hostAliasHostName only (this would be a new field, for now treat same as hostAliasName)
  if (hostAliasHostName && !ipAddress && !hostAliasName) {
    // For now, treat hostAliasHostName the same as hostAliasName
    // This can be enhanced later when the hostAliasHostName field is implemented
    const hostAliases = await getHostAliasesByName(hostAliasHostName);
    if (hostAliases.length > 0) {
      const ip = hostAliases[0].content.trim();
      return { ipAddress: ip, hostAliasName: hostAliasHostName };
    }
    return null;
  }

  return null;
}

// Interface for batch operations
export interface BatchAliasOperation {
  type: 'add' | 'update' | 'delete';
  payload?: OpnsenseAddAliasItemPayload | OpnsenseSetAliasItemPayload;
  uuid?: string;
}

export interface BatchAliasResult {
  success: boolean;
  results: Array<{ operation: BatchAliasOperation; result: OpnsenseSetItemResponse | OpnsenseAddItemResponse | OpnsenseDeleteItemResponse | null; error?: string }>;
  reconfigureResult?: OpnsenseReconfigureResponse;
  error?: string;
}

/**
 * Deduplicate group content and log if duplicates were found.
 * This function is defensive - it cleans up corrupted data transparently without failing.
 *
 * @param content - Raw content string (newline-separated host aliases)
 * @param groupName - Optional group name for logging purposes
 * @returns Deduplicated content as newline-separated string
 */
export function deduplicateGroupContent(content: string, groupName?: string): string {
  if (!content || content.trim() === '') {
    return '';
  }

  // Split content into lines and filter out empty lines
  const lines = content.split('\n').filter(line => line.trim());

  // Track original count
  const originalCount = lines.length;

  // Use Set to deduplicate while preserving order (first occurrence wins)
  const uniqueLines = Array.from(new Set(lines));

  // Log if duplicates were found
  const duplicateCount = originalCount - uniqueLines.length;
  if (duplicateCount > 0) {
    const groupInfo = groupName ? ` in group "${groupName}"` : '';
    logger.warn(
      `Detected and removed ${duplicateCount} duplicate host alias(es)${groupInfo}. ` +
      `Original count: ${originalCount}, Deduplicated count: ${uniqueLines.length}`
    );

    // Log the duplicates for debugging
    const duplicates = lines.filter((line, index) => lines.indexOf(line) !== index);
    const uniqueDuplicates = Array.from(new Set(duplicates));
    logger.debug(`Duplicate host aliases found${groupInfo}:`, uniqueDuplicates);
  }

  return uniqueLines.join('\n');
}

/**
 * Parse and deduplicate group content from raw content string.
 * Returns an array of unique, non-empty host alias names.
 *
 * @param rawContent - Raw content string from OPNsense
 * @param groupName - Optional group name for logging
 * @returns Array of unique host alias names
 */
export function parseGroupContent(rawContent: string | undefined, groupName?: string): string[] {
  if (!rawContent || rawContent.trim() === '') {
    return [];
  }

  // Deduplicate the content
  const deduplicated = deduplicateGroupContent(rawContent, groupName);

  // Return as array
  return deduplicated.split('\n').filter(line => line.trim());
}

/**
 * Execute multiple OPNsense alias operations in sequence, then reconfigure once at the end
 * This is much faster than calling reconfigureAliases after each operation
 */
export async function batchAliasOperations(operations: BatchAliasOperation[]): Promise<BatchAliasResult> {
  logger.debug(`batchAliasOperations: Starting batch of ${operations.length} operations`);

  const results: Array<{ operation: BatchAliasOperation; result: OpnsenseSetItemResponse | OpnsenseAddItemResponse | OpnsenseDeleteItemResponse | null; error?: string }> = [];
  let hasErrors = false;

  try {
    // Execute all operations sequentially (OPNsense doesn't support parallel operations well)
    for (const operation of operations) {
      try {
        logger.debug(`batchAliasOperations: Executing ${operation.type} operation`);

        let result;
        switch (operation.type) {
          case 'add':
            if (!operation.payload) {
              throw new Error('Payload required for add operation');
            }
            result = await addAliasItem(operation.payload as OpnsenseAddAliasItemPayload);
            break;

          case 'update':
            if (!operation.uuid || !operation.payload) {
              throw new Error('UUID and payload required for update operation');
            }
            result = await setAliasItem(operation.uuid, operation.payload as OpnsenseSetAliasItemPayload);
            break;

          case 'delete':
            if (!operation.uuid) {
              throw new Error('UUID required for delete operation');
            }
            result = await deleteAliasItem(operation.uuid);
            break;

          default:
            throw new Error(`Unknown operation type: ${(operation as BatchAliasOperation).type}`);
        }

        results.push({ operation, result });
        logger.debug(`batchAliasOperations: ${operation.type} operation completed successfully with result:`, result);

      } catch (error) {
        logger.error(`batchAliasOperations: ${operation.type} operation failed:`, error);
        results.push({
          operation,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        hasErrors = true;
      }
    }

    // Only reconfigure if we have operations and no critical errors
    let reconfigureResult: OpnsenseReconfigureResponse | undefined;
    if (operations.length > 0 && !hasErrors) {
      logger.debug(`batchAliasOperations: Executing single reconfigureAliases for ${operations.length} operations`);
      reconfigureResult = await reconfigureAliases();
      logger.debug(`batchAliasOperations: reconfigureAliases completed with status: ${reconfigureResult.status}`);
    }

    return {
      success: !hasErrors && reconfigureResult?.status === 'ok',
      results,
      reconfigureResult
    };

  } catch (error) {
    logger.error('batchAliasOperations: Batch operation failed:', error);
    return {
      success: false,
      results,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function addIpToGroup(groupId: string, ipAddress: string, description?: string): Promise<{ success: boolean; message: string; updatedGroup?: NetworkGroup | null }> {
  try {
    logger.debug(`addIpToGroup: Starting addition of IP ${ipAddress} to group ${groupId}`);

    const group = await getNetworkGroupById(groupId);
    if (!group) {
      logger.warn(`addIpToGroup: Group with ID ${groupId} not found`);
      return { success: false, message: `Group with ID ${groupId} not found.` };
    }

    logger.debug(`addIpToGroup: Found group ${group.name} with content: ${group.rawContent}`);

    // Get current content and deduplicate defensively (handles corrupted existing data)
    const currentContent = parseGroupContent(group.rawContent, group.name);

    // Check if IP is already in the group directly
    if (currentContent.includes(ipAddress)) {
      logger.warn(`addIpToGroup: IP ${ipAddress} already in group ${group.name}`);
      return { success: false, message: `IP ${ipAddress} is already in group ${group.name}.` };
    }

    // Check if host alias exists first
    const existingAliases = await getHostAliasesByIp(ipAddress);
    let itemToAdd = existingAliases.length > 0 ? existingAliases[0].name : null;

    const operations: BatchAliasOperation[] = [];

    // Add host alias creation to batch if needed
    if (!itemToAdd) {
      const { aliasName, detectedHostname } = await getBestHostAliasName(ipAddress);
      logger.debug(`addIpToGroup: Creating new host alias ${aliasName} for IP ${ipAddress}`);

      operations.push({
        type: 'add',
        payload: {
          alias: {
            enabled: '1',
            name: aliasName,
            type: 'host',
            content: ipAddress,
            description: description || `Auto-created host alias for IP ${ipAddress}${detectedHostname ? ` (detected hostname: ${detectedHostname})` : ''}`,
            proto: '',
            interface: '',
            counters: '0',
            updatefreq: '',
            categories: ''
          }
        }
      });
      itemToAdd = aliasName;
    } else {
      logger.debug(`addIpToGroup: Using existing host alias ${itemToAdd} for IP ${ipAddress}`);
    }

    // Check if host alias is already in the group
    if (currentContent.includes(itemToAdd)) {
      logger.info(`addIpToGroup: Host alias ${itemToAdd} already in group ${group.name}, operation is idempotent - returning success`);
      return { success: true, message: `Host alias ${itemToAdd} (IP: ${ipAddress}) is already in group ${group.name}.` };
    }

    // Use Set to build new content (prevents duplicates even if currentContent had issues)
    const contentSet = new Set(currentContent);
    contentSet.add(itemToAdd);
    const newContent = Array.from(contentSet).join('\n');

    logger.debug(`addIpToGroup: Adding ${itemToAdd} to group. New content: ${newContent}`);

    operations.push({
      type: 'update',
      uuid: groupId,
      payload: {
        alias: {
          enabled: group.enabled ? '1' : '0',
          name: group.name,
          type: group.type || 'networkgroup',
          content: newContent,
          description: group.description || '',
          proto: group.proto || '',
          interface: group.interface || '',
          counters: group.counters || '',
          updatefreq: group.updatefreq || '',
          categories: group.categories || ''
        }
      }
    });

    // Execute batch operation with single reconfigure
    logger.debug(`addIpToGroup: Executing batch operation with ${operations.length} operations`);
    const batchResult = await batchAliasOperations(operations);

    if (batchResult.success) {
      logger.debug(`addIpToGroup: Successfully added ${itemToAdd} to group ${group.name}`);
      return { success: true, message: `${itemToAdd} added to group ${group.name}.` };
    } else {
      logger.error(`addIpToGroup: Batch operation failed:`, batchResult);
      const errorMessages = batchResult.results
        .filter(r => r.error)
        .map(r => r.error)
        .join(', ');
      return { success: false, message: `Failed to update group: ${errorMessages}` };
    }

  } catch (error) {
    logger.error(`addIpToGroup: Error adding IP ${ipAddress} to group ${groupId}:`, error);
    return { success: false, message: `Error adding IP to group: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function removeIpFromGroup(groupId: string, ipAddress: string, hostAliasName?: string): Promise<{ success: boolean; message: string; updatedGroup?: NetworkGroup | null }> {
  try {
    logger.debug(`removeIpFromGroup: Starting removal of IP ${ipAddress} from group ${groupId}, hostAliasName: ${hostAliasName}`);

    const group = await getNetworkGroupById(groupId);
    if (!group) {
      logger.warn(`removeIpFromGroup: Group with ID ${groupId} not found`);
      return { success: false, message: `Group with ID ${groupId} not found.` };
    }

    logger.debug(`removeIpFromGroup: Found group ${group.name} with content: ${group.rawContent}`);

    // Get current content and deduplicate defensively (handles corrupted existing data)
    const currentContent = parseGroupContent(group.rawContent, group.name);
    let itemToRemove = ipAddress;
    let itemFound = false;

    // First, try to find the IP address directly in the content
    if (currentContent.includes(ipAddress)) {
      itemToRemove = ipAddress;
      itemFound = true;
      logger.debug(`removeIpFromGroup: Found IP ${ipAddress} directly in group content`);
    }
    // If IP not found but hostAliasName is provided, try to remove the hostname
    else if (hostAliasName && currentContent.includes(hostAliasName)) {
      itemToRemove = hostAliasName;
      itemFound = true;
      logger.debug(`removeIpFromGroup: Found hostname ${hostAliasName} in group content`);
    }
    // If neither IP nor hostname found, try to find any hostname that resolves to this IP
    else {
      logger.debug(`removeIpFromGroup: Neither IP ${ipAddress} nor hostname ${hostAliasName} found directly. Checking host aliases...`);

      // Get all host aliases to find which hostname corresponds to this IP
      try {
        const hostAliases = await getHostAliasesByIp(ipAddress);
        logger.debug(`removeIpFromGroup: Found ${hostAliases.length} host aliases for IP ${ipAddress}:`, hostAliases.map(h => h.name));

        // Check if any of the host aliases are in the group content
        for (const hostAlias of hostAliases) {
          if (currentContent.includes(hostAlias.name)) {
            itemToRemove = hostAlias.name;
            itemFound = true;
            logger.debug(`removeIpFromGroup: Found matching hostname ${hostAlias.name} in group content`);
            break;
          }
        }
      } catch (error) {
        logger.warn(`removeIpFromGroup: Error fetching host aliases for IP ${ipAddress}:`, error);
      }
    }

    if (!itemFound) {
      logger.warn(`removeIpFromGroup: Neither IP ${ipAddress} nor any corresponding hostname found in group ${group.name} content: ${group.rawContent}`);
      return { success: false, message: `IP ${ipAddress} or corresponding hostname not found in group ${group.name}.` };
    }

    // Remove the item from content using Set (ensures no duplicates remain)
    const contentSet = new Set(currentContent);
    contentSet.delete(itemToRemove);
    const newContent = Array.from(contentSet).join('\n');

    logger.debug(`removeIpFromGroup: Removing ${itemToRemove} from group. New content: ${newContent}`);

    // Use batch operations for single update
    const batchResult = await batchAliasOperations([{
      type: 'update',
      uuid: groupId,
      payload: {
        alias: {
          name: group.name,
          type: group.type || 'networkgroup',
          proto: group.proto,
          interface: group.interface,
          counters: group.counters,
          updatefreq: group.updatefreq,
          content: newContent,
          enabled: group.enabled ? '1' : '0',
          description: group.description,
        },
      }
    }]);

    if (batchResult.success) {
      logger.debug(`removeIpFromGroup: Successfully removed ${itemToRemove} from group ${group.name}`);
      return {
        success: true,
        message: `${itemToRemove} removed from group ${group.name}.`,
      };
    } else {
      logger.error(`removeIpFromGroup: Batch operation failed:`, batchResult);
      const errorMessages = batchResult.results
        .filter(r => r.error)
        .map(r => r.error)
        .join(', ');
      return { success: false, message: `Failed to update group: ${errorMessages}` };
    }

  } catch (error) {
    logger.error(`removeIpFromGroup: Error removing IP ${ipAddress} from group ${groupId}:`, error);
    return { success: false, message: `Error removing IP from group: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function get_arpTable(): Promise<OpnsenseArpEntry[]> {
  return fetchFromOpnsense<OpnsenseArpEntry[]>('/api/diagnostics/interface/get_arp');
}

export interface OpnsenseInterfaceOverview {
  macaddr?: string;
  macaddr_hw?: string;
  [key: string]: unknown; // Allow for other properties
}

export async function getInterfacesOverview(): Promise<OpnsenseInterfaceOverview[]> {
  return fetchFromOpnsense<OpnsenseInterfaceOverview[]>('/api/interfaces/overview/export');
}

/**
 * Fetch MAC addresses from OPNsense interfaces to identify router/firewall MACs
 */
export async function getOpnsenseMacAddresses(): Promise<string[]> {
  try {
    const interfaces = await getInterfacesOverview();
    const macAddresses = new Set<string>();

    interfaces.forEach(iface => {
      // Add both macaddr and macaddr_hw if they exist and are valid
      [iface.macaddr, iface.macaddr_hw].forEach(mac => {
        if (mac && mac !== '00:00:00:00:00:00' && mac.length === 17) {
          macAddresses.add(mac.toLowerCase());
        }
      });
    });

    return Array.from(macAddresses);
  } catch (error) {
    logger.warn('Failed to fetch OPNsense MAC addresses:', error);
    return [];
  }
}

export async function getOpenVpnSessions(): Promise<OpnsenseVpnEntry[]> {
  const opnsenseVpnSessionsResponse: { rows: OpnsenseVpnSession[] } = await fetchFromOpnsense('/api/openvpn/service/searchSessions');
  return opnsenseVpnSessionsResponse.rows.map((session: OpnsenseVpnSession) => ({
    ...session, // Include all original properties
    id: session.id ?? '',
    name: session.description ?? '', // Use description as name, provide fallback
    type: VpnClientType.OpenVPN,
    enabled: session.enabled ?? '0', // Default to '0' if not present
  }));
}

export async function getWireguardClients(): Promise<OpnsenseVpnEntry[]> {
  const [clientsResponse, serviceResponse] = await Promise.all([
    fetchFromOpnsense<OpnsenseWireguardClientResponse>('/api/wireguard/client/search_client'),
    fetchFromOpnsense<OpnsenseWireguardServiceResponse>('/api/wireguard/service/show'),
  ]);

  const servicePeersMap = new Map<string, OpnsenseWireguardServicePeer>();
  serviceResponse.rows.forEach(entry => {
    if (entry.type === 'peer') {
      servicePeersMap.set(entry['public-key'], entry);
    }
  });

  return clientsResponse.rows.map((client: OpnsenseWireguardClient) => {
    const matchingPeer = servicePeersMap.get(client.pubkey);
    let status: string | undefined;

    if (matchingPeer) {
      // Prioritize live status from service/show if available
      status = matchingPeer['peer-status'];
    } else {
      // Fallback to enabled status if no live peer status
      status = client.enabled === '1' ? 'online' : 'offline';
    }

    return {
      ...client,
      id: client.uuid ?? '',
      name: client.name ?? '',
      type: VpnClientType.WireGuard,
      status: status, // Add the determined status
    };
  });
}

export async function getIpsecConnections(): Promise<OpnsenseVpnEntry[]> {
  const opnsenseIpsecSessionsResponse: OpnsenseIpsecConnectionResponse = await fetchFromOpnsense('/api/ipsec/sessions/search_phase1');
  return opnsenseIpsecSessionsResponse.rows.map((session: OpnsenseIpsecConnection) => ({
    ...session, // Include all original properties
    id: session.ikeid ?? '', // Use ikeid as id for IPsec sessions
    name: session.phase1desc ?? session.ikeid ?? '', // Use phase1desc as name, fallback to ikeid
    type: VpnClientType.IPsec,
    status: session.connected ? 'connected' : 'disconnected', // Derive status from 'connected' boolean
  }));
}

export interface VpnStatusResponse {
  vpnStatuses: {
    id: string;
    status: 'connected' | 'disconnected' | 'disabled'; // Updated to include 'disabled'
    opnsenseNetworkGroupId: string;
    type: string;
    enabled?: string; // Add enabled status for WireGuard
    vpnName?: string | null;
    friendlyName?: string | null;
  }[];
  groupVpnMap: Record<string, string>;
}
