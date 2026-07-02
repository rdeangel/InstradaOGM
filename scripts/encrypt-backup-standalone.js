#!/usr/bin/env node

/**
 * Standalone backup encryption script for Docker containers
 * This script includes all necessary encryption logic inline to avoid module resolution issues
 */

const { createReadStream, createWriteStream } = require('fs');
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

// Streaming encryption. Layout: [IV (16B)] [ciphertext] [authTag (16B)].
async function encryptFile(inputPath, outputPath) {
  const key = getSecretKey();
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  const out = createWriteStream(outputPath);

  try {
    await new Promise((resolve, reject) => {
      out.write(iv, (err) => (err ? reject(err) : resolve()));
    });

    const input = createReadStream(inputPath);
    let sourceError = null;
    await new Promise((resolve, reject) => {
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

    const finalCipher = cipher.final();
    if (finalCipher.length > 0) {
      await new Promise((resolve, reject) => {
        out.write(finalCipher, (err) => (err ? reject(err) : resolve()));
      });
    }

    const authTag = cipher.getAuthTag();
    await new Promise((resolve, reject) => {
      out.write(authTag, (err) => (err ? reject(err) : resolve()));
    });

    await new Promise((resolve, reject) => {
      out.end((err) => (err ? reject(err) : resolve()));
    });

    if (sourceError) throw sourceError;
  } catch (error) {
    out.destroy();
    throw error;
  }
}

async function run() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node encrypt-backup-standalone.js <input_file_path>');
    console.log('   or: node encrypt-backup-standalone.js --help');
    console.log('\nEncrypts a file using AES-256-GCM (streaming).');
    console.log('Output layout: [IV (16B)] [ciphertext] [authTag (16B)].');
    console.log('Requires BACKUP_ENCRYPTION_SECRET_KEY environment variable.');
    console.log('\nThis is a standalone version for use in Docker containers.');
    return;
  }

  const inputFilePath = args[0];
  const outputFilePath = `${inputFilePath}.aes`;

  try {
    if (!process.env.BACKUP_ENCRYPTION_SECRET_KEY || Buffer.from(process.env.BACKUP_ENCRYPTION_SECRET_KEY, 'hex').length !== 32) {
      console.error('Error: BACKUP_ENCRYPTION_SECRET_KEY environment variable is missing or not a 32-byte hex string.');
      console.error('Please ensure it is set correctly.');
      process.exit(1);
    }

    console.log(`Attempting to encrypt '${inputFilePath}'...`);

    await encryptFile(inputFilePath, outputFilePath);
    console.log(`Encryption successful! Encrypted content saved to '${outputFilePath}'.`);

  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    if (error.code === 'ENOENT') {
      console.error(`Error: File not found at '${inputFilePath}'.`);
    }
    process.exit(1);
  }
}

run();

