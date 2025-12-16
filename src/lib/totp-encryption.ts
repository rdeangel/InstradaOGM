import { encryptTotpSecret, decryptTotpSecret, isTotpSecretEncrypted } from './encryption';
import { prisma } from './prisma';
import { logger } from './logger';

/**
 * Safely retrieves and decrypts a TOTP secret, handling both encrypted and plaintext secrets
 * for backward compatibility during migration.
 * @param totpSecret The TOTP secret from the database (may be encrypted or plaintext).
 * @returns The plaintext TOTP secret, or null if decryption fails.
 */
export function getTotpSecret(totpSecret: string | null): string | null {
  if (!totpSecret) {
    return null;
  }

  // Check if the secret is already encrypted
  if (isTotpSecretEncrypted(totpSecret)) {
    // Decrypt the encrypted secret
    const decrypted = decryptTotpSecret(totpSecret);
    if (!decrypted) {
      logger.error('Failed to decrypt TOTP secret');
      return null;
    }
    return decrypted;
  } else {
    // Return plaintext secret (for backward compatibility)
    logger.warn('TOTP secret is stored in plaintext - migration needed');
    return totpSecret;
  }
}

/**
 * Encrypts and stores a TOTP secret in the database.
 * @param userId The user ID to update.
 * @param totpSecret The plaintext TOTP secret to encrypt and store.
 * @returns True if successful, false otherwise.
 */
export async function storeTotpSecret(userId: string, totpSecret: string): Promise<boolean> {
  try {
    const encryptedSecret = encryptTotpSecret(totpSecret);
    if (!encryptedSecret) {
      logger.error('Failed to encrypt TOTP secret');
      return false;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptedSecret }
    });

    logger.info(`TOTP secret encrypted and stored for user ${userId}`);
    return true;
  } catch (error) {
    logger.error('Failed to store encrypted TOTP secret:', error);
    return false;
  }
}

/**
 * Migrates a plaintext TOTP secret to encrypted format.
 * This function should be called when a plaintext secret is detected.
 * @param userId The user ID to migrate.
 * @param plaintextSecret The plaintext TOTP secret.
 * @returns True if migration was successful, false otherwise.
 */
export async function migrateTotpSecret(userId: string, plaintextSecret: string): Promise<boolean> {
  try {
    logger.info(`Migrating plaintext TOTP secret to encrypted format for user ${userId}`);
    
    const success = await storeTotpSecret(userId, plaintextSecret);
    if (success) {
      logger.info(`Successfully migrated TOTP secret for user ${userId}`);
    } else {
      logger.error(`Failed to migrate TOTP secret for user ${userId}`);
    }
    
    return success;
  } catch (error) {
    logger.error('Error during TOTP secret migration:', error);
    return false;
  }
}

/**
 * Retrieves a TOTP secret and automatically migrates it if it's in plaintext format.
 * @param userId The user ID.
 * @param totpSecret The TOTP secret from the database.
 * @returns The plaintext TOTP secret, or null if retrieval/migration fails.
 */
export async function getTotpSecretWithMigration(userId: string, totpSecret: string | null): Promise<string | null> {
  if (!totpSecret) {
    return null;
  }

  // If already encrypted, just decrypt and return
  if (isTotpSecretEncrypted(totpSecret)) {
    return getTotpSecret(totpSecret);
  }

  // If plaintext, migrate to encrypted format
  logger.info(`Detected plaintext TOTP secret for user ${userId}, migrating...`);
  const migrationSuccess = await migrateTotpSecret(userId, totpSecret);
  
  if (migrationSuccess) {
    return totpSecret; // Return the original plaintext for immediate use
  } else {
    logger.error(`Migration failed for user ${userId}, returning plaintext secret`);
    return totpSecret; // Fallback to plaintext if migration fails
  }
}
