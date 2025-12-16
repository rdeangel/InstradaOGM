#!/usr/bin/env node

/**
 * Standalone backup encryption script for Docker containers
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

function encrypt(text) {
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
    console.error('Encryption failed:', error.message);
    return null;
  }
}

async function encryptFile() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node encrypt-backup-standalone.js <input_file_path>');
    console.log('   or: node encrypt-backup-standalone.js --help');
    console.log('\nEncrypts a plain text file using AES-256-GCM.');
    console.log('Requires BACKUP_ENCRYPTION_SECRET_KEY environment variable.');
    console.log('\nThis is a standalone version for use in Docker containers.');
    return;
  }

  const inputFilePath = args[0];
  const outputFilePath = `${inputFilePath}.aes`;

  try {
    // Ensure BACKUP_ENCRYPTION_SECRET_KEY is available
    if (!process.env.BACKUP_ENCRYPTION_SECRET_KEY || Buffer.from(process.env.BACKUP_ENCRYPTION_SECRET_KEY, 'hex').length !== 32) {
      console.error('Error: BACKUP_ENCRYPTION_SECRET_KEY environment variable is missing or not a 32-byte hex string.');
      console.error('Please ensure it is set correctly.');
      process.exit(1);
    }

    console.log(`Attempting to encrypt '${inputFilePath}'...`);

    const plainTextContent = await fs.readFile(inputFilePath, 'utf8');

    const encryptedContent = encrypt(plainTextContent);

    if (encryptedContent === null) {
      console.error('Error: Encryption failed.');
      process.exit(1);
    }

    await fs.writeFile(outputFilePath, encryptedContent, 'utf8');
    console.log(`Encryption successful! Encrypted content saved to '${outputFilePath}'.`);

  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    if (error.code === 'ENOENT') {
      console.error(`Error: File not found at '${inputFilePath}'.`);
    }
    process.exit(1);
  }
}

encryptFile();

