'use client';

import { useEffect, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';

/**
 * Hook to manage AbortController instances for cancelling ongoing requests.
 * Automatically aborts all requests when the component unmounts.
 */
export function useAbortController() {
  // Keep track of all active controllers
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    // Capture the current value of controllersRef.current for the cleanup function
    const cleanupControllers = controllersRef.current;

    return () => {
      isMountedRef.current = false;
      // Abort all active controllers when component unmounts
      cleanupControllers.forEach(controller => {
        if (!controller.signal.aborted) {
          logger.debug('Aborting request due to component unmount');
          controller.abort('Component unmounted');
        }
      });
      cleanupControllers.clear();
    };
  }, []);

  /**
   * Creates a new AbortController and tracks it for cleanup.
   * The controller will be automatically aborted when the component unmounts.
   * 
   * @param timeoutMs - Optional timeout in milliseconds to auto-abort the request
   * @returns AbortController instance
   */
  const createController = useCallback((timeoutMs?: number): AbortController => {
    const controller = new AbortController();
    
    // Add to tracking set
    controllersRef.current.add(controller);
    
    // Set up timeout if specified
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (!controller.signal.aborted) {
          logger.debug(`Aborting request due to timeout (${timeoutMs}ms)`);
          controller.abort(`Request timeout after ${timeoutMs}ms`);
        }
      }, timeoutMs);
    }
    
    // Clean up when the controller is aborted
    controller.signal.addEventListener('abort', () => {
      controllersRef.current.delete(controller);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
    
    return controller;
  }, []);

  /**
   * Aborts a specific controller and removes it from tracking.
   * 
   * @param controller - The AbortController to abort
   * @param reason - Optional reason for aborting
   */
  const abortController = useCallback((controller: AbortController, reason?: string) => {
    if (!controller.signal.aborted) {
      logger.debug('Manually aborting controller:', reason || 'No reason provided');
      controller.abort(reason);
    }
    controllersRef.current.delete(controller);
  }, []);

  /**
   * Aborts all currently active controllers.
   * 
   * @param reason - Optional reason for aborting all controllers
   */
  const abortAll = useCallback((reason?: string) => {
    logger.debug(`Aborting all active controllers (${controllersRef.current.size}):`, reason || 'No reason provided');
    
    controllersRef.current.forEach(controller => {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    });
    controllersRef.current.clear();
  }, []);

  /**
   * Creates an abortable fetch wrapper that uses the provided AbortController.
   * 
   * @param controller - The AbortController to use
   * @returns Fetch function that will be aborted when the controller is aborted
   */
  const createAbortableFetch = useCallback((controller: AbortController) => {
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Merge the abort signal with any existing signal
      const mergedInit: RequestInit = {
        ...init,
        signal: controller.signal,
      };

      return fetch(input, mergedInit);
    };
  }, []);

  /**
   * Utility function to check if an error is an AbortError.
   * 
   * @param error - The error to check
   * @returns true if the error is an AbortError
   */
  const isAbortError = useCallback((error: unknown): boolean => {
    return error instanceof Error && error.name === 'AbortError';
  }, []);

  /**
   * Creates a Promise that will be rejected when the controller is aborted.
   * Useful for racing against other promises.
   * 
   * @param controller - The AbortController to watch
   * @returns Promise that rejects when aborted
   */
  const createAbortPromise = useCallback((controller: AbortController): Promise<never> => {
    return new Promise((_, reject) => {
      if (controller.signal.aborted) {
        reject(new Error('Request was aborted'));
        return;
      }

      controller.signal.addEventListener('abort', () => {
        reject(new Error('Request was aborted'));
      });
    });
  }, []);

  return {
    createController,
    abortController,
    abortAll,
    createAbortableFetch,
    isAbortError,
    createAbortPromise,
    get activeControllerCount() {
      return controllersRef.current.size;
    },
    get isMounted() {
      return isMountedRef.current;
    },
  };
}
