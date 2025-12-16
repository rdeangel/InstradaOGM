import crypto from 'crypto';
import { logger } from './logger';

const algorithm = 'aes-256-gcm';
const ivLength = 16; // AES-GCM standard IV length
const authTagLength = 16; // AES-GCM standard auth tag length

// Lazy-loaded secret key to avoid failing during Next.js build
let secretKey: Buffer | null = null;

/**
 * Gets the encryption secret key, initializing it on first use.
 * This lazy initialization prevents build-time failures when the key isn't available.
 * @returns The secret key buffer
 * @throws Error if the key is missing or invalid
 */
function getSecretKey(): Buffer {
  if (secretKey !== null) {
    return secretKey;
  }

  const secretKeyEnv = process.env.BACKUP_ENCRYPTION_SECRET_KEY;
  if (!secretKeyEnv || Buffer.from(secretKeyEnv, 'hex').length !== 32) {
    logger.error('BACKUP_ENCRYPTION_SECRET_KEY environment variable is missing or not a 32-byte hex string.');
    throw new Error('BACKUP_ENCRYPTION_SECRET_KEY must be a valid 32-byte hex string. Generate one with: openssl rand -hex 32');
  }

  secretKey = Buffer.from(secretKeyEnv, 'hex');
  return secretKey;
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 * @param text The plain text to encrypt.
 * @returns The encrypted text as a hex string (iv:authTag:encryptedData), or null on error.
 */
export function encrypt(text: string): string | null {
  if (!text) {
    return null;
  }
  try {
    const key = getSecretKey();
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Combine IV, authTag, and encrypted data, then convert to hex
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('hex');
  } catch (error) {
    logger.error('Encryption failed:', error);
    return null;
  }
}

/**
 * Decrypts a hex string (iv:authTag:encryptedData) encrypted with AES-256-GCM.
 * @param encryptedHex The hex string to decrypt.
 * @returns The original plain text string, or null if decryption fails or input is invalid.
 */
export function decrypt(encryptedHex: string): string | null {
  if (!encryptedHex) {
    return null;
  }
  try {
    const key = getSecretKey();
    const combined = Buffer.from(encryptedHex, 'hex');

    // Ensure buffer is long enough to contain IV and auth tag
    if (combined.length < ivLength + authTagLength) {
      logger.error('Decryption failed: Input buffer too short.');
      return null;
    }

    // Extract IV, authTag, and encrypted data
    const iv = combined.slice(0, ivLength);
    const authTag = combined.slice(ivLength, ivLength + authTagLength);
    const encryptedData = combined.slice(ivLength + authTagLength);

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Decryption failed:', error);
    // Errors during decryption (e.g., wrong key, tampered data) often throw specific exceptions
    return null;
  }
}

/**
 * Encrypts a TOTP secret using AES-256-GCM encryption.
 * @param totpSecret The TOTP secret to encrypt.
 * @returns The encrypted TOTP secret as a hex string, or null on error.
 */
export function encryptTotpSecret(totpSecret: string): string | null {
  if (!totpSecret) {
    return null;
  }
  return encrypt(totpSecret);
}

/**
 * Decrypts a TOTP secret that was encrypted with encryptTotpSecret.
 * @param encryptedTotpSecret The encrypted TOTP secret as a hex string.
 * @returns The original TOTP secret, or null if decryption fails.
 */
export function decryptTotpSecret(encryptedTotpSecret: string): string | null {
  if (!encryptedTotpSecret) {
    return null;
  }
  return decrypt(encryptedTotpSecret);
}

/**
 * Determines if a TOTP secret is encrypted (hex format) or plaintext.
 * This is used for backward compatibility during migration.
 * @param totpSecret The TOTP secret to check.
 * @returns True if the secret appears to be encrypted (hex format with sufficient length).
 */
export function isTotpSecretEncrypted(totpSecret: string): boolean {
  if (!totpSecret) {
    return false;
  }

  // Encrypted secrets are hex strings with minimum length (IV + authTag + some data)
  const minEncryptedLength = (ivLength + authTagLength) * 2; // Convert bytes to hex chars

  // Check if it's a hex string of sufficient length
  const isHex = /^[0-9a-fA-F]+$/.test(totpSecret);
  const hasMinLength = totpSecret.length >= minEncryptedLength;

  return isHex && hasMinLength;
}