import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/auditLog';
import { setAliasItem, reconfigureAliases, getHostAliases, deleteAliasItem, exportAliases, addIpToGroup, removeIpFromGroup } from '@/lib/opnsense-api';
import type { OpnsenseSetAliasItemPayload } from '@/lib/opnsense-api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import * as ipaddr from 'ipaddr.js';
import type { NetworkGroup, OpnsenseAliasDetailFromExport } from '@/types/opnsense';
 
interface RouteContext {
  params: Promise<{
    uuid: string;
  }>;
}

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

    const allAliasDetails = Object.entries(allAliasesResponse.aliases.alias)
      .map(([uuid, detail]) => ({ ...detail, uuid }));

    const hostAndNetworkAliasesContainingIp = [];

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
          if (hostAndNetworkAliasesContainingIp.some(hnAlias => hnAlias.name === memberName)) {
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
 
// GET /api/opnsense/aliases/[uuid] - Get a specific alias by UUID
export async function GET(request: Request, context: RouteContext) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

  const { uuid } = await context.params;

  if (!uuid || typeof uuid !== 'string') {
    return NextResponse.json({ success: false, message: 'Valid UUID parameter is missing' }, { status: 400 });
  }

  try {
    // Get all host aliases to find the one with matching UUID
    const hostAliases = await getHostAliases();
    const alias = hostAliases.find((alias: OpnsenseAliasDetailFromExport) => alias.uuid === uuid);

    if (!alias) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'OPNSENSE_ALIAS_READ_FAILURE',
        details: {
          aliasUuid: uuid,
          reason: 'Alias not found.',
        },
      });
      return NextResponse.json({ success: false, message: 'Alias not found' }, { status: 404 });
    }

            await logAuditEvent({
      userId: auth.user.id,
      action: 'OPNSENSE_ALIAS_READ_SUCCESS',
         details: {
           aliasUuid: uuid,
        aliasName: alias.name,
         },
       });
 
    return NextResponse.json({ success: true, alias });
   } catch (error) {
    logger.error(`Error fetching alias ${uuid}:`, error);
     await logAuditEvent({
      userId: auth.user.id,
      action: 'OPNSENSE_ALIAS_READ_FAILURE',
       details: {
         aliasUuid: uuid,
        reason: 'OPNsense API error',
       },
     });
    return NextResponse.json({ success: false, message: 'Failed to fetch alias' }, { status: 500 });
   }
  });
 }

// PUT /api/opnsense/aliases/[uuid] - Update a specific alias by UUID
 export async function PUT(request: Request, context: RouteContext) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

  const { uuid } = await context.params;

   if (!uuid || typeof uuid !== 'string') {
     return NextResponse.json({ success: false, message: 'Valid UUID parameter is missing' }, { status: 400 });
   }

   try {
     const body = await request.json();
     // The body should contain the full alias object structure expected by setAliasItem
     // We expect something like { alias: { name: "...", type: "...", content: "...", ... } }
     if (!body || typeof body !== 'object' || !body.alias || typeof body.alias !== 'object') {
        await logAuditEvent({
         userId: auth.user.id,
          action: 'OPNSENSE_ALIAS_UPDATE_FAILURE',
          details: {
            aliasUuid: uuid,
            reason: 'Invalid request payload: "alias" object is missing or invalid.',
          },
        });
        return NextResponse.json({ success: false, message: 'Invalid request payload: "alias" object is missing or invalid.' }, { status: 400 });
     }

     // Basic validation of the alias object within the body
     const aliasData = body.alias;

     // Fetch the existing alias to compare for actual changes
     const hostAliases = await getHostAliases();
     const existingAlias = hostAliases.find((alias: OpnsenseAliasDetailFromExport) => alias.uuid === uuid);

     if (!existingAlias) {
       await logAuditEvent({
         userId: auth.user.id,
         action: 'OPNSENSE_ALIAS_UPDATE_FAILURE',
         details: {
           aliasUuid: uuid,
           reason: 'Alias not found',
         },
       });
       return NextResponse.json({ success: false, message: 'Alias not found' }, { status: 404 });
     }

     // Compare old and new values to detect actual changes
     const hasChanges =
       existingAlias.name !== aliasData.name ||
       existingAlias.content !== aliasData.content ||
       existingAlias.description !== (aliasData.description || '') ||
       existingAlias.enabled !== aliasData.enabled;

     // If no changes detected, log and return success without calling OPNsense API
     if (!hasChanges) {
       await logAuditEvent({
         userId: auth.user.id,
         action: 'OPNSENSE_ALIAS_UPDATE_NO_CHANGE',
         details: {
           aliasUuid: uuid,
           aliasName: aliasData.name,
           reason: 'No changes detected',
         },
       });
       return NextResponse.json({
         success: true,
         message: 'No changes detected',
         result: { result: 'saved' }
       });
     }

     // Track what changed for audit log
     const changes: Record<string, { old: string; new: string }> = {};
     if (existingAlias.name !== aliasData.name) {
       changes.name = { old: existingAlias.name, new: aliasData.name };
     }
     if (existingAlias.content !== aliasData.content) {
       changes.content = { old: existingAlias.content, new: aliasData.content };
     }
     if (existingAlias.description !== (aliasData.description || '')) {
       changes.description = { old: existingAlias.description, new: aliasData.description || '' };
     }
     if (existingAlias.enabled !== aliasData.enabled) {
       changes.enabled = { old: existingAlias.enabled, new: aliasData.enabled };
     }

     await logAuditEvent({
      userId: auth.user.id,
       action: 'OPNSENSE_ALIAS_UPDATE_ATTEMPT',
       details: {
         aliasUuid: uuid,
        aliasName: aliasData.name,
        changes,
       },
     });

    // Call the OPNsense API to update the alias
    const result = await setAliasItem(uuid, aliasData as OpnsenseSetAliasItemPayload);

    if (result.result === 'saved') {
      // Trigger reconfiguration
      await reconfigureAliases();

              await logAuditEvent({
        userId: auth.user.id,
             action: 'OPNSENSE_ALIAS_UPDATE_SUCCESS',
             details: {
               aliasUuid: uuid,
               aliasName: aliasData.name,
               changes,
             },
           });

      return NextResponse.json({ success: true, message: 'Alias updated successfully', result });
         } else {
           await logAuditEvent({
        userId: auth.user.id,
        action: 'OPNSENSE_ALIAS_UPDATE_FAILURE',
             details: {
               aliasUuid: uuid,
               aliasName: aliasData.name,
          reason: 'OPNsense API returned failure',
             },
           });
      return NextResponse.json({ success: false, message: 'Failed to update alias' }, { status: 500 });
    }
  } catch (error) {
    logger.error(`Error updating alias ${uuid}:`, error);
         await logAuditEvent({
      userId: auth.user.id,
             action: 'OPNSENSE_ALIAS_UPDATE_FAILURE',
             details: {
               aliasUuid: uuid,
        reason: 'Exception during alias update',
             },
           });
    return NextResponse.json({ success: false, message: 'Failed to update alias' }, { status: 500 });
  }
  });
}

// DELETE /api/opnsense/aliases/[uuid] - Delete a specific alias by UUID OR remove IP from network group
export async function DELETE(request: Request, context: RouteContext) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }
 
  const { uuid } = await context.params;
 
  if (!uuid || typeof uuid !== 'string') {
    return NextResponse.json({ success: false, message: 'Valid UUID parameter is missing' }, { status: 400 });
  }

  try {
    // Check if this is a request to remove an IP from a group
    const body = await request.json().catch(() => null);
    
    if (body && body.ipAddress) {
      // This is a request to remove an IP from a network group
      const { ipAddress, hostAliasName } = body;

      logger.debug(`DELETE handler: Removing IP ${ipAddress} from group ${uuid}, hostAliasName: ${hostAliasName}`);

      await logAuditEvent({
        userId: auth.user.id,
        action: 'OPNSENSE_GROUP_IP_REMOVE_ATTEMPT',
        details: {
          groupId: uuid,
          ipAddress,
          hostAliasName: hostAliasName || null,
        },
      });

      // Use the existing removeIpFromGroup function
      logger.debug(`DELETE handler: Calling removeIpFromGroup(${uuid}, ${ipAddress}, ${hostAliasName})`);
      const result = await removeIpFromGroup(uuid, ipAddress, hostAliasName);
      logger.debug(`DELETE handler: removeIpFromGroup result:`, result);

      if (result.success) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'OPNSENSE_GROUP_IP_REMOVE_SUCCESS',
          details: {
            groupId: uuid,
            ipAddress,
            hostAliasName: hostAliasName || null,
            groupName: result.updatedGroup?.name || null,
          },
        });

        const response = {
          success: true,
          message: result.message,
          updatedGroup: result.updatedGroup
        };
        logger.debug(`DELETE handler: Returning success response:`, response);
        return NextResponse.json(response);
      } else {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'OPNSENSE_GROUP_IP_REMOVE_FAILURE',
          details: {
            groupId: uuid,
            ipAddress,
            hostAliasName: hostAliasName || null,
            reason: result.message,
          },
        });

        const errorResponse = {
          success: false,
          message: result.message
        };
        logger.debug(`DELETE handler: Returning error response:`, errorResponse);
        return NextResponse.json(errorResponse, { status: 400 });
      }
    } else {
      // This is a request to delete an alias entirely
      // First, get the alias details for logging
      const hostAliases = await getHostAliases();
      const alias = hostAliases.find((alias: OpnsenseAliasDetailFromExport) => alias.uuid === uuid);
 
      if (!alias) {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'OPNSENSE_ALIAS_DELETE_FAILURE',
          details: {
            aliasUuid: uuid,
            reason: 'Alias not found for deletion.',
          },
        });
        return NextResponse.json({ success: false, message: 'Alias not found' }, { status: 404 });
      }

      await logAuditEvent({
        userId: auth.user.id,
        action: 'OPNSENSE_ALIAS_DELETE_ATTEMPT',
        details: {
          aliasUuid: uuid,
          aliasName: alias.name,
        },
      });

      // Call the OPNsense API to delete the alias
      const result = await deleteAliasItem(uuid);
 
      if (result.result === 'deleted') {
        // Trigger reconfiguration
        await reconfigureAliases();
 
        await logAuditEvent({
          userId: auth.user.id,
          action: 'OPNSENSE_ALIAS_DELETE_SUCCESS',
          details: {
            aliasUuid: uuid,
            aliasName: alias.name,
          },
        });

        return NextResponse.json({ success: true, message: 'Alias deleted successfully', result });
      } else {
        await logAuditEvent({
          userId: auth.user.id,
          action: 'OPNSENSE_ALIAS_DELETE_FAILURE',
          details: {
            aliasUuid: uuid,
            aliasName: alias.name,
            reason: 'OPNsense API returned failure',
          },
        });
        return NextResponse.json({ success: false, message: 'Failed to delete alias' }, { status: 500 });
      }
    }
  } catch (error) {
    logger.error(`Error processing DELETE request for ${uuid}:`, error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'OPNSENSE_ALIAS_DELETE_FAILURE',
      details: {
        aliasUuid: uuid,
        reason: 'Exception during alias deletion',
      },
    });
    return NextResponse.json({ success: false, message: 'Failed to process delete request' }, { status: 500 });
  }
  });
}

// POST /api/opnsense/aliases/[uuid] - Add IP to network group
export async function POST(request: Request, context: RouteContext) {
  return authenticateAndTrackRequest(request, async (auth) => {
    if (!auth.user) {
      return NextResponse.json({ message: auth.authError || 'Unauthorized' }, { status: 401 });
    }

  const { uuid: groupId } = await context.params;

  if (!groupId || typeof groupId !== 'string') {
    return NextResponse.json({ success: false, message: 'Valid group UUID parameter is missing' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { ipAddress, description, hostAliasName, moveFromExistingGroup = true } = body;

    if (!ipAddress) {
      return NextResponse.json({ success: false, message: 'IP address is required' }, { status: 400 });
    }

    await logAuditEvent({
      userId: auth.user.id,
      action: 'OPNSENSE_GROUP_IP_ADD_ATTEMPT',
      details: {
        groupId,
        ipAddress,
        hostAliasName: hostAliasName || null,
        description: description || null,
        moveFromExistingGroup: moveFromExistingGroup || false,
      },
    });

    // Check if the IP is already in another group
    if (moveFromExistingGroup) {
      try {
        // Get current group membership using the direct function instead of fetch
        const currentGroups = await getIpGroupMembership(ipAddress);
        logger.debug(`Current group membership for IP ${ipAddress}:`, currentGroups);
        
        // Find groups that are not the target group
        const otherGroups = currentGroups.filter(group => group.id !== groupId);
        
        if (otherGroups.length > 0) {
          // IP is already in other groups, remove it from them
          logger.debug(`IP ${ipAddress} is already in ${otherGroups.length} other groups. Removing before adding to new group.`);
          
          for (const group of otherGroups) {
            logger.debug(`Removing IP ${ipAddress} from group ${group.name} (${group.id})`);
            
            const removeResult = await removeIpFromGroup(group.id, ipAddress, hostAliasName);
            
            if (!removeResult.success) {
              logger.warn(`Failed to remove IP ${ipAddress} from group ${group.name} (${group.id}): ${removeResult.message}`);
              // We continue anyway to try to add to the new group
            } else {
              logger.debug(`Successfully removed IP ${ipAddress} from group ${group.name} (${group.id})`);
              
              await logAuditEvent({
                userId: auth.user.id,
                action: 'OPNSENSE_GROUP_IP_MOVE_REMOVE',
                details: {
                  sourceGroupId: group.id,
                  targetGroupId: groupId,
                  ipAddress,
                  hostAliasName: hostAliasName || null,
                },
              });
            }
          }
        }
      } catch (error) {
        logger.error(`Error checking current group membership for IP ${ipAddress}:`, error);
        // Continue anyway to try to add to the new group
      }
    }

    // Use the existing addIpToGroup function
    const result = await addIpToGroup(groupId, ipAddress, description);

    if (result.success) {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'OPNSENSE_GROUP_IP_ADD_SUCCESS',
        details: {
          groupId,
          ipAddress,
          hostAliasName: hostAliasName || null,
          groupName: result.updatedGroup?.name || null,
          wasMoved: moveFromExistingGroup || false,
        },
      });

      return NextResponse.json({
        success: true,
        message: result.message,
        updatedGroup: result.updatedGroup
      });
    } else {
      await logAuditEvent({
        userId: auth.user.id,
        action: 'OPNSENSE_GROUP_IP_ADD_FAILURE',
        details: {
          groupId,
          ipAddress,
          hostAliasName: hostAliasName || null,
          reason: result.message,
        },
      });

      return NextResponse.json({
        success: false,
        message: result.message
      }, { status: 400 });
    }
  } catch (error) {
    logger.error(`Error adding IP to group ${groupId}:`, error);
    await logAuditEvent({
      userId: auth.user.id,
      action: 'OPNSENSE_GROUP_IP_ADD_FAILURE',
      details: {
        groupId,
        reason: 'Exception during IP addition',
      },
    });
    return NextResponse.json({ success: false, message: 'Failed to add IP to group' }, { status: 500 });
  }
  });
}