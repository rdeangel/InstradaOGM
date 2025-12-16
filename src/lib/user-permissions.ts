import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getCaseInsensitiveMode } from '@/lib/prisma-utils';
import { exportAliases } from '@/lib/opnsense-api';
import { isIpInallowedNetworks } from '@/lib/network-utils';
import { ValidLocalNetwork } from '@/types/settings';
import { toJsonArrayOrUndefined } from '@/lib/utils';


/**
 * Checks if a user has access to the devices page based on their group memberships
 * and associated host alias permissions.
 * A user has access if they are a member of at least one local group that has
 * at least one host alias permission assigned.
 *
 * @param userId The ID of the user to check.
 * @returns A boolean indicating whether the user has Device Management.
 */
export async function userHasDeviceAccess(userId: string): Promise<boolean> {
  try {
    // 1. Fetch the user's accounts to get external group memberships
    const userAccounts = await prisma.account.findMany({
      where: { userId: userId },
      select: { externalGroups: true, provider: true },
    });

    // Collect all unique external group names from all accounts
    const externalGroups: { provider: string; groupName: string }[] = [];
    userAccounts.forEach(account => {
      if (account.externalGroups && Array.isArray(account.externalGroups)) {
        account.externalGroups.forEach(groupName => {
          // Ensure groupName is a string before pushing
          if (typeof groupName === 'string') {
            externalGroups.push({ provider: account.provider, groupName: groupName });
          }
        });
      }
    });

    // 2. Find local groups mapped to these external groups (case-insensitive provider matching)
    const mappedLocalGroups = externalGroups.length > 0
      ? await prisma.ssoGroupMapping.findMany({
        where: {
          OR: externalGroups.map(eg => ({
            ssoProvider: {
              equals: eg.provider,
              ...getCaseInsensitiveMode(),
            },
            ssoGroupName: eg.groupName,
          })),
        },
        select: { localGroupId: true },
      })
      : [];

    const ssoLocalGroupIds = mappedLocalGroups.map(mapping => mapping.localGroupId);

    // 3. Fetch the local groups the user is directly a member of using the many-to-many relationship
    const userWithDirectGroups = await prisma.user.findUnique({
      where: { id: userId },
      select: { groups: { select: { id: true } } },
    });

    const directLocalGroupIds = userWithDirectGroups?.groups.map(group => group.id) || [];

    // Combine local group IDs from SSO mappings and direct memberships
    const allLocalGroupIds = [...new Set([...ssoLocalGroupIds, ...directLocalGroupIds])];

    if (allLocalGroupIds.length === 0) {
      // User is not a member of any local groups, either directly or via SSO mapping
      return false;
    }

    // 4. Check if any of these local groups have associated host alias permissions, including the wildcard
    const groupPermissions = await prisma.groupHostAliasPermission.findMany({
      where: {
        groupId: {
          in: allLocalGroupIds,
        },
      },
      select: {
        opnsenseAliasUuid: true,
      },
    });

    // Check if any of the permissions include the wildcard '*'
    const hasWildcardPermission = groupPermissions.some(p => p.opnsenseAliasUuid === '*');

    // If a wildcard permission is found, the user has access
    if (hasWildcardPermission) {
      return true;
    }

    // If no wildcard, check if there are any specific host alias permissions
    const hasSpecificPermissions = groupPermissions.length > 0;

    return hasSpecificPermissions;

  } catch (error) {
    logger.error("Error checking Device Management permissions:", error);
    // In case of an error, deny access by default for security
    return false;
  }
}

/**
 * Checks if a user has permission to create DHCP reservations for a specific IP address
 * based on their group memberships and host alias permissions.
 * This is more permissive than userHasDeviceIpAccess as it allows DHCP operations
 * for devices in permitted network ranges even without existing host aliases.
 *
 * Special case: If the user is accessing from the same IP address they want to create
 * a DHCP reservation for, they are automatically granted permission (same-IP access).
 *
 * @param userId The ID of the user to check
 * @param ipAddress The IP address to check DHCP access for
 * @param userIpAddress Optional: The IP address the user is accessing from
 * @returns A boolean indicating whether the user can create DHCP reservations for this IP
 */
export async function userHasDhcpAccess(userId: string, ipAddress: string, userIpAddress?: string): Promise<boolean> {
  try {
    logger.debug(`[userHasDhcpAccess] Checking DHCP access for user ${userId} to IP ${ipAddress}, user IP: ${userIpAddress || 'unknown'}`);

    // First check if user has general device access - required for all DHCP operations
    const hasGeneralAccess = await userHasDeviceAccess(userId);
    if (!hasGeneralAccess) {
      logger.debug(`[userHasDhcpAccess] User ${userId} has no general device access`);
      return false;
    }

    // Method 1: Same-IP access - if user is accessing from the same IP they want to create DHCP reservation for
    if (userIpAddress && userIpAddress === ipAddress) {
      logger.debug(`[userHasDhcpAccess] User ${userId} granted same-IP DHCP access for ${ipAddress}`);
      return true;
    }

    // Method 2: Check if the IP is in the user's permitted devices list
    // This allows DHCP operations for devices shown in DeviceManagement dropdown
    try {
      logger.debug(`[userHasDhcpAccess] Checking permitted devices for user ${userId}`);
      const userPermittedDevices = await getUserPermittedDevices(userId);
      logger.debug(`[userHasDhcpAccess] Found ${userPermittedDevices.length} permitted devices for user ${userId}`);

      const isPermittedDevice = userPermittedDevices.some(device => device.content === ipAddress);

      if (isPermittedDevice) {
        logger.debug(`[userHasDhcpAccess] User ${userId} granted DHCP access for permitted device IP ${ipAddress}`);
        return true;
      } else {
        logger.debug(`[userHasDhcpAccess] IP ${ipAddress} not found in permitted devices: ${userPermittedDevices.map(d => d.content).join(', ')}`);
      }
    } catch (error) {
      logger.error(`[userHasDhcpAccess] Error checking permitted devices for user ${userId}:`, error);
      // Continue with network-based permission checks if this fails
    }

    // Method 3: Network-based permissions - check if IP is within permitted network ranges
    logger.debug(`[userHasDhcpAccess] Checking network-based permissions for user ${userId}`);

    // Use the properly fixed userHasDeviceIpAccess function
    const hasIpAccess = await userHasDeviceIpAccess(userId, ipAddress);

    if (hasIpAccess) {
      logger.debug(`[userHasDhcpAccess] User ${userId} granted DHCP access via network-based permissions for ${ipAddress}`);
      return true;
    } else {
      logger.debug(`[userHasDhcpAccess] User ${userId} denied DHCP access - IP ${ipAddress} not in permitted network ranges`);
      return false;
    }



  } catch (error) {
    logger.error(`Error checking DHCP access for user ${userId} and IP ${ipAddress}:`, error);
    return false;
  }
}

/**
 * Gets the list of devices (host aliases) that a user has permission to manage.
 * This is a simplified version of the logic from /api/user/devices
 *
 * @param userId The ID of the user
 * @returns Array of permitted devices with their IP addresses
 */
async function getUserPermittedDevices(userId: string): Promise<Array<{ content: string; uuid: string; name: string }>> {
  try {
    // First, get the user to check their role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      return [];
    }

    // For all users (including admins), use group-based permissions
    // Admin users should have wildcard permissions (*) in their groups

    // Use EXACT same group membership logic as userHasDeviceAccess function
    // 1. Fetch the user's accounts to get external group memberships
    const userAccounts = await prisma.account.findMany({
      where: { userId: userId },
      select: { externalGroups: true, provider: true },
    });

    // Collect all unique external group names from all accounts
    const externalGroups: { provider: string; groupName: string }[] = [];
    userAccounts.forEach(account => {
      if (account.externalGroups && Array.isArray(account.externalGroups)) {
        (account.externalGroups as string[]).forEach(groupName => {
          if (typeof groupName === 'string') {
            externalGroups.push({ provider: account.provider, groupName: groupName });
          }
        });
      }
    });

    // 2. Find local groups mapped to these external groups (case-insensitive provider matching)
    const mappedLocalGroups = externalGroups.length > 0
      ? await prisma.ssoGroupMapping.findMany({
        where: {
          OR: externalGroups.map(eg => ({
            ssoProvider: {
              equals: eg.provider,
              ...getCaseInsensitiveMode(),
            },
            ssoGroupName: eg.groupName,
          })),
        },
        select: { localGroupId: true },
      })
      : [];

    const ssoLocalGroupIds = mappedLocalGroups.map(mapping => mapping.localGroupId);

    // 3. Fetch the local groups the user is directly a member of using the many-to-many relationship
    const userWithDirectGroups = await prisma.user.findUnique({
      where: { id: userId },
      select: { groups: { select: { id: true } } },
    });

    const directLocalGroupIds = userWithDirectGroups?.groups.map(group => group.id) || [];

    // Combine local group IDs from SSO mappings and direct memberships
    const allLocalGroupIds = [...new Set([...ssoLocalGroupIds, ...directLocalGroupIds])];

    if (allLocalGroupIds.length === 0) {
      // User is not a member of any local groups, either directly or via SSO mapping
      return [];
    }

    // Get permitted alias UUIDs
    const groupAliasPermissions = await prisma.groupHostAliasPermission.findMany({
      where: {
        groupId: {
          in: allLocalGroupIds,
        },
      },
      select: { opnsenseAliasUuid: true },
    });

    const permittedAliasUuids = groupAliasPermissions.map(permission => permission.opnsenseAliasUuid);

    // Check for wildcard permission
    const hasWildcardPermission = permittedAliasUuids.includes('*');

    // Fetch OPNsense aliases
    const allOpnsenseAliasesResponse = await exportAliases();
    const allOpnsenseAliases = Object.entries(allOpnsenseAliasesResponse.aliases.alias).map(([uuid, alias]) => ({ ...alias, uuid }));

    // Filter for host aliases that the user has permission for
    const permittedDevices = allOpnsenseAliases.filter(alias => {
      // Only include host type aliases
      if (alias.type !== 'host') {
        return false;
      }

      // Must be enabled
      if (alias.enabled !== '1') {
        return false;
      }

      // Must have exactly one IP entry
      const rawIpEntries = alias.content.split(/\n|\s+/).filter(entry => entry.trim() !== '');
      if (rawIpEntries.length !== 1) {
        return false;
      }

      // Check user permissions - wildcard grants access to all, otherwise check specific UUIDs
      return hasWildcardPermission || (typeof alias.uuid === 'string' && permittedAliasUuids.includes(alias.uuid));
    }).map(alias => ({
      content: alias.content.split(/\n|\s+/).filter(entry => entry.trim() !== '')[0], // Get the IP address
      uuid: alias.uuid,
      name: alias.name
    }));

    return permittedDevices;

  } catch (error) {
    logger.error(`Error getting permitted devices for user ${userId}:`, error);
    return [];
  }
}

/**
 * Checks if an IP address would be allowed for unauthenticated self-service access
 * based on the Self-Service Access Control network restrictions.
 * @param ip - The IP address to check
 * @returns Promise<boolean> - True if the IP would be allowed for unauthenticated access
 */
async function isIpAllowedForUnauthenticatedSelfService(ip: string): Promise<boolean> {
  try {
    // Get global settings to retrieve allowed networks
    const globalSettings = await prisma.globalSettings.findFirst();

    if (!globalSettings) {
      return false;
    }

    // If self-service is globally disabled, return false
    if (globalSettings.removeSelfServicePage) {
      return false;
    }

    // Parse allowed networks from global settings
    const allowedNetworks = toJsonArrayOrUndefined<ValidLocalNetwork>(globalSettings.allowedNetworks) || [];

    // Check if IP is in allowed networks
    const isAllowed = isIpInallowedNetworks(ip, allowedNetworks);

    return isAllowed;
  } catch (error) {
    logger.error(`[isIpAllowedForUnauthenticatedSelfService] Error checking IP ${ip}:`, error);
    return false;
  }
}

/**
 * Normalizes an IP address by removing IPv4-mapped IPv6 prefix and trimming whitespace
 * @param ip - The IP address to normalize
 * @returns The normalized IP address
 */
function normalizeIpAddress(ip: string): string {
  if (!ip) return ip;

  // Trim whitespace
  let normalized = ip.trim();

  // Remove IPv4-mapped IPv6 prefix (::ffff:)
  if (normalized.startsWith('::ffff:')) {
    normalized = normalized.substring(7);
  }

  return normalized;
}

/**
 * Lightweight check to determine if a user has any device management permissions.
 * This is used for UI visibility decisions (showing/hiding self-service menu items)
 * without performing expensive device fetching or IP matching operations.
 *
 * @param userId - The user's ID
 * @returns Promise<boolean> - true if the user has any device permissions, false otherwise
 */
export async function userHasAnyDevicePermissions(userId: string): Promise<boolean> {
  try {
    // Get the user to check their role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      return false;
    }

    // Get user's group memberships (same logic as other permission functions)
    const userAccounts = await prisma.account.findMany({
      where: { userId: userId },
      select: { externalGroups: true, provider: true },
    });

    const externalGroups = userAccounts.flatMap(account =>
      (account.externalGroups as { groupName: string }[] || []).map(group => ({
        groupName: group.groupName,
        provider: account.provider,
      }))
    );

    // Find local groups mapped to external groups
    const mappedLocalGroups = externalGroups.length > 0
      ? await prisma.ssoGroupMapping.findMany({
        where: {
          OR: externalGroups.map(eg => ({
            ssoProvider: {
              equals: eg.provider,
              ...getCaseInsensitiveMode(),
            },
            ssoGroupName: eg.groupName,
          })),
        },
        select: { localGroupId: true },
      })
      : [];

    const ssoLocalGroupIds = mappedLocalGroups.map(mapping => mapping.localGroupId);

    // Get direct group memberships
    const userWithDirectGroups = await prisma.user.findUnique({
      where: { id: userId },
      select: { groups: { select: { id: true } } },
    });

    const directLocalGroupIds = userWithDirectGroups?.groups.map(group => group.id) || [];
    const allLocalGroupIds = [...new Set([...ssoLocalGroupIds, ...directLocalGroupIds])];

    if (allLocalGroupIds.length === 0) {
      return false;
    }

    // Check if any of the user's groups have device permissions
    const hasPermissions = await prisma.groupHostAliasPermission.findFirst({
      where: {
        groupId: {
          in: allLocalGroupIds,
        },
      },
      select: { id: true }, // Only need to know if any exist
    });

    return !!hasPermissions;

  } catch (error) {
    logger.error(`[userHasAnyDevicePermissions] Error checking permissions for user ${userId}:`, error);
    return false; // Fail closed
  }
}

// Hash-based optimization removed - using simplified approach with optimized IP lookup

/**
 * Optimized validation for authenticated users with simplified network-based access.
 * If the user's IP is allowed by Self-Service Access Control network rules,
 * bypass complex device management scope checks for better performance.
 *
 * @param userId - The user's ID
 * @param currentIp - The user's current IP address
 * @returns Promise<boolean> - true if access should be granted, false otherwise
 */
export async function isUserIpInDeviceManagementScopeOptimized(userId: string, currentIp: string): Promise<boolean> {
  try {
    // Normalize the IP address
    const normalizedCurrentIp = normalizeIpAddress(currentIp);

    // 1. Check global "Remove Self-Service Page" setting first
    const globalSettings = await prisma.globalSettings.findFirst({
      orderBy: { id: 'asc' },
    });

    if (globalSettings?.removeSelfServicePage) {
      return false;
    }

    // 2. OPTIMIZATION: Check if IP is allowed by Self-Service Access Control network rules
    // If yes, grant access without complex device management scope checks
    const isAllowedByNetworkRules = await isIpAllowedForUnauthenticatedSelfService(normalizedCurrentIp);

    if (isAllowedByNetworkRules) {
      return true;
    }

    // 3. Fallback to full device management scope validation
    return await isUserIpInDeviceManagementScope(userId, currentIp);

  } catch (error) {
    logger.error(`[isUserIpInDeviceManagementScopeOptimized] Error in optimized access check for user ${userId}:`, error);
    return false; // Fail closed - deny access on error
  }
}

/**
 * Checks if a user's current IP address is within their Device Management scope.
 * This is used for self-service access control to ensure users can only access
 * self-service functionality for devices they can manage.
 *
 * @param userId - The user's ID
 * @param currentIp - The user's current IP address
 * @returns Promise<boolean> - true if the IP is in the user's permitted devices, false otherwise
 */
export async function isUserIpInDeviceManagementScope(userId: string, currentIp: string): Promise<boolean> {
  try {
    // Normalize the current IP
    const normalizedCurrentIp = normalizeIpAddress(currentIp);

    // First, check if user has any device permissions at all
    const hasAnyPermissions = await userHasAnyDevicePermissions(userId);

    // Initialize permission tracking
    let isPermitted = false;

    // Only check device permissions if user has any
    if (hasAnyPermissions) {
      // Get all devices the user has permission to manage
      const permittedDevices = await getUserPermittedDevices(userId);

      // OPTIMIZED: Create a Set of permitted IPs for fast lookup instead of looping
      const permittedIPs = new Set<string>();

      for (const device of permittedDevices) {
        const normalizedDeviceIp = normalizeIpAddress(device.content);
        permittedIPs.add(normalizedDeviceIp);
      }

      // Fast O(1) lookup instead of O(n) loop
      if (permittedIPs.has(normalizedCurrentIp)) {
        isPermitted = true;
      }
    }

    // CRITICAL FIX: Always check fallback if device scope check failed, regardless of whether user has device permissions
    // This implements the three-tier access control system properly
    if (!isPermitted) {
      const isAllowedForUnauthenticated = await isIpAllowedForUnauthenticatedSelfService(normalizedCurrentIp);

      if (isAllowedForUnauthenticated) {
        isPermitted = true;
      }
    }

    return isPermitted;
  } catch (error) {
    logger.error(`[isUserIpInDeviceManagementScope] Error checking device scope for user ${userId}:`, error);
    return false; // Fail closed - deny access on error
  }
}



/**
 * Checks if a user has permission to access a specific device/IP address
 * based on their group memberships and host alias permissions.
 * This requires an existing host alias for the IP address.
 *
 * @param userId The ID of the user to check
 * @param ipAddress The IP address of the device to check access for
 * @returns A boolean indicating whether the user has access to this specific device
 */
export async function userHasDeviceIpAccess(userId: string, ipAddress: string): Promise<boolean> {
  try {
    logger.debug(`[userHasDeviceIpAccess] Checking access for user ${userId} to IP ${ipAddress}`);

    // First check if user has general device access
    const hasGeneralAccess = await userHasDeviceAccess(userId);
    if (!hasGeneralAccess) {
      logger.debug(`[userHasDeviceIpAccess] User ${userId} has no general device access`);
      return false;
    }

    // Get user's group memberships (same logic as userHasDeviceAccess)
    const userAccounts = await prisma.account.findMany({
      where: { userId: userId },
      select: { externalGroups: true, provider: true },
    });

    const externalGroups: { provider: string; groupName: string }[] = [];
    userAccounts.forEach(account => {
      if (account.externalGroups && Array.isArray(account.externalGroups)) {
        account.externalGroups.forEach((group: unknown) => {
          if (typeof group === 'object' && group !== null && 'name' in group && typeof (group as { name: unknown }).name === 'string') {
            externalGroups.push({
              provider: account.provider,
              groupName: (group as { name: string }).name,
            });
          }
        });
      }
    });

    const mappedLocalGroups = externalGroups.length > 0
      ? await prisma.ssoGroupMapping.findMany({
        where: {
          OR: externalGroups.map(eg => ({
            ssoProvider: {
              equals: eg.provider,
              ...getCaseInsensitiveMode(),
            },
            ssoGroupName: eg.groupName,
          })),
        },
        select: { localGroupId: true },
      })
      : [];

    const ssoLocalGroupIds = mappedLocalGroups.map(mapping => mapping.localGroupId);

    const userWithDirectGroups = await prisma.user.findUnique({
      where: { id: userId },
      select: { groups: { select: { id: true } } },
    });

    const directLocalGroupIds = userWithDirectGroups?.groups.map(group => group.id) || [];
    const allLocalGroupIds = [...new Set([...ssoLocalGroupIds, ...directLocalGroupIds])];

    if (allLocalGroupIds.length === 0) {
      return false;
    }

    // Check for wildcard permission
    const wildcardPermission = await prisma.groupHostAliasPermission.findFirst({
      where: {
        groupId: { in: allLocalGroupIds },
        opnsenseAliasUuid: '*',
      },
    });

    if (wildcardPermission) {
      logger.debug(`[userHasDeviceIpAccess] User ${userId} has wildcard permission for IP ${ipAddress}`);
      return true;
    }

    // Get all permitted alias UUIDs for the user's groups
    const userPermissions = await prisma.groupHostAliasPermission.findMany({
      where: {
        groupId: { in: allLocalGroupIds },
        opnsenseAliasUuid: { not: '*' }, // Exclude wildcard, already checked above
      },
      select: {
        opnsenseAliasUuid: true,
      },
    });

    if (userPermissions.length === 0) {
      logger.debug(`[userHasDeviceIpAccess] No specific permissions found for user ${userId}`);
      return false;
    }

    // Get the actual host aliases from OPNsense to check the IP
    const allOpnsenseAliasesResponse = await exportAliases();
    const allOpnsenseAliases = Object.entries(allOpnsenseAliasesResponse.aliases.alias).map(([uuid, alias]) => ({ ...alias, uuid }));

    // Check if the IP matches any permitted host alias (exact match only)
    const permittedAliasUuids = userPermissions.map(p => p.opnsenseAliasUuid);

    for (const alias of allOpnsenseAliases) {
      if (permittedAliasUuids.includes(alias.uuid)) {
        // Only check for exact host alias matches (same as assignment behavior)
        if (alias.type === 'host' && alias.content === ipAddress) {
          logger.debug(`[userHasDeviceIpAccess] User ${userId} has direct access to IP ${ipAddress} via host alias ${alias.name}`);
          return true;
        }
        // Note: Network aliases are not checked - users can only create DHCP reservations
        // for specific host IPs they have permission for, not entire network ranges
      }
    }

    logger.debug(`[userHasDeviceIpAccess] User ${userId} does not have access to IP ${ipAddress}`);
    return false;

  } catch (error) {
    logger.error(`Error checking device IP access for user ${userId} and IP ${ipAddress}:`, error);
    return false;
  }
}

// Optional: Add a middleware or modify the page component to use this function
// Example usage in a page component (client-side check after server-side redirect/render):
/*
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { userHasDeviceAccess } from '@/lib/user-permissions'; // Assuming this is a client-callable API route or similar

export default function DevicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/auth/signin'); // Redirect unauthenticated users
      return;
    }

    // Client-side check (can be redundant if server-side check is in layout/middleware)
    // For a full server-side check, this logic would be in a server component or middleware
    const checkAccess = async () => {
        // This would ideally call a server action or API route
        // const access = await userHasDeviceAccess(session.user.id); // Direct call won't work client-side
        // Need an API route or Server Action to expose this check
        const res = await fetch('/api/user/has-device-access'); // Example API route
        const data = await res.json();
        setHasAccess(data.hasAccess);
        setLoading(false);
    };

    checkAccess();

  }, [session, status, router]);

  if (loading || status === 'loading') {
    return <div>Loading...</div>; // Or a skeleton loader
  }

  if (!hasAccess) {
    return <div>Access Denied</div>; // Or redirect to an access denied page
  }

  // Render the page content if user has access
  return (
    <div>
      <h1>Device Management</h1>
      // ... rest of your page content with cards ...
    </div>
  );
}
*/