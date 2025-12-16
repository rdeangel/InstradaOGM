import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { getUserGroupTimestamps } from '@/lib/group-permissions-cache';
import { logger } from '@/lib/logger';

/**
 * GET /api/user/group-timestamps
 * 
 * Returns the current permissionsLastModified timestamps for the authenticated user's groups.
 * Used by the client-side caching system to validate cached permission results.
 * 
 * Response format:
 * {
 *   "timestamps": {
 *     "groupId1": "2023-12-01T10:30:00.000Z",
 *     "groupId2": "2023-12-01T11:45:00.000Z"
 *   }
 * }
 */
export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    try {
      if (!auth.user?.id) {
        logger.warn('[group-timestamps] No authenticated user found');
        return NextResponse.json({
          error: 'Authentication required'
        }, { status: 401 });
      }

      const userId = auth.user.id;
      logger.debug(`[group-timestamps] Getting timestamps for user ${userId}`);

      // Get current group timestamps
      const timestamps = await getUserGroupTimestamps(userId);
      
      // Convert Date objects to ISO strings for JSON response
      const timestampsISO: Record<string, string> = {};
      for (const [groupId, timestamp] of Object.entries(timestamps)) {
        // groupId is from Object.entries of timestamps object
        // eslint-disable-next-line security/detect-object-injection
        timestampsISO[groupId] = timestamp.toISOString();
      }

      logger.debug(`[group-timestamps] Returning ${Object.keys(timestampsISO).length} group timestamps for user ${userId}`);

      return NextResponse.json({
        timestamps: timestampsISO
      });

    } catch (error) {
      logger.error('[group-timestamps] Error getting group timestamps:', error);
      return NextResponse.json({
        error: 'Internal server error'
      }, { status: 500 });
    }
  });
}
