// src/lib/logs-analytics-cleanup-service.ts
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Service for automated cleanup of logs and analytics data
 * Mirrors the MAC Address Tracking cleanup architecture
 */
class LogsAnalyticsCleanupService {
  private isRunning: boolean = false;
  private cleanupTimeoutId: NodeJS.Timeout | null = null;
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  /**
   * Start the automated cleanup service
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Logs and analytics cleanup service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting logs and analytics cleanup service');

    // Schedule automatic cleanup
    this.scheduleAutomaticCleanup();
  }

  /**
   * Stop the automated cleanup service
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.cleanupTimeoutId) {
      clearTimeout(this.cleanupTimeoutId);
      this.cleanupTimeoutId = null;
    }
    
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    
    logger.info('Logs and analytics cleanup service stopped');
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean;
    cleanupTimeoutId: NodeJS.Timeout | null;
    cleanupIntervalId: NodeJS.Timeout | null;
  } {
    return {
      isRunning: this.isRunning,
      cleanupTimeoutId: this.cleanupTimeoutId,
      cleanupIntervalId: this.cleanupIntervalId,
    };
  }

  /**
   * Clean up old logs and analytics data based on retention policy
   */
  async cleanupOldData(retentionDays: number = 90): Promise<{
    logsDeleted: number;
    analyticsDeleted: {
      apiKeyUsageEvents: number;
      apiKeyUsageStats: number;
      sessionUsageEvents: number;
      sessionUsageStats: number;
    };
    totalDeleted: number;
  }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      logger.info(`Starting logs and analytics cleanup with cutoff date: ${cutoffDate.toISOString()}`);

      // Perform cleanup in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Clean up audit logs
        const logsResult = await tx.auditLog.deleteMany({
          where: {
            timestamp: { lt: cutoffDate }
          }
        });

        // Clean up analytics data
        const apiKeyEventsResult = await tx.apiKeyUsageEvent.deleteMany({
          where: {
            timestamp: { lt: cutoffDate }
          }
        });

        const apiKeyStatsResult = await tx.apiKeyUsageStats.deleteMany({
          where: {
            date: { lt: cutoffDate }
          }
        });

        const sessionEventsResult = await tx.sessionUsageEvent.deleteMany({
          where: {
            timestamp: { lt: cutoffDate }
          }
        });

        const sessionStatsResult = await tx.sessionUsageStats.deleteMany({
          where: {
            date: { lt: cutoffDate }
          }
        });

        return {
          logsDeleted: logsResult.count,
          analyticsDeleted: {
            apiKeyUsageEvents: apiKeyEventsResult.count,
            apiKeyUsageStats: apiKeyStatsResult.count,
            sessionUsageEvents: sessionEventsResult.count,
            sessionUsageStats: sessionStatsResult.count,
          }
        };
      });

      const totalAnalyticsDeleted = 
        result.analyticsDeleted.apiKeyUsageEvents +
        result.analyticsDeleted.apiKeyUsageStats +
        result.analyticsDeleted.sessionUsageEvents +
        result.analyticsDeleted.sessionUsageStats;

      const totalDeleted = result.logsDeleted + totalAnalyticsDeleted;

      logger.info(`Cleaned up ${result.logsDeleted} audit logs and ${totalAnalyticsDeleted} analytics records (${totalDeleted} total) older than ${retentionDays} days`);
      
      return {
        ...result,
        totalDeleted
      };
    } catch (error) {
      logger.error('Failed to clean up old logs and analytics data:', error);
      throw error;
    }
  }

  /**
   * Schedule automatic cleanup based on settings
   * Runs daily at 2 AM (same as MAC tracking cleanup)
   */
  private scheduleAutomaticCleanup(): void {
    // Run cleanup daily at 2 AM
    const now = new Date();
    const tomorrow2AM = new Date(now);
    tomorrow2AM.setDate(tomorrow2AM.getDate() + 1);
    tomorrow2AM.setHours(2, 0, 0, 0);

    const msUntil2AM = tomorrow2AM.getTime() - now.getTime();

    this.cleanupTimeoutId = setTimeout(() => {
      this.runAutomaticCleanup();
      // Then schedule it to run every 24 hours
      this.cleanupIntervalId = setInterval(() => {
        this.runAutomaticCleanup();
      }, 24 * 60 * 60 * 1000);
    }, msUntil2AM);

    logger.info(`Automatic logs and analytics cleanup scheduled for ${tomorrow2AM.toLocaleString()}`);
  }

  /**
   * Run automatic cleanup using settings
   */
  private async runAutomaticCleanup(): Promise<void> {
    try {
      const settings = await prisma.globalSettings.findFirst();
      if (!settings) {
        logger.warn('No global settings found, skipping automatic cleanup');
        return;
      }

      const retentionDays = settings.logsAnalyticsRetentionDays || 90;
      const result = await this.cleanupOldData(retentionDays);

      if (result.totalDeleted > 0) {
        logger.info(`Automatic logs and analytics cleanup completed: ${result.totalDeleted} records removed (${result.logsDeleted} logs, ${result.totalDeleted - result.logsDeleted} analytics)`);
      } else {
        logger.debug('Automatic logs and analytics cleanup completed: no old records found');
      }
    } catch (error) {
      logger.error('Automatic logs and analytics cleanup failed:', error);
    }
  }
}

export const logsAnalyticsCleanupService = new LogsAnalyticsCleanupService();
