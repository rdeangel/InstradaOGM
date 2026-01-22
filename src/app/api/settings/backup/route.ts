import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { exec } from 'child_process';
import { logAuditEvent } from '@/lib/auditLog';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { encrypt, decrypt } from '@/lib/encryption'; // Add decrypt import
import { redactConnectionString } from '@/lib/log-redactor';
import { PrismaClient } from '@prisma/client'; // For type usage
import { prisma } from '@/lib/prisma'; // Import global Prisma singleton
import busboy from 'busboy';
import { pipeline } from 'stream/promises';
import { getDataPath } from '@/lib/server/data-paths';

/**
 * Redacts sensitive information from error objects before logging.
 * This prevents password leakage when exec() errors contain the full command.
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

      // Decrypt the uploaded file
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const encryptedContent = await fs.readFile(encryptedUploadFilePath, 'utf8');
      const decryptedContent = decrypt(encryptedContent);
      if (decryptedContent === null) {
        throw new Error('Failed to decrypt uploaded backup content.');
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.writeFile(restoreFilePath, decryptedContent);
      logger.info(`Uploaded backup decrypted to: ${restoreFilePath}`);
    } else if (filename) {
      // Restore from server backup file
      const encryptedFilename = filename.endsWith('.aes') ? filename : `${filename}.aes`;
      const encryptedBackupFilePath = path.join(getDataPath('backups'), encryptedFilename);
      const tempDecryptedFileName = `decrypted_restore_temp_${Date.now()}.sql`;
      restoreFilePath = path.join(getDataPath('temp'), tempDecryptedFileName);
      tempFilesToCleanup.push(restoreFilePath);

      logger.debug(`Attempting to read encrypted server backup: ${encryptedBackupFilePath}`);
      try {
        await fs.access(encryptedBackupFilePath);
      } catch (error) {
        logger.error(`Encrypted backup file not found or inaccessible at ${encryptedBackupFilePath}:`, error);
        return NextResponse.json({ error: `Backup file not found or inaccessible: ${filename}` }, { status: 404 });
      }

      // Read encrypted content, decrypt, and write to a temporary file
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const encryptedContent = await fs.readFile(encryptedBackupFilePath, 'utf8');
      const decryptedContent = decrypt(encryptedContent);
      if (decryptedContent === null) {
        throw new Error('Failed to decrypt server-stored backup content.');
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.mkdir(path.dirname(restoreFilePath), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.writeFile(restoreFilePath, decryptedContent);
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

      // Step 2: Create a new database from the SQL dump
      const command = `sqlite3 ${dbPath} < ${restoreFilePath}`;
      logger.info(`Executing SQLite restore command: ${command}`);

      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(command, (error, _stdout, stderr) => {
          if (error) {
            const redactedError = redactError(error);
            logger.error('SQLite restore exec error:', redactedError);
            return reject(error);
          }
          if (stderr) {
            logger.warn(`SQLite restore stderr: ${stderr}`);
          }
          logger.info(`SQLite database restored successfully from: ${restoreFilePath}`);
          resolve();
        });
      });
    } else if (dbType === 'postgresql') {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set for PostgreSQL restore.');
      }
      const url = new URL(databaseUrl);
      const user = url.username;
      const password = url.password;
      const host = url.hostname;
      const port = url.port || '5432';
      const database = url.pathname.substring(1);

      logger.info('Starting PostgreSQL restore: terminating connections, dropping and recreating database...');

      // Step 1: Terminate all connections to the database
      const terminateCommand = `PGPASSWORD=${password} psql -h ${host} -p ${port} -U ${user} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid();"`;

      await new Promise<void>((resolve) => {
        // eslint-disable-next-line security/detect-child-process
        exec(terminateCommand, { env: { ...process.env, PGPASSWORD: password } }, (error, _stdout, stderr) => {
          if (error) {
            const redactedError = redactError(error);
            logger.warn('Terminate connections warning:', redactedError);
            // Don't reject - continue even if termination fails
          }
          if (stderr) {
            logger.warn(`Terminate connections stderr: ${stderr}`);
          }
          logger.info(`Terminated active connections to database "${database}".`);
          resolve();
        });
      });

      // Step 2: Drop the database
      const dropCommand = `PGPASSWORD=${password} psql -h ${host} -p ${port} -U ${user} -d postgres -c "DROP DATABASE IF EXISTS \\"${database}\\";"`;

      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(dropCommand, { env: { ...process.env, PGPASSWORD: password } }, (error, _stdout, stderr) => {
          if (error) {
            const redactedError = redactError(error);
            logger.error('Failed to drop database:', redactedError);
            const sanitizedError = new Error(redactConnectionString(error.message));
            sanitizedError.name = error.name;
            return reject(sanitizedError);
          }
          if (stderr) {
            logger.warn(`Drop database stderr: ${stderr}`);
          }
          logger.info(`Database "${database}" dropped successfully.`);
          resolve();
        });
      });

      // Step 2: Create the database
      const createCommand = `PGPASSWORD=${password} psql -h ${host} -p ${port} -U ${user} -d postgres -c "CREATE DATABASE \\"${database}\\";"`;

      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(createCommand, { env: { ...process.env, PGPASSWORD: password } }, (error, _stdout, stderr) => {
          if (error) {
            const redactedError = redactError(error);
            logger.error('Failed to create database:', redactedError);
            const sanitizedError = new Error(redactConnectionString(error.message));
            sanitizedError.name = error.name;
            return reject(sanitizedError);
          }
          if (stderr) {
            logger.warn(`Create database stderr: ${stderr}`);
          }
          logger.info(`Database "${database}" created successfully.`);
          resolve();
        });
      });

      // Step 3: Restore the backup
      const restoreCommand = `PGPASSWORD=${password} psql -h ${host} -p ${port} -U ${user} -d ${database} -f ${restoreFilePath}`;

      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(restoreCommand, { env: { ...process.env, PGPASSWORD: password } }, (error, _stdout, stderr) => {
          if (error) {
            const redactedError = redactError(error);
            logger.error('Failed to restore database:', redactedError);
            const sanitizedError = new Error(redactConnectionString(error.message));
            sanitizedError.name = error.name;
            return reject(sanitizedError);
          }
          if (stderr) {
            logger.warn(`Restore stderr: ${stderr}`);
          }
          logger.info(`Database "${database}" restored successfully.`);
          resolve();
        });
      });
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
    const backupFilePath = path.join(getDataPath('backups'), backupFileName);
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

        // Command uses validated paths from environment and controlled sources
        const command = `sqlite3 ${dbPath} ".dump" > ${backupFilePath}`;

        try {
          await new Promise<void>((resolve, reject) => {
            // eslint-disable-next-line security/detect-child-process
            exec(command, async (error, stdout, stderr) => {
              if (error) {
                logger.error(`exec error: ${error}`);
                return reject(error);
              }

              // Check for database lock errors in stderr
              if (stderr && stderr.includes('database is locked')) {
                logger.warn(`stderr: ${stderr}`);
                return reject(new Error('Database is locked. Please try again.'));
              }

              if (stderr) {
                logger.warn(`stderr: ${stderr}`);
              }

              resolve();
            });
          });

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
      const url = new URL(databaseUrl);
      const user = url.username;
      const password = url.password;
      const host = url.hostname;
      const port = url.port || '5432';
      const database = url.pathname.substring(1);

      // Command uses validated paths and credentials from DATABASE_URL

      const command = `PGPASSWORD=${password} pg_dump -h ${host} -p ${port} -U ${user} -d ${database} -Fp > ${backupFilePath}`;

      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(command, { env: { ...process.env, PGPASSWORD: password } }, async (error, stdout, stderr) => {
          if (error) {
            // Redact the error before logging or rejecting
            const redactedError = redactError(error);
            logger.error('exec error:', redactedError);

            // Create a sanitized error to reject with
            const sanitizedError = new Error(redactConnectionString(error.message));
            sanitizedError.name = error.name;
            return reject(sanitizedError);
          }
          if (stderr) {
            logger.warn(`stderr: ${stderr}`);
          }
          resolve();
        });
      });
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

    // Read the created SQL dump, encrypt it, and overwrite the file
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const sqlContent = await fs.readFile(backupFilePath, 'utf8');
    const encryptedContent = encrypt(sqlContent);

    if (encryptedContent === null) {
      throw new Error('Failed to encrypt backup content.');
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.writeFile(backupFilePath, encryptedContent);
    logger.info(`Backup file encrypted and saved: ${backupFilePath} (original: ${stats.size} bytes, encrypted: ${encryptedContent.length} bytes)`);

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

// DEPRECATED: Old non-streaming restore handler (kept for reference, not used)
// Use handleRestoreFlexibleStreaming instead
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleRestoreFlexible({ filename, file, userId }: { filename?: string | null, file?: File | null, userId: string }) {
  const dbType = getDatabaseType();
  let restoreFilePath: string | undefined;
  const tempFilesToCleanup: string[] = [];

  // Disconnect Prisma before restore
  const prisma = new PrismaClient();
  logger.debug('Disconnecting Prisma client before restore...');
  await prisma.$disconnect();
  logger.debug('Prisma client disconnected.');

  try {
    if (file) {
      // Handle uploaded file restore
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const tempFileName = `restore_temp_${Date.now()}.sql`;
      const encryptedUploadFilePath = path.join(getDataPath('temp'), `encrypted_${tempFileName}`);
      restoreFilePath = path.join(getDataPath('temp'), tempFileName);
      tempFilesToCleanup.push(encryptedUploadFilePath, restoreFilePath);

      logger.debug(`Temporary encrypted upload file path: ${encryptedUploadFilePath}`);
      logger.debug(`Temporary decrypted restore file path: ${restoreFilePath}`);

      // Paths are constructed from controlled sources (process.cwd() + timestamp)
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.mkdir(path.dirname(encryptedUploadFilePath), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.writeFile(encryptedUploadFilePath, buffer);

      // Decrypt the uploaded file
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const encryptedContent = await fs.readFile(encryptedUploadFilePath, 'utf8');
      const decryptedContent = decrypt(encryptedContent);
      if (decryptedContent === null) {
        throw new Error('Failed to decrypt uploaded backup content.');
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.writeFile(restoreFilePath, decryptedContent);
      logger.info(`Uploaded backup decrypted to: ${restoreFilePath}`);

      // Internal ls -l for debugging
      logger.debug(`Running internal 'ls -l' on decrypted temp file: ${restoreFilePath}`);
      await new Promise<void>((resolve, reject) => {
        // Command uses validated path from controlled sources
        // eslint-disable-next-line security/detect-child-process
        exec(`ls -l ${restoreFilePath}`, (lsError, lsStdout, lsStderr) => {
          if (lsError) {
            logger.error(`Internal 'ls -l' error on decrypted temp file: ${lsError.message}`);
            logger.error(`Internal 'ls -l' stderr: ${lsStderr}`);
            return reject(lsError);
          }
          logger.info(`Internal 'ls -l' stdout for decrypted temp file: ${lsStdout}`);
          resolve();
        });
      });
    } else if (filename) {
      // Restore from server backup file
      const encryptedFilename = filename.endsWith('.aes') ? filename : `${filename}.aes`;
      const encryptedBackupFilePath = path.join(getDataPath('backups'), encryptedFilename);
      const tempDecryptedFileName = `decrypted_restore_temp_${Date.now()}.sql`;
      restoreFilePath = path.join(getDataPath('temp'), tempDecryptedFileName);
      tempFilesToCleanup.push(restoreFilePath);

      logger.debug(`Attempting to read encrypted server backup: ${encryptedBackupFilePath}`);
      try {
        await fs.access(encryptedBackupFilePath);
        logger.debug(`Encrypted backup file found at: ${encryptedBackupFilePath}`);
      } catch (error) {
        logger.error(`Encrypted backup file not found or inaccessible at ${encryptedBackupFilePath}:`, error);
        return NextResponse.json({ error: `Backup file not found or inaccessible: ${filename}` }, { status: 404 });
      }

      // Read encrypted content, decrypt, and write to a temporary file
      // Path is constructed from controlled sources
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const encryptedContent = await fs.readFile(encryptedBackupFilePath, 'utf8');
      const decryptedContent = decrypt(encryptedContent);
      if (decryptedContent === null) {
        throw new Error('Failed to decrypt server-stored backup content.');
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.mkdir(path.dirname(restoreFilePath), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.writeFile(restoreFilePath, decryptedContent);
      logger.info(`Server-stored backup decrypted to temporary file: ${restoreFilePath}`);

      // Internal ls -l for debugging
      logger.debug(`Running internal 'ls -l' on decrypted temp file: ${restoreFilePath}`);
      await new Promise<void>((resolve, reject) => {
        // Command uses validated path from controlled sources
        // eslint-disable-next-line security/detect-child-process
        exec(`ls -l ${restoreFilePath}`, (lsError, lsStdout, lsStderr) => {
          if (lsError) {
            logger.error(`Internal 'ls -l' error on decrypted temp file: ${lsError.message}`);
            logger.error(`Internal 'ls -l' stderr: ${lsStderr}`);
            return reject(lsError);
          }
          logger.info(`Internal 'ls -l' stdout for decrypted temp file: ${lsStdout}`);
          resolve();
        });
      });
    } else {
      logger.warn('No file or filename provided for restore.');
      return NextResponse.json({ error: 'No file or filename provided for restore.' }, { status: 400 });
    }

    // Now restore from restoreFilePath (which is always a decrypted SQL file at this point)
    if (dbType === 'sqlite') {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set for SQLite restore.');
      }
      const dbFileName = databaseUrl.replace('file:', '');
      const dbPath = dbFileName;
      logger.debug(`Final SQLite DB path for restore: ${dbPath}`);
      // Delete existing SQLite DB file before restoring
      try {
        // Path is from DATABASE_URL environment variable
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.unlink(dbPath);
        logger.info(`Existing SQLite DB file deleted: ${dbPath}`);
      } catch (unlinkError) {
        if (unlinkError && typeof unlinkError === 'object' && 'code' in unlinkError && (unlinkError as { code?: string }).code === 'ENOENT') {
          logger.warn(`SQLite DB file not found, proceeding with restore: ${dbPath}`);
        } else {
          logger.error(`Failed to delete existing SQLite DB file: ${dbPath}`, unlinkError);
          throw new Error(`Failed to prepare database for restore: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`);
        }
      }
      // Command uses validated paths from environment and controlled sources

      const command = `sqlite3 ${dbPath} ".read ${restoreFilePath}"`;
      logger.debug(`Executing SQLite restore command: "${command}"`);
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(command, (error, stdout, stderr) => {
          if (error) {
            logger.error(`Database restore exec error: ${error.message}`);
            logger.error(`Command executed: "${command}"`);
            logger.error(`Stderr from exec: ${stderr}`);
            return reject(error);
          }
          if (stderr) {
            logger.warn(`Database restore stderr: ${stderr}`);
          }
          logger.info(`Database restore stdout: ${stdout}`);
          resolve();
        });
      });
    } else if (dbType === 'postgresql') {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        logger.error('DATABASE_URL is not set for PostgreSQL restore.');
        throw new Error('DATABASE_URL is not set for PostgreSQL restore.');
      }
      const url = new URL(databaseUrl);
      const user = url.username;
      const password = url.password;
      const host = url.hostname;
      const port = url.port || '5432';
      const database = url.pathname.substring(1);

      // Terminate all connections to the database before dropping it
      // Command uses validated credentials from DATABASE_URL

      const terminateConnectionsCommand = `PGPASSWORD=${password} psql -h ${host} -p ${port} -U ${user} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid();"`;
      logger.debug(`Executing PostgreSQL terminate connections command: "${terminateConnectionsCommand}"`);
      await new Promise<void>((resolve) => {
        // eslint-disable-next-line security/detect-child-process
        exec(terminateConnectionsCommand, { env: { ...process.env, PGPASSWORD: password } }, async (error, stdout, stderr) => {
          if (error) {
            logger.warn(`Terminate connections warning: ${error.message}. Stderr: ${stderr}`);
          }
          logger.info(`Terminate connections stdout: ${stdout}`);
          resolve(); // Always resolve, even on warning, to attempt dropdb
        });
      });

      // Use dropdb and createdb utilities
      // Commands use validated credentials from DATABASE_URL

      const dropDbCommand = `PGPASSWORD=${password} dropdb -h ${host} -p ${port} -U ${user} ${database}`;

      const createDbCommand = `PGPASSWORD=${password} createdb -h ${host} -p ${port} -U ${user} ${database}`;

      const restoreCommand = `PGPASSWORD=${password} psql -h ${host} -p ${port} -U ${user} -d ${database} < ${restoreFilePath}`;
      logger.debug(`Executing PostgreSQL drop DB command: "${dropDbCommand}"`);
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(dropDbCommand, { env: { ...process.env, PGPASSWORD: password } }, (error, stdout, stderr) => {
          if (error) {
            if (stderr && stderr.includes('does not exist')) {
              logger.warn(`Database ${database} does not exist, proceeding to create.`);
              resolve();
            } else {
              logger.error(`PostgreSQL drop DB exec error: ${error.message}`);
              logger.error(`Stderr from dropdb: ${stderr}`);
              return reject(error);
            }
          } else {
            logger.info(`PostgreSQL drop DB stdout: ${stdout}`);
            resolve();
          }
        });
      });
      logger.debug(`Executing PostgreSQL create DB command: "${createDbCommand}"`);
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(createDbCommand, { env: { ...process.env, PGPASSWORD: password } }, (error, stdout, stderr) => {
          if (error) {
            logger.error(`PostgreSQL create DB exec error: ${error.message}`);
            logger.error(`Stderr from createdb: ${stderr}`);
            return reject(error);
          }
          logger.info(`PostgreSQL create DB stdout: ${stdout}`);
          resolve();
        });
      });
      logger.debug(`Executing PostgreSQL restore command: "${restoreCommand}"`);
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line security/detect-child-process
        exec(restoreCommand, { env: { ...process.env, PGPASSWORD: password } }, (error, stdout, stderr) => {
          if (error) {
            logger.error(`Database restore exec error: ${error.message}`);
            logger.error(`Command executed: "${restoreCommand}"`);
            logger.error(`Stderr from exec: ${stderr}`);
            return reject(error);
          }
          if (stderr) {
            logger.warn(`Database restore stderr: ${stderr}`);
          }
          logger.info(`Database restore stdout: ${stdout}`);
          resolve();
        });
      });
    } else {
      logger.error(`Unsupported database type for restore: ${dbType}`);
      return NextResponse.json({ error: 'Unsupported database type for restore.' }, { status: 400 });
    }

    // Clean up temp files
    for (const tempFile of tempFilesToCleanup) {
      try {
        // Path is from controlled sources
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.unlink(tempFile);
        logger.debug(`Deleted temporary file: ${tempFile}`);
      } catch (cleanupError) {
        logger.warn(`Could not delete temporary file: ${tempFile}`, cleanupError);
      }
    }

    // Reconnect Prisma
    await prisma.$connect();
    logger.debug('Prisma client reconnected after restore.');
    await logAuditEvent({
      userId: userId,
      action: 'BACKUP_RESTORED',
      details: { filename: filename || file?.name },
    });
    return NextResponse.json({ message: `Database restored successfully${filename ? ` from ${filename}` : ''}.` });
  } catch (error) {
    // Reconnect Prisma even if restore failed
    try {
      await prisma.$connect();
    } catch (reconnectError) {
      logger.error('Failed to reconnect Prisma after restore error:', reconnectError);
    }
    logger.error('Failed to restore database:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to restore database.' }, { status: 500 });
  }
}