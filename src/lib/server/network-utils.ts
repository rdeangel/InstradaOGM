import 'server-only';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises'; // Import promises API
import { get_arpTable } from '@/lib/opnsense-api'; // Add this import
import { logger } from '@/lib/logger';
import { getDataPath } from '@/lib/server/data-paths';

const execAsync = promisify(exec);

// Define a Map to store the OUI to vendor mapping
const macVendorMap = new Map<string, string>();

// Define the path to the MAC vendor database file
const macVendorFilePath = getDataPath('mac-db', 'mac-vendors.json');

// Function to load and parse the MAC vendor database file
async function loadMacVendorDatabase() {
  try {
    // Path is validated by getDataPath() utility
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const data = await readFile(macVendorFilePath, 'utf8');
    const vendors = JSON.parse(data);
    const stats = { total: 0, 'MA-L': 0, 'MA-M': 0, 'MA-S': 0, 'IAB': 0, 'CID': 0, 'other': 0 };

    if (Array.isArray(vendors)) {
      for (const entry of vendors) {
        if (entry.macPrefix && entry.vendorName) {
          // Remove separators and convert to uppercase for consistent lookup
          const oui = entry.macPrefix.replace(/[:-]/g, '').toUpperCase();
          // Load ALL prefix lengths (6, 7, 9+) to support MA-L, MA-M, MA-S, and IAB block types
          if (oui.length >= 6) {
            macVendorMap.set(oui, entry.vendorName);
            stats.total++;

            // Track statistics by block type
            const blockType = entry.blockType || 'other';
            if (blockType in stats) {
              stats[blockType as keyof typeof stats]++;
            } else {
              stats.other++;
            }
          }
        }
      }
    }
    logger.info(`Loaded ${stats.total} MAC vendor entries: MA-L=${stats['MA-L']}, MA-M=${stats['MA-M']}, MA-S=${stats['MA-S']}, IAB=${stats.IAB}, CID=${stats.CID}, other=${stats.other}`);
  } catch (error) {
    logger.error("Error loading MAC vendor database:", error);
    // Continue without the database if loading fails
  }
}

// Load the database when the module is initialized
// Using an IIFE (Immediately Invoked Function Expression) to run the async function
(async () => {
  await loadMacVendorDatabase();
})();

/**
 * Attempts to look up the MAC address for a given IP address using the system's ARP/neighbor table.
 * This function is intended for use with private IP addresses on a local network.
 * Requires network_mode=host or equivalent to access the host's network information.
 * @param ipAddress The IP address to look up.
 * @returns The detected MAC address string, or null if not found or an error occurred.
 */
export async function lookupNetworkDetails(ipAddress: string): Promise<{
  mac: string | null;
  vendor: string | null;
  hostname: string | null;
  source: 'opnsense' | 'local' | null;
}> {
  let mac: string | null = null;
  let vendor: string | null = null;
  let hostname: string | null = null;
  let source: 'opnsense' | 'local' | null = null;

  // 1. Try OPNsense ARP table first
  try {
    const arpTable = await get_arpTable();
    const opnsenseEntry = arpTable.find(entry => entry.ip === ipAddress);

    if (opnsenseEntry) {
      mac = opnsenseEntry.mac ? opnsenseEntry.mac.toLowerCase() : null; // Normalize MAC to lowercase
      vendor = opnsenseEntry.manufacturer ?? null;
      hostname = opnsenseEntry.hostname || null;
      source = 'opnsense';
      logger.debug(`Found network details for ${ipAddress} from OPNsense:`, {
        ip: ipAddress,
        mac: mac,
        vendor: vendor,
        hostname: hostname,
        fullEntry: opnsenseEntry
      });
      return { mac, vendor, hostname, source };
    } else {
      logger.debug(`IP ${ipAddress} not found in OPNsense ARP table. Falling back to local lookup.`);
    }
  } catch (error) {
    logger.error("Error fetching OPNsense ARP table, falling back to local lookup:", error);
  }

  // 2. Fallback to local system ARP lookup if OPNsense fails or no match
  try {
    const { stdout, stderr } = await execAsync(`ip neigh show to ${ipAddress}`);
    if (stderr) {
      logger.error(`Error looking up MAC address for ${ipAddress} locally: ${stderr}`);
    } else {
      const match = stdout.match(/lladdr\s+([0-9a-fA-F:]+)/);
      if (match && match[1]) {
        mac = match[1].toLowerCase(); // Normalize MAC to lowercase
        vendor = lookupMacVendor(mac); // Use local vendor lookup
        hostname = null; // No local hostname detection
        source = 'local';
        logger.debug(`Found network details for ${ipAddress} locally.`);
      } else {
        logger.warn(`Could not parse MAC address for ${ipAddress} from local output: ${stdout}`);
      }
    }
  } catch (error) {
    logger.error(`Exception during local MAC address lookup for ${ipAddress}:`, error);
  }

  return { mac, vendor, hostname, source };
}

// Placeholder for MAC vendor lookup
// Implements hierarchical prefix matching to support all MAC block types:
// - IAB/MA-S (9-char): Most specific, checked first
// - MA-M (7-char): Medium specificity
// - MA-L (6-char): Standard OUI, least specific
export function lookupMacVendor(macAddress: string | null): string | null {
  if (!macAddress) {
    return null;
  }

  // Normalize MAC address (remove separators, uppercase)
  const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();

  // Try hierarchical matching: longest prefix first (most specific)
  // 1. Try 9-char match (IAB, MA-S) - e.g., "00:50:C2:31:2" -> "0050C2312"
  if (normalizedMac.length >= 9) {
    const prefix9 = normalizedMac.substring(0, 9);
    const vendor = macVendorMap.get(prefix9);
    if (vendor) {
      logger.debug(`Vendor found for ${macAddress} using 9-char prefix ${prefix9}: ${vendor}`);
      return vendor;
    }
  }

  // 2. Try 7-char match (MA-M)
  if (normalizedMac.length >= 7) {
    const prefix7 = normalizedMac.substring(0, 7);
    const vendor = macVendorMap.get(prefix7);
    if (vendor) {
      logger.debug(`Vendor found for ${macAddress} using 7-char prefix ${prefix7}: ${vendor}`);
      return vendor;
    }
  }

  // 3. Try 6-char match (MA-L, standard OUI)
  if (normalizedMac.length >= 6) {
    const prefix6 = normalizedMac.substring(0, 6);
    const vendor = macVendorMap.get(prefix6);
    if (vendor) {
      logger.debug(`Vendor found for ${macAddress} using 6-char OUI ${prefix6}: ${vendor}`);
      return vendor;
    }
  }

  logger.debug(`No vendor found for MAC ${macAddress}`);
  return 'Unknown Vendor';
}

export function isPrivateIP(ipAddress: string): boolean {
  if (!ipAddress) return false;
  const parts = ipAddress.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    // Basic check for IPv4 format. For IPv6, this logic would need expansion.
    // For now, assuming we are primarily dealing with IPv4 for MAC lookups in typical LANs.
    return false;
  }

  if (parts[0] === 10) return true; // 10.0.0.0/8
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
  return false;
}