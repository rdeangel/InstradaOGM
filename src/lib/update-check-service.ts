// src/lib/update-check-service.ts
import { logger } from '@/lib/logger';
import { checkForUpdates } from '@/lib/version-utils';

interface UpdateCheckResult {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseUrl?: string;
    releaseNotes?: string;
    publishedAt?: string;
    versionsSkipped?: number;
    error?: string;
    errorType?: 'not_found' | 'network' | 'unknown';
    lastChecked: Date;
}

class UpdateCheckService {
    private intervalId: NodeJS.Timeout | null = null;
    private cachedResult: UpdateCheckResult | null = null;
    private isRunning = false;
    private readonly CHECK_INTERVAL_HOURS = 6;

    /**
     * Start the update check service
     * Performs an immediate check and then checks every 6 hours
     * Can be disabled via AUTO_UPDATE_CHECK environment variable
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.debug('Update check service already running');
            return;
        }

        // Check if update checking is enabled
        // Handle both quoted and unquoted values: false, "false", 0, etc.
        const rawValue = process.env.AUTO_UPDATE_CHECK;
        logger.info(`[UPDATE CHECK] Raw AUTO_UPDATE_CHECK value: "${rawValue}"`);

        const envValue = rawValue?.toLowerCase().replace(/['"]/g, '');
        logger.info(`[UPDATE CHECK] Processed value: "${envValue}"`);

        const updateCheckEnabled = envValue !== 'false' && envValue !== '0';
        logger.info(`[UPDATE CHECK] Update check enabled: ${updateCheckEnabled}`);

        if (!updateCheckEnabled) {
            logger.info('Update check service is disabled via AUTO_UPDATE_CHECK environment variable');
            this.isRunning = false;
            return;
        }

        logger.info('Starting update check service...');
        this.isRunning = true;

        // Perform initial check
        await this.performUpdateCheck();

        // Schedule periodic checks every 6 hours
        const intervalMs = this.CHECK_INTERVAL_HOURS * 60 * 60 * 1000;
        this.intervalId = setInterval(async () => {
            await this.performUpdateCheck();
        }, intervalMs);

        logger.info(`Update check service started (checking every ${this.CHECK_INTERVAL_HOURS} hours)`);
    }

    /**
     * Stop the update check service
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        logger.info('Update check service stopped');
    }

    /**
     * Perform an update check and cache the result
     * @param forceRefresh - If true, bypass cache and fetch fresh data from GitHub
     */
    async performUpdateCheck(forceRefresh = false): Promise<void> {
        try {
            const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
            logger.info(`Checking for updates (current version: ${currentVersion})${forceRefresh ? ' [FORCE REFRESH]' : ''}...`);

            const result = await checkForUpdates(currentVersion, forceRefresh);

            this.cachedResult = {
                ...result,
                lastChecked: new Date(),
            };

            if (result.updateAvailable) {
                logger.info(`Update available: ${result.latestVersion} (current: ${currentVersion})`);
            } else if (result.error) {
                logger.warn(`Update check completed with error: ${result.error}`);
            } else {
                logger.info(`No updates available. Current version ${currentVersion} is up to date.`);
            }
        } catch (error) {
            logger.error('Error performing update check:', error);
            // Cache the error result
            this.cachedResult = {
                updateAvailable: false,
                currentVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
                latestVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
                error: error instanceof Error ? error.message : 'Unknown error during update check',
                errorType: 'unknown',
                lastChecked: new Date(),
            };
        }
    }

    /**
     * Get the cached update check result
     * Returns null if no check has been performed yet
     */
    getCachedResult(): UpdateCheckResult | null {
        return this.cachedResult;
    }

    /**
     * Check if update checking is enabled
     */
    isEnabled(): boolean {
        const envValue = process.env.AUTO_UPDATE_CHECK?.toLowerCase().replace(/['"]/g, '');
        return envValue !== 'false' && envValue !== '0';
    }

    /**
     * Get the service status
     */
    getStatus(): {
        isRunning: boolean;
        intervalId: NodeJS.Timeout | null;
        lastChecked: Date | null;
        hasUpdate: boolean;
    } {
        return {
            isRunning: this.isRunning,
            intervalId: this.intervalId,
            lastChecked: this.cachedResult?.lastChecked || null,
            hasUpdate: this.cachedResult?.updateAvailable || false,
        };
    }
}

// Export a singleton instance
export const updateCheckService = new UpdateCheckService();
