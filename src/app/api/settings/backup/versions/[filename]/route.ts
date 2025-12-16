import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { logger } from '@/lib/logger';
import { getDataPath } from '@/lib/server/data-paths';

const backupsDirectory = getDataPath('backups');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
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
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Track usage for authenticated requests
  await trackUsageByAuthMethod(request, auth, 200);

  const { filename } = await params;
  // Ensure the filename has the .aes extension for consistency, or handle both .sql and .aes
  const actualFilename = filename.endsWith('.aes') ? filename : `${filename}.aes`;
  const filePath = path.join(backupsDirectory, actualFilename);

  // Basic security check: prevent directory traversal
  if (!filePath.startsWith(backupsDirectory)) {
    return new NextResponse(JSON.stringify({ error: 'Invalid file path.' }), { status: 400 });
  }

  try {
    // Path is validated against backupsDirectory
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const fileBuffer = await fs.readFile(filePath);
    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream'); // Changed to generic binary type
    headers.set('Content-Disposition', `attachment; filename="${actualFilename}"`);

    return new NextResponse(fileBuffer as unknown as BodyInit, { headers });
  } catch (error) {
    logger.error(`Failed to download backup file ${filename}:`, error);
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse(JSON.stringify({ error: 'File not found.' }), { status: 404 });
    }
    return new NextResponse(JSON.stringify({ error: 'Failed to download backup file.' }), { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = await authenticateRequest(request);

  // Check for rate limiting errors for authenticated users
  if (auth.user) {
    const authError = handleAuthResponse(auth);
    if (authError) return authError;
  }

  if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Track usage for authenticated requests
  await trackUsageByAuthMethod(request, auth, 200);

  const { filename } = await params;
  // Ensure the filename has the .aes extension for consistency, or handle both .sql and .aes
  const actualFilename = filename.endsWith('.aes') ? filename : `${filename}.aes`;
  const currentFilePath = path.join(backupsDirectory, actualFilename);

  // Basic security check: prevent directory traversal
  if (!currentFilePath.startsWith(backupsDirectory)) {
    return new NextResponse(JSON.stringify({ error: 'Invalid file path.' }), { status: 400 });
  }

  try {
    const body = await request.json();
    const { newFilename } = body;

    if (!newFilename || typeof newFilename !== 'string') {
      return new NextResponse(JSON.stringify({ error: 'New filename is required.' }), { status: 400 });
    }

    // Validate new filename (basic validation)
    if (newFilename.includes('/') || newFilename.includes('\\') || newFilename.includes('..')) {
      return new NextResponse(JSON.stringify({ error: 'Invalid filename.' }), { status: 400 });
    }

    // Ensure the new filename has the correct extension
    const fileExtension = actualFilename.split('.').slice(-2).join('.'); // Get the last two parts (e.g., "sqlite.aes")
    let finalNewFilename = newFilename;
    if (!finalNewFilename.endsWith(`.${fileExtension}`)) {
      // Remove any existing extension and add the correct one
      const baseName = finalNewFilename.replace(/\.[^.]*$/, '').replace(/\.[^.]*$/, ''); // Remove up to two extensions
      finalNewFilename = `${baseName}.${fileExtension}`;
    }

    const newFilePath = path.join(backupsDirectory, finalNewFilename);

    // Check if new file already exists
    try {
      await fs.access(newFilePath);
      return new NextResponse(JSON.stringify({ error: 'A backup with this name already exists.' }), { status: 409 });
    } catch {
      // File doesn't exist, which is what we want
    }

    // Check if current file exists
    try {
      await fs.access(currentFilePath);
    } catch {
      return new NextResponse(JSON.stringify({ error: 'Original backup file not found.' }), { status: 404 });
    }

    // Rename the file
    // Paths are validated against backupsDirectory
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.rename(currentFilePath, newFilePath);

    return new NextResponse(JSON.stringify({
      message: `Backup file renamed successfully.`,
      newFilename: finalNewFilename
    }), { status: 200 });
  } catch (error) {
    logger.error(`Failed to rename backup file ${filename}:`, error);
    return new NextResponse(JSON.stringify({ error: 'Failed to rename backup file.' }), { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await authenticateRequest(request);

  if (!session.user || session.user.role !== Role.SUPER_ADMIN) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Track usage for authenticated requests
  await trackUsageByAuthMethod(request, session, 200);

  const { filename } = await params;
  // Ensure the filename has the .aes extension for consistency, or handle both .sql and .aes
  const actualFilename = filename.endsWith('.aes') ? filename : `${filename}.aes`;
  const filePath = path.join(backupsDirectory, actualFilename);

  // Basic security check: prevent directory traversal
  if (!filePath.startsWith(backupsDirectory)) {
    return new NextResponse(JSON.stringify({ error: 'Invalid file path.' }), { status: 400 });
  }

  try {
    // Path is validated against backupsDirectory
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.unlink(filePath);
    return new NextResponse(JSON.stringify({ message: `Backup file ${filename} deleted successfully.` }), { status: 200 });
  } catch (error) {
    logger.error(`Failed to delete backup file ${filename}:`, error);
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse(JSON.stringify({ error: 'File not found.' }), { status: 404 });
    }
    return new NextResponse(JSON.stringify({ error: 'Failed to delete backup file.' }), { status: 500 });
  }
}