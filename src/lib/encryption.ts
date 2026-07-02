import crypto from 'crypto';
import { createReadStream, createWriteStream, promises as fsPromises } from 'fs';
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
 * Encrypts a file using AES-256-GCM with a streaming approach.
 * File layout: [IV (16B)] [ciphertext] [authTag (16B)]
 * Constant memory regardless of file size. Used for large database backups.
 * @param inputPath Path to the plaintext input file.
 * @param outputPath Path to write the encrypted output.
 * @throws Error if encryption fails.
 */
export async function encryptFile(inputPath: string, outputPath: string): Promise<void> {
  const key = getSecretKey();
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  const out = createWriteStream(outputPath);

  try {
    // Write IV at the start of the output
    await new Promise<void>((resolve, reject) => {
      out.write(iv, (err) => (err ? reject(err) : resolve()));
    });

    // Stream plaintext → cipher → output. Don't let pipeline close `out` because
    // we still need to append the auth tag after the ciphertext finishes.
    const input = createReadStream(inputPath);
    let sourceError: unknown = null;
    await new Promise<void>((resolve, reject) => {
      input.on('data', (chunk) => {
        if (!out.write(cipher.update(chunk))) {
          input.pause();
          out.once('drain', () => input.resume());
        }
      });
      input.on('end', () => resolve());
      input.on('error', (err) => {
        sourceError = err;
        reject(err);
      });
      out.on('error', reject);
    });

    // Finalize the cipher to flush any buffered ciphertext.
    const finalCipher = cipher.final();
    if (finalCipher.length > 0) {
      await new Promise<void>((resolve, reject) => {
        out.write(finalCipher, (err) => (err ? reject(err) : resolve()));
      });
    }

    // Append auth tag at the end
    const authTag = cipher.getAuthTag();
    await new Promise<void>((resolve, reject) => {
      out.write(authTag, (err) => (err ? reject(err) : resolve()));
    });

    await new Promise<void>((resolve, reject) => {
      out.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });

    if (sourceError) throw sourceError;
  } catch (error) {
    out.destroy();
    throw error;
  }
}

/**
 * Decrypts a file produced by encryptFile() using a streaming approach.
 * Expected layout: [IV (16B)] [ciphertext] [authTag (16B)]
 * @param inputPath Path to the encrypted input file.
 * @param outputPath Path to the plaintext output file.
 * @throws Error if decryption fails (wrong key, tampered data, truncation).
 */
export async function decryptFile(inputPath: string, outputPath: string): Promise<void> {
  const key = getSecretKey();

  // Read encrypted file as a Buffer (binary, not string) and slice header/footer.
  // This avoids constructing ~2x-sized hex strings in JS heap.
  // For typical backups (hundreds of MB) this single buffer is acceptable;
  // the previously materialized hex string was the actual OOM trigger.
  const rawFile = await fsPromises.readFile(inputPath);

  if (rawFile.length < ivLength + authTagLength) {
    throw new Error('Decryption failed: Input file too short.');
  }

  // Detect legacy format: older backups were written as a UTF-8 hex string
  // produced by encrypt() with layout [IV][authTag][ciphertext]. If every byte
  // is an ASCII hex character, decode from hex first. Otherwise assume the
  // current binary format: [IV][ciphertext][authTag].
  const isLegacyHex = rawFile.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(rawFile.toString('latin1'));
  const buf = isLegacyHex ? Buffer.from(rawFile.toString('ascii'), 'hex') : rawFile;

  if (buf.length < ivLength + authTagLength) {
    throw new Error('Decryption failed: Decoded payload too short.');
  }

  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;
  if (isLegacyHex) {
    iv = buf.subarray(0, ivLength);
    authTag = buf.subarray(ivLength, ivLength + authTagLength);
    ciphertext = buf.subarray(ivLength + authTagLength);
  } else {
    iv = buf.subarray(0, ivLength);
    authTag = buf.subarray(buf.length - authTagLength);
    ciphertext = buf.subarray(ivLength, buf.length - authTagLength);
  }

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  const out = createWriteStream(outputPath);
  try {
    await new Promise<void>((resolve, reject) => {
      out.write(decipher.update(ciphertext), (err) => (err ? reject(err) : resolve()));
    });
    const finalChunk = decipher.final(); // throws if auth tag verification fails
    if (finalChunk.length > 0) {
      await new Promise<void>((resolve, reject) => {
        out.write(finalChunk, (err) => (err ? reject(err) : resolve()));
      });
    }
    await new Promise<void>((resolve, reject) => {
      out.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
  } catch (error) {
    out.destroy();
    try {
      await fsPromises.unlink(outputPath);
    } catch {
      // ignore — best-effort cleanup of partial output
    }
    throw error;
  }
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