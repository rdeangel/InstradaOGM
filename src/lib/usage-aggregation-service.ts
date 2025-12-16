import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { updateDailyAggregation } from './api-usage-tracker';
import {
  getServiceState,
  setServiceState,
  clearServiceState,
  updateServiceActivity
} from '@/lib/server/service-state-manager';

export interface AggregationJobResult {
  processedApiKeys: number;
  processedDates: number;
  errors: number;
  duration: number;
}

/**
 * Background service to aggregate API usage data
 */
export class UsageAggregationService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the aggregation service with specified interval
   */
  start(intervalMinutes: number = 60): void {
    // Check if already running (in this worker or another)
    const existingState = getServiceState('usage-aggregation');
    if (existingState?.isRunning) {
      logger.info('Usage aggregation service already running in another worker or instance');
      return;
    }

    if (this.isRunning) {
      logger.warn('Usage aggregation service is already running in this worker');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting usage aggregation service with ${intervalMinutes} minute interval`);

    // Write state to file system for cross-worker coordination
    setServiceState('usage-aggregation', {
      isRunning: true,
      startedAt: new Date().toISOString(),
      workerPid: process.pid,
      intervalMinutes
    });

    // Run immediately on start
    this.runAggregation().catch(error => {
      logger.error('Initial aggregation run failed:', error);
    });

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      // Check if service should still be running
      const state = getServiceState('usage-aggregation');

      if (!state || !state.isRunning) {
        logger.info('Detected service stop signal from another worker. Stopping local usage aggregation interval.');
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
        this.isRunning = false;
        return;
      }

      this.runAggregation().catch(error => {
        logger.error('Scheduled aggregation run failed:', error);
      });
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the aggregation service
   */
  stop(): void {
    // ALWAYS clear state file first to signal all workers
    clearServiceState('usage-aggregation');

    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Usage aggregation service stopped');
  }

  /**
   * Run a single aggregation cycle
   */
  async runAggregation(): Promise<AggregationJobResult> {
    const startTime = Date.now();
    let processedApiKeys = 0;
    let processedDates = 0;
    let errors = 0;

    try {
      logger.info('Starting usage data aggregation');

      // Get all API keys that have usage events
      const apiKeysWithEvents = await prisma.apiKeyUsageEvent.findMany({
        select: {
          apiKeyId: true,
          timestamp: true,
        },
        distinct: ['apiKeyId'],
        orderBy: {
          timestamp: 'desc',
        },
      });

      logger.info(`Found ${apiKeysWithEvents.length} API keys with usage events`);

      // Process each API key
      for (const { apiKeyId } of apiKeysWithEvents) {
        try {
          const dates = await this.getUnprocessedDates(apiKeyId);

          for (const date of dates) {
            try {
              await updateDailyAggregation(apiKeyId, date);
              processedDates++;
            } catch (error) {
              logger.error(`Failed to aggregate data for API key ${apiKeyId} on ${date.toISOString()}:`, error);
              errors++;
            }
          }

          processedApiKeys++;
        } catch (error) {
          logger.error(`Failed to process API key ${apiKeyId}:`, error);
          errors++;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Aggregation completed: ${processedApiKeys} API keys, ${processedDates} dates, ${errors} errors in ${duration}ms`);

      return {
        processedApiKeys,
        processedDates,
        errors,
        duration,
      };
    } catch (error) {
      logger.error('Aggregation job failed:', error);
      throw error;
    } finally {
      // Update activity timestamp in state file
      if (this.isRunning) {
        updateServiceActivity('usage-aggregation');
      }
    }
  }

  /**
   * Get dates that need aggregation for an API key
   */
  private async getUnprocessedDates(apiKeyId: string): Promise<Date[]> {
    try {
      // Get the date range of events for this API key
      const eventRange = await prisma.apiKeyUsageEvent.aggregate({
        where: { apiKeyId },
        _min: { timestamp: true },
        _max: { timestamp: true },
      });

      if (!eventRange._min.timestamp || !eventRange._max.timestamp) {
        return [];
      }

      // Get existing aggregated dates
      const existingStats = await prisma.apiKeyUsageStats.findMany({
        where: { apiKeyId },
        select: { date: true },
      });

      const existingDates = new Set(
        existingStats.map((stat: { date: Date }) => stat.date.toISOString().split('T')[0])
      );

      // Generate list of dates that need processing
      const dates: Date[] = [];
      const startDate = new Date(eventRange._min.timestamp);
      const endDate = new Date(eventRange._max.timestamp);

      // Normalize to start of day
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split('T')[0];

        // Only process dates that don't have recent aggregations
        if (!existingDates.has(dateKey) || this.shouldReprocess(currentDate)) {
          dates.push(new Date(currentDate));
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return dates;
    } catch (error) {
      logger.error(`Failed to get unprocessed dates for API key ${apiKeyId}:`, error);
      return [];
    }
  }

  /**
   * Determine if a date should be reprocessed (e.g., if it's recent)
   */
  private shouldReprocess(date: Date): boolean {
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    // Reprocess data from the last 2 days to catch late-arriving events
    return daysDiff <= 2;
  }

  /**
   * Manual aggregation for a specific API key and date range
   */
  async aggregateApiKeyDateRange(
    apiKeyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    try {
      logger.info(`Manual aggregation for API key ${apiKeyId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      const currentDate = new Date(startDate);
      currentDate.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);

      while (currentDate <= end) {
        await updateDailyAggregation(apiKeyId, new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      logger.info(`Manual aggregation completed for API key ${apiKeyId}`);
    } catch (error) {
      logger.error(`Manual aggregation failed for API key ${apiKeyId}:`, error);
      throw error;
    }
  }

  /**
   * Get aggregation service status
   */
  getStatus(): { isRunning: boolean; intervalId: number | null } {
    // Check shared state from file system
    const state = getServiceState('usage-aggregation');
    return {
      isRunning: state?.isRunning ?? false,
      intervalId: this.intervalId ? Number(this.intervalId) : null,
    };
  }

  /**
   * Clean up old usage events based on retention policy
   */
  async cleanupOldEvents(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await prisma.apiKeyUsageEvent.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      logger.info(`Cleaned up ${result.count} old usage events older than ${retentionDays} days`);
      return result.count;
    } catch (error) {
      logger.error('Failed to clean up old usage events:', error);
      throw error;
    }
  }

  /**
   * Get aggregation statistics
   */
  async getAggregationStats(): Promise<{
    totalEvents: number;
    totalStats: number;
    oldestEvent: Date | null;
    newestEvent: Date | null;
    oldestStat: Date | null;
    newestStat: Date | null;
  }> {
    try {
      const [eventStats, statsStats] = await Promise.all([
        prisma.apiKeyUsageEvent.aggregate({
          _count: { id: true },
          _min: { timestamp: true },
          _max: { timestamp: true },
        }),
        prisma.apiKeyUsageStats.aggregate({
          _count: { id: true },
          _min: { date: true },
          _max: { date: true },
        }),
      ]);

      return {
        totalEvents: eventStats._count.id,
        totalStats: statsStats._count.id,
        oldestEvent: eventStats._min.timestamp,
        newestEvent: eventStats._max.timestamp,
        oldestStat: statsStats._min.date,
        newestStat: statsStats._max.date,
      };
    } catch (error) {
      logger.error('Failed to get aggregation statistics:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const usageAggregationService = new UsageAggregationService();
