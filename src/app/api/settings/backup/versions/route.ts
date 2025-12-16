import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import busboy from 'busboy';
import { pipeline } from 'stream/promises';
import { getDataPath } from '@/lib/server/data-paths';

// Streaming upload configuration
// Files are streamed directly to disk without loading into memory
// This allows handling large files (1GB+) with minimal RAM usage (~10-20MB)
// The actual upload size limit is only constrained by:
// 1. NGINX/proxy server limits (configured as client_max_body_size 1G)
// 2. Network timeout limits
// 3. Available disk space

const backupsDirectory = getDataPath('backups');

// GET handler for listing backup versions
export async function GET() {
  const auth = await authenticateRequest(new Request('http://localhost'));

  if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Track usage for authenticated requests
  await trackUsageByAuthMethod(new Request('http://localhost'), auth, 200);

  try {
    // Path is validated by getDataPath() utility
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.mkdir(backupsDirectory, { recursive: true }); // Ensure directory exists

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const files = await fs.readdir(backupsDirectory);

    // Filter out the .temp directory and only include files (not directories)
    const backupVersions = await Promise.all(
      files
        .filter(file => file !== '.temp') // Exclude .temp directory
        .map(async (file) => {
          const filePath = path.join(backupsDirectory, file);
          // Path is constructed from backupsDirectory and readdir results
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          const stats = await fs.stat(filePath);

          // Only include files, not directories
          if (!stats.isFile()) {
            return null;
          }

          return {
            name: file,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
          };
        })
    );

    // Filter out null entries (directories) and sort by lastModified descending
    const validBackups = backupVersions.filter(backup => backup !== null);
    validBackups.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return NextResponse.json(validBackups);
  } catch (error) {
    logger.error('Failed to list backup versions:', error);
    return NextResponse.json({ error: 'Failed to list backup versions.' }, { status: 500 });
  }
}

// POST handler for uploading a new backup file using streaming
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Track usage for authenticated requests
  await trackUsageByAuthMethod(request, auth, 200);

  return new Promise<NextResponse>((resolve) => {
    let uploadedFilePath: string | null = null;
    let uploadedFileName: string | null = null;
    let hasError = false;

    // Helper function to cleanup partial files on error
    const cleanupPartialFile = async () => {
      if (uploadedFilePath) {
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          await fs.unlink(uploadedFilePath);
          logger.info(`Cleaned up partial file: ${uploadedFilePath} `);
        } catch (err) {
          logger.error(`Failed to cleanup partial file ${uploadedFilePath}: `, err);
        }
      }
    };

    try {
      // Ensure backups directory exists
      // Path is validated by getDataPath() utility
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.mkdir(backupsDirectory, { recursive: true }).catch((err) => {
        logger.error('Failed to create backups directory:', err);
        hasError = true;
        cleanupPartialFile();
        resolve(NextResponse.json({ error: 'Failed to create backups directory.' }, { status: 500 }));
      });

      // Get headers for busboy
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        // eslint-disable-next-line security/detect-object-injection
        headers[key] = value;
      });

      // Initialize busboy for streaming multipart/form-data parsing
      const bb = busboy({ headers });

      // Handle file upload stream
      bb.on('file', async (_fieldname: string, fileStream: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
        if (hasError) {
          fileStream.resume(); // Drain the stream
          return;
        }

        const { filename } = info;
        uploadedFileName = filename;

        // Validate filename (basic security check)
        if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
          logger.error('Invalid filename detected:', filename);
          hasError = true;
          fileStream.resume(); // Drain the stream
          cleanupPartialFile();
          resolve(NextResponse.json({ error: 'Invalid filename.' }, { status: 400 }));
          return;
        }

        // Validate file extension (.aes expected) - STRICT CHECK
        if (!filename.toLowerCase().endsWith('.aes')) {
          logger.error('Invalid file extension. Expected .aes file:', filename);
          hasError = true;
          fileStream.resume(); // Drain the stream
          cleanupPartialFile();
          resolve(NextResponse.json({ error: 'Invalid file type. Only .aes files are allowed.' }, { status: 400 }));
          return;
        }

        uploadedFilePath = path.join(backupsDirectory, filename);
        logger.info(`Starting streaming upload for file: ${filename} to ${uploadedFilePath} `);

        // Create write stream to save file directly to disk
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const writeStream = createWriteStream(uploadedFilePath);

        // Handle write stream errors
        writeStream.on('error', (err) => {
          logger.error('Write stream error:', err);
          hasError = true;
          cleanupPartialFile();
          resolve(NextResponse.json({ error: 'Failed to write backup file to disk.' }, { status: 500 }));
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
          logger.info(`Successfully streamed file to disk: ${filename} `);
        } catch (err) {
          if (!hasError) {
            logger.error('Pipeline error during file upload:', err);
            hasError = true;
            cleanupPartialFile();
            resolve(NextResponse.json({ error: 'Failed to upload backup file. Please try again.' }, { status: 500 }));
          }
        }
      });

      // Handle completion of all fields/files
      bb.on('finish', () => {
        if (hasError) {
          return; // Error already handled
        }

        if (!uploadedFileName) {
          resolve(NextResponse.json({ error: 'No file uploaded.' }, { status: 400 }));
          return;
        }

        logger.info(`Backup file upload completed successfully: ${uploadedFileName} `);
        resolve(NextResponse.json({ message: 'Backup file uploaded successfully.' }));
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
        logger.info('Request body exists, converting to Node.js stream...');
        try {
          // Convert Web ReadableStream to Node.js Readable stream
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nodeStream = Readable.fromWeb(request.body as any);
          logger.info('Stream converted, piping to busboy...');
          nodeStream.pipe(bb);
        } catch (streamError) {
          logger.error('Error converting stream:', streamError);
          resolve(NextResponse.json({ error: 'Failed to process request stream.' }, { status: 500 }));
        }
      } else {
        logger.error('No request body found');
        resolve(NextResponse.json({ error: 'No request body.' }, { status: 400 }));
      }

    } catch (error) {
      logger.error('Failed to upload backup file:', error);
      if (!hasError) {
        cleanupPartialFile();
        resolve(NextResponse.json({ error: 'Failed to upload backup file. Please try again.' }, { status: 500 }));
      }
    }
  });
}