'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// Hash-based optimization removed - using simplified approach

interface UIConfig {
  groupTypesEnabled: boolean;
  selfServiceMultiSelectEnabled: boolean;
  assignmentMode: 'smart' | 'moveOnly';
  selfServiceEnabled: boolean;
  registrationEnabled: boolean;
  selfServiceRenamingEnabled: boolean;
  deviceManagementRenamingEnabled: boolean;
  macTrackingEnabled: boolean;
  groupTypeConfig: {
    showTypeIndicators: boolean;
    singleSelectLabel: string;
    multiSelectLabel: string;
    singleSelectIcon: string;
    multiSelectIcon: string;
  };
}

interface SecureUIContextType extends UIConfig {
  isLoading: boolean;
  refreshConfig: () => Promise<void>;
}

const SecureUIContext = createContext<SecureUIContextType | undefined>(undefined);

interface SecureUIProviderProps {
  children: ReactNode;
}

export function SecureUIProvider({ children }: SecureUIProviderProps) {
  const [config, setConfig] = useState<UIConfig>({
    groupTypesEnabled: false,
    selfServiceMultiSelectEnabled: true,
    assignmentMode: 'moveOnly',
    selfServiceEnabled: false,
    registrationEnabled: false,
    selfServiceRenamingEnabled: false,
    deviceManagementRenamingEnabled: false,
    macTrackingEnabled: false,
    groupTypeConfig: {
      showTypeIndicators: false,
      singleSelectLabel: 'Primary Group',
      multiSelectLabel: 'Additional Groups',
      singleSelectIcon: 'dot',
      multiSelectIcon: 'dots'
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = async () => {
    try {
      // For unauthenticated users, we need full IP-based validation, not lightweight
      // For authenticated users, lightweight is fine for basic UI config
      const url = `/api/ui/config?lightweight=true`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch UI configuration');
      }
      const data = await response.json();

      // Hash-based optimization removed - no client-side caching needed

      setConfig(data);

      // Log optimization info for debugging
      if (data.skipExpensiveCheck !== undefined) {
        console.debug(`[SecureUI] Permission check optimization: ${data.skipExpensiveCheck ? 'skipped expensive check' : 'performed full check'}`);
      }
    } catch (error) {
      console.error('Failed to fetch UI configuration:', error);
      // Keep default values on error
    } finally {
      setIsLoading(false);
    }
  };

  const refreshConfig = async () => {
    setIsLoading(true);
    await fetchConfig();
  };

  useEffect(() => {
    fetchConfig();

    // Add listeners to refresh config when user switches back to tab or page becomes visible
    const handleFocus = () => {
      setTimeout(() => {
        fetchConfig();
      }, 100);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(() => {
          fetchConfig();
        }, 100);
      }
    };

    // Listen for localStorage changes (when settings are saved in admin panel)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'uiConfigChanged') {
        fetchConfig();
      }
    };

    // Listen for custom storage events (for same-tab communication)
    const handleCustomStorageChange = () => {
      fetchConfig();
    };

    // Periodic polling to catch config changes (every 30 seconds when page is visible)
    const pollInterval = setInterval(() => {
      if (!document.hidden) {
        fetchConfig();
      }
    }, 30000); // 30 seconds

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('uiConfigChanged', handleCustomStorageChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('uiConfigChanged', handleCustomStorageChange);
      clearInterval(pollInterval);
    };
  }, []);

  const contextValue: SecureUIContextType = {
    ...config,
    isLoading,
    refreshConfig,
  };

  return (
    <SecureUIContext.Provider value={contextValue}>
      {children}
    </SecureUIContext.Provider>
  );
}

export function useSecureUI() {
  const context = useContext(SecureUIContext);
  if (context === undefined) {
    throw new Error('useSecureUI must be used within a SecureUIProvider');
  }
  return context;
}

// Backward compatibility hook that maps to the old GroupType interface
export function useGroupType() {
  const secureUI = useSecureUI();
  
  return {
    enableGroupTypes: secureUI.groupTypesEnabled,
    enableSelfServiceMultiSelect: secureUI.selfServiceMultiSelectEnabled,
    singleSelectName: secureUI.groupTypeConfig.singleSelectLabel,
    multiSelectName: secureUI.groupTypeConfig.multiSelectLabel,
    singleSelectIcon: secureUI.groupTypeConfig.singleSelectIcon,
    multiSelectIcon: secureUI.groupTypeConfig.multiSelectIcon,
    isLoading: secureUI.isLoading,
    refreshSettings: secureUI.refreshConfig,
  };
}
