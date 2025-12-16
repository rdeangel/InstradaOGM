// src/lib/server/app-initializer.ts
import 'server-only';
import { logger } from '@/lib/logger';
import { initializeServices, shutdownServices } from './service-initializer';

let appInitialized = false;

/**
 * Initialize the application and all its services
 * This should be called once when the application starts
 */
export async function initializeApp(): Promise<void> {
  if (appInitialized) {
    logger.debug('Application already initialized, skipping');
    return;
  }

  try {
    logger.info('Initializing InstradaOGM application...');

    // Initialize background services
    await initializeServices();

    logger.info('Application initialization completed successfully');
    appInitialized = true;
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    // Don't throw - we don't want to prevent the app from starting
  }
}

/**
 * Shutdown the application gracefully
 */
export async function shutdownApp(): Promise<void> {
  if (!appInitialized) {
    return;
  }

  try {
    logger.info('Shutting down InstradaOGM application...');

    // Shutdown background services
    await shutdownServices();

    logger.info('Application shutdown completed successfully');
    appInitialized = false;
  } catch (error) {
    logger.error('Error during application shutdown:', error);
  }
}

/**
 * Get application initialization status
 */
export function getAppStatus(): { initialized: boolean } {
  return { initialized: appInitialized };
}

// Handle process signals for graceful shutdown
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await shutdownApp();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await shutdownApp();
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception:', error);
    await shutdownApp();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    await shutdownApp();
    process.exit(1);
  });
}
