import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

async function encryptFile() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: npm run encrypt-backup <input_file_path>');
    console.log('   or: npx tsx scripts/encrypt-backup.ts <input_file_path>');
    console.log('   or: npx tsx scripts/encrypt-backup.ts --help');
    console.log('\nEncrypts a plain text file using AES-256-GCM.');
    console.log('Requires BACKUP_ENCRYPTION_SECRET_KEY to be set in a .env file in the current directory.');
    return;
  }

  // Lazy-load encryption module after help check to avoid premature env validation
  const { encrypt } = await import('../src/lib/encryption');

  const inputFilePath = args[0];
  const outputFilePath = `${inputFilePath}.aes`; // Add .aes extension for encrypted file

  try {
    // Ensure BACKUP_ENCRYPTION_SECRET_KEY is available
    if (!process.env.BACKUP_ENCRYPTION_SECRET_KEY || Buffer.from(process.env.BACKUP_ENCRYPTION_SECRET_KEY, 'hex').length !== 32) {
      console.error('Error: BACKUP_ENCRYPTION_SECRET_KEY environment variable is missing or not a 32-byte hex string.');
      console.error('Please ensure it is set correctly in your .env file.');
      return;
    }

    console.log(`Attempting to encrypt '${inputFilePath}'...`);

    const plainTextContent = await fs.readFile(inputFilePath, 'utf8');

    const encryptedContent = encrypt(plainTextContent);

    if (encryptedContent === null) {
      console.error('Error: Encryption failed.');
      return;
    }

    await fs.writeFile(outputFilePath, encryptedContent, 'utf8');
    console.log(`Encryption successful! Encrypted content saved to '${outputFilePath}'.`);

  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(`An error occurred: ${err.message}`);
    if (err.code === 'ENOENT') {
      console.error(`Error: File not found at '${inputFilePath}'.`);
    }
  }
}

encryptFile();

