import { NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import * as ipaddr from 'ipaddr.js';
import { exportAliases, OpnsenseAliasDetailFromExport } from '@/lib/opnsense-api';
import type { NetworkGroup } from '@/types/opnsense';
import { prisma } from '@/lib/prisma';
import type { ValidLocalNetwork } from '@/types/settings';
import { Role } from '@/types/opnsense';
import { isIpAllowedForSelfService } from '@/lib/network-utils';
import { toJsonArrayOrUndefined } from '@/lib/utils';
 
// Helper function to check if an IP is contained in an alias's content
// This function uses the ipaddr.js library for robust IP and CIDR matching.
// OPNsense aliases can contain IPs, networks (CIDR), other alias names, hostnames, etc.
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
      // Further logic would be needed for hostnames, other alias names, etc.
      return false;
    });
  } catch (e) {
    // Handle cases where the input 'ip' itself is invalid
    logger.error(`Invalid IP address provided to aliasContentContainsIp: ${ip}`, e);
    return false;
  }
}


export async function GET(request: Request) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // Get global settings for access control checks
  const globalSettings = await prisma.globalSettings.findFirst({
    orderBy: { id: 'asc' },
  });

  // For unauthenticated users, check if self-service is globally disabled
  if (!auth.user) {
    // Check if self-service is globally disabled
    if (globalSettings?.removeSelfServicePage) {
      logger.info(`Unauthenticated IP group membership lookup blocked - self-service functionality is disabled`);
      return NextResponse.json({
        error: 'Forbidden: Self-service functionality is disabled'
      }, { status: 403 });
    }
  }

  // Note: For authenticated users, we don't block IP group membership queries
  // because this API is used for informational purposes (showing group memberships)
  // The device management scope check is applied at the UI level and in management APIs

  const { searchParams } = new URL(request.url);
  const ip = searchParams.get('ip');

  if (!ip) {
    return NextResponse.json({ error: 'IP address query parameter is required' }, { status: 400 });
  }

  // Get client IP for unauthenticated users (authenticated users already have it from above)
  let clientIp: string | undefined = undefined;
  if (!auth.user) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      clientIp = forwardedFor.split(',')[0].trim();
    } else {
      const realIp = request.headers.get('x-real-ip');
      if (realIp) {
        clientIp = realIp.trim();
      }
    }

    if (clientIp && clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.substring(7); // Remove '::ffff:' IPv4-mapped IPv6 address prefix
    }
  }

  // Normalize IPs for comparison
  const normalizedTargetIp = ip ? ip.trim().replace(/^::ffff:/, '') : undefined;
  const normalizedClientIp = clientIp ? clientIp.trim().replace(/^::ffff:/, '') : undefined;

  // For unauthenticated users, validate IP access for self-service
  if (!auth.user) {
    // Use global settings already fetched above
    const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

    // Check if the IP is allowed for self-service operations
    const ipValidation = isIpAllowedForSelfService(
      clientIp || null,
      ip,
      allowedNetworks,
      false // unauthenticated
    );

    if (!ipValidation.isAllowed) {
      logger.info(`Self-service access denied for IP ${ip} from client IP ${clientIp}: ${ipValidation.reason}`);
      return NextResponse.json({ error: `Forbidden: ${ipValidation.reason}` }, { status: 403 });
    }
  } else {
    // For authenticated users, allow access to their own IP for self-service
    logger.debug(`Authenticated user ${auth.user.email} - targetIp: ${ip}, clientIp: ${clientIp}, normalizedTargetIp: ${normalizedTargetIp}, normalizedClientIp: ${normalizedClientIp}`);
    if (normalizedTargetIp !== normalizedClientIp) {
      // For other IPs, check if they have permission via allowed networks
      const globalSettings = await prisma.globalSettings.findFirst({
        orderBy: { id: 'asc' },
      });
      const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings?.allowedNetworks) || [];

      // Check if the IP is allowed for self-service operations
      const ipValidation = isIpAllowedForSelfService(
        clientIp || null, 
        ip, 
        allowedNetworks, 
        !!auth.user
      );
      
      if (!ipValidation.isAllowed) {
        logger.warn(`Self-service access denied for IP ${ip} from client IP ${clientIp}: ${ipValidation.reason}`);
        return NextResponse.json({ error: `Unauthorized: ${ipValidation.reason}` }, { status: 403 });
      }
    } else {
      logger.debug(`Authenticated user ${auth.user.email} querying their own IP ${ip} (self-service)`);
    }
  }

  try {
    const [allAliasesResponse, opnsenseGroupDisplays] = await Promise.all([
      exportAliases(),
      prisma.opnsenseGroupDisplay.findMany({ orderBy: { friendlyName: 'asc' } }),
    ]);

    if (!allAliasesResponse?.aliases?.alias) {
      return NextResponse.json({ error: 'Could not retrieve aliases from OPNsense' }, { status: 500 });
    }

    const allAliasDetails: OpnsenseAliasDetailFromExport[] = Object.entries(allAliasesResponse.aliases.alias)
      .map(([uuid, detail]) => ({ ...detail, uuid }));

    const hostAndNetworkAliasesContainingIp: OpnsenseAliasDetailFromExport[] = [];

    for (const alias of allAliasDetails) {
      // Consider 'host', 'network', 'url', 'geoip' types as potentially containing IPs directly or indirectly.
      // 'networkgroup' type contains other alias names.
      if (alias.type !== 'networkgroup') {
        if (aliasContentContainsIp(alias.content, ip)) {
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
              // Construct a simplified NetworkGroup object for the response
              // The full NetworkGroup type has more fields, adapt as needed
              const displayInfo = opnsenseGroupDisplays.find(d => d.opnsenseUuid.toLowerCase() === (groupAlias.uuid || '').toLowerCase());

              memberOfGroups.push({
                id: groupAlias.uuid || groupAlias.name, // Use UUID if available
                uuid: groupAlias.uuid || '',
                name: groupAlias.name,
                description: groupAlias.description || '',
                enabled: groupAlias.enabled === '1',
                members: [], // Simplified: not populating detailed members here
                lastUpdated: null, // Simplified
                rawContent: groupAlias.content,
                type: groupAlias.type,
                friendlyName: displayInfo?.friendlyName || groupAlias.name, // Populate friendlyName
                iconIdentifier: displayInfo?.iconIdentifier || null, // Populate iconIdentifier
                groupType: (displayInfo?.groupType === 'MultiSelect' || displayInfo?.groupType === 'SingleSelect') ? displayInfo.groupType : 'SingleSelect', // Populate groupType as union
              });
            }
            break; // Found a match for this group, move to the next group
          }
        }
      }
    }

    // Filter sensitive data based on user role
    const isUnauthenticated = !auth.user;
    const isUserRole = auth.user?.role === Role.USER;

    const filteredGroups = memberOfGroups.map(group => {
      const newGroup = { ...group };
      if (isUnauthenticated || isUserRole) {
        delete newGroup.rawContent;
      }
      // 'members' is already an empty array, but explicitly ensure for unauthenticated
      if (isUnauthenticated) {
        newGroup.members = [];
      }
      return newGroup;
    });

    // Track usage for authenticated requests
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 200);
    }

    return NextResponse.json(filteredGroups);

  } catch (error) {
    logger.error('Error fetching IP group membership:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';

    // Track usage for authenticated requests (even failed ones)
    if (auth && auth.user) {
      await trackUsageByAuthMethod(request, auth, 500);
    }

    return NextResponse.json({ error: 'Failed to determine IP group membership', details: message }, { status: 500 });
  }
}