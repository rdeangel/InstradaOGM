'use client';

import { useState, useEffect, useCallback } from 'react';
import { globalSettingsEvents } from '@/lib/events/globalSettingsEvents';
import { logger } from '@/lib/logger';

interface GlobalSettingsHook {
  isSelfServiceAllowed: boolean;
  isLoading: boolean;
  subtitleEnabled: boolean;
  subtitleText: string | null;
  refresh: () => Promise<void>;
}

export function useGlobalSettings(): GlobalSettingsHook {
  const [isSelfServiceAllowed, setIsSelfServiceAllowed] = useState(true); // Default to true to avoid hiding navigation initially
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [subtitleText, setSubtitleText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start with true to fetch immediately
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  const fetchGlobalSettings = useCallback(async () => {
    try {
      if (!hasInitialLoad) {
        setIsLoading(true);
      }
      // Use fetch with cache optimization for faster loading
      const response = await fetch('/api/ui/config', {
        cache: 'no-store', // Ensure fresh data but allow browser optimizations
        priority: 'high' // High priority for critical UI data
      });
      if (!response.ok) {
        throw new Error('Failed to fetch UI configuration');
      }
      const data = await response.json();

      // Batch state updates to prevent multiple re-renders
      setIsSelfServiceAllowed(data.selfServiceEnabled ?? true);
      setSubtitleEnabled(data.subtitleEnabled ?? false);
      setSubtitleText(data.subtitleText ?? null);
      setHasInitialLoad(true);
    } catch (error) {
      logger.error("Error fetching global settings:", error);
      setIsSelfServiceAllowed(true); // Default to true on error to avoid hiding navigation
      setSubtitleEnabled(false); // Default to false on error
      setSubtitleText(null); // Default to null on error
      setHasInitialLoad(true);
    } finally {
      setIsLoading(false);
    }
  }, [hasInitialLoad]);

  useEffect(() => {
    // Fetch immediately without delay
    fetchGlobalSettings();

    // Subscribe to global settings events for real-time updates
    const unsubscribe = globalSettingsEvents.subscribe(() => {
      fetchGlobalSettings();
    });

    return unsubscribe;
  }, [fetchGlobalSettings]);

  const refresh = async () => {
    setIsLoading(true);
    await fetchGlobalSettings();
  };

  return {
    isSelfServiceAllowed,
    isLoading,
    subtitleEnabled,
    subtitleText,
    refresh,
  };
}
