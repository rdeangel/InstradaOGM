import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';
import { getDataPath } from '@/lib/server/data-paths';

const backupsDirectory = getDataPath('backups');
const tempDirectory = getDataPath('backups', '.temp');

// POST handler for uploading backup file chunks
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Track usage for authenticated requests
  await trackUsageByAuthMethod(request, auth, 200);

  try {
    // Ensure temp directory exists
    // Path is validated by getDataPath() utility
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.mkdir(tempDirectory, { recursive: true });

    // Parse the multipart form data
    const formData = await request.formData();
    const chunk = formData.get('chunk') as File;
    const filename = formData.get('filename') as string;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string, 10);
    const totalChunks = parseInt(formData.get('totalChunks') as string, 10);

    if (!chunk || !filename || isNaN(chunkIndex) || isNaN(totalChunks)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate filename (basic security check)
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      logger.error('Invalid filename detected:', filename);
      return NextResponse.json({ error: 'Invalid filename.' }, { status: 400 });
    }

    // Validate file extension (.aes expected) - STRICT CHECK
    if (!filename.toLowerCase().endsWith('.aes')) {
      logger.error('Invalid file extension. Expected .aes file:', filename);
      return NextResponse.json({ error: 'Invalid file type. Only .aes files are allowed.' }, { status: 400 });
    }

    // Create a unique temp file path for this upload session
    const uploadId = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFilePath = path.join(tempDirectory, `${uploadId}.part`);
    const finalFilePath = path.join(backupsDirectory, filename);

    logger.info(`Receiving chunk ${chunkIndex + 1}/${totalChunks} for file: ${filename}`);

    // Convert chunk to buffer and append to temp file
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

    // Append chunk to temp file
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.appendFile(tempFilePath, chunkBuffer);

    // If this is the last chunk, move the temp file to final location
    if (chunkIndex === totalChunks - 1) {
      logger.info(`All chunks received for ${filename}, finalizing upload...`);

      // Move temp file to final location
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.rename(tempFilePath, finalFilePath);

      // Try to remove the .temp directory if it's empty
      try {
        // Path is validated by getDataPath() utility
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const files = await fs.readdir(tempDirectory);
        if (files.length === 0) {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          await fs.rmdir(tempDirectory);
          logger.debug('Removed empty .temp directory');
        }
      } catch {
        // Ignore errors - directory might not be empty or might not exist
        logger.debug('Could not remove .temp directory (may not be empty or may not exist)');
      }

      logger.info(`Backup file upload completed successfully: ${filename}`);
      return NextResponse.json({
        message: 'Backup file uploaded successfully.',
        complete: true
      });
    }

    // Return success for intermediate chunks
    return NextResponse.json({
      message: `Chunk ${chunkIndex + 1}/${totalChunks} uploaded successfully.`,
      complete: false
    });

  } catch (error) {
    logger.error('Failed to upload backup chunk:', error);
    return NextResponse.json({ error: 'Failed to upload backup chunk. Please try again.' }, { status: 500 });
  }
}

// DELETE handler for cleaning up partial uploads
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
    }

    // Validate filename (basic security check)
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      logger.error('Invalid filename detected:', filename);
      return NextResponse.json({ error: 'Invalid filename.' }, { status: 400 });
    }

    const uploadId = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFilePath = path.join(tempDirectory, `${uploadId}.part`);

    // Delete temp file if it exists
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await fs.unlink(tempFilePath);
      logger.info(`Cleaned up partial upload: ${tempFilePath}`);
    } catch {
      // File might not exist, which is fine
      logger.debug(`Temp file not found (already cleaned up?): ${tempFilePath}`);
    }

    // Try to remove the .temp directory if it's empty
    try {
      // Path is validated by getDataPath() utility
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const files = await fs.readdir(tempDirectory);
      if (files.length === 0) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fs.rmdir(tempDirectory);
        logger.debug('Removed empty .temp directory after cleanup');
      }
    } catch {
      // Ignore errors - directory might not be empty or might not exist
      logger.debug('Could not remove .temp directory (may not be empty or may not exist)');
    }

    return NextResponse.json({ message: 'Cleanup successful' });
  } catch (error) {
    logger.error('Failed to cleanup partial upload:', error);
    return NextResponse.json({ error: 'Failed to cleanup partial upload.' }, { status: 500 });
  }
}

