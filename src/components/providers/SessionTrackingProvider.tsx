'use client';

import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { useSessionTracking } from '@/hooks/use-session-tracking';
import { logger } from '@/lib/logger';

interface SessionTrackingContextType {
  trackEvent: (eventData: Record<string, unknown>) => void;
  flush: () => void;
}

const SessionTrackingContext = createContext<SessionTrackingContextType | null>(null);

interface SessionTrackingProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export function SessionTrackingProvider({
  children,
  enabled = true
}: SessionTrackingProviderProps) {
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check if advanced analytics is enabled on mount
  useEffect(() => {
    const checkAnalyticsEnabled = async () => {
      try {
        const response = await fetch('/api/settings/analytics-enabled');
        if (response.ok) {
          const data = await response.json();
          setAnalyticsEnabled(data.enableAdvancedAnalytics || false);
        } else {
          setAnalyticsEnabled(false); // Default to disabled on error
        }
      } catch (error) {
        logger.error('Failed to check analytics setting:', error);
        setAnalyticsEnabled(false); // Default to disabled on error
      } finally {
        setIsLoading(false);
      }
    };

    checkAnalyticsEnabled();

    // Listen for advanced analytics setting changes
    const handleAdvancedAnalyticsChange = () => {
      checkAnalyticsEnabled();
    };

    window.addEventListener('advancedAnalyticsSettingsChanged', handleAdvancedAnalyticsChange);

    return () => {
      window.removeEventListener('advancedAnalyticsSettingsChanged', handleAdvancedAnalyticsChange);
    };
  }, []);

  const shouldTrack = enabled && analyticsEnabled && !isLoading;

  const tracking = useSessionTracking({
    trackPageViews: shouldTrack,
    trackClicks: shouldTrack,
    trackFormSubmits: shouldTrack,
    trackApiCalls: shouldTrack, // Disable API call tracking when analytics is disabled
    debounceMs: 2000, // 2 second debounce for better performance
  });

  // If tracking is disabled, provide no-op functions
  const contextValue: SessionTrackingContextType = shouldTrack
    ? tracking
    : {
        trackEvent: () => {},
        flush: () => {},
      };

  return (
    <SessionTrackingContext.Provider value={contextValue}>
      {children}
    </SessionTrackingContext.Provider>
  );
}

export function useSessionTrackingContext() {
  const context = useContext(SessionTrackingContext);
  if (!context) {
    throw new Error('useSessionTrackingContext must be used within a SessionTrackingProvider');
  }
  return context;
}

// Optional hook for manual event tracking
export function useTrackEvent() {
  const { trackEvent } = useSessionTrackingContext();
  
  return {
    trackApiCall: (endpoint: string, method: string, statusCode?: number, responseTime?: number) => {
      trackEvent({
        actionType: 'api_call',
        endpoint,
        method,
        statusCode,
        responseTime,
      });
    },
    
    trackNavigation: (to: string, from?: string) => {
      trackEvent({
        actionType: 'navigation',
        endpoint: to,
        method: 'NAVIGATE',
        metadata: {
          from,
          to,
        },
      });
    },
    
    trackCustomEvent: (eventType: string, data: Record<string, unknown>) => {
      trackEvent({
        actionType: eventType,
        endpoint: window.location.pathname,
        method: 'CUSTOM',
        metadata: data,
      });
    },
  };
}
