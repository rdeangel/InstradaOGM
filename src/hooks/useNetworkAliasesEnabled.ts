'use client';

import { useState, useEffect, useCallback } from 'react';
import { globalSettingsEvents } from '@/lib/events/globalSettingsEvents';
import { logger } from '@/lib/logger';

interface NetworkAliasesEnabledHook {
  manageNetworkAliasesEnabled: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useNetworkAliasesEnabled(): NetworkAliasesEnabledHook {
  const [manageNetworkAliasesEnabled, setManageNetworkAliasesEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSetting = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/global-full', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setManageNetworkAliasesEnabled(data.manageNetworkAliasesEnabled ?? false);
    } catch (error) {
      logger.error('[useNetworkAliasesEnabled] fetch error:', error);
      setManageNetworkAliasesEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetting();
    const unsubscribe = globalSettingsEvents.subscribe(() => { fetchSetting(); });
    return unsubscribe;
  }, [fetchSetting]);

  return { manageNetworkAliasesEnabled, isLoading, refresh: fetchSetting };
}
