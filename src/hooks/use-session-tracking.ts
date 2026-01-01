'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { logger } from '@/lib/logger';

// Client-side analytics exclusion check
function shouldExcludeFromClientAnalytics(path: string): boolean {
  return path.includes('analytics') || path.includes('monitoring') || path.startsWith('/admin/monitoring-analytics');
}

interface SessionTrackingOptions {
  trackPageViews?: boolean;
  trackClicks?: boolean;
  trackFormSubmits?: boolean;
  trackApiCalls?: boolean;
  debounceMs?: number;
}

const DEFAULT_OPTIONS: SessionTrackingOptions = {
  trackPageViews: true,
  trackClicks: true,
  trackFormSubmits: true,
  trackApiCalls: true,
  debounceMs: 1000,
};

// Helper function to safely get class name
const getFirstClassName = (className: string | DOMTokenList | null): string => {
  if (typeof className === 'string') {
    return className.split(' ')[0];
  } else if (className && typeof className.toString === 'function') {
    // Handle DOMTokenList or other objects with toString method
    return className.toString().split(' ')[0];
  }
  return '';
};

export function useSessionTracking(options: SessionTrackingOptions = {}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const lastTrackedPath = useRef<string>('');
  const trackingQueue = useRef<Array<Record<string, unknown>>>([]);
  const flushTimeout = useRef<NodeJS.Timeout | null>(null);

  const finalOptions = { ...DEFAULT_OPTIONS, ...options };

  // Function to send tracking data to the server
  const sendTrackingData = useCallback(async (eventData: Record<string, unknown>) => {
    try {
      // Only track if user is authenticated
      if (!session?.user) {
        logger.debug('Session tracking: No authenticated user, skipping');
        return;
      }

      logger.debug('Session tracking: Sending event', eventData);

      // Use keepalive to ensure the request completes even if the page unloads
      // This prevents "Unexpected end of JSON input" errors from cancelled requests
      const response = await fetch('/api/system/track-session-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
        keepalive: true, // Ensures request completes even if page unloads
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn('Failed to track session usage:', response.status, response.statusText, errorText);
      } else {
        logger.debug('Session tracking: Event sent successfully');
      }
    } catch (error) {
      // Silently ignore errors from cancelled requests (common during page navigation)
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug('Session tracking: Request aborted (page navigation)');
      } else {
        logger.warn('Error tracking session usage:', error);
      }
    }
  }, [session?.user]);

  // Function to flush the tracking queue
  const flushQueue = useCallback(() => {
    if (trackingQueue.current.length === 0) return;

    const events = [...trackingQueue.current];
    trackingQueue.current = [];

    // Send all queued events
    events.forEach(event => sendTrackingData(event));
  }, [sendTrackingData]);

  // Function to queue tracking events
  const queueEvent = useCallback((eventData: Record<string, unknown>) => {
    trackingQueue.current.push(eventData);

    // Clear existing timeout
    if (flushTimeout.current) {
      clearTimeout(flushTimeout.current);
    }

    // Set new timeout to flush queue
    flushTimeout.current = setTimeout(flushQueue, finalOptions.debounceMs);
  }, [flushQueue, finalOptions.debounceMs]);

  // Track page views
  useEffect(() => {
    if (!finalOptions.trackPageViews || !session?.user || !pathname) {
      logger.debug('Session tracking: Page view tracking skipped', {
        trackPageViews: finalOptions.trackPageViews,
        hasUser: !!session?.user,
        pathname,
      });
      return;
    }

    // Skip tracking for analytics pages to prevent compounded data
    if (shouldExcludeFromClientAnalytics(pathname)) {
      logger.debug('Session tracking: Page view tracking skipped for analytics page:', pathname);
      return;
    }

    // Define pages to exclude from tracking (analytics/monitoring pages)
    const excludedPages = [
      '/admin/monitoring-analytics',
    ];

    // Check if current page should be excluded
    if (excludedPages.some(excluded => pathname.startsWith(excluded))) {
      logger.debug('Session tracking: Page excluded from tracking', pathname);
      return;
    }

    // Avoid tracking the same page multiple times
    if (lastTrackedPath.current === pathname) {
      logger.debug('Session tracking: Page already tracked', pathname);
      return;
    }
    lastTrackedPath.current = pathname;

    const eventData = {
      actionType: 'page_view',
      endpoint: pathname,
      method: 'GET',
      pageUrl: window.location.href,
      referrer: document.referrer || undefined,
      timestamp: new Date().toISOString(),
    };

    logger.debug('Session tracking: Queuing page view event', eventData);
    queueEvent(eventData);
  }, [pathname, session?.user, finalOptions.trackPageViews, queueEvent]);

  // Track clicks
  useEffect(() => {
    if (!finalOptions.trackClicks || !session?.user) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target) return;

      // Get meaningful information about the clicked element
      const tagName = target.tagName.toLowerCase();
      const className = target.className;
      const id = target.id;
      const text = target.textContent?.slice(0, 50) || '';



      // Create a meaningful identifier for the clicked element
      let elementIdentifier = tagName;
      if (id) elementIdentifier += `#${id}`;
      if (className) {
        const firstClass = getFirstClassName(className);
        if (firstClass) elementIdentifier += `.${firstClass}`;
      }
      if (text) elementIdentifier += ` "${text}"`;

      const eventData = {
        actionType: 'click',
        endpoint: pathname,
        method: 'CLICK',
        pageUrl: window.location.href,
        metadata: {
          elementType: tagName,
          elementId: id || undefined,
          elementClass: getFirstClassName(className),
          elementText: text || undefined,
          elementIdentifier,
          clickX: event.clientX,
          clickY: event.clientY,
        },
        timestamp: new Date().toISOString(),
      };

      queueEvent(eventData);
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname, session?.user, finalOptions.trackClicks, queueEvent]);

  // Track form submissions
  useEffect(() => {
    if (!finalOptions.trackFormSubmits || !session?.user) return;

    const handleFormSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (!form) return;

      const formId = form.id;
      const formClass = form.className;
      const formAction = form.action;
      const formMethod = form.method;

      const eventData = {
        actionType: 'form_submit',
        endpoint: pathname,
        method: formMethod.toUpperCase(),
        pageUrl: window.location.href,
        metadata: {
          formId: formId || undefined,
          formClass: getFirstClassName(formClass),
          formAction: formAction || undefined,
          formMethod: formMethod || undefined,
        },
        timestamp: new Date().toISOString(),
      };

      queueEvent(eventData);
    };

    document.addEventListener('submit', handleFormSubmit);
    return () => document.removeEventListener('submit', handleFormSubmit);
  }, [pathname, session?.user, finalOptions.trackFormSubmits, queueEvent]);

  // Track API calls made by the UI
  useEffect(() => {
    if (!session?.user || !finalOptions.trackApiCalls) return;

    // Intercept fetch requests to track API calls
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource :
        resource instanceof Request ? resource.url : resource.toString();
      const method = config?.method || 'GET';

      // Define endpoints to exclude from session tracking (meta-operations)
      const excludedEndpoints = [
        '/api/admin/analytics/realtime',           // Real-time monitoring
        '/api/admin/analytics/combined',           // Combined analytics dashboard
        '/api/admin/api-keys/analytics/performance', // Performance analytics
        '/api/admin/api-keys/analytics/system',    // System analytics
        '/api/admin/audit-logs',                   // Audit log viewing
        '/api/admin/audit-logs/stats',             // Audit log statistics
        '/api/system/track-session-usage',       // Session tracking endpoint
        '/api/ui/config',                          // UI configuration endpoint
      ];

      // Helper function to check if endpoint should be excluded
      const shouldExcludeEndpoint = (endpoint: string): boolean => {
        return excludedEndpoints.some(excluded => endpoint === excluded) ||
          endpoint.includes('/analytics/') ||  // Any analytics endpoint
          endpoint.includes('/audit-logs/analytics/'); // Any audit analytics
      };

      // Only track API calls (not external requests or meta-operations)
      if (url.startsWith('/api/') && !shouldExcludeEndpoint(url)) {
        const startTime = Date.now();

        try {
          const response = await originalFetch(...args);
          const responseTime = Date.now() - startTime;

          // Track the API call
          queueEvent({
            actionType: 'api_call',
            endpoint: url,
            method: method.toUpperCase(),
            statusCode: response.status,
            responseTime,
            pageUrl: window.location.href,
            timestamp: new Date().toISOString(),
          });

          return response;
        } catch (error) {
          const responseTime = Date.now() - startTime;

          // Track failed API call
          queueEvent({
            actionType: 'api_call',
            endpoint: url,
            method: method.toUpperCase(),
            statusCode: 0, // Network error
            responseTime,
            errorType: 'NetworkError',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            pageUrl: window.location.href,
            timestamp: new Date().toISOString(),
          });

          throw error;
        }
      } else {
        return originalFetch(...args);
      }
    };

    // Cleanup: restore original fetch on unmount
    return () => {
      window.fetch = originalFetch;
    };
  }, [session?.user, finalOptions.trackApiCalls, queueEvent]);

  // Flush queue on component unmount
  useEffect(() => {
    return () => {
      if (flushTimeout.current) {
        clearTimeout(flushTimeout.current);
      }
      flushQueue();
    };
  }, [flushQueue]);

  // Flush queue when page is about to unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushQueue();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flushQueue]);

  return {
    // Expose manual tracking function for custom events
    trackEvent: (eventData: Record<string, unknown>) => {
      if (!session?.user) return;
      queueEvent({
        ...eventData,
        endpoint: pathname,
        pageUrl: window.location.href,
        timestamp: new Date().toISOString(),
      });
    },

    // Expose flush function for immediate sending
    flush: flushQueue,
  };
}
