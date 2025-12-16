'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { globalSettingsEvents } from '@/lib/events/globalSettingsEvents';
// Hash-based optimization removed - using simplified approach

export interface UIConfig {
  selfServiceEnabled: boolean;
  subtitleEnabled: boolean;
  subtitleText: string | null;
  loginPageSubtitleEnabled: boolean;
}

interface UIConfigContextType {
  uiConfig: UIConfig;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const UIConfigContext = createContext<UIConfigContextType | undefined>(undefined);

interface UIConfigProviderProps {
  children: ReactNode;
  initialConfig?: UIConfig;
}

export function UIConfigProvider({ children, initialConfig }: UIConfigProviderProps) {
  const [uiConfig, setUIConfig] = useState<UIConfig>(
    initialConfig || {
      selfServiceEnabled: true,
      subtitleEnabled: false,
      subtitleText: null,
      loginPageSubtitleEnabled: false,
    }
  );
  const [isLoading, setIsLoading] = useState(!initialConfig);

  const fetchUIConfig = useCallback(async () => {
    try {
      if (!initialConfig) {
        setIsLoading(true);
      }

      // Lightweight API call for basic UI config (no device scope validation)
      const url = `/api/ui/config?lightweight=true`;

      const response = await fetch(url, {
        cache: 'no-store',
        priority: 'high'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch UI configuration');
      }

      const data = await response.json();

      // Hash-based optimization removed - no client-side caching needed

      const newConfig: UIConfig = {
        selfServiceEnabled: data.selfServiceEnabled ?? true,
        subtitleEnabled: data.subtitleEnabled ?? false,
        subtitleText: data.subtitleText ?? null,
        loginPageSubtitleEnabled: data.loginPageSubtitleEnabled ?? false,
      };

      setUIConfig(newConfig);

      // Log optimization info for debugging
      if (data.skipExpensiveCheck !== undefined) {
        console.debug(`[UIConfig] Permission check optimization: ${data.skipExpensiveCheck ? 'skipped expensive check' : 'performed full check'}`);
      }
    } catch (error) {
      console.error('Error fetching UI config:', error);
      // Keep existing config on error, don't reset to defaults
    } finally {
      setIsLoading(false);
    }
  }, [initialConfig]);

  const refresh = async () => {
    await fetchUIConfig();
  };

  useEffect(() => {
    // Only fetch if we don't have initial config
    if (!initialConfig) {
      fetchUIConfig();
    }

    // Subscribe to global settings events for real-time updates
    const unsubscribe = globalSettingsEvents.subscribe(() => {
      fetchUIConfig();
    });

    return unsubscribe;
  }, [initialConfig, fetchUIConfig]);

  return (
    <UIConfigContext.Provider value={{ uiConfig, isLoading, refresh }}>
      {children}
    </UIConfigContext.Provider>
  );
}

export function useUIConfig(): UIConfigContextType {
  const context = useContext(UIConfigContext);
  if (context === undefined) {
    throw new Error('useUIConfig must be used within a UIConfigProvider');
  }
  return context;
}
