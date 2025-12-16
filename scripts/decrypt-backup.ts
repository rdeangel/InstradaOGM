import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

async function decryptBackupFile() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: npm run decrypt-backup <encrypted_backup_file.sql.aes>');
    console.log('   or: npx tsx scripts/decrypt-backup.ts <encrypted_backup_file.sql.aes>');
    console.log('   or: npx tsx scripts/decrypt-backup.ts --help');
    console.log('\nDecrypts an AES-256-GCM encrypted backup file.');
    console.log('Requires BACKUP_ENCRYPTION_SECRET_KEY to be set in a .env file in the current directory.');
    return;
  }

  const encryptedFilePath = args[0];
  const outputFilePath = encryptedFilePath.replace(/\.aes$/, ''); // Remove .aes extension

  if (!encryptedFilePath.endsWith('.aes')) {
    console.error('Error: Input file must have a .aes extension.');
    return;
  }

  // Lazy-load encryption module after help check to avoid premature env validation
  const { decrypt } = await import('../src/lib/encryption');

  try {
    // Ensure BACKUP_ENCRYPTION_SECRET_KEY is available
    if (!process.env.BACKUP_ENCRYPTION_SECRET_KEY || Buffer.from(process.env.BACKUP_ENCRYPTION_SECRET_KEY, 'hex').length !== 32) {
      console.error('Error: BACKUP_ENCRYPTION_SECRET_KEY environment variable is missing or not a 32-byte hex string.');
      console.error('Please ensure it is set correctly in your .env file.');
      return;
    }

    console.log(`Attempting to decrypt '${encryptedFilePath}'...`);

    const encryptedContentHex = await fs.readFile(encryptedFilePath, 'utf8');

    const decryptedContent = decrypt(encryptedContentHex);

    if (decryptedContent === null) {
      console.error('Error: Decryption failed. Check your key, or file integrity.');
      return;
    }

    await fs.writeFile(outputFilePath, decryptedContent, 'utf8');
    console.log(`Decryption successful! Decrypted content saved to '${outputFilePath}'.`);

  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(`An error occurred: ${err.message}`);
    if (err.code === 'ENOENT') {
      console.error(`Error: File not found at '${encryptedFilePath}'.`);
    }
  }
}

decryptBackupFile();

