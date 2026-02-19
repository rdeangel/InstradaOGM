// src/lib/server/service-initializer.ts
import 'server-only';
import { logger } from '@/lib/logger';
import { usageAggregationService } from '@/lib/usage-aggregation-service';
import { macTrackingService } from '@/lib/mac-tracking-service';
import { logsAnalyticsCleanupService } from '@/lib/logs-analytics-cleanup-service';
import { updateCheckService } from '@/lib/update-check-service';
import { scheduleExecutionService } from '@/lib/schedule-execution-service';
import { prisma } from '@/lib/prisma';

let servicesInitialized = false;

/**
 * Initialize background services for the application
 * This should be called once when the application starts
 */
export async function initializeServices(): Promise<void> {
  if (servicesInitialized) {
    logger.debug('Services already initialized, skipping');
    return;
  }

  try {
    logger.info('Initializing background services...');

    // Fetch global settings once
    const settings = await prisma.globalSettings.findFirst();

    // Start the usage aggregation service if enabled
    if (settings?.enableAdvancedAnalytics) {
      // Run every 30 minutes to keep data fresh
      usageAggregationService.start(30);
      logger.info('Usage aggregation service started (30 min interval)');
    } else {
      logger.info('Usage aggregation service skipped (disabled in settings)');
    }

    // Start MAC tracking service if enabled
    if (settings?.enableMacTracking) {
      const interval = settings.macTrackingInterval || 5;
      macTrackingService.start(interval);
      logger.info(`MAC tracking service started with ${interval} minute interval`);
    }

    // Start logs and analytics cleanup service (always enabled)
    logsAnalyticsCleanupService.start();
    logger.info('Logs and analytics cleanup service started');

    // Start update check service (always enabled for SUPER_ADMIN visibility)
    await updateCheckService.start();
    logger.info('Update check service started');

    // Start schedule execution service (always enabled)
    scheduleExecutionService.start();
    logger.info('Schedule execution service started');

    logger.info('Background services initialized successfully');
    servicesInitialized = true;
  } catch (error) {
    logger.error('Failed to initialize background services:', error);
    // Don't throw - we don't want to prevent the app from starting
    // if background services fail to initialize
  }
}

/**
 * Shutdown background services gracefully
 */
export async function shutdownServices(): Promise<void> {
  if (!servicesInitialized) {
    return;
  }

  try {
    logger.info('Shutting down background services...');

    // Stop the usage aggregation service
    usageAggregationService.stop();

    // Stop the MAC tracking service
    macTrackingService.stop();

    // Stop the logs and analytics cleanup service
    logsAnalyticsCleanupService.stop();

    // Stop the update check service
    updateCheckService.stop();

    // Stop the schedule execution service
    scheduleExecutionService.stop();

    logger.info('Background services shut down successfully');
    servicesInitialized = false;
  } catch (error) {
    logger.error('Error shutting down background services:', error);
  }
}

/**
 * Get the status of background services
 */
export function getServicesStatus(): {
  initialized: boolean;
  usageAggregation: { isRunning: boolean; intervalId: number | null };
  macTracking: { isRunning: boolean; intervalId: number | null; lastScanTime: Date | null };
  logsAnalyticsCleanup: { isRunning: boolean; cleanupTimeoutId: NodeJS.Timeout | null; cleanupIntervalId: NodeJS.Timeout | null };
  updateCheck: { isRunning: boolean; intervalId: NodeJS.Timeout | null; lastChecked: Date | null; hasUpdate: boolean };
  scheduleExecution: { isRunning: boolean; precisionTimerId: NodeJS.Timeout | null; reconciliationIntervalId: NodeJS.Timeout | null; nextBoundaryAt: Date | null; lastExecutedAt: Date | null };
} {
  return {
    initialized: servicesInitialized,
    usageAggregation: usageAggregationService.getStatus(),
    macTracking: macTrackingService.getStatus(),
    logsAnalyticsCleanup: logsAnalyticsCleanupService.getStatus(),
    updateCheck: updateCheckService.getStatus(),
    scheduleExecution: scheduleExecutionService.getStatus(),
  };
}
