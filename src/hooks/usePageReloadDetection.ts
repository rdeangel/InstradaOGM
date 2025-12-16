'use client';

import { useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

interface PageReloadDetectionState {
  isPageReloading: boolean;
  isPageUnloading: boolean;
  shouldSuppressErrors: boolean;
}

/**
 * Hook to detect page reload/unload events and provide utilities to suppress
 * misleading error messages during page transitions.
 *
 * This helps prevent network error messages from appearing when page refreshes
 * interrupt ongoing API requests triggered by focus events.
 */
export function usePageReloadDetection() {
  const [state, setState] = useState<PageReloadDetectionState>({
    isPageReloading: false,
    isPageUnloading: false,
    shouldSuppressErrors: false,
  });

  // Use ref to track state for event handlers to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;



  useEffect(() => {
    let beforeUnloadTimeout: NodeJS.Timeout;
    let unloadTimeout: NodeJS.Timeout;

    const handleBeforeUnload = () => {
      logger.debug('Page beforeunload detected - setting reload state for error suppression');

      setState(prev => ({
        ...prev,
        isPageReloading: true,
        shouldSuppressErrors: true,
      }));

      // Clear any existing timeout
      if (beforeUnloadTimeout) {
        clearTimeout(beforeUnloadTimeout);
      }

      // Reset the state after a delay in case the user cancels the reload
      beforeUnloadTimeout = setTimeout(() => {
        logger.debug('Beforeunload timeout - resetting reload state');
        setState(prev => ({
          ...prev,
          isPageReloading: false,
          shouldSuppressErrors: false,
        }));
      }, 1000);
    };

    const handleUnload = () => {
      logger.debug('Page unload detected - setting unload state for error suppression');

      setState(prev => ({
        ...prev,
        isPageUnloading: true,
        shouldSuppressErrors: true,
      }));
    };

    const handleVisibilityChange = () => {
      // If page becomes hidden during a reload state, extend the suppression
      if (document.hidden && stateRef.current.isPageReloading) {
        logger.debug('Page hidden during reload - extending error suppression');
        
        if (unloadTimeout) {
          clearTimeout(unloadTimeout);
        }

        unloadTimeout = setTimeout(() => {
          setState(prev => ({
            ...prev,
            isPageReloading: false,
            isPageUnloading: false,
            shouldSuppressErrors: false,
          }));
        }, 2000);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (beforeUnloadTimeout) {
        clearTimeout(beforeUnloadTimeout);
      }
      if (unloadTimeout) {
        clearTimeout(unloadTimeout);
      }
    };
  }, []);

  /**
   * Utility function to conditionally suppress error messages during page transitions.
   * Use this before showing error toasts or notifications.
   * 
   * @param error - The error that occurred
   * @param context - Optional context for logging
   * @returns true if the error should be suppressed, false if it should be shown
   */
  const shouldSuppressError = (error: unknown, context?: string): boolean => {
    const { shouldSuppressErrors, isPageReloading, isPageUnloading } = stateRef.current;

    // Always suppress errors during page transitions
    if (shouldSuppressErrors || isPageReloading || isPageUnloading) {
      logger.debug(`Suppressing error during page transition${context ? ` (${context})` : ''}:`, error);
      return true;
    }

    // Check if this is an AbortError or PageReloadAbortError (request was cancelled)
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'PageReloadAbortError')) {
      logger.debug(`Suppressing ${error.name}${context ? ` (${context})` : ''}:`, error);
      return true;
    }

    // Check for network errors that might be due to page reload
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const networkErrorKeywords = [
        'fetch',
        'network',
        'connection',
        'aborted',
        'cancelled',
        'timeout',
      ];

      const isLikelyNetworkError = networkErrorKeywords.some(keyword => 
        errorMessage.includes(keyword)
      );

      if (isLikelyNetworkError) {
        logger.debug(`Potentially suppressing network error${context ? ` (${context})` : ''}:`, error);
        // For network errors, be more conservative and only suppress if we're very sure
        return shouldSuppressErrors;
      }
    }

    return false;
  };

  /**
   * Wrapper function for showing error toasts that respects page reload state.
   * Use this instead of directly calling toast() for error messages.
   * 
   * @param error - The error that occurred
   * @param toastFn - The toast function to call if error should be shown
   * @param context - Optional context for logging
   */
  const showErrorIfNotSuppressed = (
    error: unknown,
    toastFn: () => void,
    context?: string
  ): void => {
    if (!shouldSuppressError(error, context)) {
      toastFn();
    }
  };

  /**
   * Creates a no-op function that can be used as a placeholder.
   * This maintains compatibility with components that expect createFocusSafeFetch
   * while we rely on error suppression instead of request cancellation.
   *
   * @returns Function that does nothing (no-op)
   */
  const createFocusSafeFetch = (): (() => void) => {
    // Return a no-op function - we're relying on error suppression instead
    return () => {
      // No-op: do nothing
    };
  };



  return {
    ...state,
    shouldSuppressError,
    showErrorIfNotSuppressed,
    createFocusSafeFetch,
  };
}
