// Removed unused import IPCIDR
/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with array indices from IP address parsing. All uses are safe.
import * as ipaddr from 'ipaddr.js';
import { logger } from './logger';
import type { ValidLocalNetwork } from '@/types/settings'; // Import ValidLocalNetwork type

/**
 * Type for request objects that may have an ip property (like NextRequest)
 */
type RequestWithIp = Request & { ip?: string };

/**
 * Extracts the client's IP address from the request headers or socket.
 * Prioritizes headers (X-Forwarded-For, X-Real-IP) for proxy support,
 * falling back to Next.js request.ip for direct connections.
 */
export function getClientIp(request: RequestWithIp): string | null {
  const headers = request.headers;

  // Standard Proxy Header (Comma-separated, first is original client)
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Fallback Proxy Header
  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // Native Next.js IP (Direct Access)
  // Note: 'ip' property exists on NextRequest but might be missing on standard Request
  if ('ip' in request && request.ip) {
    return request.ip;
  }

  return null;
}

/**
 * Checks if a given IP address is within the valid local networks, considering includes and excludes.
 * Excluded ranges are evaluated first.
 * @param ip The IP address to check.
 * @param allowedNetworks An array of valid local network definitions.
 * @returns True if the IP is within an included range and not within an excluded range, false otherwise.
 */
/**
 * Compares two byte arrays lexicographically.
 * @param a The first byte array.
 * @param b The second byte array.
 * @returns A negative value if a < b, a positive value if a > b, or 0 if a === b.
 */
function compareByteArrays(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

/**
 * Compares two IP addresses numerically. Supports both IPv4 and IPv6.
 * If IP versions mismatch or parsing fails, they are treated as equal or moved to the end.
 * @param ipA The first IP address string.
 * @param ipB The second IP address string.
 * @returns A negative value if ipA < ipB, a positive value if ipA > ipB, or 0 if ipA === ipB.
 */
export function sortIpAddresses(ipA: string | null, ipB: string | null): number {
  if (!ipA && !ipB) return 0;
  if (!ipA) return 1; // Null/undefined IPs go to the end
  if (!ipB) return -1; // Null/undefined IPs go to the end

  let parsedIpA: ipaddr.IPv4 | ipaddr.IPv6 | null = null;
  let parsedIpB: ipaddr.IPv4 | ipaddr.IPv6 | null = null;

  try {
    parsedIpA = ipaddr.parse(ipA);
  } catch {
    logger.warn(`Invalid IP address format for sorting: ${ipA}`);
  }
  try {
    parsedIpB = ipaddr.parse(ipB);
  } catch {
    logger.warn(`Invalid IP address format for sorting: ${ipB}`);
  }

  if (!parsedIpA && !parsedIpB) return 0;
  if (!parsedIpA) return 1;
  if (!parsedIpB) return -1;

  // If IP versions mismatch, sort IPv4 before IPv6
  if (parsedIpA.kind() !== parsedIpB.kind()) {
    return parsedIpA.kind() === 'ipv4' ? -1 : 1;
  }

  return compareByteArrays(parsedIpA.toByteArray(), parsedIpB.toByteArray());
}

/**
 * Checks if a given string is a valid IPv4 or IPv6 address.
 * @param ip The string to validate.
 * @returns True if the string is a valid IP address, false otherwise.
 */
export function isValidIpAddress(ip: string): boolean {
  try {
    ipaddr.parse(ip);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a given string is a valid CIDR (Classless Inter-Domain Routing) block.
 * Supports both IPv4 and IPv6 CIDR formats.
 * @param cidr The string to validate.
 * @returns True if the string is a valid CIDR, false otherwise.
 */
export function isValidCidr(cidr: string): boolean {
  try {
    const parsed = ipaddr.parseCIDR(cidr);
    const ip = parsed[0];
    const mask = parsed[1];

    // Check if the mask is within the valid range for the IP version
    if (ip.kind() === 'ipv4' && (mask < 0 || mask > 32)) {
      return false;
    }
    if (ip.kind() === 'ipv6' && (mask < 0 || mask > 128)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function isIpInallowedNetworks(ip: string | null, allowedNetworks: ValidLocalNetwork[]): boolean {
  if (!ip || !allowedNetworks || allowedNetworks.length === 0) {
    return false;
  }

  let parsedIp: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsedIp = ipaddr.parse(ip);
    // Normalize IPv4-mapped IPv6 addresses to IPv4
    if (parsedIp.kind() === 'ipv6') {
      const ipv6 = parsedIp as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) {
        parsedIp = ipv6.toIPv4Address();
      }
    }
  } catch (e) {
    logger.error(`Invalid IP address format: ${ip}`, e);
    return false;
  }

  const includedRanges = allowedNetworks.filter(range => range.type === 'include');
  const excludedRanges = allowedNetworks.filter(range => range.type === 'exclude');

  // Check excluded ranges first
  for (const range of excludedRanges) {
    if (range.network) {
      try {
        const cidr = ipaddr.parseCIDR(range.network);
        // Only attempt match if IP versions are compatible
        if (parsedIp.kind() === cidr[0].kind()) {
          if (parsedIp.match(cidr)) {
            return false; // IP is in an excluded CIDR range
          }
        }
      } catch (e) {
        logger.error(`Invalid excluded CIDR range: ${range.network}`, e);
      }
    } else if (range.startIp && range.endIp) {
      try {
        const start = ipaddr.parse(range.startIp);
        const end = ipaddr.parse(range.endIp);

        // Ensure all IPs are the same version and are comparable before comparing
        if (parsedIp instanceof ipaddr.IPv4 && start instanceof ipaddr.IPv4 && end instanceof ipaddr.IPv4) {
          // Type assertion to satisfy TypeScript
          const parsedIpV4 = parsedIp as ipaddr.IPv4;
          const startV4 = start as ipaddr.IPv4;
          const endV4 = end as ipaddr.IPv4;
          const parsedIpV4Bytes = parsedIpV4.toByteArray();
          const startV4Bytes = startV4.toByteArray();
          const endV4Bytes = endV4.toByteArray();
          if (compareByteArrays(parsedIpV4Bytes, startV4Bytes) >= 0 && compareByteArrays(parsedIpV4Bytes, endV4Bytes) <= 0) {
            return false; // IP is in an excluded IP range
          }
        } else if (parsedIp instanceof ipaddr.IPv6 && start instanceof ipaddr.IPv6 && end instanceof ipaddr.IPv6) {
          // Type assertion to satisfy TypeScript
          const parsedIpV6 = parsedIp as ipaddr.IPv6;
          const startV6 = start as ipaddr.IPv6;
          const endV6 = end as ipaddr.IPv6;
          const parsedIpV6Bytes = parsedIpV6.toByteArray();
          const startV6Bytes = startV6.toByteArray();
          const endV6Bytes = endV6.toByteArray();
          if (compareByteArrays(parsedIpV6Bytes, startV6Bytes) >= 0 && compareByteArrays(parsedIpV6Bytes, endV6Bytes) <= 0) {
            return false; // IP is in an excluded IP range
          }
        } else {
          // Verify IP version mismatch logic
          // If the target IP version doesn't match the range version, it's not in the range
        }
      } catch (e) {
        logger.error(`Invalid excluded IP range: ${range.startIp}-${range.endIp}`, e);
      }
    }
  }

  // Check included ranges
  for (const range of includedRanges) {
    if (range.network) {
      try {
        const cidr = ipaddr.parseCIDR(range.network);
        // Only attempt match if IP versions are compatible
        if (parsedIp.kind() === cidr[0].kind()) {
          if (parsedIp.match(cidr)) {
            return true; // IP is in an included CIDR range
          }
        }
      } catch (e) {
        logger.error(`Invalid included CIDR range: ${range.network}`, e);
      }
    } else if (range.startIp && range.endIp) {
      try {
        const start = ipaddr.parse(range.startIp);
        const end = ipaddr.parse(range.endIp);
        // Ensure all IPs are the same version and are comparable before comparing
        if (parsedIp instanceof ipaddr.IPv4 && start instanceof ipaddr.IPv4 && end instanceof ipaddr.IPv4) {
          // Type assertion to satisfy TypeScript
          const parsedIpV4 = parsedIp as ipaddr.IPv4;
          const startV4 = start as ipaddr.IPv4;
          const endV4 = end as ipaddr.IPv4;
          const parsedIpV4Bytes = parsedIpV4.toByteArray();
          const startV4Bytes = startV4.toByteArray();
          const endV4Bytes = endV4.toByteArray();
          if (compareByteArrays(parsedIpV4Bytes, startV4Bytes) >= 0 && compareByteArrays(parsedIpV4Bytes, endV4Bytes) <= 0) {
            return true; // IP is in an included IP range
          }
        } else if (parsedIp instanceof ipaddr.IPv6 && start instanceof ipaddr.IPv6 && end instanceof ipaddr.IPv6) {
          // Type assertion to satisfy TypeScript
          const parsedIpV6 = parsedIp as ipaddr.IPv6;
          const startV6 = start as ipaddr.IPv6;
          const endV6 = end as ipaddr.IPv6;
          const parsedIpV6Bytes = parsedIpV6.toByteArray();
          const startV6Bytes = startV6.toByteArray();
          const endV6Bytes = endV6.toByteArray();
          if (compareByteArrays(parsedIpV6Bytes, startV6Bytes) >= 0 && compareByteArrays(parsedIpV6Bytes, endV6Bytes) <= 0) {
            return true; // IP is in an included IP range
          }
        } else {
          // Verify IP version mismatch logic
          // If the target IP version doesn't match the range version, it's not in the range
        }
      } catch (e) {
        logger.error(`Invalid included IP range: ${range.startIp}-${range.endIp}`, e);
      }
    }
  }

  return false; // IP is not in any included range or is in an excluded range
}

/**
 * Checks if an IP address is allowed for self-service operations.
 * This combines IP ownership validation with allowed networks validation.
 * 
 * @param clientIp The IP address of the client making the request
 * @param targetIp The IP address being operated on
 * @param allowedNetworks Array of allowed network configurations
 * @param isAuthenticated Whether the user is authenticated
 * @returns Object with isAllowed boolean and reason string
 */
export function isIpAllowedForSelfService(
  clientIp: string | null,
  targetIp: string,
  allowedNetworks: ValidLocalNetwork[],
  isAuthenticated: boolean
): { isAllowed: boolean; reason: string } {
  // If user is authenticated, they can operate on any IP they have permission for
  // (permission checking is handled at the application level)
  if (isAuthenticated) {
    return { isAllowed: true, reason: 'Authenticated user' };
  }

  // For unauthenticated users, check IP ownership
  if (clientIp !== targetIp) {
    return {
      isAllowed: false,
      reason: 'Unauthenticated users can only operate on their own IP address'
    };
  }

  // Check if the IP is in allowed networks for self-service
  if (!isIpInallowedNetworks(targetIp, allowedNetworks)) {
    return {
      isAllowed: false,
      reason: 'IP address is not in allowed networks for self-service access'
    };
  }

  return { isAllowed: true, reason: 'IP is in allowed networks for self-service access' };
}
