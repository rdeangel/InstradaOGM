import { NextResponse } from 'next/server';
import { getHostAliases, addAliasItem, reconfigureAliases, deleteAliasItem, setAliasItem, fetchFromOpnsense, exportAliases } from '@/lib/opnsense-api';

interface OpnsenseAliasDetail {
  uuid?: string;
  name: string;
  type: string;
  content: string;
  description?: string;
  enabled?: string;
}
import { prisma } from '@/lib/prisma'; // Import prisma
import { logger } from '@/lib/logger';
import { Role, OpnsenseDhcpReservation, NetworkGroup } from '@/types/opnsense'; // Import OpnsenseDhcpReservation and NetworkGroup
import { getFilteredHostAliases } from '@/lib/host-alias-filtering'; // Import the filtering function
import { lookupMacVendor } from '@/lib/server/network-utils'; // Import lookupMacVendor
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { logApiAccess } from '@/lib/auditLog';
import { fetchUnmanagedGroupFilterData, isHostInUnmanagedGroups } from '@/lib/unmanaged-group-utils';


// Helper function to get IP group membership for a host alias
async function getIpGroupMembershipForAlias(hostAliasName: string): Promise<NetworkGroup[]> {
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

    const memberOfGroups: NetworkGroup[] = [];

    // Find network groups that contain this host alias
    for (const groupAlias of allAliasDetails) {
      if (groupAlias.type === 'networkgroup' && groupAlias.content) {
        const memberAliasNames = groupAlias.content.split(/\n|,/).map((name: string) => name.trim()).filter(Boolean);

        if (memberAliasNames.includes(hostAliasName)) {
          const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === (groupAlias.uuid || '').toLowerCase());

          memberOfGroups.push({
            id: groupAlias.uuid || groupAlias.name,
            uuid: groupAlias.uuid || '',
            name: groupAlias.name,
            description: groupAlias.description || '',
            enabled: groupAlias.enabled === '1',
            members: [], // Required by NetworkGroup type
            lastUpdated: null,
            rawContent: groupAlias.content,
            type: groupAlias.type,
            friendlyName: displayInfo?.friendlyName || groupAlias.name,
            iconIdentifier: displayInfo?.iconIdentifier || null,
          });
        }
      }
    }

    return memberOfGroups;
  } catch (error) {
    logger.error('Error fetching IP group membership for alias:', error);
    throw new Error('Failed to determine IP group membership');
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ipAddress = searchParams.get('ipAddress');
  const auth = await authenticateRequest(request);
  // Extract client IP using standardized helper
  const { getClientIp } = await import('@/lib/network-utils');
  const rawClientIp = getClientIp(request);

  // Normalize client IP for comparison (remove IPv4-mapped IPv6 prefix)
  const clientIp = rawClientIp?.startsWith('::ffff:') ? rawClientIp.substring(7) : (rawClientIp || 'UNKNOWN_IP');
  const normalizedRequestedIp = ipAddress?.startsWith('::ffff:') ? ipAddress.substring(7) : ipAddress;

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // Check if self-service is globally disabled for unauthenticated users only
  // Authenticated admin users should still be able to access this endpoint for admin functionality
  const globalSettings = await prisma.globalSettings.findFirst({
    orderBy: { id: 'asc' },
  });

  if (!auth.user && globalSettings?.removeSelfServicePage) {
    logger.info(`Unauthenticated host alias management blocked - self-service functionality is globally disabled`);
    return NextResponse.json({
      error: 'Forbidden: Self-service functionality is disabled'
    }, { status: 403 });
  }

  // For authenticated users, no additional IP-based restrictions
  // (Device management scope is only enforced for self-service functionality)

  try {
    if (ipAddress) {
      // If not authenticated, verify the request is for the client's own IP
      if (!auth.user) {
        if (normalizedRequestedIp !== clientIp) {
          logger.warn(`Unauthorized attempt to search host alias for IP ${ipAddress} from client IP ${clientIp}.`);
          return new NextResponse(JSON.stringify({ error: 'Forbidden: You can only query for your own device.' }), { status: 403 });
        }
      }

      const hostAliases = await getHostAliases();
      // Find the alias where content matches the detected IP
      const matchingAlias = hostAliases.find(alias =>
        alias.content.split('\n').includes(ipAddress) && alias.type === 'host'
      );
      if (matchingAlias) {
        return NextResponse.json({
          name: matchingAlias.name,
          uuid: matchingAlias.uuid,
          enabled: matchingAlias.enabled,
          description: matchingAlias.description || '',
          last_updated: matchingAlias.last_updated || null
        });
      } else {
        return NextResponse.json({ name: null, uuid: null, enabled: null, description: null, last_updated: null }, { status: 200 }); // Return null if no alias found for IP
      }
    } else {
      // If no specific IP is requested, require authentication to list all aliases
      if (!auth.user || (auth.user?.role !== Role.SUPER_ADMIN && auth.user?.role !== Role.ADMIN)) {
        return new NextResponse(JSON.stringify({ error: 'Unauthorized: Listing all host aliases requires ADMIN or SUPER_ADMIN role.' }), { status: 401 });
      }
      // Use the centralized filtering function for admin view
      const { displayableHostAliases, filteredCount } = await getFilteredHostAliases();

      // Fetch DHCP reservations to enrich host aliases
      const dhcpReservationsResponse = await fetchFromOpnsense<{ rows: OpnsenseDhcpReservation[] }>('/api/kea/dhcpv4/search_reservation', 'POST', {});
      const dhcpReservations: OpnsenseDhcpReservation[] = dhcpReservationsResponse.rows || [];

      const enrichedHostAliases = displayableHostAliases.map(alias => {
        const dhcpReservation = dhcpReservations.find(res => res.ip_address === alias.content);
        const dhcpMacConflict = dhcpReservation && alias.detectedMac && dhcpReservation.hw_address.toLowerCase() !== alias.detectedMac.toLowerCase();

        return {
          ...alias,
          isDhcpReserved: !!dhcpReservation,
          dhcpReservedMac: dhcpReservation?.hw_address?.toLowerCase() || null,
          dhcpReservedVendor: dhcpReservation?.hw_address ? lookupMacVendor(dhcpReservation.hw_address.toLowerCase()) : null,
          dhcpMacConflict: dhcpMacConflict,
        };
      });

      // Track usage for authenticated requests
      if (auth && auth.user) {
        await trackUsageByAuthMethod(request, auth, 200);
      }

      return NextResponse.json({ displayableHostAliases: enrichedHostAliases, filteredCount });
    }
  } catch (error) {
    logger.error("API Error fetching host aliases:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

    // Track usage for authenticated requests (even failed ones)
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 500);
    }

    // Check if the error is specifically about API credentials
    if (errorMessage.includes("OPNsense API credentials are not configured")) {
      return NextResponse.json({ message: "OPNsense API connection is not configured in the settings." }, { status: 503 }); // Service Unavailable
    }
    return NextResponse.json({ message: `Failed to fetch host aliases: ${errorMessage}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const uuid = searchParams.get('uuid');

  if (!uuid || typeof uuid !== 'string') {
    return NextResponse.json({ message: 'Valid UUID parameter is missing' }, { status: 400 });
  }

  // Use mixed tracking since this might support both authenticated and unauthenticated access
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors BEFORE proceeding
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // Track usage for authenticated requests
  if (auth && auth.user) {
    await trackUsageByAuthMethod(request, auth, 200);
  }

  try {

    // Get alias details before deletion for logging
    let aliasName = 'unknown';
    let aliasType = 'unknown';
    try {
      const allAliases = await getHostAliases();
      const alias = allAliases.find(a => a.uuid === uuid);
      if (alias) {
        aliasName = alias.name;
        aliasType = alias.type;
      }
    } catch (error) {
      logger.warn(`Could not fetch alias details for UUID ${uuid} before deletion:`, error);
    }

    // Log deletion attempt
    await logApiAccess(auth, 'HOST_ALIAS_DELETE_ATTEMPT', {
      aliasUuid: uuid,
      aliasName,
      aliasType
    }, request);

    // 1. Delete the host alias from OPNsense
    const deleteResult = await deleteAliasItem(uuid);
    logger.debug(`deleteAliasItem result for host alias: ${deleteResult.result}.`);

    if (deleteResult.result === 'deleted') {
      // Log successful deletion
      await logApiAccess(auth, 'HOST_ALIAS_DELETE_SUCCESS', {
        aliasUuid: uuid,
        aliasName,
        aliasType
      }, request);

      // 2. If OPNsense deletion is successful, clean up associated permissions in the local database
      try {
        const deletePermissionsResult = await prisma.groupHostAliasPermission.deleteMany({
          where: {
            opnsenseAliasUuid: uuid,
          },
        });
        logger.debug(`Deleted ${deletePermissionsResult.count} associated group host alias permissions for UUID ${uuid}.`);
      } catch (dbError) {
        logger.error(`Failed to delete associated group host alias permissions for UUID ${uuid}:`, dbError);
        // Decide if this should halt the process or just log a warning.
        // For now, we'll log and continue, as the OPNsense deletion was successful.
      }

      // 3. Reconfigure OPNsense
      try {
        const reconfigureResult = await reconfigureAliases();
        logger.debug(`reconfigureAliases result after DELETE host alias: ${reconfigureResult.status}.`);
        if (reconfigureResult.status === 'ok' || reconfigureResult.status === 'done' || reconfigureResult.status === 'success') {
          return NextResponse.json({ success: true, message: `Host alias ${uuid} deleted and OPNsense reconfigured successfully.` });
        } else {
          logger.warn(`Host alias ${uuid} was deleted, but reconfigure step returned:`, reconfigureResult);
          return NextResponse.json({
            success: true, // Deletion was successful
            message: `Host alias ${uuid} deleted, but reconfigure step may have had issues.`,
            detailsReconfigure: reconfigureResult
          }, { status: 207 }); // Multi-Status
        }
      } catch (reconfigureError) {
        logger.error(`Host alias ${uuid} was deleted, but failed to reconfigure:`, reconfigureError);
        return NextResponse.json({
          success: true, // Deletion was successful
          message: `Host alias ${uuid} deleted, but an error occurred during reconfiguration.` + (reconfigureError instanceof Error ? ` ${reconfigureError.message}` : ''),
          reconfigureError: reconfigureError instanceof Error ? reconfigureError.message : String(reconfigureError)
        }, { status: 207 }); // Multi-Status
      }
    } else {
      // Log failed deletion
      await logApiAccess(auth, 'HOST_ALIAS_DELETE_FAILURE', {
        aliasUuid: uuid,
        aliasName,
        aliasType,
        reason: 'OPNsense API returned failure',
        opnsenseResponse: deleteResult
      }, request, `Failed to delete host alias ${uuid}`);

      logger.error(`Failed to delete host alias ${uuid} or unexpected response from OPNsense API:`, deleteResult);
      return NextResponse.json({ success: false, message: `Failed to delete host alias ${uuid}. Details: ${JSON.stringify(deleteResult)}` }, { status: 400 });
    }

  } catch (error) {
    // Log error in deletion
    await logApiAccess(auth, 'HOST_ALIAS_DELETE_FAILURE', {
      aliasUuid: uuid,
      reason: 'API Error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    }, request, `API Error deleting host alias: ${error instanceof Error ? error.message : 'Unknown error'}`);

    logger.error("API Error deleting host alias:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    if (errorMessage.includes("OPNsense API credentials are not configured")) {
      return NextResponse.json({ message: "OPNsense API connection is not configured in the settings." }, { status: 503 });
    }
    return NextResponse.json({ message: `Failed to delete host alias: ${errorMessage}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let auth;
  let uuid: string | null = null;

  try {
    auth = await authenticateRequest(request);
    logger.debug(`PUT /api/opnsense/host-alias-management - Session User ID: ${auth.user?.id}.`);
    logger.debug(`PUT /api/opnsense/host-alias-management - User Role: ${auth.user?.role}.`);

    // Check for rate limiting errors BEFORE proceeding
    if (auth.user) {
      const authError = handleAuthResponse(auth);
      if (authError) return authError;
    }

    // Track usage for authenticated requests
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 200);
    }

    const { searchParams } = new URL(request.url);
    uuid = searchParams.get('uuid');

    if (!uuid || typeof uuid !== 'string') {
      return NextResponse.json({ message: 'Valid UUID parameter is missing' }, { status: 400 });
    }

    const body = await request.json();
    const { name: newName } = body.alias; // Only expect the new name from the request body

    if (!newName) {
      return NextResponse.json({ message: 'Missing required field: name' }, { status: 400 });
    }

    // Fetch the existing alias details
    const allAliases = await getHostAliases();
    const existingAlias = allAliases.find(alias => alias.uuid === uuid);

    if (!existingAlias) {
      return NextResponse.json({ message: `Host alias with UUID ${uuid} not found.` }, { status: 404 });
    }

    // Check if this is a self-service operation and if the host is in unmanaged groups
    // Self-service operations are typically performed by non-admin users
    if (auth.user && (auth.user.role !== Role.SUPER_ADMIN && auth.user.role !== Role.ADMIN)) {
      try {
        // Get current group memberships for the host alias
        const currentGroups = await getIpGroupMembershipForAlias(existingAlias.name);

        // Fetch filter data
        const filterData = await fetchUnmanagedGroupFilterData(auth.user);

        // Check if host is in unmanaged groups
        const unmanagedResult = await isHostInUnmanagedGroups(
          currentGroups,
          filterData.globalFilters,
          filterData.globallyDisabledGroups,
          auth.user,
          filterData.userSpecificFilters
        );

        if (unmanagedResult.isUnmanaged) {
          logger.warn(`Self-service host alias rename rejected: Host alias ${existingAlias.name} is in unmanaged groups`);

          await logApiAccess(auth, 'HOST_ALIAS_RENAME_FAILURE', {
            aliasName: existingAlias.name,
            aliasUuid: uuid,
            newName: newName,
            reason: unmanagedResult.message,
            validationFailure: 'UNMANAGED_GROUP',
            unmanagedGroups: unmanagedResult.unmanagedGroups.map(g => ({
              id: g.id,
              name: g.name,
              friendlyName: g.friendlyName
            }))
          }, request, unmanagedResult.message);

          return NextResponse.json({
            success: false,
            message: `Self-service is restricted: ${unmanagedResult.message}`
          }, { status: 403 });
        }
      } catch (error) {
        logger.error('Error checking unmanaged group status for host alias rename:', error);
        // Continue with operation if check fails (fail open)
      }
    }

    // Construct the payload by merging new name with existing details
    const payload: import('@/lib/opnsense-api').OpnsenseSetAliasItemPayload = {
      alias: {
        enabled: existingAlias.enabled, // Keep existing enabled status
        name: newName, // Apply the new name
        type: existingAlias.type, // Keep existing type
        content: existingAlias.content, // Keep existing content
        description: existingAlias.description || '', // Keep existing description
        proto: existingAlias.proto || '',
        interface: existingAlias.interface || '',
        counters: existingAlias.counters || '',
        updatefreq: existingAlias.updatefreq || '',
        categories: existingAlias.categories || ''
      }
    };

    // Log the attempt to rename host alias
    await logApiAccess(auth, 'HOST_ALIAS_UPDATE_ATTEMPT', {
      aliasUuid: uuid,
      aliasName: existingAlias.name,
      newName: newName,
      aliasType: existingAlias.type
    }, request);

    const result = await setAliasItem(uuid, payload); // Ensure UUID is passed correctly

    if (result && result.result === 'saved') {
      try {
        const reconfigureResult = await reconfigureAliases();
        logger.debug(`reconfigureAliases result after PUT to host-aliases: ${reconfigureResult.status}.`);
        if (reconfigureResult.status === 'ok' || reconfigureResult.status === 'done' || reconfigureResult.status === 'success') {
          // Log successful host alias update
          await logApiAccess(auth, 'HOST_ALIAS_UPDATE_SUCCESS', {
            aliasUuid: uuid,
            aliasName: existingAlias.name,
            newName: newName,
            aliasType: existingAlias.type
          }, request);

          return NextResponse.json({ message: `Host alias ${uuid} updated and OPNsense reconfigured successfully.` });
        } else {
          logger.warn(`Host alias ${uuid} was updated, but reconfigure step returned:`, reconfigureResult);

          // Log partial success (updated but reconfigure issues)
          await logApiAccess(auth, 'HOST_ALIAS_UPDATE_PARTIAL_SUCCESS', {
            aliasUuid: uuid,
            aliasName: existingAlias.name,
            newName: newName,
            aliasType: existingAlias.type,
            reason: 'Reconfigure step had issues',
            reconfigureResult: reconfigureResult
          }, request);

          return NextResponse.json({
            message: `Host alias ${uuid} updated, but reconfigure step may have had issues.`,
            detailsReconfigure: reconfigureResult
          }, { status: 207 }); // Multi-Status
        }
      } catch (reconfigureError) {
        logger.error(`Host alias ${uuid} was updated, but failed to reconfigure:`, reconfigureError);

        // Log partial success (updated but reconfigure failed)
        await logApiAccess(auth, 'HOST_ALIAS_UPDATE_PARTIAL_SUCCESS', {
          aliasUuid: uuid,
          aliasName: existingAlias.name,
          newName: newName,
          aliasType: existingAlias.type,
          reason: 'Reconfigure step failed',
          reconfigureError: reconfigureError instanceof Error ? reconfigureError.message : String(reconfigureError)
        }, request);

        return NextResponse.json({
          message: `Host alias ${uuid} updated, but an error occurred during reconfiguration.` + (reconfigureError instanceof Error ? ` ${reconfigureError.message}` : ''),
          reconfigureError: reconfigureError instanceof Error ? reconfigureError.message : String(reconfigureError)
        }, { status: 207 }); // Multi-Status
      }
    } else {
      logger.error("Failed to update host alias or unexpected response format from OPNsense API:", result);

      // Check if the result contains validation errors from OPNsense
      if (result && typeof result === 'object' && 'validations' in result && typeof result.validations === 'object' && Object.keys(result.validations as Record<string, unknown>).length > 0) {
        // Log validation failure
        await logApiAccess(auth, 'HOST_ALIAS_UPDATE_FAILURE', {
          aliasUuid: uuid,
          aliasName: existingAlias.name,
          newName: newName,
          aliasType: existingAlias.type,
          reason: 'Validation failed',
          validations: result.validations
        }, request, 'Validation failed for host alias update');

        // Return the specific validation errors to the client
        return NextResponse.json({ message: 'Validation failed for host alias.', validations: result.validations }, { status: 400 });
      } else {
        // Log general failure
        await logApiAccess(auth, 'HOST_ALIAS_UPDATE_FAILURE', {
          aliasUuid: uuid,
          aliasName: existingAlias.name,
          newName: newName,
          aliasType: existingAlias.type,
          reason: 'Unexpected response format from OPNsense API',
          opnsenseResponse: result
        }, request, 'Failed to update host alias or unexpected response format from OPNsense API');

        // This 'else' handles cases where setAliasItem returns but not with the expected success indicators or known validation errors.
        throw new Error('Failed to update host alias or unexpected response format from OPNsense API.');
      }
    }

  } catch (error) {
    logger.error("API Error updating host alias:", error);
    if (error instanceof Error) {
      logger.error("Error message:", error.message);
      logger.error("Error stack:", error.stack);
    }
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

    // Log the error in audit log (only if auth is available)
    if (auth) {
      await logApiAccess(auth, 'HOST_ALIAS_UPDATE_FAILURE', {
        aliasUuid: uuid,
        reason: 'API Error',
        errorMessage: errorMessage
      }, request, `Failed to update host alias: ${errorMessage}`);
    }

    if (errorMessage.includes("OPNsense API credentials are not configured")) {
      return NextResponse.json({ message: "OPNsense API connection is not configured in the settings." }, { status: 503 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON format in request body.' }, { status: 400 });
    }
    return NextResponse.json({ message: `Failed to update host alias: ${errorMessage}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Authenticate the request to get user info for audit logging
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors BEFORE proceeding
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // Track usage for authenticated requests
  if (auth && auth.user) {
    await trackUsageByAuthMethod(request, auth, 200);
  }

  let body: { alias: { name: string; type: string; content: string; description?: string } } | undefined;
  try {
    body = await request.json();

    // Validate required fields within the 'alias' object from the request body
    // OPNsense 'add' usually requires name, type, content. Description is good practice.
    if (!body!.alias || !body!.alias.name || !body!.alias.type || !body!.alias.content) {
      await logApiAccess(auth, 'HOST_ALIAS_CREATE_FAILURE', {
        aliasName: body!.alias?.name || 'unknown',
        aliasType: body!.alias?.type || 'unknown',
        reason: 'Missing required fields'
      }, request, 'Missing required fields in alias object: name, type, content');
      return NextResponse.json({ message: 'Missing required fields in alias object: name, type, content' }, { status: 400 });
    }

    // Log the attempt to create host alias
    await logApiAccess(auth, 'HOST_ALIAS_CREATE_ATTEMPT', {
      aliasName: body!.alias.name,
      aliasType: body!.alias.type,
      content: body!.alias.content,
      description: body!.alias.description || ''
    }, request);

    // Reject creation if another host alias with the same IP already exists
    if (body!.alias.type === 'host') {
      const newIp = String(body!.alias.content).trim();
      const existingAliases = await getHostAliases();
      const conflict = existingAliases.find(a => a.type === 'host' && a.content.trim() === newIp);
      if (conflict) {
        await logApiAccess(auth, 'HOST_ALIAS_CREATE_FAILURE', {
          aliasName: body!.alias.name,
          aliasType: body!.alias.type,
          reason: 'Duplicate IP address',
          conflictingAlias: conflict.name,
          ip: newIp
        }, request, `Duplicate IP: ${newIp} already used by host alias "${conflict.name}"`);
        return NextResponse.json({
          message: `A host alias named "${conflict.name}" already exists with IP ${newIp}. If a rename is needed, edit the existing host alias instead.`
        }, { status: 409 });
      }
    }

    // Prepare the payload for addAliasItem
    // The body already contains the 'alias' object in the expected structure.
    // We just need to ensure content is a string and handle 'enabled'.
    const payload = {
      alias: {
        ...body!.alias, // Spread existing alias properties
        // Ensure content is a string (OPNsense expects newline-separated string for multi-line content, though less common for 'host')
        content: Array.isArray(body!.alias.content) ? body!.alias.content.join('\n') : String(body!.alias.content),
        // Ensure enabled is "1" or "0", defaulting to "1" if not provided or invalid
        enabled: (body!.alias as { enabled?: string }).enabled === "0" ? "0" : "1",
        description: body!.alias.description || '', // Ensure description is at least an empty string
      }
    };

    // Type assertion for clarity, assuming OpnsenseAddAliasItemPayload is imported or defined
    const result = await addAliasItem(payload as import('@/lib/opnsense-api').OpnsenseAddAliasItemPayload);

    // OPNsense add API returns a UUID on success. Errors are thrown by fetchFromOpnsense.
    if (result && result.uuid && result.result === 'saved') {
      // Log successful host alias creation
      await logApiAccess(auth, 'HOST_ALIAS_CREATE_SUCCESS', {
        aliasName: body!.alias.name,
        aliasType: body!.alias.type,
        aliasUuid: result.uuid,
        content: body!.alias.content
      }, request);

      try {
        const reconfigureResult = await reconfigureAliases();
        logger.debug(`reconfigureAliases result after POST to host-aliases: ${reconfigureResult.status}.`);
        if (reconfigureResult.status === 'ok' || reconfigureResult.status === 'done' || reconfigureResult.status === 'success') {
          return NextResponse.json({ message: `Host alias created and OPNsense reconfigured successfully.`, uuid: result.uuid }, { status: 201 });
        } else {
          logger.warn(`Host alias ${result.uuid} was created, but reconfigure step returned:`, reconfigureResult);
          return NextResponse.json({
            message: `Host alias created, but reconfigure step may have had issues.`,
            uuid: result.uuid,
            detailsReconfigure: reconfigureResult
          }, { status: 207 }); // Multi-Status
        }
      } catch (reconfigureError) {
        logger.error(`Host alias ${result.uuid} was created, but failed to reconfigure:`, reconfigureError);
        return NextResponse.json({
          message: `Host alias created, but an error occurred during reconfiguration.`,
          uuid: result.uuid,
          reconfigureError: reconfigureError instanceof Error ? reconfigureError.message : String(reconfigureError)
        }, { status: 207 }); // Multi-Status
      }
    } else {
      logger.error("Failed to create host alias or unexpected response format from OPNsense API:", result);
      // Check if the result contains validation errors from OPNsense
      if (result && typeof result === 'object' && 'validations' in result && typeof result.validations === 'object' && Object.keys(result.validations as Record<string, unknown>).length > 0) {
        // Log validation failure
        await logApiAccess(auth, 'HOST_ALIAS_CREATE_FAILURE', {
          aliasName: body!.alias.name,
          aliasType: body!.alias.type,
          reason: 'Validation failed',
          validations: result.validations
        }, request, 'Validation failed for host alias');
        // Return the specific validation errors to the client
        return NextResponse.json({ message: 'Validation failed for host alias.', validations: result.validations }, { status: 400 });
      } else {
        // Log general failure
        await logApiAccess(auth, 'HOST_ALIAS_CREATE_FAILURE', {
          aliasName: body!.alias.name,
          aliasType: body!.alias.type,
          reason: 'Unexpected response format'
        }, request, 'Failed to create host alias or unexpected response format from OPNsense API');
        // This 'else' handles cases where addAliasItem returns but not with the expected success indicators or known validation errors.
        throw new Error('Failed to create host alias or unexpected response format from OPNsense API.');
      }
    }

  } catch (error) {
    logger.error("API Error creating host alias:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

    // Log the error in audit log
    await logApiAccess(auth, 'HOST_ALIAS_CREATE_FAILURE', {
      aliasName: body?.alias?.name || 'unknown',
      aliasType: body?.alias?.type || 'unknown',
      reason: 'API Error',
      errorMessage: errorMessage
    }, request, `Failed to create host alias: ${errorMessage}`);

    if (errorMessage.includes("OPNsense API credentials are not configured")) {
      return NextResponse.json({ message: "OPNsense API connection is not configured in the settings." }, { status: 503 });
    }
    // Distinguish between client errors (e.g., bad input) and server errors
    if (error instanceof SyntaxError) { // Bad JSON input
      return NextResponse.json({ message: 'Invalid JSON format in request body.' }, { status: 400 });
    }
    return NextResponse.json({ message: `Failed to create host alias: ${errorMessage}` }, { status: 500 });
  }
}
