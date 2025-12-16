import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/auditLog';
import { logger } from '@/lib/logger';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import {
  removeIpFromGroup,
  exportAliases,
  resolveGroupIdentifier,
  resolveHostAliasIdentifier,
  batchAliasOperations,
  getNetworkGroupById,
  getHostAliasesByName,
  getBestHostAliasName,
  createHostAliasFromHostname,
  addAliasItem,
  parseGroupContent
} from '@/lib/opnsense-api';
import * as ipaddr from 'ipaddr.js';
import { prisma } from '@/lib/prisma';
import type { NetworkGroup } from '@/types/opnsense';
import type { ValidLocalNetwork } from '@/types/settings';
import { isIpAllowedForSelfService } from '@/lib/network-utils';
import { fetchUnmanagedGroupFilterData, isHostInUnmanagedGroups } from '@/lib/unmanaged-group-utils';

/**
 * API endpoint for managing host alias group assignments
 * Supports both session authentication and API keys
 *
 * Operations:
 * - assign: Assign a host alias to a group (removes from other groups if moveFromExisting=true)
 * - unassign: Unassign a host alias from a group or from all groups if groupId is not provided
 *
 * For unauthenticated users, only allows operations on the client's own IP address
 *
 * Validation Rules:
 * - Group assignments are rejected if the target group is disabled in OPNsense
 * - Group assignments are rejected if the target group has an associated VPN that is disconnected or disabled
 * - This ensures consistency with UI behavior where disabled groups and disconnected VPNs are greyed out and non-selectable
 * - Error response includes detailed message about the disabled group status or VPN connection issues
 * - Audit logs track validation failures with 'GROUP_DISABLED' or 'VPN_DISCONNECTED' classification
 */

// Removed unused interface VpnInfo

interface OpnsenseGroupDisplay {
  id: string;
  opnsenseUuid: string;
  friendlyName: string;
  iconIdentifier: string | null;
  groupType?: 'SingleSelect' | 'MultiSelect';
}

interface AssignRequestBody {
  ipAddress?: string;
  hostAliasName?: string;
  hostAliasHostName?: string;
  hostname?: string;
  groupId?: string;
  groupName?: string;
  groupFriendlyName?: string;
  description?: string;
  moveFromExisting?: boolean;
}

interface UnassignRequestBody {
  ipAddress?: string;
  hostAliasName?: string;
  hostAliasHostName?: string;
  groupId?: string;
  groupName?: string;
  groupFriendlyName?: string;
}

interface HostAliasInput {
  ipAddress?: string;
  hostAliasName?: string;
  hostAliasHostName?: string;
  hostname?: string;
  description?: string;
}

interface GroupInput {
  groupId?: string;
  groupName?: string;
  groupFriendlyName?: string;
}

interface BatchOperationItem {
  type: 'add' | 'update' | 'delete';
  uuid?: string;
  payload?: OpnsenseAddAliasItemPayload | OpnsenseSetAliasItemPayload;
}

// Removed BatchResultItem interface as it is no longer used

interface BatchRequestBody {
  hostAliases?: HostAliasInput[];
  groups?: GroupInput[];
  batchOperations?: BatchOperationItem[];
  description?: string; // This was an unused variable in the original code, but including it here for completeness if it's ever used.
  moveFromExisting?: boolean;
  operationType?: 'assign' | 'unassign';
  // New: when true, and moveFromExisting is true, only remove from SingleSelect groups (preserve MultiSelect)
  restrictRemovalToSingleSelect?: boolean;
  // New: when true and assigning to a SingleSelect target, enforce uniqueness by removing from other SingleSelect groups even if moveFromExisting=false
  enforceSingleSelectUniqueness?: boolean;
}

interface OperationResult {
  hostAlias?: {
    ipAddress: string;
    hostAliasName: string;
  };
  group?: {
    groupId: string;
    group: NetworkGroup; // This should be the full NetworkGroup object
    groupName?: string;
    groupFriendlyName?: string;
  };
  success: boolean;
  error?: string;
  removedFromGroups?: { id: string; name: string; friendlyName: string | null }[];
}

interface OpnsenseAliasDetail {
  uuid?: string;
  name: string;
  type: string;
  content: string;
  description?: string;
  enabled: string; // Changed from '0' | '1' to string
  proto?: string;
  interface?: string;
  updatefreq?: string;
  categories?: string;
  counters?: string;
}

// Import necessary types from opnsense-api.ts
import type { BatchAliasOperation, OpnsenseAddAliasItemPayload, OpnsenseSetAliasItemPayload, BatchAliasResult } from '@/lib/opnsense-api';

// Helper function to check if an IP is contained in an alias's content
function aliasContentContainsIp(aliasContent: string, ip: string): boolean {
  if (!aliasContent) return false;

  const entries = aliasContent.split(/[\s,]+/).filter(Boolean); // Split by space or comma

  try {
    const parsedIp = ipaddr.parse(ip); // Parse the input IP once

    return entries.some(entry => {
      // Direct IP match
      if (entry === ip) {
        return true;
      }

      // CIDR notation check using ipaddr.js
      if (entry.includes('/')) {
        try {
          const cidr = ipaddr.parseCIDR(entry);
          // Ensure IP versions match before attempting to match CIDR
          if (parsedIp.kind() !== cidr[0].kind()) {
            logger.warn(`Skipping CIDR entry ${entry} due to IP version mismatch with ${ip}.`);
            return false; // Skip this entry, continue to the next
          }
          if (parsedIp.match(cidr)) {
            return true;
          }
        } catch (e) {
          // Log or handle invalid CIDR entries if necessary
          logger.warn(`Invalid CIDR entry in alias content: ${entry}. Skipping. Error: ${(e as Error).message}`, e);
        }
      }
      // For now, if it's not a direct IP or a valid CIDR, it doesn't match.
      return false;
    });
  } catch (e) {
    // Handle cases where the input 'ip' itself is invalid
    logger.error(`Invalid IP address provided to aliasContentContainsIp: ${ip}`, e);
    return false;
  }
}

// Helper function to get VPN status for a specific group (only when needed)
async function getVpnStatusForGroup(groupId: string): Promise<{ vpnUuid: string; status: 'connected' | 'disconnected' | 'disabled'; type: string; enabled?: string } | null> {
  try {
    // First check if the group has a VPN mapping
    const vpnMapping = await prisma.vpnMapping.findFirst({
      where: { opnsenseNetworkGroupId: groupId },
      select: { vpnUuid: true }
    });

    if (!vpnMapping?.vpnUuid) {
      return null; // No VPN associated with this group
    }

    // Use server-side utility to get VPN status
    const { getVpnStatusServer } = await import('@/lib/server/vpn-status-utils');
    const internalResult = await getVpnStatusServer();

    if (!internalResult.success) {
      logger.error(`Failed to fetch VPN status for group ${groupId}`);
      return null;
    }

    const vpnData = internalResult.data;

    if (!vpnData) {
      logger.error(`No VPN data returned for group ${groupId}`);
      return null;
    }

    const vpnInfo = vpnData.vpnStatuses?.find((vpn: { id: string; status: 'connected' | 'disconnected' | 'disabled'; enabled?: string; type: unknown; details: Record<string, unknown> }) => vpn.id === vpnMapping.vpnUuid);

    if (vpnInfo) {
      return {
        vpnUuid: vpnMapping.vpnUuid,
        status: vpnInfo.status,
        type: (vpnInfo.details?.type || vpnInfo.type || 'unknown') as string,
        enabled: vpnInfo.enabled
      };
    }

    return null;
  } catch (error) {
    logger.error(`Error checking VPN status for group ${groupId}:`, error);
    return null;
  }
}

// Helper function to get the groups an IP belongs to
async function getIpGroupMembership(ipAddress: string): Promise<NetworkGroup[]> {
  try {
    const [allAliasesResponse, opnsenseGroupDisplays] = await Promise.all([
      exportAliases(),
      prisma.opnsenseGroupDisplay.findMany({ orderBy: { friendlyName: 'asc' } }),
    ]);

    if (!allAliasesResponse?.aliases?.alias) {
      throw new Error('Could not retrieve aliases from OPNsense');
    }

    const allAliasDetails: OpnsenseAliasDetail[] = Object.entries(allAliasesResponse.aliases.alias)
      .map(([uuid, detail]) => ({ ...detail, uuid }));

    const hostAndNetworkAliasesContainingIp: OpnsenseAliasDetail[] = [];

    for (const alias of allAliasDetails) {
      // Consider 'host', 'network', 'url', 'geoip' types as potentially containing IPs directly or indirectly.
      if (alias.type !== 'networkgroup') {
        if (aliasContentContainsIp(alias.content, ipAddress)) {
          hostAndNetworkAliasesContainingIp.push(alias);
        }
      }
    }

    const memberOfGroupNames = new Set<string>();
    const memberOfGroups: NetworkGroup[] = [];

    for (const groupAlias of allAliasDetails) {
      if (groupAlias.type === 'networkgroup' && groupAlias.content) {
        const memberAliasNames = groupAlias.content.split(/\n|,/).map(name => name.trim()).filter(Boolean);

        for (const memberName of memberAliasNames) {
          if (hostAndNetworkAliasesContainingIp.some((hnAlias: OpnsenseAliasDetail) => hnAlias.name === memberName)) {
            if (!memberOfGroupNames.has(groupAlias.name)) {
              memberOfGroupNames.add(groupAlias.name);

              const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === (groupAlias.uuid || '').toLowerCase());

              memberOfGroups.push({
                id: groupAlias.uuid || groupAlias.name,
                uuid: groupAlias.uuid || '',
                name: groupAlias.name,
                description: groupAlias.description || '',
                enabled: groupAlias.enabled === '1',
                members: [],
                lastUpdated: null,
                rawContent: groupAlias.content,
                type: groupAlias.type,
                friendlyName: displayInfo?.friendlyName || groupAlias.name,
                iconIdentifier: displayInfo?.iconIdentifier || null,
              });
            }
            break;
          }
        }
      }
    }

    return memberOfGroups;
  } catch (error) {
    logger.error('Error fetching IP group membership:', error);
    throw new Error('Failed to determine IP group membership');
  }
}

export async function POST(request: Request) {
  // Get client IP address for validation
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

  // Authenticate the request (works with both session and API key)
  const auth = await authenticateRequest(request);

  // For self-service operations, we allow unauthenticated access
  // but we still need to check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  try {
    const body = await request.json();
    const {
      operation,
      // Single operation parameters (backward compatibility)
      // These are destructured in the handler functions, so no need to destructure them here.
      // ipAddress,
      // hostAliasName,
      // hostAliasHostName,
      // groupId,
      // groupName,
      // groupFriendlyName,
      // description,
      // moveFromExisting = true,
      // // New batch operation parameters
      // hostAliases, // Array of host alias objects
      // groups, // Array of group objects
      // batchOperations, // Array of operation objects
      // operationType = 'assign' // New parameter: 'assign' or 'unassign'
    } = body;

    // Get the friendly name for groups and groupType if available (normalize to typed union)
    const opnsenseGroupDisplays: OpnsenseGroupDisplay[] = (await prisma.opnsenseGroupDisplay.findMany()).map(d => ({
      id: d.id,
      opnsenseUuid: d.opnsenseUuid,
      friendlyName: d.friendlyName,
      iconIdentifier: d.iconIdentifier,
      groupType: d.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect'
    }));

    // Get allowed networks for self-service validation
    const globalSettings = await prisma.globalSettings.findFirst({
      orderBy: { id: 'asc' },
    });
    const allowedNetworks = (globalSettings?.allowedNetworks || []) as unknown as ValidLocalNetwork[];

    // Log the authentication method if user is authenticated
    const authMethod = auth.user
      ? (auth.method === 'apiKey' ? `API Key (${auth.apiKeyId})` : 'Session')
      : 'Unauthenticated (Client IP)';

    const userId = auth.user?.id || null;

    // Handle different operations
    switch (operation) {
      case 'assign':
        return await handleAssignOperation(
          body,
          authMethod,
          userId,
          clientIp,
          allowedNetworks,
          opnsenseGroupDisplays
        );

      case 'unassign':
        return await handleUnassignOperation(
          body,
          authMethod,
          userId,
          clientIp,
          allowedNetworks,
          opnsenseGroupDisplays
        );

      case 'batch':
        return await handleBatchOperation(
          body,
          authMethod,
          userId,
          clientIp,
          allowedNetworks,
          opnsenseGroupDisplays
        );

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid operation. Must be one of: assign, unassign, batch'
        }, { status: 400 });
    }
  } catch (error) {
    logger.error(`Error in host-group-management API:`, error);
    await logAuditEvent({
      userId: auth.user?.id || null,
      action: 'OPNSENSE_GROUP_IP_OPERATION_FAILURE',
      details: {
        reason: 'Exception during operation',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        clientIp
      },
    });

    // Track usage for authenticated requests (even failed ones)
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 500);
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to process host group management request'
    }, { status: 500 });
  }
}

// Handler for single assign operation (backward compatibility)
async function handleAssignOperation(
  body: AssignRequestBody,
  authMethod: string,
  userId: string | null,
  clientIp: string,
  allowedNetworks: ValidLocalNetwork[],
  opnsenseGroupDisplays: OpnsenseGroupDisplay[]
) {
  const {
    ipAddress,
    hostAliasName,
    hostAliasHostName,
    hostname, // New parameter for hostname-based host alias creation
    groupId,
    groupName,
    groupFriendlyName,
    description,
    moveFromExisting = true
  } = body;

  // Resolve host alias identifier from various parameter combinations
  let resolvedHostAlias = await resolveHostAliasIdentifier(ipAddress, hostAliasName, hostAliasHostName);

  // If host alias cannot be resolved, create it
  if (!resolvedHostAlias) {
    // Case 1: hostname is provided, create from hostname
    if (hostname) {
      try {
        logger.debug(`Creating host alias from hostname "${hostname}" for single assign operation`);

        const hostAliasInfo = await createHostAliasFromHostname(hostname, ipAddress);
        const aliasName = hostAliasInfo.aliasName;
        const content = hostAliasInfo.ipAddress;

        // Create the host alias first
        const createResult = await addAliasItem({
          alias: {
            enabled: '1',
            name: aliasName,
            type: 'host',
            content: content,
            description: description || `Auto-created from hostname: ${hostAliasInfo.originalHostname}`,
            proto: '',
            interface: '',
            updatefreq: '',
            categories: ''
          }
        });

        if (createResult.result === 'saved') {
          logger.debug(`Successfully created host alias "${aliasName}" from hostname "${hostname}"`);
          resolvedHostAlias = {
            ipAddress: content,
            hostAliasName: aliasName
          };
        } else {
          logger.error(`OPNsense API failed to create host alias "${aliasName}":`, createResult);
          throw new Error(`Failed to create host alias: ${createResult.result || 'Unknown error'}. Full response: ${JSON.stringify(createResult)}`);
        }
      } catch (error) {
        logger.error(`Failed to create host alias from hostname "${hostname}":`, error);
        return NextResponse.json({
          success: false,
          message: `Failed to create host alias from hostname: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, { status: 500 });
      }
    }
    // Case 2: only ipAddress is provided, create from IP address
    else if (ipAddress) {
      try {
        logger.debug(`Creating host alias from IP address "${ipAddress}" for single assign operation`);

        const { aliasName, detectedHostname } = await getBestHostAliasName(ipAddress);

        // Create the host alias first
        const createResult = await addAliasItem({
          alias: {
            enabled: '1',
            name: aliasName,
            type: 'host',
            content: ipAddress,
            description: description || `Auto-created host alias for IP ${ipAddress}${detectedHostname ? ` (detected hostname: ${detectedHostname})` : ''}`,
            proto: '',
            interface: '',
            updatefreq: '',
            categories: ''
          }
        });

        if (createResult.result === 'saved') {
          logger.debug(`Successfully created host alias "${aliasName}" from IP address "${ipAddress}"`);
          resolvedHostAlias = {
            ipAddress: ipAddress,
            hostAliasName: aliasName
          };
        } else {
          throw new Error(`Failed to create host alias: ${createResult.result || 'Unknown error'}`);
        }
      } catch (error) {
        logger.error(`Failed to create host alias from IP address "${ipAddress}":`, error);
        return NextResponse.json({
          success: false,
          message: `Failed to create host alias from IP address: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, { status: 500 });
      }
    }
  }

  if (!resolvedHostAlias) {
    return NextResponse.json({
      success: false,
      message: 'Could not resolve host alias. Please provide valid ipAddress, hostAliasName, hostAliasHostName, or hostname parameters.'
    }, { status: 400 });
  }

  const { ipAddress: resolvedIpAddress, hostAliasName: resolvedHostAliasName } = resolvedHostAlias;

  // Check if the IP is allowed for self-service operations
  const ipValidation = isIpAllowedForSelfService(
    clientIp,
    resolvedIpAddress,
    allowedNetworks,
    true // Assume authenticated for now
  );

  if (!ipValidation.isAllowed) {
    logger.warn(`Self-service access denied for IP ${resolvedIpAddress} from client IP ${clientIp}: ${ipValidation.reason}`);
    return NextResponse.json({
      success: false,
      message: `Unauthorized: ${ipValidation.reason}`
    }, { status: 401 });
  }

  // Resolve group identifier from various parameter combinations
  const resolvedGroup = await resolveGroupIdentifier(groupId, groupName, groupFriendlyName);

  if (!resolvedGroup) {
    return NextResponse.json({
      success: false,
      message: 'Could not resolve group. Please provide valid groupId, groupName, or groupFriendlyName parameters.'
    }, { status: 400 });
  }

  const { groupId: resolvedGroupId, group } = resolvedGroup;

  // Check if the target group is enabled - consistent with UI validation
  if (!group.enabled) {
    const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === resolvedGroupId.toLowerCase());
    const groupDisplayName = displayInfo?.friendlyName || group.name;

    logger.warn(`Assignment rejected: Target group "${groupDisplayName}" is disabled in OPNsense`);

    await logAuditEvent({
      userId,
      action: 'OPNSENSE_GROUP_IP_ASSIGN_FAILURE',
      details: {
        operationType: 'assign',
        groupId: resolvedGroupId,
        groupName: group.name,
        groupFriendlyName: displayInfo?.friendlyName || null,
        ipAddress: resolvedIpAddress,
        hostAliasName: resolvedHostAliasName,
        hostAliasHostName: hostAliasHostName || null,
        reason: `Target group "${groupDisplayName}" is disabled in OPNsense`,
        authMethod,
        validationFailure: 'GROUP_DISABLED'
      },
    });

    return NextResponse.json({
      success: false,
      message: `Cannot assign to group "${groupDisplayName}" because it is disabled in OPNsense. Please enable the group first or contact an administrator.`
    }, { status: 400 });
  }

  // Check if the target group has an associated VPN that is disconnected or disabled - consistent with UI validation
  const vpnStatus = await getVpnStatusForGroup(resolvedGroupId);
  if (vpnStatus && (vpnStatus.status === 'disconnected' || vpnStatus.status === 'disabled')) {
    const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === resolvedGroupId.toLowerCase());
    const groupDisplayName = displayInfo?.friendlyName || group.name;
    const vpnTypeDisplay = vpnStatus.type === 'openvpn' ? 'OpenVPN' :
      vpnStatus.type === 'wireguard' ? 'WireGuard' :
        vpnStatus.type === 'ipsec' ? 'IPsec' : vpnStatus.type;

    logger.warn(`Assignment rejected: Target group "${groupDisplayName}" has ${vpnTypeDisplay} VPN that is ${vpnStatus.status}`);

    await logAuditEvent({
      userId,
      action: 'OPNSENSE_GROUP_IP_ASSIGN_FAILURE',
      details: {
        operationType: 'assign',
        groupId: resolvedGroupId,
        groupName: group.name,
        groupFriendlyName: displayInfo?.friendlyName || null,
        ipAddress: resolvedIpAddress,
        hostAliasName: resolvedHostAliasName,
        hostAliasHostName: hostAliasHostName || null,
        reason: `Target group "${groupDisplayName}" has ${vpnTypeDisplay} VPN that is ${vpnStatus.status}`,
        authMethod,
        validationFailure: 'VPN_DISCONNECTED',
        vpnDetails: {
          vpnUuid: vpnStatus.vpnUuid,
          vpnType: vpnStatus.type,
          vpnStatus: vpnStatus.status
        }
      },
    });

    return NextResponse.json({
      success: false,
      message: `Cannot assign to group "${groupDisplayName}" because its associated ${vpnTypeDisplay} VPN is ${vpnStatus.status}. Please ensure the VPN is connected or contact an administrator.`
    }, { status: 400 });
  }

  // Check if the host is in unmanaged groups for self-service operations
  if (authMethod === 'Unauthenticated (Client IP)') {
    try {
      // Get current group memberships for the IP
      const currentGroups = await getIpGroupMembership(resolvedIpAddress);

      // Fetch filter data
      const filterData = await fetchUnmanagedGroupFilterData();

      // Check if host is in unmanaged groups
      const unmanagedResult = await isHostInUnmanagedGroups(
        currentGroups,
        filterData.globalFilters,
        filterData.globallyDisabledGroups,
        null, // No user for unauthenticated requests
        filterData.userSpecificFilters
      );

      if (unmanagedResult.isUnmanaged) {
        logger.warn(`Self-service assignment rejected: Host ${resolvedIpAddress} is in unmanaged groups`);

        await logAuditEvent({
          userId,
          action: 'OPNSENSE_GROUP_IP_ASSIGN_FAILURE',
          details: {
            operationType: 'assign',
            groupId: resolvedGroupId,
            groupName: group.name,
            groupFriendlyName: groupFriendlyName || null,
            ipAddress: resolvedIpAddress,
            hostAliasName: resolvedHostAliasName,
            hostAliasHostName: hostAliasHostName || null,
            reason: unmanagedResult.message,
            authMethod,
            validationFailure: 'UNMANAGED_GROUP',
            unmanagedGroups: unmanagedResult.unmanagedGroups.map(g => ({
              id: g.id,
              name: g.name,
              friendlyName: g.friendlyName
            }))
          },
        });

        return NextResponse.json({
          success: false,
          message: `Self-service is restricted: ${unmanagedResult.message}`
        }, { status: 403 });
      }
    } catch (error) {
      logger.error('Error checking unmanaged group status:', error);
      // Continue with operation if check fails (fail open)
    }
  }

  // Track groups that the IP was removed from during moveFromExisting
  const removedGroupsInfo: { id: string, name: string, friendlyName: string | null, groupType?: string }[] = [];

  await logAuditEvent({
    userId,
    action: 'OPNSENSE_GROUP_IP_ASSIGN_ATTEMPT',
    details: {
      groupId: resolvedGroupId,
      groupName: groupName || null,
      groupFriendlyName: groupFriendlyName || null,
      ipAddress: resolvedIpAddress,
      hostAliasName: resolvedHostAliasName,
      hostAliasHostName: hostAliasHostName || null,
      description: description || null,
      moveFromExisting,
      authMethod,
      operationType: moveFromExisting ? 'move' : 'assign',
      targetGroup: {
        id: resolvedGroupId,
        name: group.name,
        friendlyName: groupFriendlyName
      },
      hostAliasDetails: {
        name: resolvedHostAliasName,
        hostname: hostAliasHostName || null,
        ipAddress: resolvedIpAddress
      }
    },
  });

  // Prepare batch operations
  const batchOperations: BatchAliasOperation[] = [];

  // Handle moving from existing groups if requested
  if (moveFromExisting) {
    try {
      // Get current group membership directly using our helper function
      const currentGroups = await getIpGroupMembership(resolvedIpAddress);
      logger.debug(`Current group membership for IP ${resolvedIpAddress}:`, currentGroups);

      // Find groups that are not the target group
      const otherGroups = currentGroups.filter(group => group.id !== resolvedGroupId);

      if (otherGroups.length > 0) {
        // IP is already in other groups, remove it from them
        logger.debug(`IP ${resolvedIpAddress} is already in ${otherGroups.length} other groups. Removing before adding to new group.`);

        for (const group of otherGroups) {
          logger.debug(`Removing IP ${resolvedIpAddress} from group ${group.name} (${group.id})`);

          // Get current content and deduplicate defensively (handles corrupted existing data)
          const currentContent = parseGroupContent(group.rawContent, group.name);

          // Remove using Set (ensures no duplicates remain)
          const contentSet = new Set(currentContent);
          contentSet.delete(resolvedHostAliasName);
          const updatedContent = Array.from(contentSet).join('\n');

          // Add removal operation to batch
          batchOperations.push({
            type: 'update',
            uuid: group.id,
            payload: {
              alias: {
                enabled: group.enabled ? '1' : '0',
                name: group.name,
                type: group.type || 'networkgroup',
                content: updatedContent,
                description: group.description || '',
                proto: group.proto || '',
                interface: group.interface || '',
                counters: group.counters || '',
                updatefreq: group.updatefreq || '',
                categories: group.categories || ''
              }
            }
          });

          // Get friendly name for the removed group
          const removedGroupDisplayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === group.id.toLowerCase());
          const removedGroupFriendlyName = removedGroupDisplayInfo?.friendlyName || null;

          removedGroupsInfo.push({
            id: group.id,
            name: group.name,
            friendlyName: removedGroupFriendlyName,
            groupType: removedGroupDisplayInfo?.groupType || undefined
          });

          await logAuditEvent({
            userId,
            action: 'OPNSENSE_GROUP_IP_MOVE_REMOVE',
            details: {
              operationType: 'move',
              sourceGroupId: group.id,
              sourceGroupName: group.name,
              sourceGroupFriendlyName: removedGroupFriendlyName,
              targetGroupId: resolvedGroupId,
              ipAddress: resolvedIpAddress,
              hostAliasName: resolvedHostAliasName,
              authMethod
            },
          });
        }
      }
    } catch (error) {
      logger.error(`Error checking current group membership for IP ${resolvedIpAddress}:`, error);
      // Continue anyway to try to add to the new group
    }
  }

  // Add the target group update to batch
  const targetGroup = await getNetworkGroupById(resolvedGroupId);
  if (targetGroup) {
    // Get current content and deduplicate defensively (handles corrupted existing data)
    const currentContent = parseGroupContent(targetGroup.rawContent, targetGroup.name);

    // Use Set to build new content (prevents duplicates)
    const contentSet = new Set(currentContent);
    contentSet.add(resolvedHostAliasName);
    const newContent = Array.from(contentSet).join('\n');

    batchOperations.push({
      type: 'update',
      uuid: resolvedGroupId,
      payload: {
        alias: {
          enabled: targetGroup.enabled ? '1' : '0',
          name: targetGroup.name,
          type: targetGroup.type || 'networkgroup',
          content: newContent,
          description: targetGroup.description || '',
          proto: targetGroup.proto || '',
          interface: targetGroup.interface || '',
          counters: targetGroup.counters || '',
          updatefreq: targetGroup.updatefreq || '',
          categories: targetGroup.categories || ''
        }
      }
    });
  }

  // Execute all operations in one batch with single reconfigure
  logger.debug(`Executing batch operation with ${batchOperations.length} operations for IP ${resolvedIpAddress}`);
  const batchResult: BatchAliasResult = await batchAliasOperations(batchOperations);

  // Get the friendly name for the group if available
  const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === resolvedGroupId.toLowerCase());
  const friendlyName = displayInfo?.friendlyName || null;

  if (batchResult.success) {
    // Create enhanced message using friendly name if available, otherwise group name
    const groupDisplayName = friendlyName || group.name;
    const enhancedMessage = `Successfully added ${resolvedHostAliasName} to group ${groupDisplayName}`;

    // Determine the appropriate audit action based on whether this was a move or new assignment
    const auditAction = moveFromExisting && removedGroupsInfo.length > 0
      ? 'OPNSENSE_GROUP_IP_MOVE_SUCCESS'
      : 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS';

    await logAuditEvent({
      userId,
      action: auditAction,
      details: {
        operationType: moveFromExisting && removedGroupsInfo.length > 0 ? 'move' : 'assign',
        groupId: resolvedGroupId,
        groupName: groupName || null,
        groupFriendlyName: groupFriendlyName || null,
        ipAddress: resolvedIpAddress,
        hostAliasName: resolvedHostAliasName,
        hostAliasHostName: hostAliasHostName || null,
        wasMoved: moveFromExisting,
        removedFromGroups: removedGroupsInfo.length > 0 ? removedGroupsInfo : null,
        authMethod,
        moveOperation: moveFromExisting && removedGroupsInfo.length > 0,
        ...(removedGroupsInfo.length > 0 && {
          sourceGroups: removedGroupsInfo.map(g => ({
            id: g.id,
            name: g.name,
            friendlyName: g.friendlyName
          }))
        }),
        targetGroup: {
          id: resolvedGroupId,
          name: group.name,
          friendlyName: friendlyName,
          groupType: displayInfo?.groupType || undefined
        }
      },
    });

    // Create enhanced response with friendly name
    const enhancedResponse = {
      success: true,
      message: enhancedMessage,
      ...(moveFromExisting && removedGroupsInfo && removedGroupsInfo.length > 0 && {
        removedFromGroups: removedGroupsInfo,
        moveFromExisting: true
      })
    };

    return NextResponse.json(enhancedResponse);
  } else {
    // Create enhanced error message
    const groupDisplayName = friendlyName || group.name;
    const errorMessages = batchResult.results
      .filter(r => r.error)
      .map(r => r.error)
      .join(', ');
    const enhancedErrorMessage = `Failed to update group ${groupDisplayName}: ${errorMessages}`;

    await logAuditEvent({
      userId,
      action: 'OPNSENSE_GROUP_IP_ASSIGN_FAILURE',
      details: {
        operationType: moveFromExisting ? 'move' : 'assign',
        groupId: resolvedGroupId,
        groupName: groupName || null,
        groupFriendlyName: groupFriendlyName || null,
        ipAddress: resolvedIpAddress,
        hostAliasName: resolvedHostAliasName,
        hostAliasHostName: hostAliasHostName || null,
        reason: enhancedErrorMessage,
        authMethod
      },
    });

    return NextResponse.json({
      success: false,
      message: enhancedErrorMessage
    }, { status: 400 });
  }
}

// Handler for single unassign operation (backward compatibility)
async function handleUnassignOperation(
  body: UnassignRequestBody,
  authMethod: string,
  userId: string | null,
  clientIp: string,
  allowedNetworks: ValidLocalNetwork[],
  opnsenseGroupDisplays: OpnsenseGroupDisplay[]
) {
  const {
    ipAddress,
    hostAliasName,
    hostAliasHostName,
    groupId,
    groupName,
    groupFriendlyName
  } = body;

  // Resolve host alias identifier from various parameter combinations
  const resolvedHostAlias = await resolveHostAliasIdentifier(ipAddress, hostAliasName, hostAliasHostName);

  if (!resolvedHostAlias) {
    return NextResponse.json({
      success: false,
      message: 'Could not resolve host alias. Please provide valid ipAddress, hostAliasName, or hostAliasHostName parameters.'
    }, { status: 400 });
  }

  const { ipAddress: resolvedIpAddress, hostAliasName: resolvedHostAliasName } = resolvedHostAlias;

  // Check if the IP is allowed for self-service operations
  const ipValidation = isIpAllowedForSelfService(
    clientIp,
    resolvedIpAddress,
    allowedNetworks,
    true // Assume authenticated for now
  );

  if (!ipValidation.isAllowed) {
    logger.warn(`Self-service access denied for IP ${resolvedIpAddress} from client IP ${clientIp}: ${ipValidation.reason}`);
    return NextResponse.json({
      success: false,
      message: `Unauthorized: ${ipValidation.reason}`
    }, { status: 401 });
  }

  // Check if the host is in unmanaged groups for self-service operations
  if (authMethod === 'Unauthenticated (Client IP)') {
    try {
      // Get current group memberships for the IP
      const currentGroups = await getIpGroupMembership(resolvedIpAddress);

      // Fetch filter data
      const filterData = await fetchUnmanagedGroupFilterData();

      // Check if host is in unmanaged groups
      const unmanagedResult = await isHostInUnmanagedGroups(
        currentGroups,
        filterData.globalFilters,
        filterData.globallyDisabledGroups,
        null, // No user for unauthenticated requests
        filterData.userSpecificFilters
      );

      if (unmanagedResult.isUnmanaged) {
        logger.warn(`Self-service unassign rejected: Host ${resolvedIpAddress} is in unmanaged groups`);

        await logAuditEvent({
          userId,
          action: 'OPNSENSE_GROUP_IP_UNASSIGN_FAILURE',
          details: {
            operationType: 'unassign',
            groupId: groupId || null,
            groupName: groupName || null,
            groupFriendlyName: groupFriendlyName || null,
            ipAddress: resolvedIpAddress,
            hostAliasName: resolvedHostAliasName,
            hostAliasHostName: hostAliasHostName || null,
            reason: unmanagedResult.message,
            authMethod,
            validationFailure: 'UNMANAGED_GROUP',
            unmanagedGroups: unmanagedResult.unmanagedGroups.map(g => ({
              id: g.id,
              name: g.name,
              friendlyName: g.friendlyName
            }))
          },
        });

        return NextResponse.json({
          success: false,
          message: `Self-service is restricted: ${unmanagedResult.message}`
        }, { status: 403 });
      }
    } catch (error) {
      logger.error('Error checking unmanaged group status:', error);
      // Continue with operation if check fails (fail open)
    }
  }

  // If no group identifier is provided, unassign from all groups
  if (!groupId && !groupName && !groupFriendlyName) {
    await logAuditEvent({
      userId,
      action: 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_ATTEMPT',
      details: {
        ipAddress: resolvedIpAddress,
        hostAliasName: resolvedHostAliasName,
        hostAliasHostName: hostAliasHostName || null,
        authMethod,
        // Enhanced operation information
        operationType: 'unassign_all',
        hostAliasDetails: {
          name: resolvedHostAliasName,
          hostname: hostAliasHostName || null,
          ipAddress: resolvedIpAddress
        }
      },
    });

    try {
      // Get current group membership directly using our helper function
      const currentGroups = await getIpGroupMembership(resolvedIpAddress);

      if (currentGroups.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'IP is not assigned to any groups'
        });
      }

      // Prepare batch operations for all groups
      const batchOperations: BatchAliasOperation[] = [];
      const successGroups: string[] = [];
      const failedGroups: string[] = [];

      for (const group of currentGroups) {
        // Get current content and deduplicate defensively (handles corrupted existing data)
        const currentContent = parseGroupContent(group.rawContent, group.name);

        // Remove using Set (ensures no duplicates remain)
        const contentSet = new Set(currentContent);
        contentSet.delete(resolvedHostAliasName);
        const updatedContent = Array.from(contentSet).join('\n');

        // Add removal operation to batch
        batchOperations.push({
          type: 'update',
          uuid: group.id,
          payload: {
            alias: {
              enabled: group.enabled ? '1' : '0',
              name: group.name,
              type: group.type || 'networkgroup',
              content: updatedContent,
              description: group.description || '',
              proto: group.proto || '',
              interface: group.interface || '',
              counters: group.counters || '',
              updatefreq: group.updatefreq || '',
              categories: group.categories || ''
            }
          }
        });
      }

      // Execute all operations in one batch with single reconfigure
      logger.debug(`Executing batch unassign operation with ${batchOperations.length} operations for IP ${resolvedIpAddress}`);
      const batchResult: BatchAliasResult = await batchAliasOperations(batchOperations);

      // Process results
      if (batchResult.success) {
        // All operations succeeded
        successGroups.push(...currentGroups.map(g => g.name));
      } else {
        // Some operations failed, check individual results
        batchResult.results.forEach((result, index) => {
          // index is from forEach iteration
          // eslint-disable-next-line security/detect-object-injection
          const group = currentGroups[index];
          if (result.error) {
            failedGroups.push(group.name);
          } else {
            successGroups.push(group.name);
          }
        });
      }

      const allSucceeded = failedGroups.length === 0;

      await logAuditEvent({
        userId,
        action: allSucceeded ? 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_SUCCESS' : 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_PARTIAL',
        details: {
          operationType: 'unassign_all',
          ipAddress: resolvedIpAddress,
          hostAliasName: resolvedHostAliasName,
          hostAliasHostName: hostAliasHostName || null,
          successGroups,
          failedGroups,
          authMethod,
          unassignedGroups: currentGroups.map(g => {
            const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === g.id.toLowerCase());
            return {
              id: g.id,
              name: g.name,
              friendlyName: displayInfo?.friendlyName || null,
              success: successGroups.includes(g.name)
            };
          }),
          totalGroupsUnassigned: currentGroups.length,
          successfulUnassignments: successGroups.length,
          failedUnassignments: failedGroups.length
        },
      });

      if (allSucceeded) {
        return NextResponse.json({
          success: true,
          message: `Successfully unassigned IP from all groups: ${successGroups.join(', ')}`
        });
      } else {
        return NextResponse.json({
          success: true,
          message: `Partially unassigned IP. Succeeded: ${successGroups.join(', ')}. Failed: ${failedGroups.join(', ')}`,
          partialSuccess: true,
          successGroups,
          failedGroups
        }, { status: 207 }); // 207 Multi-Status
      }
    } catch (error) {
      logger.error(`Error unassigning IP ${resolvedIpAddress} from all groups:`, error);

      await logAuditEvent({
        userId,
        action: 'OPNSENSE_GROUP_IP_UNASSIGN_ALL_FAILURE',
        details: {
          operationType: 'unassign_all',
          ipAddress: resolvedIpAddress,
          hostAliasName: resolvedHostAliasName,
          hostAliasHostName: hostAliasHostName || null,
          error: error instanceof Error ? error.message : 'Unknown error',
          authMethod
        },
      });

      return NextResponse.json({
        success: false,
        message: `Failed to unassign IP from all groups: ${error instanceof Error ? error.message : 'Unknown error'}`
      }, { status: 500 });
    }
  }

  // Resolve group identifier for specific group unassign
  const resolvedGroupForUnassign = await resolveGroupIdentifier(groupId, groupName, groupFriendlyName);

  if (!resolvedGroupForUnassign) {
    return NextResponse.json({
      success: false,
      message: 'Could not resolve group. Please provide valid groupId, groupName, or groupFriendlyName parameters.'
    }, { status: 400 });
  }

  const { groupId: resolvedGroupIdForUnassign, group: groupForUnassign } = resolvedGroupForUnassign;

  // Regular unassign from specific group
  await logAuditEvent({
    userId,
    action: 'OPNSENSE_GROUP_IP_UNASSIGN_ATTEMPT',
    details: {
      groupId: resolvedGroupIdForUnassign,
      groupName: groupName || null,
      groupFriendlyName: groupFriendlyName || null,
      ipAddress: resolvedIpAddress,
      hostAliasName: resolvedHostAliasName,
      hostAliasHostName: hostAliasHostName || null,
      authMethod,
      // Enhanced operation information
      operationType: 'unassign',
      targetGroup: {
        id: resolvedGroupIdForUnassign,
        name: groupForUnassign.name,
        friendlyName: groupFriendlyName
      },
      hostAliasDetails: {
        name: resolvedHostAliasName,
        hostname: hostAliasHostName || null,
        ipAddress: resolvedIpAddress
      }
    },
  });

  // Remove IP from the group
  const removeResult = await removeIpFromGroup(resolvedGroupIdForUnassign, resolvedIpAddress, resolvedHostAliasName);

  // Get the friendly name for the group if available (for both success and error messages)
  const displayInfoForUnassign = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === resolvedGroupIdForUnassign.toLowerCase());
  const friendlyNameForUnassign = displayInfoForUnassign?.friendlyName || null;

  if (removeResult.success) {

    // Create enhanced message using friendly name if available, otherwise group name
    const groupDisplayName = friendlyNameForUnassign || groupForUnassign.name;
    const enhancedMessage = removeResult.message.replace(groupForUnassign.name, groupDisplayName);

    await logAuditEvent({
      userId,
      action: 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS',
      details: {
        operationType: 'unassign',
        groupId: resolvedGroupIdForUnassign,
        groupName: groupName || null,
        groupFriendlyName: groupFriendlyName || null,
        ipAddress: resolvedIpAddress,
        hostAliasName: resolvedHostAliasName,
        hostAliasHostName: hostAliasHostName || null,
        updatedGroupName: removeResult.updatedGroup?.name || null,
        authMethod,
        // Enhanced group information
        unassignedGroup: {
          id: resolvedGroupIdForUnassign,
          name: groupForUnassign.name,
          friendlyName: friendlyNameForUnassign,
          groupType: displayInfoForUnassign?.groupType || undefined
        }
      },
    });

    // Create enhanced response with friendly name
    const enhancedResponse = {
      success: true,
      message: enhancedMessage,
      updatedGroup: removeResult.updatedGroup ? {
        ...removeResult.updatedGroup,
        friendlyName: friendlyNameForUnassign
      } : null
    };

    return NextResponse.json(enhancedResponse);
  } else {
    await logAuditEvent({
      userId,
      action: 'OPNSENSE_GROUP_IP_UNASSIGN_FAILURE',
      details: {
        operationType: 'unassign',
        groupId: resolvedGroupIdForUnassign,
        groupName: groupName || null,
        groupFriendlyName: groupFriendlyName || null,
        ipAddress: resolvedIpAddress,
        hostAliasName: resolvedHostAliasName,
        hostAliasHostName: hostAliasHostName || null,
        reason: removeResult.message,
        authMethod
      },
    });

    return NextResponse.json({
      success: false,
      message: removeResult.message
    }, { status: 400 });
  }
}

// Handler for batch operations
async function handleBatchOperation(
  body: BatchRequestBody,
  authMethod: string,
  userId: string | null,
  clientIp: string,
  allowedNetworks: ValidLocalNetwork[],
  opnsenseGroupDisplays: OpnsenseGroupDisplay[]
) {
  const {
    hostAliases, // Array of host alias objects
    groups, // Array of group objects
    batchOperations: customBatchOperations, // Array of operation objects
    // Removed description as it's not directly used here after destructuring
    moveFromExisting = true,
    operationType = 'assign', // New parameter: 'assign' or 'unassign'
    restrictRemovalToSingleSelect = false
  } = body;

  // Validate input
  if (!hostAliases && !groups && !customBatchOperations) {
    return NextResponse.json({
      success: false,
      message: 'Must provide either hostAliases, groups, or batchOperations'
    }, { status: 400 });
  }

  // Validate operationType
  if (operationType !== 'assign' && operationType !== 'unassign') {
    return NextResponse.json({
      success: false,
      message: 'operationType must be either "assign" or "unassign"'
    }, { status: 400 });
  }

  logger.debug(`Batch operation type: ${operationType}`);

  // Process batch operations
  const allBatchOperations: BatchOperationItem[] = [];
  const operationResults: OperationResult[] = [];
  const hostAliasCreationOperations: BatchOperationItem[] = [];
  const groupAssignmentOperations: BatchOperationItem[] = [];

  // Track group content changes to avoid overwriting
  const groupContentChanges: Map<string, Set<string>> = new Map();

  // Track groups that need host aliases removed (for moveFromExisting)
  const groupsToRemoveFrom: Map<string, Set<string>> = new Map();

  // Track per-host removed groups for richer response when moveFromExisting is used
  const removedFromGroupsByHost: Map<string, { id: string; name: string; friendlyName: string | null; groupType?: string }[]> = new Map();

  // Handle hostAliases and groups combination
  if (hostAliases && groups) {
    for (const hostAlias of hostAliases) {
      // Resolve host alias
      let resolvedHostAlias = await resolveHostAliasIdentifier(
        hostAlias.ipAddress,
        hostAlias.hostAliasName,
        hostAlias.hostAliasHostName
      );

      if (!resolvedHostAlias) {
        // For unassign operations, we don't create host aliases
        if (operationType === 'unassign') {
          operationResults.push({
            hostAlias: {
              ipAddress: hostAlias.ipAddress || '',
              hostAliasName: hostAlias.hostAliasName || ''
            },
            success: false,
            error: 'Could not resolve host alias for unassign operation'
          });
          continue;
        }

        // If host alias cannot be resolved, create it (only for assign operations)
        if (hostAlias.ipAddress || hostAlias.hostname) {
          try {
            let aliasName: string;
            let descriptionText: string;
            let content: string;
            let resolvedIpAddress: string;
            let existingAliasUuid: string | null = null;

            if (hostAlias.hostname) {
              // Create host alias from hostname
              logger.debug(`Creating host alias from hostname "${hostAlias.hostname}"`);

              const hostAliasInfo = await createHostAliasFromHostname(hostAlias.hostname, hostAlias.ipAddress);
              aliasName = hostAliasInfo.aliasName;
              content = hostAliasInfo.ipAddress;
              resolvedIpAddress = hostAliasInfo.ipAddress;
              descriptionText = hostAlias.description || `Auto-created from hostname: ${hostAliasInfo.originalHostname}`;

              // Check if host alias already exists
              const existingAliases = await getHostAliasesByName(aliasName);
              if (existingAliases.length > 0) {
                existingAliasUuid = existingAliases[0].uuid;
                logger.debug(`Host alias "${aliasName}" already exists with UUID ${existingAliasUuid}`);

                // Check if the existing alias has empty content and needs to be updated
                if (!existingAliases[0].content || existingAliases[0].content.trim() === '') {
                  logger.debug(`Existing host alias "${aliasName}" has empty content, will update with IP "${resolvedIpAddress}"`);
                } else {
                  logger.debug(`Existing host alias "${aliasName}" already has content: "${existingAliases[0].content}"`);
                  // Use the existing content
                  content = existingAliases[0].content.trim();
                  resolvedIpAddress = content;
                }
              }

              logger.debug(`Created host alias "${aliasName}" from hostname "${hostAlias.hostname}" with IP "${resolvedIpAddress}"`);
            } else if (hostAlias.ipAddress) {
              // Create host alias from IP address (existing logic)
              logger.debug(`Host alias for IP ${hostAlias.ipAddress} not found. Creating it.`);

              const { aliasName: detectedAliasName, detectedHostname } = await getBestHostAliasName(hostAlias.ipAddress);
              aliasName = detectedAliasName;
              content = hostAlias.ipAddress;
              resolvedIpAddress = hostAlias.ipAddress;

              // Check if host alias already exists
              const existingAliases = await getHostAliasesByName(aliasName);
              if (existingAliases.length > 0) {
                existingAliasUuid = existingAliases[0].uuid;
                logger.debug(`Host alias "${aliasName}" already exists with UUID ${existingAliasUuid}`);

                // Check if the existing alias has empty content and needs to be updated
                if (!existingAliases[0].content || existingAliases[0].content.trim() === '') {
                  logger.debug(`Existing host alias "${aliasName}" has empty content, will update with IP "${resolvedIpAddress}"`);
                } else {
                  logger.debug(`Existing host alias "${aliasName}" already has content: "${existingAliases[0].content}"`);
                  // Use the existing content
                  content = existingAliases[0].content.trim();
                  resolvedIpAddress = content;
                }
              }

              if (detectedHostname) {
                logger.debug(`Detected hostname "${detectedHostname}" for IP ${hostAlias.ipAddress}, sanitized to "${aliasName}"`);
                descriptionText = hostAlias.description || `Auto-created for batch operation (detected hostname: ${detectedHostname})`;
              } else {
                logger.debug(`No hostname detected for IP ${hostAlias.ipAddress}, using default name "${aliasName}"`);
                descriptionText = hostAlias.description || `Auto-created for batch operation`;
              }
            } else {
              throw new Error('Neither IP address nor hostname provided for host alias creation');
            }

            // Add host alias creation/update to separate array (will be executed first)
            if (existingAliasUuid) {
              // Update existing host alias
              hostAliasCreationOperations.push({
                type: 'update',
                uuid: existingAliasUuid,
                payload: {
                  alias: {
                    enabled: '1',
                    name: aliasName,
                    type: 'host',
                    content: content,
                    description: descriptionText,
                    proto: '',
                    interface: '',
                    counters: '0',
                    updatefreq: '',
                    categories: ''
                  }
                }
              });

              logger.debug(`Added host alias update ${aliasName} (UUID: ${existingAliasUuid}) to creation operations`);
            } else {
              // Create new host alias
              hostAliasCreationOperations.push({
                type: 'add',
                payload: {
                  alias: {
                    enabled: '1',
                    name: aliasName,
                    type: 'host',
                    content: content,
                    description: descriptionText,
                    proto: '',
                    interface: '',
                    counters: '0',
                    updatefreq: '',
                    categories: ''
                  }
                }
              });

              logger.debug(`Added host alias creation ${aliasName} to creation operations`);
            }

            resolvedHostAlias = {
              ipAddress: resolvedIpAddress, // Use the resolved IP address
              hostAliasName: aliasName
            };
          } catch (error) {
            logger.error(`Failed to prepare host alias creation:`, error);
            operationResults.push({
              hostAlias: {
                ipAddress: hostAlias.ipAddress || '',
                hostAliasName: hostAlias.hostAliasName || ''
              },
              success: false,
              error: `Failed to prepare host alias creation: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
            continue;
          }
        } else {
          operationResults.push({
            hostAlias: {
              ipAddress: hostAlias.ipAddress || '',
              hostAliasName: hostAlias.hostAliasName || ''
            },
            success: false,
            error: 'Could not resolve host alias and no IP address or hostname provided for creation'
          });
          continue;
        }
      }

      const { ipAddress: resolvedIpAddress, hostAliasName: resolvedHostAliasName } = resolvedHostAlias;

      // Check IP validation
      const ipValidation = isIpAllowedForSelfService(
        clientIp,
        resolvedIpAddress,
        allowedNetworks,
        true
      );

      if (!ipValidation.isAllowed) {
        operationResults.push({
          hostAlias: resolvedHostAlias, // Use resolved alias here
          success: false,
          error: `Unauthorized: ${ipValidation.reason}`
        });
        continue;
      }

      // Check if the host is in unmanaged groups for self-service operations
      if (authMethod === 'Unauthenticated (Client IP)') {
        try {
          // Get current group memberships for the IP
          const currentGroups = await getIpGroupMembership(resolvedIpAddress);

          // Fetch filter data
          const filterData = await fetchUnmanagedGroupFilterData();

          // Check if host is in unmanaged groups
          const unmanagedResult = await isHostInUnmanagedGroups(
            currentGroups,
            filterData.globalFilters,
            filterData.globallyDisabledGroups,
            null, // No user for unauthenticated requests
            filterData.userSpecificFilters
          );

          if (unmanagedResult.isUnmanaged) {
            logger.warn(`Self-service batch operation rejected: Host ${resolvedIpAddress} is in unmanaged groups`);

            operationResults.push({
              hostAlias: resolvedHostAlias,
              success: false,
              error: `Self-service is restricted: ${unmanagedResult.message}`
            });
            continue;
          }
        } catch (error) {
          logger.error('Error checking unmanaged group status in batch operation:', error);
          // Continue with operation if check fails (fail open)
        }
      }

      // Process each group for this host alias
      for (const group of groups) {
        const resolvedGroup = await resolveGroupIdentifier(
          group.groupId,
          group.groupName,
          group.groupFriendlyName
        );

        if (!resolvedGroup) {
          operationResults.push({
            hostAlias: resolvedHostAlias, // Use resolved alias here
            group: { // Ensure 'group' property is explicitly set with NetworkGroup
              groupId: group.groupId || '',
              group: {} as NetworkGroup, // Placeholder, actual group object might not be available here
              groupName: group.groupName,
              groupFriendlyName: group.groupFriendlyName
            },
            success: false,
            error: 'Could not resolve group'
          });
          continue;
        }

        const { groupId: resolvedGroupId, group: targetGroup } = resolvedGroup;

        // Check if the target group is enabled - consistent with UI validation (only for assign operations)
        if (operationType === 'assign' && !targetGroup.enabled) {
          const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === resolvedGroupId.toLowerCase());
          const groupDisplayName = displayInfo?.friendlyName || targetGroup.name;

          logger.warn(`Batch assignment rejected: Target group "${groupDisplayName}" is disabled in OPNsense`);

          operationResults.push({
            hostAlias: resolvedHostAlias, // Use resolved alias here
            group: {
              groupId: resolvedGroupId,
              group: targetGroup,
              groupName: group.groupName,
              groupFriendlyName: group.groupFriendlyName
            },
            success: false,
            error: `Cannot assign to group "${groupDisplayName}" because it is disabled in OPNsense. Please enable the group first or contact an administrator.`
          });
          continue;
        }

        // Check if the target group has an associated VPN that is disconnected or disabled - consistent with UI validation (only for assign operations)
        if (operationType === 'assign') {
          const vpnStatus = await getVpnStatusForGroup(resolvedGroupId);
          if (vpnStatus && (vpnStatus.status === 'disconnected' || vpnStatus.status === 'disabled')) {
            const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === resolvedGroupId.toLowerCase());
            const groupDisplayName = displayInfo?.friendlyName || targetGroup.name;
            const vpnTypeDisplay = vpnStatus.type === 'openvpn' ? 'OpenVPN' :
              vpnStatus.type === 'wireguard' ? 'WireGuard' :
                vpnStatus.type === 'ipsec' ? 'IPsec' : vpnStatus.type;

            logger.warn(`Batch assignment rejected: Target group "${groupDisplayName}" has ${vpnTypeDisplay} VPN that is ${vpnStatus.status}`);

            operationResults.push({
              hostAlias: resolvedHostAlias, // Use resolved alias here
              group: {
                groupId: resolvedGroupId,
                group: targetGroup,
                groupName: group.groupName,
                groupFriendlyName: group.groupFriendlyName
              },
              success: false,
              error: `Cannot assign to group "${groupDisplayName}" because its associated ${vpnTypeDisplay} VPN is ${vpnStatus.status}. Please ensure the VPN is connected or contact an administrator.`
            });
            continue;
          }
        }

        if (operationType === 'assign') {
          // Handle moving from existing groups if requested
          if (moveFromExisting) {
            try {
              // Get all network groups to find which ones contain this host alias
              const allAliasesResponse = await exportAliases();
              if (allAliasesResponse?.aliases?.alias) {
                const allAliasDetails: OpnsenseAliasDetail[] = Object.entries(allAliasesResponse.aliases.alias)
                  .map(([uuid, detail]) => ({ ...detail, uuid }));

                // Find all network groups that contain this host alias name
                let groupsContainingHostAlias = allAliasDetails
                  .filter(alias => alias.type === 'networkgroup' && alias.content)
                  .filter(groupAlias => {
                    const memberAliasNames = groupAlias.content.split(/\n|,/).map(name => name.trim()).filter(Boolean);
                    return memberAliasNames.includes(resolvedHostAliasName);
                  })
                  .filter(groupAlias => groupAlias.uuid !== resolvedGroupId); // Exclude target group

                // Optional: restrict removals to SingleSelect groups only
                if (restrictRemovalToSingleSelect) {
                  groupsContainingHostAlias = groupsContainingHostAlias.filter(groupAlias => {
                    const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === (groupAlias.uuid || '').toLowerCase());
                    const groupType = displayInfo?.groupType || 'SingleSelect';
                    return groupType === 'SingleSelect';
                  });
                }

                logger.debug(`Found ${groupsContainingHostAlias.length} groups containing host alias "${resolvedHostAliasName}":`,
                  groupsContainingHostAlias.map(g => g.name));

                // Track which groups need this host alias removed
                for (const currentGroup of groupsContainingHostAlias) {
                  if (!groupsToRemoveFrom.has(currentGroup.uuid!)) { // uuid can be undefined for NetworkGroup
                    groupsToRemoveFrom.set(currentGroup.uuid!, new Set());
                  }
                  groupsToRemoveFrom.get(currentGroup.uuid!)!.add(resolvedHostAliasName);

                  // Track removed groups per host for response/notifications
                  const existingList = removedFromGroupsByHost.get(resolvedHostAliasName) || [];
                  const groupDisplayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === (currentGroup.uuid || '').toLowerCase());
                  removedFromGroupsByHost.set(resolvedHostAliasName, [
                    ...existingList,
                    { id: currentGroup.uuid || '', name: currentGroup.name, friendlyName: groupDisplayInfo?.friendlyName || null, groupType: groupDisplayInfo?.groupType || undefined }
                  ]);

                  logger.debug(`Tracked removal of "${resolvedHostAliasName}" from group "${currentGroup.name}" (${currentGroup.uuid})`);
                }
              }
            } catch (error) {
              logger.error(`Error checking current group membership for host alias "${resolvedHostAliasName}":`, error);
            }
          }

          // Add to target group - track content changes to avoid overwriting
          const targetGroup = await getNetworkGroupById(resolvedGroupId);
          if (targetGroup) {
            // Get the current content for this group (either from original or from our tracked changes)
            let currentContent: string[];
            if (groupContentChanges.has(resolvedGroupId)) {
              // Use our tracked changes
              currentContent = Array.from(groupContentChanges.get(resolvedGroupId)!);
            } else {
              // Use original content and initialize tracking with defensive deduplication
              currentContent = parseGroupContent(targetGroup.rawContent, targetGroup.name);
              groupContentChanges.set(resolvedGroupId, new Set(currentContent));
            }

            // Add the host alias to our tracked content (Set automatically handles duplicates)
            groupContentChanges.get(resolvedGroupId)!.add(resolvedHostAliasName);

            // Convert back to array for the operation
            const newContent = Array.from(groupContentChanges.get(resolvedGroupId)!).join('\n');

            logger.debug(`Group assignment details:\n              - Group: ${targetGroup.name} (${resolvedGroupId})\n              - Original content: "${targetGroup.rawContent}"\n              - Current tracked content: [${currentContent.join(', ')}]\n              - Host alias to add: "${resolvedHostAliasName}"\n              - New content: "${newContent}"\n            `);

            // Group update operations are handled separately to avoid duplicates
          } else {
            logger.error(`Target group not found for ID: ${resolvedGroupId}`);
            operationResults.push({
              hostAlias: resolvedHostAlias,
              group: { // Ensure 'group' property is explicitly set with NetworkGroup
                groupId: resolvedGroupId,
                group: {} as NetworkGroup, // Placeholder, actual group object might not be available here
                groupName: group.groupName,
                groupFriendlyName: group.groupFriendlyName
              },
              success: false,
              error: 'Target group not found'
            });
            continue;
          }
        } else if (operationType === 'unassign') {
          // Handle unassign operation
          const targetGroup = await getNetworkGroupById(resolvedGroupId);
          if (targetGroup) {
            // Get the current content for this group (either from original or from our tracked changes)
            let currentContent: string[];
            if (groupContentChanges.has(resolvedGroupId)) {
              // Use our tracked changes
              currentContent = Array.from(groupContentChanges.get(resolvedGroupId)!);
            } else {
              // Use original content and initialize tracking
              currentContent = targetGroup.rawContent ? targetGroup.rawContent.split('\n').filter(line => line.trim()) : [];
              groupContentChanges.set(resolvedGroupId, new Set(currentContent));
            }

            // Remove the host alias from our tracked content
            groupContentChanges.get(resolvedGroupId)!.delete(resolvedHostAliasName);

            // Convert back to array for the operation
            const newContent = Array.from(groupContentChanges.get(resolvedGroupId)!).join('\n');

            logger.debug(`Group unassignment details:\n              - Group: ${targetGroup.name} (${resolvedGroupId})\n              - Original content: "${targetGroup.rawContent}"\n              - Current tracked content: [${currentContent.join(', ')}]\n              - Host alias to remove: "${resolvedHostAliasName}"\n              - New content: "${newContent}"\n            `);

            // Group update operations are handled separately to avoid duplicates
          } else {
            logger.error(`Target group not found for ID: ${resolvedGroupId}`);
            operationResults.push({
              hostAlias: resolvedHostAlias,
              group: { // Ensure 'group' property is explicitly set with NetworkGroup
                groupId: resolvedGroupId,
                group: {} as NetworkGroup, // Placeholder, actual group object might not be available here
                groupName: group.groupName,
                groupFriendlyName: group.groupFriendlyName
              },
              success: false,
              error: 'Target group not found'
            });
            continue;
          }
        }

        operationResults.push({
          hostAlias: resolvedHostAlias,
          group: resolvedGroup,
          success: true
        });
      }
    }

    // Now add the final group update operations based on our tracked changes
    for (const [groupId, hostAliases] of groupContentChanges) {
      const targetGroup = await getNetworkGroupById(groupId);
      if (targetGroup) {
        const newContent = Array.from(hostAliases).join('\n');

        groupAssignmentOperations.push({
          type: 'update',
          uuid: groupId,
          payload: {
            alias: {
              enabled: targetGroup.enabled ? '1' : '0',
              name: targetGroup.name,
              type: targetGroup.type || 'networkgroup',
              content: newContent,
              description: targetGroup.description || '',
              proto: targetGroup.proto || '',
              interface: targetGroup.interface || '',
              counters: targetGroup.counters || '',
              updatefreq: targetGroup.updatefreq || '',
              categories: targetGroup.categories || ''
            }
          }
        });
      }
    }

    // Process groups that need host aliases removed (for moveFromExisting)
    if (groupsToRemoveFrom.size > 0) {
      logger.debug(`Processing ${groupsToRemoveFrom.size} groups that need host aliases removed for moveFromExisting`);

      for (const [groupId, hostAliasesToRemove] of groupsToRemoveFrom) {
        const targetGroup = await getNetworkGroupById(groupId);
        if (targetGroup) {
          // Get current content and deduplicate defensively (handles corrupted existing data)
          const currentContent = parseGroupContent(targetGroup.rawContent, targetGroup.name);

          // Remove all tracked host aliases using Set (ensures no duplicates remain)
          const contentSet = new Set(currentContent);
          for (const aliasToRemove of hostAliasesToRemove) {
            contentSet.delete(aliasToRemove);
          }
          const updatedContent = Array.from(contentSet).join('\n');

          logger.debug(`Removing host aliases from group "${targetGroup.name}" (${groupId}):\n            - Original content: "${targetGroup.rawContent}"\n            - Host aliases to remove: [${Array.from(hostAliasesToRemove).join(', ')}]\n            - Updated content: "${updatedContent}"\n          `);

          groupAssignmentOperations.push({
            type: 'update',
            uuid: groupId,
            payload: {
              alias: {
                enabled: targetGroup.enabled ? '1' : '0',
                name: targetGroup.name,
                type: targetGroup.type || 'networkgroup',
                content: updatedContent,
                description: targetGroup.description || '',
                proto: targetGroup.proto || '',
                interface: targetGroup.interface || '',
                counters: targetGroup.counters || '',
                updatefreq: targetGroup.updatefreq || '',
                categories: targetGroup.categories || ''
              }
            }
          });
        }
      }
    }
  }

  // Handle custom batchOperations
  if (customBatchOperations) {
    groupAssignmentOperations.push(...customBatchOperations);
  }

  // Combine operations: host alias creation first, then group assignments
  allBatchOperations.push(...hostAliasCreationOperations, ...groupAssignmentOperations);

  logger.debug(`Batch operation summary:\n      - Host alias creation operations: ${hostAliasCreationOperations.length}\n      - Group assignment operations: ${groupAssignmentOperations.length}\n      - Total operations: ${allBatchOperations.length}\n    `);

  if (hostAliasCreationOperations.length > 0) {
    logger.debug('Host alias creation operations:', hostAliasCreationOperations.map(op => (op.payload as OpnsenseAddAliasItemPayload)?.alias.name));
  }

  if (groupAssignmentOperations.length > 0) {
    logger.debug('Group assignment operations:', groupAssignmentOperations.map(op => ({
      group: (op.payload as OpnsenseSetAliasItemPayload)?.alias.name,
      content: (op.payload as OpnsenseSetAliasItemPayload)?.alias.content
    })));
  }

  // Log audit event for batch operation
  await logAuditEvent({
    userId,
    action: operationType === 'assign' ? 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_ATTEMPT' : 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_ATTEMPT',
    details: {
      operationType,
      hostAliases: hostAliases?.map((ha: HostAliasInput) => ({
        ipAddress: ha.ipAddress,
        hostAliasName: ha.hostAliasName,
        hostAliasHostName: ha.hostAliasHostName
      })) || [],
      groups: groups?.map((g: GroupInput) => ({
        groupId: g.groupId,
        groupName: g.groupName,
        groupFriendlyName: g.groupFriendlyName
      })) || [],
      moveFromExisting,
      authMethod,
      totalOperations: allBatchOperations.length,
      hostAliasCreationCount: hostAliasCreationOperations.length,
      groupAssignmentCount: groupAssignmentOperations.length
    },
  });

  // Execute operations in phases: host alias creation first, then group assignments
  if (allBatchOperations.length > 0) {
    logger.debug(`Executing batch operation with ${allBatchOperations.length} operations`);

    let batchResult: BatchAliasResult; // Explicitly type batchResult

    // If we have host alias creation operations, execute them first with reconfigure
    if (hostAliasCreationOperations.length > 0) {
      logger.debug(`Phase 1: Executing ${hostAliasCreationOperations.length} host alias creation operations`);
      const hostAliasResult = await batchAliasOperations(hostAliasCreationOperations);

      if (!hostAliasResult.success) {
        logger.error('Host alias creation failed:', hostAliasResult);
        return NextResponse.json({
          success: false,
          message: `Host alias creation failed: ${hostAliasResult.error || 'Unknown error'}`,
          operationResults,
          totalOperations: allBatchOperations.length,
          batchResults: hostAliasResult.results.map((r, idx) => ({
            index: idx,
            type: r.operation.type,
            success: !r.error,
            error: r.error,
            result: r.result
          }))
        }, { status: 400 });
      }

      logger.debug('Phase 1 completed successfully, host aliases created');

      // Verify that host aliases were actually created
      for (const operation of hostAliasCreationOperations) {
        if (!operation.payload) continue; // Skip if payload is undefined
        const aliasName = (operation.payload as OpnsenseAddAliasItemPayload).alias.name;
        logger.debug(`Verifying host alias "${aliasName}" was created...`);
        try {
          const hostAliases = await getHostAliasesByName(aliasName);
          if (hostAliases.length > 0) {
            logger.debug(`Host alias "${aliasName}" verified as created`);
            logger.debug(`Host alias details:`, hostAliases[0]);
          } else {
            logger.warn(`Host alias "${aliasName}" was not found after creation - this may be a timing issue`);

            // Additional debugging: check all host aliases to see what exists
            try {
              const { getHostAliases, exportAliases } = await import('@/lib/opnsense-api');
              const allHostAliases = await getHostAliases();
              logger.debug(`All host aliases found:`, allHostAliases.map((ha: OpnsenseAliasDetail) => ({ name: ha.name, type: ha.type, content: ha.content })));

              // Also check if it exists in the full export
              const fullExport = await exportAliases();
              const allAliases: OpnsenseAliasDetail[] = Object.entries(fullExport.aliases.alias).map(([uuid, alias]) => ({ uuid, ...alias }));
              logger.debug(`All aliases in export:`, allAliases.map((ha: OpnsenseAliasDetail) => ({ name: ha.name, type: ha.type, content: ha.content })));

              const matchingAlias = allAliases.find((alias: OpnsenseAliasDetail) => alias.name === aliasName);
              if (matchingAlias) {
                logger.debug(`Found alias "${aliasName}" in full export:`, matchingAlias);
              } else {
                logger.debug(`Alias "${aliasName}" not found in full export`);
              }
            } catch (debugError) {
              logger.error(`Error during additional debugging:`, debugError);
            }

            // Don't fail the operation, just log the warning
            // The host alias might still exist but not be immediately visible
          }
        } catch (error) {
          logger.error(`Error verifying host alias "${aliasName}":`, error);
          // Don't fail the operation, just log the error
        }
      }

      // Small delay to ensure OPNsense has processed the host alias creation
      await new Promise(resolve => setTimeout(resolve, 1000));
      logger.debug('Delay completed, proceeding to Phase 2');
    }

    // Now execute group assignment operations
    if (groupAssignmentOperations.length > 0) {
      logger.debug(`Phase 2: Executing ${groupAssignmentOperations.length} group assignment operations`);
      batchResult = await batchAliasOperations(groupAssignmentOperations);
    } else {
      // No group assignments, use the host alias result
      batchResult = { success: true, results: [] };
    }

    // Log detailed results
    logger.debug(`Batch operation results:`, {
      success: batchResult.success,
      totalOperations: allBatchOperations.length,
      results: batchResult.results.map((r, idx) => ({
        index: idx,
        type: r.operation.type,
        success: !r.error,
        error: r.error,
        result: r.result
      }))
    });

    // Combine results from both phases if we had host alias creation
    const allResults: BatchAliasResult['results'] = batchResult.results;
    if (hostAliasCreationOperations.length > 0) {
      // We need to get the host alias creation results from the first phase
      // For now, we'll just use the current batch results
      logger.debug(`Combined results from both phases: ${allResults.length} total operations`);
    }

    if (batchResult.success) {
      // Compute removedFromGroups for audit logs when single-host/single-target moves are performed
      let removedFromGroupsForAudit: { id: string; name: string; friendlyName: string | null }[] | undefined = undefined;
      if (moveFromExisting && restrictRemovalToSingleSelect && hostAliases?.length === 1 && groups?.length === 1) {
        const onlyHost = hostAliases[0];
        const aliasNameForAudit = (await resolveHostAliasIdentifier(onlyHost.ipAddress, onlyHost.hostAliasName, onlyHost.hostAliasHostName))?.hostAliasName;
        if (aliasNameForAudit) {
          removedFromGroupsForAudit = removedFromGroupsByHost.get(aliasNameForAudit);
        }
      }


      // Prepare audit log host aliases
      const auditHostAliases = hostAliases?.map((ha: HostAliasInput) => ({
        ipAddress: ha.ipAddress,
        hostAliasName: ha.hostAliasName,
        hostAliasHostName: ha.hostAliasHostName
      })) || [];

      // Resolve groups to get complete information for audit log
      const resolvedGroupsForAudit = await Promise.all(
        (groups || []).map(async (g: GroupInput) => {
          const resolved = await resolveGroupIdentifier(g.groupId, g.groupName, g.groupFriendlyName);
          if (resolved) {
            const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid === resolved.groupId);
            return {
              groupId: resolved.groupId,
              groupName: resolved.group.name,
              groupFriendlyName: displayInfo?.friendlyName || null,
              groupType: displayInfo?.groupType || undefined
            };
          }
          // Fallback to input if resolution fails
          return {
            groupId: g.groupId || '',
            groupName: g.groupName || '',
            groupFriendlyName: g.groupFriendlyName || null
          };
        })
      );

      // Log success audit event
      await logAuditEvent({
        userId,
        action: operationType === 'assign' ? 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_SUCCESS' : 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_SUCCESS',
        details: {
          operationType,
          hostAliases: auditHostAliases,
          groups: resolvedGroupsForAudit,
          authMethod,
          totalOperations: allBatchOperations.length,
          successfulOperations: batchResult.results.filter(r => !r.error).length,
          failedOperations: batchResult.results.filter(r => r.error).length,
          // Include helpful move-related context when present
          ...(removedFromGroupsForAudit?.length ? { removedFromGroups: removedFromGroupsForAudit } : {}),
          ...(removedFromGroupsByHost.size ? { removedFromGroupsByHost: Array.from(removedFromGroupsByHost.entries()).map(([hostAliasName, groups]) => ({ hostAliasName, removedFromGroups: groups })) } : {})
        },
      });

      // Update operationResults with current group state after operations
      const updatedOperationResults = await Promise.all(operationResults.map(async (result: OperationResult) => {
        if (result.success && result.group?.groupId) {
          try {
            const currentGroup = await getNetworkGroupById(result.group.groupId);
            if (currentGroup) {
              return {
                ...result,
                group: {
                  ...result.group,
                  group: currentGroup
                }
              };
            }
          } catch (error) {
            logger.error(`Error fetching updated group state for ${result.group.groupId}:`, error);
          }
        }
        return result;
      }));

      // Build a lightweight top-level removedFromGroups for single-host single-target moves
      let removedFromGroups: { id: string; name: string; friendlyName: string | null }[] | undefined = undefined;
      if (moveFromExisting && restrictRemovalToSingleSelect && hostAliases?.length === 1 && groups?.length === 1) {
        const onlyHost = hostAliases[0];
        const aliasName = (await resolveHostAliasIdentifier(onlyHost.ipAddress, onlyHost.hostAliasName, onlyHost.hostAliasHostName))?.hostAliasName;
        if (aliasName) {
          removedFromGroups = removedFromGroupsByHost.get(aliasName);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully executed ${allBatchOperations.length} operations`,
        operationResults: updatedOperationResults,
        totalOperations: allBatchOperations.length,
        ...(removedFromGroups && removedFromGroups.length > 0 ? { removedFromGroups } : {}),
        batchResults: batchResult.results.map((r, idx) => ({
          index: idx,
          type: r.operation.type,
          success: !r.error,
          error: r.error,
          result: r.result
        }))
      });
    } else {
      // Log failure audit event
      await logAuditEvent({
        userId,
        action: operationType === 'assign' ? 'OPNSENSE_GROUP_IP_BATCH_ASSIGN_FAILURE' : 'OPNSENSE_GROUP_IP_BATCH_UNASSIGN_FAILURE',
        details: {
          operationType,
          hostAliases: hostAliases?.map((ha: HostAliasInput) => ({
            ipAddress: ha.ipAddress,
            hostAliasName: ha.hostAliasName,
            hostAliasHostName: ha.hostAliasHostName
          })) || [],
          groups: groups?.map((g: GroupInput) => ({
            groupId: g.groupId,
            groupName: g.groupName,
            groupFriendlyName: g.groupFriendlyName
          })) || [],
          authMethod,
          totalOperations: allBatchOperations.length,
          successfulOperations: batchResult.results.filter(r => !r.error).length,
          failedOperations: batchResult.results.filter(r => r.error).length,
          errorMessages: batchResult.results.filter(r => r.error).map(r => r.error)
        },
      });

      const errorMessages = batchResult.results
        .filter(r => r.error)
        .map(r => r.error)
        .join(', ');

      return NextResponse.json({
        success: false,
        message: `Batch operation failed: ${errorMessages}`,
        operationResults,
        totalOperations: allBatchOperations.length,
        batchResults: batchResult.results.map((r, idx) => ({
          index: idx,
          type: r.operation.type,
          success: !r.error,
          error: r.error,
          result: r.result
        }))
      }, { status: 400 });
    }
  }

  return NextResponse.json({
    success: true,
    message: 'No operations to execute',
    operationResults
  });
}