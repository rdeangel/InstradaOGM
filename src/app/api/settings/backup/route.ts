import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { encryptFile, decryptFile } from '@/lib/encryption';
import { redactConnectionString } from '@/lib/log-redactor';
import { prisma } from '@/lib/prisma'; // Import global Prisma singleton
import busboy from 'busboy';
import { pipeline } from 'stream/promises';
import { getDataPath } from '@/lib/server/data-paths';
import {
  findExistingBackup,
  isValidNewBackupName,
  resolveInBackups,
  runTool,
} from '@/lib/server/backup-files';

/**
 * Redacts sensitive information from error objects before logging.
 * This prevents password leakage when child-process errors contain the full command.
 */
function redactError(error: unknown): unknown {
  if (error instanceof Error) {
    const redactedError: Record<string, unknown> = {
      message: redactConnectionString(error.message),
      name: error.name,
      stack: error.stack ? redactConnectionString(error.stack) : undefined,
    };

    // Redact any additional properties that might contain sensitive data
    // Cast through unknown to avoid TypeScript error about incompatible types
    const errorObj = error as unknown as Record<string, unknown>;
    if (errorObj.cmd && typeof errorObj.cmd === 'string') {
      redactedError.cmd = redactConnectionString(errorObj.cmd);
    }
    if (errorObj.code !== undefined) {
      redactedError.code = errorObj.code;
    }
    if (errorObj.killed !== undefined) {
      redactedError.killed = errorObj.killed;
    }
    if (errorObj.signal !== undefined) {
      redactedError.signal = errorObj.signal;
    }

    return redactedError;
  }
  return error;
}

// Helper function to determine DB type
const getDatabaseType = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }
  if (databaseUrl.startsWith('file:')) {
    logger.debug('Detected database type: sqlite');
    return 'sqlite';
  }
  if (databaseUrl.startsWith('postgresql:')) {
    logger.debug('Detected database type: postgresql');
    return 'postgresql';
  }
  throw new Error(`Unsupported database type in DATABASE_URL: ${databaseUrl}`);
};

function decodeUrlPart(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function pgConnFromUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const user = decodeUrlPart(url.username);
  const password = decodeUrlPart(url.password);
  const host = url.hostname;
  const port = url.port || '5432';
  const database = decodeUrlPart(url.pathname.slice(1));
  const pgConn = ['-h', host, '-p', port, '-U', user];
  const env = { ...process.env, PGPASSWORD: password };
  return { host, port, database, pgConn, env };
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  // Check for rate limiting errors
  const authError = handleAuthResponse(auth);
  if (authError) return authError;

  if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Track usage for authenticated requests
  await trackUsageByAuthMethod(request, auth, 200);

  // Check if this is a multipart/form-data request (file upload)
  const contentType = request.headers.get('content-type') || '';
  const isMultipart = contentType.includes('multipart/form-data');

  if (isMultipart) {
    // Use streaming for file uploads
    return handleStreamingRequest(request, auth);
  } else {
    // Handle non-file requests (backup creation) using standard formData
    try {
      const formData = await request.formData();
      const action = formData.get('action') as string;
      const filename = formData.get('filename') as string | null;

      logger.debug(`Backup request - action: ${action}, filename: ${filename}`);

      if (action === 'backup' || !action) {
        // This is a backup creation request (default behavior)
        return await handleBackup(auth.user.id, filename || undefined);
      } else {
        logger.error(`Invalid action received: ${action}`);
        return NextResponse.json({ error: `Invalid action: ${action}. Use "backup" or "restore"` }, { status: 400 });
      }
    } catch (error) {
      const redactedError = redactError(error);
      const errorMessage = error instanceof Error ? redactConnectionString(error.message) : 'Unknown error';
      logger.error('Error in backup operation:', redactedError);
      await logAuditEvent({
        userId: auth.user.id,
        action: 'BACKUP_FAILURE',
        reason: `Backup operation failed: ${errorMessage}`,
      });
      return NextResponse.json({ error: `Failed to perform backup operation: ${errorMessage}` }, { status: 500 });
    }
  }
}

// Handle streaming multipart/form-data requests
async function handleStreamingRequest(request: Request, auth: Awaited<ReturnType<typeof authenticateRequest>>) {
  return new Promise<NextResponse>((resolve) => {
    let action: string | null = null;
    let filename: string | null = null;
    let uploadedFilePath: string | null = null;
    let hasError = false;

    // Helper function to cleanup partial files on error
    const cleanupPartialFile = async () => {
      if (uploadedFilePath) {
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          await fs.unlink(uploadedFilePath);
          logger.info(`Cleaned up partial file: ${uploadedFilePath}`);
        } catch (err) {
          logger.error(`Failed to cleanup partial file ${uploadedFilePath}:`, err);
        }
      }
    };

    try {
      // Get headers for busboy
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        // eslint-disable-next-line security/detect-object-injection
        headers[key] = value;
      });

      // Initialize busboy for streaming multipart/form-data parsing
      const bb = busboy({ headers });

      // Handle regular form fields (action, filename)
      bb.on('field', (fieldname: string, value: string) => {
        if (fieldname === 'action') {
          action = value;
        } else if (fieldname === 'filename') {
          filename = value;
        }
      });

      // Handle file upload stream
      bb.on('file', async (_fieldname: string, fileStream: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
        if (hasError) {
          fileStream.resume(); // Drain the stream
          return;
        }

        const { filename: uploadFilename } = info;

        // Validate filename (basic security check)
        if (!uploadFilename || uploadFilename.includes('/') || uploadFilename.includes('\\') || uploadFilename.includes('..')) {
          logger.error('Invalid filename detected:', uploadFilename);
          hasError = true;
          fileStream.resume(); // Drain the stream
          cleanupPartialFile();
          resolve(NextResponse.json({ error: 'Invalid filename.' }, { status: 400 }));
          return;
        }

        // Validate file extension (.aes expected) - STRICT CHECK
        if (!uploadFilename.toLowerCase().endsWith('.aes')) {
          logger.error('Invalid file extension. Expected .aes file:', uploadFilename);
          hasError = true;
          fileStream.resume(); // Drain the stream
          cleanupPartialFile();
          resolve(NextResponse.json({ error: 'Invalid file type. Only .aes files are allowed.' }, { status: 400 }));
          return;
        }

        // Create temp directory for uploaded file
        const tempDir = getDataPath('temp');
        // Path is validated by getDataPath() utility
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.mkdir(tempDir, { recursive: true }).catch((err) => {
          logger.error('Failed to create temp directory:', err);
          hasError = true;
          fileStream.resume();
          resolve(NextResponse.json({ error: 'Failed to create temp directory.' }, { status: 500 }));
        });

        if (hasError) return;

        // Stream file to temp location
        const tempFileName = `restore_upload_${Date.now()}_${uploadFilename}`;
        uploadedFilePath = path.join(tempDir, tempFileName);
        logger.info(`Starting streaming upload for restore file: ${uploadFilename} to ${uploadedFilePath}`);

        // Create write stream to save file directly to disk
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const writeStream = createWriteStream(uploadedFilePath);

        // Handle write stream errors
        writeStream.on('error', (err) => {
          logger.error('Write stream error:', err);
          hasError = true;
          cleanupPartialFile();
          resolve(NextResponse.json({ error: 'Failed to write restore file to disk.' }, { status: 500 }));
        });

        // Handle file stream errors (includes network disconnects)
        fileStream.on('error', (err) => {
          logger.error('File stream error (possible network disconnect):', err);
          hasError = true;
          writeStream.destroy();
          cleanupPartialFile();
          resolve(NextResponse.json({ error: 'Upload interrupted. Please try again.' }, { status: 500 }));
        });

        // Pipe the upload stream directly to disk
        try {
          await pipeline(fileStream, writeStream);
          logger.info(`Successfully streamed restore file to disk: ${uploadFilename}`);
        } catch (err) {
          if (!hasError) {
            logger.error('Pipeline error during file upload:', err);
            hasError = true;
            cleanupPartialFile();
            resolve(NextResponse.json({ error: 'Failed to upload restore file. Please try again.' }, { status: 500 }));
          }
        }
      });

      // Handle completion of all fields/files
      bb.on('finish', async () => {
        if (hasError) {
          return; // Error already handled
        }

        // Ensure user is authenticated
        if (!auth.user) {
          resolve(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
          return;
        }

        // Process the request based on action
        if (action === 'backup' || !action) {
          // Handle backup creation (no file upload expected)
          logger.debug(`Streaming handler: Creating backup with filename: ${filename || 'auto-generated'}`);
          try {
            const result = await handleBackup(auth.user.id, filename || undefined);
            resolve(result);
          } catch (error) {
            logger.error('Error in backup operation:', error);
            await logAuditEvent({
              userId: auth.user.id,
              action: 'BACKUP_FAILURE',
              reason: 'Backup operation failed',
            });
            resolve(NextResponse.json({ error: 'Failed to create backup' }, { status: 500 }));
          }
        } else if (action === 'restore') {
          // Security: Block restore operations when using API key authentication
          if (auth.method === 'apiKey') {
            logger.warn(`Restore operation blocked for API key authentication. User: ${auth.user.email}`);
            await logAuditEvent({
              userId: auth.user.id,
              action: 'BACKUP_RESTORE_BLOCKED',
              method: 'API_KEY',
              details: {
                apiKeyId: auth.apiKeyId,
                apiKeyName: auth.apiKeyName,
                reason: 'Restore operations are not allowed via API key authentication'
              },
              reason: 'Security policy: Restore operations require web session authentication',
            });

            // Clean up uploaded file if exists
            if (uploadedFilePath) {
              // eslint-disable-next-line security/detect-non-literal-fs-filename
              await fs.unlink(uploadedFilePath).catch(() => {/* ignore */ });
            }

            resolve(NextResponse.json({
              message: 'Restore operations are not allowed via API key authentication. Please use the web interface.',
              error: 'API_KEY_NOT_ALLOWED'
            }, { status: 403 }));
            return;
          }

          // Restore from uploaded file or server backup
          if (!filename && !uploadedFilePath) {
            resolve(NextResponse.json({ message: 'Filename or file is required for restore operation' }, { status: 400 }));
            return;
          }

          try {
            const result = await handleRestoreFlexibleStreaming({
              filename,
              uploadedFilePath,
              userId: auth.user.id
            });
            resolve(result);
          } catch (error) {
            logger.error('Error in restore operation:', error);
            await logAuditEvent({
              userId: auth.user.id,
              action: 'BACKUP_RESTORE_FAILURE',
              reason: 'Restore operation failed',
            });
            resolve(NextResponse.json({ message: 'Failed to perform restore operation' }, { status: 500 }));
          }
        } else {
          resolve(NextResponse.json({ error: `Invalid action: ${action}. Use "backup" or "restore"` }, { status: 400 }));
        }
      });

      // Handle busboy errors (includes malformed multipart data)
      bb.on('error', (err) => {
        logger.error('Busboy parsing error:', err);
        if (!hasError) {
          hasError = true;
          cleanupPartialFile();
          resolve(NextResponse.json({ error: 'Failed to parse upload request. Please ensure you are uploading a valid .aes file.' }, { status: 400 }));
        }
      });

      // Get the request body as a readable stream and pipe to busboy
      if (request.body) {
        // Convert Web ReadableStream to Node.js Readable stream
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nodeStream = Readable.fromWeb(request.body as any);
        nodeStream.pipe(bb);
      } else {
        resolve(NextResponse.json({ error: 'No request body.' }, { status: 400 }));
      }

    } catch (error) {
      logger.error('Failed to handle streaming request:', error);
      if (!hasError) {
        cleanupPartialFile();
        resolve(NextResponse.json({ error: 'Failed to process upload request.' }, { status: 500 }));
      }
    }
  });
}

// Handle restore operation with streaming (file already written to disk)
async function handleRestoreFlexibleStreaming({ filename, uploadedFilePath, userId }: { filename?: string | null, uploadedFilePath?: string | null, userId: string }) {
  const dbType = getDatabaseType();
  let restoreFilePath: string | undefined;
  const tempFilesToCleanup: string[] = [];


  // Disconnect the global Prisma client before restore (SQLite only)
  // For SQLite, this is required to release file locks.
  // For PostgreSQL, we keep the app connected (connections will be terminated by the restore command)
  if (dbType === 'sqlite') {
    logger.debug('Disconnecting global Prisma client before restore (SQLite)...');
    await prisma.$disconnect();
    logger.debug('Global Prisma client disconnected.');
  }

  // Wait a moment for any in-flight operations to complete
  logger.debug('Waiting 1 second for in-flight operations to complete...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  logger.debug('Ready to proceed with restore.');

  try {
    if (uploadedFilePath) {
      // Handle uploaded file restore
      const encryptedUploadFilePath = uploadedFilePath;
      const tempFileName = `restore_temp_${Date.now()}.sql`;
      restoreFilePath = path.join(getDataPath('temp'), tempFileName);
      tempFilesToCleanup.push(encryptedUploadFilePath, restoreFilePath);

      logger.debug(`Encrypted upload file path: ${encryptedUploadFilePath}`);
      logger.debug(`Temporary decrypted restore file path: ${restoreFilePath}`);

      // Stream-decrypt the uploaded file. New format: [IV][ciphertext][authTag].
      await decryptFile(encryptedUploadFilePath, restoreFilePath);
      logger.info(`Uploaded backup decrypted to: ${restoreFilePath}`);
    } else if (filename) {
      // Restore from server backup file (exact listing match; legacy names still work)
      const encryptedBackupFilePath = await findExistingBackup(filename);
      if (!encryptedBackupFilePath) {
        logger.error(`Encrypted backup file not found or inaccessible: ${filename}`);
        return NextResponse.json({ error: `Backup file not found or inaccessible: ${filename}` }, { status: 404 });
      }
      const tempDecryptedFileName = `decrypted_restore_temp_${Date.now()}.sql`;
      restoreFilePath = path.join(getDataPath('temp'), tempDecryptedFileName);
      tempFilesToCleanup.push(restoreFilePath);

      logger.debug(`Attempting to read encrypted server backup: ${encryptedBackupFilePath}`);

      // Read encrypted content, decrypt, and write to a temporary file
      // Stream-decryption avoids materializing the full plaintext in heap.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.mkdir(path.dirname(restoreFilePath), { recursive: true });
      await decryptFile(encryptedBackupFilePath, restoreFilePath);
      logger.info(`Server-stored backup decrypted to temporary file: ${restoreFilePath}`);
    } else {
      return NextResponse.json({ message: 'Filename or uploaded file path is required for restore operation' }, { status: 400 });
    }

    // Perform the restore operation
    if (!restoreFilePath) {
      throw new Error('Restore file path is undefined.');
    }

    if (dbType === 'sqlite') {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set for SQLite restore.');
      }
      const dbFileName = databaseUrl.replace('file:', '');
      const dbPath = dbFileName;
      logger.debug(`Final SQLite DB path for restore: ${dbPath}`);

      // Step 1: Remove ALL old database files (main db, WAL, and SHM files)
      const filesToDelete = [
        dbPath,           // Main database file
        `${dbPath}-wal`,  // Write-Ahead Log file
        `${dbPath}-shm`,  // Shared memory file
      ];

      for (const filePath of filesToDelete) {
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          await fs.unlink(filePath);
          logger.info(`Deleted SQLite file: ${filePath}`);
        } catch (unlinkError) {
          if (unlinkError && typeof unlinkError === 'object' && 'code' in unlinkError && (unlinkError as { code?: string }).code === 'ENOENT') {
            logger.debug(`SQLite file does not exist (skipping): ${filePath}`);
          } else {
            const errorMessage = unlinkError instanceof Error ? unlinkError.message : 'Unknown error';
            logger.warn(`Could not delete SQLite file ${filePath}: ${errorMessage}`);
          }
        }
      }

      // Step 2: Create a new database from the SQL dump (stdin, no shell)
      logger.info('Restoring SQLite database from dump');
      try {
        const { stderr } = await runTool('sqlite3', [dbPath], { stdinFile: restoreFilePath });
        if (stderr) {
          logger.warn(`SQLite restore stderr: ${stderr}`);
        }
        logger.info('SQLite database restored successfully from dump');
      } catch (error) {
        logger.error('SQLite restore exec error:', redactError(error));
        throw error;
      }
    } else if (dbType === 'postgresql') {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set for PostgreSQL restore.');
      }
      const { database, pgConn, env } = pgConnFromUrl(databaseUrl);
      const qIdent = (s: string) => '"' + s.replace(/"/g, '""') + '"';
      const terminateSql = (db: string) =>
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db.replace(/'/g, "''")}' AND pid <> pg_backend_pid();`;

      logger.info('Starting PostgreSQL restore: terminating connections, dropping and recreating database...');

      // Step 1: Terminate all connections to the database (failure only logs a warning)
      try {
        const { stderr } = await runTool(
          'psql',
          [...pgConn, '-d', 'postgres', '-c', terminateSql(database)],
          { env },
        );
        if (stderr) {
          logger.warn(`Terminate connections stderr: ${stderr}`);
        }
        logger.info(`Terminated active connections to database "${database}".`);
      } catch (error) {
        logger.warn('Terminate connections warning:', redactError(error));
      }

      // Step 2: Drop the database
      try {
        const { stderr } = await runTool(
          'psql',
          [...pgConn, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${qIdent(database)};`],
          { env },
        );
        if (stderr) {
          logger.warn(`Drop database stderr: ${stderr}`);
        }
        logger.info(`Database "${database}" dropped successfully.`);
      } catch (error) {
        logger.error('Failed to drop database:', redactError(error));
        const sanitizedError = new Error(redactConnectionString(error instanceof Error ? error.message : String(error)));
        throw sanitizedError;
      }

      // Step 3: Create the database
      try {
        const { stderr } = await runTool(
          'psql',
          [...pgConn, '-d', 'postgres', '-c', `CREATE DATABASE ${qIdent(database)};`],
          { env },
        );
        if (stderr) {
          logger.warn(`Create database stderr: ${stderr}`);
        }
        logger.info(`Database "${database}" created successfully.`);
      } catch (error) {
        logger.error('Failed to create database:', redactError(error));
        const sanitizedError = new Error(redactConnectionString(error instanceof Error ? error.message : String(error)));
        throw sanitizedError;
      }

      // Step 4: Restore the backup
      try {
        const { stderr } = await runTool(
          'psql',
          [...pgConn, '-d', database, '-f', restoreFilePath],
          { env },
        );
        if (stderr) {
          logger.warn(`Restore stderr: ${stderr}`);
        }
        logger.info(`Database "${database}" restored successfully.`);
      } catch (error) {
        logger.error('Failed to restore database:', redactError(error));
        const sanitizedError = new Error(redactConnectionString(error instanceof Error ? error.message : String(error)));
        throw sanitizedError;
      }
    } else {
      return NextResponse.json({ message: 'Unsupported database type for restore.' }, { status: 400 });
    }

    logger.info('Database restore completed successfully.');

    // SQLite-specific: Reconnect Prisma and restart application
    // PostgreSQL handles connections differently and doesn't need this
    if (dbType === 'sqlite') {
      // Reconnect Prisma after successful restore
      try {
        logger.info('Reconnecting Prisma client after SQLite restore...');
        await prisma.$connect();
        logger.info('Prisma client reconnected successfully.');
      } catch (reconnectError) {
        logger.error('Failed to reconnect Prisma after restore:', reconnectError);
        // Continue anyway - the application restart will handle this
      }

      await logAuditEvent({
        userId: userId,
        action: 'BACKUP_RESTORED',
        details: { filename: filename || 'uploaded_file' },
      });

      // Schedule application restart after response is sent
      // This ensures all database connections are properly re-established
      setTimeout(() => {
        logger.warn('Triggering application restart after SQLite database restore...');
        process.exit(0); // Docker will automatically restart the container
      }, 2000); // 2 second delay to allow response to be sent

      return NextResponse.json({
        message: 'Database restored successfully. Application will restart in a few seconds to re-establish database connections.'
      });
    } else {
      // PostgreSQL: Use existing behavior (no restart needed)
      await logAuditEvent({
        userId: userId,
        action: 'BACKUP_RESTORED',
        details: { filename: filename || 'uploaded_file' },
      });

      return NextResponse.json({ message: 'Database restored successfully.' });
    }
  } catch (error) {
    const redactedError = redactError(error);
    logger.error('Failed to restore database:', redactedError);

    // Try to reconnect Prisma even on failure for ALL database types
    try {
      logger.info('Attempting to reconnect Prisma after restore failure...');
      await prisma.$connect();
      logger.info('Prisma reconnected after restore failure.');
    } catch (reconnectError) {
      const redactedReconnectError = redactError(reconnectError);
      logger.error('Failed to reconnect Prisma after restore failure:', redactedReconnectError);
    }

    // Attempt to log the failure (might fail if reconnection failed)
    try {
      await logAuditEvent({
        userId: userId,
        action: 'BACKUP_RESTORE_FAILURE',
        reason: 'Database restore failed',
      });
    } catch (auditError) {
      const redactedAuditError = redactError(auditError);
      logger.error('Failed to write audit log for restore failure:', redactedAuditError);
    }

    return NextResponse.json({ message: 'Failed to restore database.' }, { status: 500 });
  } finally {
    // Clean up temporary files
    for (const tempFile of tempFilesToCleanup) {
      try {
        // Path is constructed from controlled sources
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.unlink(tempFile);
        logger.debug(`Cleaned up temporary file: ${tempFile}`);
      } catch (cleanupError) {
        logger.warn(`Failed to clean up temporary file ${tempFile}:`, cleanupError);
      }
    }

    // Try to remove the temp directory if it's empty
    try {
      const tempDir = getDataPath('temp');
      // Path is validated by getDataPath() utility
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const files = await fs.readdir(tempDir);
      logger.debug(`Temp directory contains ${files.length} files: ${files.join(', ')}`);
      if (files.length === 0) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.rmdir(tempDir);
        logger.info('Removed empty temp directory');
      } else {
        logger.debug(`Temp directory not empty, contains: ${files.join(', ')}`);
      }
    } catch (dirError) {
      // Ignore errors - directory might not exist or might not be empty
      const errorMessage = dirError instanceof Error ? dirError.message : 'Unknown error';
      logger.debug(`Could not remove temp directory: ${errorMessage}`);
    }
  }
}

async function handleBackup(userId: string, customFilename?: string) {
  try {
    const dbType = getDatabaseType();
    logger.debug(`Current working directory: ${process.cwd()}`);
    logger.debug(`Database type: ${dbType}`);
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');

    // Use custom filename if provided, otherwise generate default
    let backupFileName: string;
    if (customFilename) {
      if (!isValidNewBackupName(customFilename)) {
        return NextResponse.json({
          error: 'Invalid filename. Use only letters, digits, ".", "_" and "-" (max 100).',
        }, { status: 400 });
      }
      logger.debug(`Custom filename provided: ${customFilename}`);
      // Check if filename contains extension (has .aes at the end)
      const hasExtension = customFilename.endsWith(`.${dbType}.aes`) ||
        customFilename.includes('.sqlite.aes') ||
        customFilename.includes('.postgresql.aes') ||
        customFilename.includes('.mysql.aes');

      if (hasExtension) {
        // Full filename with extension provided - use as-is
        backupFileName = customFilename;
      } else {
        // Treat as prefix: add timestamp and extension
        backupFileName = `${customFilename}_${timestamp}.${dbType}.aes`;
      }
    } else {
      backupFileName = `backup_${timestamp}.${dbType}.aes`;
    }

    logger.debug(`Final backup filename: ${backupFileName}`);
    const backupFilePath = resolveInBackups(backupFileName);
    logger.debug(`Backup file path: ${backupFilePath}`);

    // Ensure the backups directory exists
    // Path is constructed from controlled sources (process.cwd() + timestamp)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.mkdir(path.dirname(backupFilePath), { recursive: true });

    if (dbType === 'sqlite') {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set for SQLite backup.');
      }
      const dbFileName = databaseUrl.replace('file:', '');
      const dbPath = dbFileName;
      logger.debug(`Final SQLite DB path for dump: ${dbPath}`);

      // Retry logic for database locks
      const maxRetries = 3;
      const retryDelays = [500, 1000, 2000]; // milliseconds
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) {
          logger.info(`Retry attempt ${attempt + 1}/${maxRetries} after ${retryDelays[attempt - 1]}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt - 1]));
        }

        try {
          const { stderr } = await runTool('sqlite3', [dbPath, '.dump'], { stdoutFile: backupFilePath });

          // Check for database lock errors in stderr
          if (stderr && stderr.includes('database is locked')) {
            logger.warn(`stderr: ${stderr}`);
            throw new Error('Database is locked. Please try again.');
          }

          if (stderr) {
            logger.warn(`stderr: ${stderr}`);
          }

          // Validate backup file size before proceeding
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          const stats = await fs.stat(backupFilePath);
          if (stats.size === 0) {
            throw new Error('Backup file is empty (0 bytes). Database may be locked or dump failed.');
          }

          logger.info(`SQLite backup created successfully: ${stats.size} bytes`);
          break; // Success - exit retry loop

        } catch (error) {
          lastError = error as Error;
          logger.warn(`Backup attempt ${attempt + 1} failed: ${lastError.message}`);

          // If this was the last attempt, throw the error
          if (attempt === maxRetries - 1) {
            throw new Error(`Failed to create SQLite backup after ${maxRetries} attempts: ${lastError.message}`);
          }

          // Clean up failed backup file before retry
          try {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            await fs.unlink(backupFilePath);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    } else if (dbType === 'postgresql') {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set for PostgreSQL backup.');
      }
      const { database, pgConn, env } = pgConnFromUrl(databaseUrl);

      try {
        const { stderr } = await runTool(
          'pg_dump',
          [...pgConn, '-d', database, '-Fp', '-f', backupFilePath],
          { env },
        );
        if (stderr) {
          logger.warn(`stderr: ${stderr}`);
        }
      } catch (error) {
        logger.error('exec error:', redactError(error));
        const sanitizedError = new Error(redactConnectionString(error instanceof Error ? error.message : String(error)));
        throw sanitizedError;
      }
    } else {
      return NextResponse.json({ message: 'Unsupported database type for backup.' }, { status: 400 });
    }

    // Validate backup file exists and has content before encryption
    // Path is constructed from controlled sources
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const stats = await fs.stat(backupFilePath);
    if (stats.size === 0) {
      throw new Error('Backup file is empty. Cannot encrypt empty backup.');
    }

    logger.debug(`Encrypting backup file (${stats.size} bytes)...`);

    // Stream-encrypt the SQL dump to avoid materializing the full content
    // (plus its 2x-sized hex encoding) in the JS heap. AES-256-GCM file
    // layout: [IV (16B)] [ciphertext] [authTag (16B)].
    const tmpEncryptedPath = `${backupFilePath}.enc.tmp`;
    try {
      await encryptFile(backupFilePath, tmpEncryptedPath);
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.rename(tmpEncryptedPath, backupFilePath);
    } catch (error) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.unlink(tmpEncryptedPath);
      } catch {
        // ignore cleanup errors
      }
      throw error;
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const encryptedStats = await fs.stat(backupFilePath);
    logger.info(`Backup file encrypted and saved: ${backupFilePath} (original: ${stats.size} bytes, encrypted: ${encryptedStats.size} bytes)`);

    await logAuditEvent({
      userId: userId,
      action: 'BACKUP_CREATED',
      details: { filename: backupFileName },
    });

    return NextResponse.json({
      message: 'Database backup created and stored successfully.',
      filename: backupFileName,
    });
  } catch (error) {
    const redactedError = redactError(error);
    const errorMessage = error instanceof Error ? redactConnectionString(error.message) : 'Unknown error';
    logger.error('Error in handleBackup:', redactedError);

    await logAuditEvent({
      userId: userId,
      action: 'BACKUP_FAILURE',
      details: { error: errorMessage },
    });

    return NextResponse.json({
      error: `Failed to create backup: ${errorMessage}`
    }, { status: 500 });
  }
}
