#!/usr/bin/env node

/**
 * Standalone backup decryption script for Docker containers
 * This script includes all necessary encryption logic inline to avoid module resolution issues
 */

const fs = require('fs').promises;
const { createWriteStream } = require('fs');
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

// Streaming decryption. Accepts current [IV][ciphertext][authTag] layout and
// the legacy hex-encoded [IV][authTag][ciphertext] layout produced by older
// versions of this script.
async function decryptFile(inputPath, outputPath) {
  const key = getSecretKey();

  const rawFile = await fs.readFile(inputPath);

  if (rawFile.length < ivLength + authTagLength) {
    throw new Error('Decryption failed: Input file too short.');
  }

  const isLegacyHex = rawFile.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(rawFile.toString('latin1'));
  const buf = isLegacyHex ? Buffer.from(rawFile.toString('ascii'), 'hex') : rawFile;

  if (buf.length < ivLength + authTagLength) {
    throw new Error('Decryption failed: Decoded payload too short.');
  }

  let iv, authTag, ciphertext;
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
    await new Promise((resolve, reject) => {
      out.write(decipher.update(ciphertext), (err) => (err ? reject(err) : resolve()));
    });
    const finalChunk = decipher.final(); // throws on auth tag mismatch
    if (finalChunk.length > 0) {
      await new Promise((resolve, reject) => {
        out.write(finalChunk, (err) => (err ? reject(err) : resolve()));
      });
    }
    await new Promise((resolve, reject) => {
      out.end((err) => (err ? reject(err) : resolve()));
    });
  } catch (error) {
    out.destroy();
    try {
      await fs.unlink(outputPath);
    } catch {
      // ignore — best-effort cleanup of partial output
    }
    throw error;
  }
}

async function run() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node decrypt-backup-standalone.js <encrypted_backup_file.sql.aes>');
    console.log('   or: node decrypt-backup-standalone.js --help');
    console.log('\nDecrypts an AES-256-GCM encrypted backup file (streaming).');
    console.log('Supports the current [IV][ciphertext][authTag] layout and the legacy hex format.');
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
    if (!process.env.BACKUP_ENCRYPTION_SECRET_KEY || Buffer.from(process.env.BACKUP_ENCRYPTION_SECRET_KEY, 'hex').length !== 32) {
      console.error('Error: BACKUP_ENCRYPTION_SECRET_KEY environment variable is missing or not a 32-byte hex string.');
      console.error('Please ensure it is set correctly.');
      process.exit(1);
    }

    console.log(`Attempting to decrypt '${encryptedFilePath}'...`);

    await decryptFile(encryptedFilePath, outputFilePath);
    console.log(`Decryption successful! Decrypted content saved to '${outputFilePath}'.`);

  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    if (error.code === 'ENOENT') {
      console.error(`Error: File not found at '${encryptedFilePath}'.`);
    }
    process.exit(1);
  }
}

run();

