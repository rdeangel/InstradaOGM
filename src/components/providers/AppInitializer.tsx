'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

/**
 * Component that initializes the application services on startup
 * This should be included in the root layout to ensure services start automatically
 */
export function AppInitializer() {
  useEffect(() => {
    const initializeApp = async () => {
      try {
        logger.debug('Triggering application initialization...');

        const response = await fetch('/api/system/initialize', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const result = await response.json();
          logger.info('Application initialization completed:', result.message);
        } else {
          logger.warn('Application initialization request failed:', response.status);
        }
      } catch (error) {
        logger.error('Failed to trigger application initialization:', error);
        // Don't throw - we don't want to break the UI if initialization fails
      }
    };

    // Initialize on component mount (app startup)
    initializeApp();
  }, []);

  // This component doesn't render anything
  return null;
}
