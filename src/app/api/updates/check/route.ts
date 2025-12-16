import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { updateCheckService } from '@/lib/update-check-service';
import { logger } from '@/lib/logger';

/**
 * GET /api/updates/check
 * 
 * Manually trigger an update check from GitHub releases.
 * This should only be called when explicitly requested by the user
 * (e.g., clicking "Check for Updates" button).
 * 
 * Access: SUPER_ADMIN only
 * 
 * Returns:
 * - updateAvailable: boolean - Whether a newer version is available
 * - currentVersion: string - Current application version
 * - latestVersion: string - Latest available version on GitHub
 * - releaseUrl: string - URL to the GitHub release page
 * - releaseNotes: string - Release notes/changelog
 * - publishedAt: string - ISO timestamp of release publication
 */
export async function GET(request: Request) {
  return authenticateAndTrackRequest(request, async (auth) => {
    // Restrict access to SUPER_ADMIN only
    if (!auth.user || auth.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized'
        },
        { status: 403 }
      );
    }

    try {
      logger.info('Manual update check requested by user:', auth.user.email);

      // Trigger a manual update check with force refresh to bypass cache
      await updateCheckService.performUpdateCheck(true);

      // Get the fresh result
      const updateInfo = updateCheckService.getCachedResult();

      if (!updateInfo) {
        throw new Error('Update check failed to produce a result');
      }

      if (updateInfo.error) {
        logger.warn(`Update check completed with error: ${updateInfo.error}`);
      } else if (updateInfo.updateAvailable) {
        logger.info(`Update available: ${updateInfo.latestVersion} (current: ${updateInfo.currentVersion})`);
      } else {
        logger.debug(`No updates available. Current version ${updateInfo.currentVersion} is up to date.`);
      }

      return NextResponse.json({
        success: true,
        data: updateInfo,
      });
    } catch (error) {
      logger.error('Error in update check endpoint:', error);
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to check for updates',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  });
}

