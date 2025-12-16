import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role, OpnsenseVpnSession, OpnsenseWireguardClient, OpnsenseIpsecConnection, OpnsenseVpnEntry, isOpnsenseIpsecConnection, VpnMapping, OpnsenseWireguardServiceResponse } from '@/types/opnsense'; // Removed VpnMappingType, added specific VPN types and OpnsenseVpnEntry, added OpnsenseWireguardServiceResponse
import { VpnClientType } from '@prisma/client'; // Import VpnClientType directly from Prisma Client
import { prisma } from '@/lib/prisma'; // Named export for prisma
import { fetchFromOpnsense, getNetworkGroups } from '@/lib/opnsense-api'; // Correct named export, added getNetworkGroups
import { logger } from '@/lib/logger'; // Import logger

// Define a type for the VpnMapping with the new relation
interface VpnMappingWithOpnsenseNetworkGroup {
  id: string;
  vpnUuid: string;
  vpnName: string;
  friendlyName: string | null;
  opnsenseNetworkGroupId: string | null;
  opnsenseNetworkGroup?: {
    name: string;
  } | null;
}

export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

    // Fetch all active VPN sessions from OPNsense
    logger.debug("Fetching OPNsense OpenVPN sessions...");
    const opnsenseOpenVpnSessionsResponse: { rows: OpnsenseVpnSession[] } = await fetchFromOpnsense('/api/openvpn/service/searchSessions');
    const openVpns = opnsenseOpenVpnSessionsResponse.rows.map(session => ({
      ...session,
      id: session.id, // Ensure 'id' is present and correctly mapped
      name: session.description, // Map OpenVPN's description to a common 'name' field
      type: VpnClientType.OpenVPN,
      enabled: session.status === 'connected' ? '1' : '0', // Map OpenVPN status to 'enabled'
      status: session.status, // Keep original status for frontend display
    })) as (OpnsenseVpnEntry & { id: string; vpnUuid: string; vpnName: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null })[];
    logger.debug(`OPNsense OpenVPN sessions fetched: ${openVpns.length} sessions. Sample: ${JSON.stringify(openVpns.slice(0, 2))}`);

    logger.debug("Fetching OPNsense WireGuard clients...");
    const opnsenseWireguardClientsResponse: { rows: OpnsenseWireguardClient[] } = await fetchFromOpnsense('/api/wireguard/client/search_client');

    logger.debug("Fetching OPNsense WireGuard service status (for RX/TX data)...");
    const opnsenseWireguardServiceResponse: OpnsenseWireguardServiceResponse = await fetchFromOpnsense('/api/wireguard/service/show');
    const wireguardServicePeers = opnsenseWireguardServiceResponse.rows.filter(row => row.type === 'peer');

    // Map WireGuard clients and merge with service status data
    const wireguardClients = opnsenseWireguardClientsResponse.rows.map(client => {
      const matchingPeer = wireguardServicePeers.find(peer => peer.name === client.name); // Match by client name
      return {
        ...client,
        id: client.uuid,
        name: client.name,
        type: VpnClientType.WireGuard,
        enabled: client.enabled, // Use the 'enabled' status directly from searchClient
        status: matchingPeer ? matchingPeer['peer-status'] : 'N/A', // Use peer-status from service API
        transfer_rx: matchingPeer ? parseInt(matchingPeer['transfer-rx'].toString()) : 0, // Add RX data, ensure it's a number
        transfer_tx: matchingPeer ? parseInt(matchingPeer['transfer-tx'].toString()) : 0, // Add TX data, ensure it's a number
      };
    }) as (OpnsenseVpnEntry & { id: string; vpnUuid: string; vpnName: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null })[];

    logger.debug(`OPNsense WireGuard clients fetched: ${wireguardClients.length} clients. Sample: ${JSON.stringify(wireguardClients.slice(0, 2))}`);

    logger.debug("Fetching OPNsense IPsec connections...");
    const opnsenseIpsecConnectionsResponse: { rows: OpnsenseIpsecConnection[] } = await fetchFromOpnsense('/api/ipsec/sessions/search_phase1'); // Changed API endpoint
    const ipsecConnections = opnsenseIpsecConnectionsResponse.rows.map(connection => ({
      // Explicitly map properties from the API response to match the OpnsenseIpsecConnection interface
      id: connection.name, // Use connection.name as id for IPsec as it contains the UUID
      name: connection.name, // Keep original name (which is the UUID)
      type: VpnClientType.IPsec,
      enabled: connection.connected ? '1' : '0', // Derive 'enabled' from 'connected' for IPsec
      connected: connection.connected,
      'install-time': connection['install-time'],
      'bytes-in': connection['bytes-in'], // Explicitly map hyphenated
      'bytes-out': connection['bytes-out'], // Explicitly map hyphenated
      'local-addrs': connection['local-addrs'], // Explicitly map hyphenated
      'remote-addrs': connection['remote-addrs'], // Explicitly map hyphenated
      phase1desc: connection.phase1desc, // Explicitly map phase1desc
      // Add other properties from the original connection object if they are needed and not covered above
      // For example, if 'local_ts' or 'remote_ts' are used elsewhere:
      local_ts: connection.local_ts,
      remote_ts: connection.remote_ts,
      ikeid: connection.ikeid,
    })) as (OpnsenseVpnEntry & { id: string; vpnUuid: string; vpnName: string; opnsenseNetworkGroupId: string | null; mappingId: string | null; opnsenseNetworkGroup: { name: string } | null; friendlyName: string | null })[];
    logger.debug(`OPNsense IPsec connections fetched: ${ipsecConnections.length} connections. Sample: ${JSON.stringify(ipsecConnections.slice(0, 2))}`);

    // Combine all VPN types
    const allOpnsenseVpns = [...openVpns, ...wireguardClients, ...ipsecConnections];
    logger.debug(`Total OPNsense VPNs (all types): ${allOpnsenseVpns.length} entries.`);

    // Fetch all network groups from OPNsense
    logger.debug("Fetching OPNsense network groups...");
    const opnsenseNetworkGroups = await getNetworkGroups();
    logger.debug(`OPNsense network groups fetched: ${opnsenseNetworkGroups.length} groups. Sample: ${JSON.stringify(opnsenseNetworkGroups.slice(0, 2))}`);

    // Fetch all existing OPNsenseNetworkGroups from the local database
    logger.debug("Fetching existing OPNsenseNetworkGroups from DB...");
    const existingDbOpnsenseNetworkGroups = await prisma.opnsenseNetworkGroup.findMany({
      select: { id: true, name: true },
      orderBy: {
        name: 'asc',
      },
    });
    const existingDbOpnsenseNetworkGroupIds = new Set(existingDbOpnsenseNetworkGroups.map(g => g.id));
    logger.debug(`Existing DB OPNsenseNetworkGroups: ${existingDbOpnsenseNetworkGroups.length} groups. Sample: ${JSON.stringify(existingDbOpnsenseNetworkGroups.slice(0, 2))}`);
    logger.debug(`Existing DB OPNsenseNetworkGroupIds: ${existingDbOpnsenseNetworkGroupIds.size} IDs.`);

    // Identify and create missing OPNsenseNetworkGroups in the local database
    const opnsenseGroupsToCreate = opnsenseNetworkGroups.filter(
      opnsenseGroup => !existingDbOpnsenseNetworkGroupIds.has(opnsenseGroup.id)
    );
    logger.debug(`OPNsense groups to create: ${opnsenseGroupsToCreate.length} groups.`);

    if (opnsenseGroupsToCreate.length > 0) {
      await prisma.$transaction(
        opnsenseGroupsToCreate.map(group =>
          prisma.opnsenseNetworkGroup.create({
            data: {
              id: group.id,
              name: group.name,
              description: group.description || '',
            },
          })
        )
      );
      logger.debug(`Created ${opnsenseGroupsToCreate.length} missing OPNsense network groups in the local database.`);
    }

    // Fetch existing VPN mappings from the database (after potential OPNsenseNetworkGroup creation)
    logger.debug("Fetching existing VPN mappings from DB...");
    const dbVpnMappings = await prisma.vpnMapping.findMany({
      orderBy: {
        vpnName: 'asc',
      },
      include: {
        opnsenseNetworkGroup: {
          select: {
            name: true,
          },
        },
      },
    });
    logger.debug(`Existing DB VPN mappings: ${dbVpnMappings.length} mappings.`);

    // Merge OPNsense VPN data with stored mappings
    logger.debug("Merging OPNsense VPN data with stored mappings...");
    const mergedVpnData = allOpnsenseVpns.map(vpn => {
      const existingMapping = dbVpnMappings.find((mapping: VpnMappingWithOpnsenseNetworkGroup) => mapping.vpnUuid === vpn.id);
      return {
        ...vpn,
        vpnUuid: vpn.id, // Ensure vpnUuid is explicitly set from vpn.id
        vpnName: isOpnsenseIpsecConnection(vpn) ? vpn.description || vpn.phase1desc || vpn['remote-addrs'] || 'N/A' : vpn.name || vpn.description || 'N/A', // Prioritize description for IPsec, exclude name as it's now the UUID
        opnsenseNetworkGroupId: existingMapping?.opnsenseNetworkGroupId || null,
        opnsenseNetworkGroup: existingMapping?.opnsenseNetworkGroup || null,
        friendlyName: existingMapping?.friendlyName || null,
        mappingId: existingMapping?.id || null,
      };
    });
    logger.debug(`Merged VPN data: ${mergedVpnData.length} entries.`);

    return NextResponse.json(mergedVpnData);
    } catch (error) {
      logger.error('Error fetching VPN mappings:', error);
      return new NextResponse(JSON.stringify({ error: 'Failed to fetch VPN mappings' }), { status: 500 });
    }
  });
}

export async function POST(req: Request) {
  return authenticateAndTrackRequest(req, async (auth) => {
    try {
      if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

    const updatedMappings: VpnMapping[] = await req.json(); // Read the body once
    logger.debug(`POST /api/opnsense/vpn-mappings - Incoming updatedMappings: ${updatedMappings.length} mappings. Sample: ${JSON.stringify(updatedMappings.slice(0, 2))}`);

    if (!Array.isArray(updatedMappings) || updatedMappings.length === 0) {
      logger.error("Invalid payload: updatedMappings is not an array or is empty.");
      return new NextResponse(JSON.stringify({ error: 'Invalid payload: expected an array of mappings' }), { status: 400 });
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const operations = updatedMappings.map(async (mapping) => {
        let vpnIdentifier: string | undefined = mapping.vpnUuid;
        const validatedOpnsenseNetworkGroupId = mapping.opnsenseNetworkGroupId === '' ? null : mapping.opnsenseNetworkGroupId;

        // Step 1: Try to resolve vpnIdentifier from incoming payload (vpnUuid or id)
        if (!vpnIdentifier && mapping.id && mapping.id !== "") {
          const tempExistingMapping = await tx.vpnMapping.findUnique({
            where: { id: mapping.id },
            select: { vpnUuid: true }
          });
          if (tempExistingMapping) {
            vpnIdentifier = tempExistingMapping.vpnUuid;
            logger.debug(`Resolved vpnUuid from existing mapping ID: ${vpnIdentifier}`);
          }
        }

        // Step 2: If vpnIdentifier is still not resolved and it's an IPsec client,
        // attempt to find the vpnUuid from OPNsense based on vpnName (description/phase1desc)
        if (!vpnIdentifier && mapping.vpnClient === VpnClientType.IPsec && mapping.vpnName) {
          logger.debug(`Attempting to resolve IPsec vpnUuid from OPNsense using vpnName: ${mapping.vpnName}`);
          try {
            const opnsenseIpsecConnectionsResponse: { rows: OpnsenseIpsecConnection[] } = await fetchFromOpnsense('/api/ipsec/connections/search_connection');
            const foundIpsecConnection = opnsenseIpsecConnectionsResponse.rows.find(
              conn => conn.phase1desc === mapping.vpnName || conn.name === mapping.vpnName || conn.description === mapping.vpnName || conn['remote-addrs'] === mapping.vpnName
            );
            if (foundIpsecConnection) {
              vpnIdentifier = foundIpsecConnection.uuid;
              logger.debug(`Resolved IPsec vpnUuid: ${vpnIdentifier} from OPNsense.`);
            } else {
              logger.warn(`Could not find IPsec connection in OPNsense for vpnName: ${mapping.vpnName}`);
            }
          } catch (opnsenseError) {
            logger.error(`Error fetching IPsec connections from OPNsense to resolve vpnUuid:`, opnsenseError);
          }
        }

        if (!vpnIdentifier) {
            logger.error(`Critical: VPN UUID is missing for mapping. Incoming mapping: ${JSON.stringify(mapping)}`);
            throw new Error('VPN UUID is missing and could not be resolved.');
        }

        // Now that vpnIdentifier is definitively resolved, perform the main lookup
        logger.debug(`Processing mapping for VPN UUID: ${vpnIdentifier}, vpnClient: ${mapping.vpnClient}.`);
        const existingDbMapping = await tx.vpnMapping.findUnique({
          where: { vpnUuid: vpnIdentifier },
        });
        logger.debug(`Existing DB mapping found for VPN UUID ${vpnIdentifier}: ${existingDbMapping ? 'Yes' : 'No'}.`);

        if (existingDbMapping) {
          // Update existing mapping
          const updateData = {
            opnsenseNetworkGroupId: validatedOpnsenseNetworkGroupId,
            vpnName: mapping.vpnName,
            friendlyName: mapping.friendlyName,
            vpnClient: mapping.vpnClient, // Ensure vpnClient is updated if it changes
          };
          logger.debug(`Updating mapping for VPN UUID ${vpnIdentifier} with data: ${JSON.stringify(updateData)}.`);
          return tx.vpnMapping.update({
            where: { id: existingDbMapping.id },
            data: updateData,
          });
        } else {
          // Create new mapping
          const createData = {
            vpnUuid: vpnIdentifier, // Use the resolved vpnIdentifier
            vpnName: mapping.vpnName,
            vpnClient: mapping.vpnClient, // Use the vpnClient from the incoming mapping
            friendlyName: mapping.friendlyName,
            opnsenseNetworkGroupId: validatedOpnsenseNetworkGroupId,
          };
          logger.debug(`Creating new mapping for VPN UUID ${vpnIdentifier} with data: ${JSON.stringify(createData)}.`);
          return tx.vpnMapping.create({
            data: createData,
          });
        }
      });
      return Promise.all(operations);
    });

    logger.debug("VPN mappings saved successfully.");
    return NextResponse.json({ message: 'VPN mappings saved successfully', transaction });
    } catch (error) {
      logger.error('Failed to save VPN mappings:', error);
      return new NextResponse(JSON.stringify({ error: 'Failed to save VPN mappings' }), { status: 500 });
    }
  });
}