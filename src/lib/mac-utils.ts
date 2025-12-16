/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with array indices from string operations. All uses are safe.
import { logger } from './logger';

/**
 * Checks if a MAC address is likely randomized/locally administered.
 * 
 * A MAC address with a second character of 2, 6, A, or E indicates a locally administered address,
 * which is commonly used for privacy-focused MAC randomization features in iOS, Android, and other devices.
 * 
 * This is based on the "locally administered" bit (bit 1) in the first byte of the MAC address.
 * When this bit is set to 1, the address is locally administered rather than globally unique.
 * 
 * @param macAddress The MAC address to check (format: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX)
 * @returns Object with isRandomized boolean and explanation string
 */
export function checkMacRandomization(macAddress: string): {
  isRandomized: boolean;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
} {
  try {
    // Normalize MAC address - remove separators and convert to uppercase
    const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();
    
    // Validate MAC address format (should be 12 hex characters)
    if (!/^[0-9A-F]{12}$/.test(normalizedMac)) {
      return {
        isRandomized: false,
        explanation: 'Invalid MAC address format',
        confidence: 'low'
      };
    }
    
    // Get the second character (nibble) of the first byte
    const secondChar = normalizedMac.charAt(1);
    
    // Check if the second character indicates locally administered address
    const randomizedChars = ['2', '6', 'A', 'E'];
    const isRandomized = randomizedChars.includes(secondChar);
    
    if (isRandomized) {
      return {
        isRandomized: true,
        explanation: `MAC address appears to be randomized/locally administered (second character '${secondChar}' indicates locally administered bit is set). This is commonly used by iOS, Android, and other devices for privacy protection.`,
        confidence: 'high'
      };
    } else {
      return {
        isRandomized: false,
        explanation: `MAC address appears to be a globally unique identifier (second character '${secondChar}' indicates manufacturer-assigned address).`,
        confidence: 'high'
      };
    }
    
  } catch (error) {
    logger.error(`Error checking MAC randomization for ${macAddress}:`, error);
    return {
      isRandomized: false,
      explanation: 'Error analyzing MAC address',
      confidence: 'low'
    };
  }
}

/**
 * Gets a user-friendly warning message for randomized MAC addresses
 * 
 * @param macAddress The MAC address that was detected as randomized
 * @returns Warning message explaining the implications for DHCP reservations
 */
export function getRandomizedMacWarning(macAddress: string): string {
  return `⚠️ Privacy MAC Detected: The MAC address ${macAddress} appears to be randomized for privacy protection. 

🔄 This means the device may change its MAC address periodically, which could cause:
• DHCP reservation to stop working when MAC changes
• Device to receive different IP addresses over time
• Need to recreate DHCP reservation with new MAC address

💡 Consider:
• Disabling MAC randomization for this network on the device
• Using static IP configuration instead of DHCP reservation
• Being prepared to update the reservation if the MAC changes`;
}

/**
 * Checks if a MAC address belongs to a known manufacturer that commonly uses randomization
 * 
 * @param macAddress The MAC address to check
 * @returns Information about the manufacturer and randomization likelihood
 */
export function getMacManufacturerInfo(macAddress: string): {
  isKnownRandomizer: boolean;
  manufacturer: string | null;
  note: string;
} {
  try {
    const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();
    const oui = normalizedMac.substring(0, 6); // First 3 bytes (6 hex chars)
    
    // Common OUI prefixes used for randomization by major vendors
    const randomizationOUIs: Record<string, string> = {
      // Apple's randomized MAC prefixes (some examples)
      '02': 'Apple (Randomized)',
      '06': 'Generic (Randomized)',
      '0A': 'Generic (Randomized)', 
      '0E': 'Generic (Randomized)',
      // Note: Real randomized MACs use various prefixes, these are just examples
    };
    
    const firstByte = oui.substring(0, 2);
    
    if (randomizationOUIs[firstByte]) {
      return {
        isKnownRandomizer: true,
        manufacturer: randomizationOUIs[firstByte],
        note: 'This MAC address prefix is commonly used for randomized addresses'
      };
    }
    
    return {
      isKnownRandomizer: false,
      manufacturer: null,
      note: 'MAC address analysis based on locally administered bit only'
    };
    
  } catch (error) {
    logger.error(`Error getting MAC manufacturer info for ${macAddress}:`, error);
    return {
      isKnownRandomizer: false,
      manufacturer: null,
      note: 'Error analyzing MAC address'
    };
  }
}
