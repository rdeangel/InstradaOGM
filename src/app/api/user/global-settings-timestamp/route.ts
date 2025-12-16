import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { authenticateRequest, handleAuthResponse } from '@/lib/auth-middleware';

/**
 * GET /api/user/global-settings-timestamp
 * 
 * Returns the current global settings lastModified timestamp for cache validation.
 * This endpoint is used by the permission caching system to determine if cached
 * permission data should be invalidated due to global settings changes.
 * 
 * Authentication: Required (session or API key)
 * 
 * Response:
 * - 200: { timestamp: string } - ISO timestamp of global settings lastModified
 * - 401: Authentication required
 * - 500: Server error
 */
export async function GET(request: Request) {
  try {
    // Authenticate the request
    const auth = await authenticateRequest(request);

    // Check for rate limiting errors
    if (auth.user) {
      const authError = handleAuthResponse(auth);
      if (authError) return authError;
    }

    if (!auth.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    logger.info(`[global-settings-timestamp] Fetching timestamp for user ${auth.user.id}`);

    // Get the global settings lastModified timestamp
    const globalSettings = await prisma.globalSettings.findFirst({
      select: {
        lastModified: true,
      },
      orderBy: { id: 'asc' },
    });

    if (!globalSettings) {
      // If no global settings exist, return current timestamp
      const currentTimestamp = new Date().toISOString();
      logger.warn(`[global-settings-timestamp] No global settings found, returning current timestamp: ${currentTimestamp}`);
      return NextResponse.json({ timestamp: currentTimestamp });
    }

    const timestamp = globalSettings.lastModified.toISOString();
    logger.info(`[global-settings-timestamp] Returning timestamp: ${timestamp} for user ${auth.user.id}`);

    return NextResponse.json({ timestamp });

  } catch (error) {
    logger.error(`[global-settings-timestamp] Error fetching timestamp:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch global settings timestamp' },
      { status: 500 }
    );
  }
}
