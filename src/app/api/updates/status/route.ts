import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { Role } from '@/types/opnsense';
import { updateCheckService } from '@/lib/update-check-service';
import { logger } from '@/lib/logger';

/**
 * GET /api/updates/status
 * 
 * Get the cached update check status without triggering a new GitHub API call.
 * This endpoint returns the result from the last automatic check.
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
 * - lastChecked: string - ISO timestamp of when the check was performed
 * - autoUpdateEnabled: boolean - Whether automatic update checks are enabled (AUTO_UPDATE_CHECK env var)
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
            // Get cached result from the update check service
            const cachedResult = updateCheckService.getCachedResult();

            if (!cachedResult) {
                // Check if auto-update is enabled before triggering a check
                if (!updateCheckService.isEnabled()) {
                    // Auto-update is disabled, return a message indicating this
                    logger.info('Update check requested but AUTO_UPDATE_CHECK is disabled');
                    return NextResponse.json({
                        success: true,
                        data: {
                            updateAvailable: false,
                            currentVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
                            latestVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
                            lastChecked: new Date().toISOString(),
                            autoUpdateEnabled: false,
                            message: 'Automatic update checks are disabled. Use the manual check button to check for updates.',
                        },
                    });
                }

                // No check has been performed yet - trigger one now and wait for it
                logger.info('No cached update check result - performing immediate check');
                await updateCheckService.performUpdateCheck();
                const freshResult = updateCheckService.getCachedResult();

                if (!freshResult) {
                    // Still no result - something went wrong
                    logger.warn('Update check failed to produce a result');
                    return NextResponse.json({
                        success: true,
                        data: {
                            updateAvailable: false,
                            currentVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
                            latestVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
                            lastChecked: new Date().toISOString(),
                            autoUpdateEnabled: updateCheckService.isEnabled(),
                            error: 'Update check failed',
                        },
                    });
                }

                return NextResponse.json({
                    success: true,
                    data: {
                        ...freshResult,
                        autoUpdateEnabled: updateCheckService.isEnabled(),
                    },
                });
            }

            logger.debug('Returning cached update check result:', {
                updateAvailable: cachedResult.updateAvailable,
                lastChecked: cachedResult.lastChecked,
            });

            return NextResponse.json({
                success: true,
                data: {
                    ...cachedResult,
                    autoUpdateEnabled: updateCheckService.isEnabled(),
                },
            });
        } catch (error) {
            logger.error('Error in update status endpoint:', error);
            return NextResponse.json(
                {
                    success: false,
                    message: 'Failed to get update status',
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                { status: 500 }
            );
        }
    });
}
