#!/usr/bin/env node

/**
 * Standalone backup decryption script for Docker containers
 * This script includes all necessary encryption logic inline to avoid module resolution issues
 */

const fs = require('fs').promises;
const crypto = require('crypto');

const algorithm = 'aes-256-gcm';
const ivLength = 16;
const authTagLength = 16;

// Lazy-loaded secret key
let secretKey = null;

function getSecretKey() {
  if (secretKey !== null) {
    return secretKey;
  }

  const secretKeyEnv = process.env.BACKUP_ENCRYPTION_SECRET_KEY;
  if (!secretKeyEnv || Buffer.from(secretKeyEnv, 'hex').length !== 32) {
    console.error('BACKUP_ENCRYPTION_SECRET_KEY environment variable is missing or not a 32-byte hex string.');
    throw new Error('BACKUP_ENCRYPTION_SECRET_KEY must be a valid 32-byte hex string. Generate one with: openssl rand -hex 32');
  }

  secretKey = Buffer.from(secretKeyEnv, 'hex');
  return secretKey;
}

function decrypt(encryptedHex) {
  if (!encryptedHex) {
    return null;
  }
  
  try {
    const key = getSecretKey();
    const combined = Buffer.from(encryptedHex, 'hex');

    // Ensure buffer is long enough to contain IV and auth tag
    if (combined.length < ivLength + authTagLength) {
      console.error('Decryption failed: Input buffer too short.');
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
    console.error('Decryption failed:', error.message);
    return null;
  }
}

async function decryptBackupFile() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node decrypt-backup-standalone.js <encrypted_backup_file.sql.aes>');
    console.log('   or: node decrypt-backup-standalone.js --help');
    console.log('\nDecrypts an AES-256-GCM encrypted backup file.');
    console.log('Requires BACKUP_ENCRYPTION_SECRET_KEY environment variable.');
    console.log('\nThis is a standalone version for use in Docker containers.');
    return;
  }

  const encryptedFilePath = args[0];
  const outputFilePath = encryptedFilePath.replace(/\.aes$/, '');

  if (!encryptedFilePath.endsWith('.aes')) {
    console.error('Error: Input file must have a .aes extension.');
    process.exit(1);
  }

  try {
    // Ensure BACKUP_ENCRYPTION_SECRET_KEY is available
    if (!process.env.BACKUP_ENCRYPTION_SECRET_KEY || Buffer.from(process.env.BACKUP_ENCRYPTION_SECRET_KEY, 'hex').length !== 32) {
      console.error('Error: BACKUP_ENCRYPTION_SECRET_KEY environment variable is missing or not a 32-byte hex string.');
      console.error('Please ensure it is set correctly.');
      process.exit(1);
    }

    console.log(`Attempting to decrypt '${encryptedFilePath}'...`);

    const encryptedContentHex = await fs.readFile(encryptedFilePath, 'utf8');

    const decryptedContent = decrypt(encryptedContentHex);

    if (decryptedContent === null) {
      console.error('Error: Decryption failed. Check your key or file integrity.');
      process.exit(1);
    }

    await fs.writeFile(outputFilePath, decryptedContent, 'utf8');
    console.log(`Decryption successful! Decrypted content saved to '${outputFilePath}'.`);

  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    if (error.code === 'ENOENT') {
      console.error(`Error: File not found at '${encryptedFilePath}'.`);
    }
    process.exit(1);
  }
}

decryptBackupFile();

