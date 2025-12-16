/* eslint-disable security/detect-object-injection */
// This file uses bracket notation with array indices from iterations. All uses are safe.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from './prisma';
import { logger } from './logger';

const SALT_ROUNDS = 10;

/**
 * Generates backup codes for 2FA.
 * @param count Number of backup codes to generate (default: 10).
 * @param length Length of each backup code (default: 8).
 * @returns Array of plaintext backup codes.
 */
export function generateBackupCodes(count: number = 10, length: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(length).toString('hex').toUpperCase().slice(0, length);
    codes.push(code);
  }
  return codes;
}

/**
 * Hashes backup codes using bcrypt.
 * @param codes Array of plaintext backup codes.
 * @returns Array of hashed backup codes.
 */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const hashedCodes: string[] = [];
  
  for (const code of codes) {
    try {
      const hashedCode = await bcrypt.hash(code.toUpperCase(), SALT_ROUNDS);
      hashedCodes.push(hashedCode);
    } catch (error) {
      logger.error('Failed to hash backup code:', error);
      throw new Error('Failed to hash backup codes');
    }
  }
  
  return hashedCodes;
}

/**
 * Verifies a backup code against stored hashed codes.
 * @param providedCode The backup code provided by the user.
 * @param hashedCodes Array of hashed backup codes from the database.
 * @returns Object with isValid boolean and the index of the matched code (if valid).
 */
export async function verifyBackupCode(
  providedCode: string, 
  hashedCodes: string[]
): Promise<{ isValid: boolean; matchedIndex?: number }> {
  const normalizedCode = providedCode.toUpperCase();
  
  for (let i = 0; i < hashedCodes.length; i++) {
    try {
      const isMatch = await bcrypt.compare(normalizedCode, hashedCodes[i]);
      if (isMatch) {
        return { isValid: true, matchedIndex: i };
      }
    } catch (error) {
      logger.error('Error verifying backup code:', error);
      // Continue checking other codes even if one fails
    }
  }
  
  return { isValid: false };
}

/**
 * Stores hashed backup codes in the database.
 * @param userId The user ID to update.
 * @param codes Array of plaintext backup codes to hash and store.
 * @returns True if successful, false otherwise.
 */
export async function storeBackupCodes(userId: string, codes: string[]): Promise<boolean> {
  try {
    const hashedCodes = await hashBackupCodes(codes);
    
    await prisma.user.update({
      where: { id: userId },
      data: { backupCodes: JSON.stringify(hashedCodes) }
    });
    
    logger.info(`Backup codes hashed and stored for user ${userId}`);
    return true;
  } catch (error) {
    logger.error('Failed to store hashed backup codes:', error);
    return false;
  }
}

/**
 * Determines if backup codes are hashed (bcrypt format) or plaintext.
 * This is used for backward compatibility during migration.
 * @param backupCodesJson The backup codes JSON string from the database.
 * @returns True if the codes appear to be hashed (bcrypt format).
 */
export function areBackupCodesHashed(backupCodesJson: string | null): boolean {
  if (!backupCodesJson) {
    return false;
  }
  
  try {
    const codes = JSON.parse(backupCodesJson);
    if (!Array.isArray(codes) || codes.length === 0) {
      return false;
    }
    
    // Check if the first code looks like a bcrypt hash
    const firstCode = codes[0];
    if (typeof firstCode !== 'string') {
      return false;
    }
    
    // Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters long
    const bcryptPattern = /^\$2[aby]\$\d{2}\$.{53}$/;
    return bcryptPattern.test(firstCode);
  } catch (error) {
    logger.error('Error parsing backup codes JSON:', error);
    return false;
  }
}

/**
 * Migrates plaintext backup codes to hashed format.
 * @param userId The user ID to migrate.
 * @param plaintextCodesJson The plaintext backup codes JSON string.
 * @returns True if migration was successful, false otherwise.
 */
export async function migrateBackupCodes(userId: string, plaintextCodesJson: string): Promise<boolean> {
  try {
    logger.info(`Migrating plaintext backup codes to hashed format for user ${userId}`);
    
    const plaintextCodes = JSON.parse(plaintextCodesJson);
    if (!Array.isArray(plaintextCodes)) {
      logger.error('Invalid backup codes format for migration');
      return false;
    }
    
    const success = await storeBackupCodes(userId, plaintextCodes);
    if (success) {
      logger.info(`Successfully migrated backup codes for user ${userId}`);
    } else {
      logger.error(`Failed to migrate backup codes for user ${userId}`);
    }
    
    return success;
  } catch (error) {
    logger.error('Error during backup codes migration:', error);
    return false;
  }
}

/**
 * Retrieves backup codes and automatically migrates them if they're in plaintext format.
 * @param userId The user ID.
 * @param backupCodesJson The backup codes JSON string from the database.
 * @returns Object with the backup codes (hashed format) and migration status.
 */
export async function getBackupCodesWithMigration(
  userId: string, 
  backupCodesJson: string | null
): Promise<{ codes: string[] | null; migrated: boolean }> {
  if (!backupCodesJson) {
    return { codes: null, migrated: false };
  }

  // If already hashed, just return them
  if (areBackupCodesHashed(backupCodesJson)) {
    try {
      const codes = JSON.parse(backupCodesJson);
      return { codes, migrated: false };
    } catch (error) {
      logger.error('Error parsing hashed backup codes:', error);
      return { codes: null, migrated: false };
    }
  }

  // If plaintext, migrate to hashed format
  logger.info(`Detected plaintext backup codes for user ${userId}, migrating...`);
  const migrationSuccess = await migrateBackupCodes(userId, backupCodesJson);
  
  if (migrationSuccess) {
    // Fetch the newly hashed codes
    try {
      const updatedUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { backupCodes: true }
      });
      
      if (updatedUser?.backupCodes) {
        const hashedCodes = JSON.parse(updatedUser.backupCodes);
        return { codes: hashedCodes, migrated: true };
      }
    } catch (error) {
      logger.error('Error fetching migrated backup codes:', error);
    }
  }
  
  // Fallback: return plaintext codes if migration failed
  logger.error(`Migration failed for user ${userId}, returning plaintext codes`);
  try {
    const plaintextCodes = JSON.parse(backupCodesJson);
    return { codes: plaintextCodes, migrated: false };
  } catch (error) {
    logger.error('Error parsing fallback plaintext codes:', error);
    return { codes: null, migrated: false };
  }
}

/**
 * Verifies a backup code and removes it if valid (for both hashed and plaintext codes).
 * @param userId The user ID.
 * @param providedCode The backup code provided by the user.
 * @param backupCodesJson The backup codes JSON string from the database.
 * @returns Object with verification result and updated codes.
 */
export async function verifyAndConsumeBackupCode(
  userId: string,
  providedCode: string,
  backupCodesJson: string | null
): Promise<{ isValid: boolean; updatedCodes: string[] | null }> {
  if (!backupCodesJson) {
    return { isValid: false, updatedCodes: null };
  }

  try {
    const { codes } = await getBackupCodesWithMigration(userId, backupCodesJson);
    if (!codes || codes.length === 0) {
      return { isValid: false, updatedCodes: null };
    }

    if (areBackupCodesHashed(JSON.stringify(codes))) {
      // Handle hashed codes
      const verification = await verifyBackupCode(providedCode, codes);
      if (verification.isValid && verification.matchedIndex !== undefined) {
        // Remove the used code
        const updatedCodes = [...codes];
        updatedCodes.splice(verification.matchedIndex, 1);
        return { isValid: true, updatedCodes };
      }
    } else {
      // Handle plaintext codes (fallback for failed migration)
      const normalizedCode = providedCode.toUpperCase();
      const codeIndex = codes.findIndex(code => code.toUpperCase() === normalizedCode);
      if (codeIndex !== -1) {
        // Remove the used code
        const updatedCodes = [...codes];
        updatedCodes.splice(codeIndex, 1);
        return { isValid: true, updatedCodes };
      }
    }

    return { isValid: false, updatedCodes: codes };
  } catch (error) {
    logger.error('Error verifying and consuming backup code:', error);
    return { isValid: false, updatedCodes: null };
  }
}
