import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from './logger';

const SALT_ROUNDS = 12; // Higher salt rounds for password reset tokens (more security)
const TOKEN_LENGTH = 32; // 32 bytes = 256 bits of entropy

/**
 * Generates a secure password reset token.
 * @returns Object containing the plaintext token (for URL) and hashed token (for storage)
 */
export async function generatePasswordResetToken(): Promise<{
  plaintextToken: string;
  hashedToken: string;
}> {
  try {
    // Generate a cryptographically secure random token
    const plaintextToken = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
    
    // Hash the token with bcrypt for secure storage
    const hashedToken = await bcrypt.hash(plaintextToken, SALT_ROUNDS);
    
    logger.debug('Password reset token generated successfully');
    
    return {
      plaintextToken,
      hashedToken,
    };
  } catch (error) {
    logger.error('Failed to generate password reset token:', error);
    throw new Error('Failed to generate password reset token');
  }
}

/**
 * Verifies a password reset token against the stored hash.
 * @param plaintextToken - The token from the URL/user input
 * @param hashedToken - The hashed token stored in the database
 * @returns True if the token is valid, false otherwise
 */
export async function verifyPasswordResetToken(
  plaintextToken: string,
  hashedToken: string
): Promise<boolean> {
  try {
    if (!plaintextToken || !hashedToken) {
      logger.debug('Password reset token verification failed: missing token or hash');
      return false;
    }
    
    // Use bcrypt to verify the token
    const isValid = await bcrypt.compare(plaintextToken, hashedToken);
    
    if (isValid) {
      logger.debug('Password reset token verified successfully');
    } else {
      logger.debug('Password reset token verification failed: invalid token');
    }
    
    return isValid;
  } catch (error) {
    logger.error('Error verifying password reset token:', error);
    return false;
  }
}

/**
 * Generates a password reset token expiry date.
 * @param hoursValid - Number of hours the token should be valid (default: 1 hour)
 * @returns Date object representing when the token expires
 */
export function generatePasswordResetExpiry(hoursValid: number = 1): Date {
  const expiryTime = Date.now() + (hoursValid * 60 * 60 * 1000);
  return new Date(expiryTime);
}

/**
 * Checks if a password reset token has expired.
 * @param expiryDate - The expiry date from the database
 * @returns True if the token has expired, false otherwise
 */
export function isPasswordResetTokenExpired(expiryDate: Date | null): boolean {
  if (!expiryDate) {
    return true; // No expiry date means expired
  }
  
  return new Date() > expiryDate;
}

/**
 * Validates the format of a password reset token.
 * @param token - The token to validate
 * @returns True if the token format is valid, false otherwise
 */
export function isValidPasswordResetTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Token should be a hex string of the expected length
  const expectedLength = TOKEN_LENGTH * 2; // Each byte becomes 2 hex characters
  const hexPattern = /^[a-f0-9]+$/i;
  
  return token.length === expectedLength && hexPattern.test(token);
}

/**
 * Migrates existing SHA256-hashed tokens to bcrypt (for backward compatibility).
 * This function can be used during a transition period.
 * @param plaintextToken - The original plaintext token
 * @param existingHash - The existing SHA256 hash from the database
 * @returns Object with migration status and new bcrypt hash if migration occurred
 */
export async function migratePasswordResetToken(
  plaintextToken: string,
  existingHash: string
): Promise<{
  migrated: boolean;
  newHash?: string;
}> {
  try {
    // Check if the existing hash is SHA256 format (64 hex characters)
    const sha256Pattern = /^[a-f0-9]{64}$/i;
    if (!sha256Pattern.test(existingHash)) {
      // Already migrated or invalid format
      return { migrated: false };
    }
    
    // Verify the token against the SHA256 hash
    const sha256Hash = crypto.createHash('sha256').update(plaintextToken).digest('hex');
    if (sha256Hash !== existingHash) {
      // Token doesn't match the existing hash
      return { migrated: false };
    }
    
    // Generate new bcrypt hash
    const newHash = await bcrypt.hash(plaintextToken, SALT_ROUNDS);
    
    logger.info('Password reset token migrated from SHA256 to bcrypt');
    
    return {
      migrated: true,
      newHash,
    };
  } catch (error) {
    logger.error('Error migrating password reset token:', error);
    return { migrated: false };
  }
}

/**
 * Verifies a password reset token with automatic migration support.
 * This function handles both bcrypt and SHA256 hashes for backward compatibility.
 * @param plaintextToken - The token from the URL/user input
 * @param storedHash - The hash stored in the database
 * @returns Object with verification result and migration info
 */
export async function verifyPasswordResetTokenWithMigration(
  plaintextToken: string,
  storedHash: string
): Promise<{
  isValid: boolean;
  needsMigration: boolean;
  newHash?: string;
}> {
  try {
    // First, try bcrypt verification
    const bcryptValid = await verifyPasswordResetToken(plaintextToken, storedHash);
    if (bcryptValid) {
      return {
        isValid: true,
        needsMigration: false,
      };
    }
    
    // If bcrypt fails, try SHA256 verification and migration
    const migration = await migratePasswordResetToken(plaintextToken, storedHash);
    if (migration.migrated && migration.newHash) {
      return {
        isValid: true,
        needsMigration: true,
        newHash: migration.newHash,
      };
    }
    
    return {
      isValid: false,
      needsMigration: false,
    };
  } catch (error) {
    logger.error('Error verifying password reset token with migration:', error);
    return {
      isValid: false,
      needsMigration: false,
    };
  }
}
