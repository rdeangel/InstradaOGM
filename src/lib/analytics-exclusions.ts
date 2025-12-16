/**
 * Utility functions to determine if endpoints/pages should be excluded from analytics tracking
 * to prevent compounded data where viewing analytics inflates the analytics numbers.
 */

/**
 * Analytics-related API endpoints that should be excluded from tracking
 */
const EXCLUDED_API_ENDPOINTS = [
  // Session analytics endpoints
  '/api/account/sessions/analytics',
  '/api/admin/sessions/analytics/system',

  // API key analytics endpoints
  '/api/account/api-keys/usage/summary',
  '/api/admin/api-keys/usage/overview',
  '/api/admin/api-keys/usage/trends',
  '/api/admin/api-keys/analytics/performance',

  // Combined analytics endpoints
  '/api/admin/analytics/combined',
  '/api/admin/analytics/realtime',

  // Audit log analytics endpoints
  '/api/admin/audit-logs/analytics/group-changes',
  '/api/admin/audit-logs/analytics/host-aliases',

  // MAC tracking analytics endpoints
  '/api/admin/mac-tracking/analytics',

  // Internal tracking endpoints
  '/api/internal/track-session-usage',
];

/**
 * API endpoints that should be excluded from SESSION tracking only
 * (but still tracked when accessed via API keys)
 */
const SESSION_EXCLUDED_API_ENDPOINTS = [
  '/api/auth/session',      // NextAuth session check - called constantly
  '/api/ui/config',         // UI configuration - called frequently
  '/api/admin/audit-logs',  // Audit logs listing - called frequently when viewing audit logs
];

/**
 * Analytics-related page paths that should be excluded from tracking
 */
const EXCLUDED_PAGE_PATTERNS = [
  '/admin/monitoring-analytics',
  '/admin/audit-logs', // If it has analytics features
];

/**
 * Check if an API endpoint should be excluded from analytics tracking
 */
export function shouldExcludeApiEndpointFromAnalytics(endpoint: string): boolean {
  // Remove query parameters for comparison
  const baseEndpoint = endpoint.split('?')[0];

  // Direct endpoint matches
  if (EXCLUDED_API_ENDPOINTS.includes(endpoint) || EXCLUDED_API_ENDPOINTS.includes(baseEndpoint)) {
    return true;
  }

  // Pattern-based exclusions
  if (baseEndpoint.includes('/analytics')) {
    return true;
  }

  if (baseEndpoint.includes('/usage') && (baseEndpoint.includes('/api-keys/') || baseEndpoint.includes('/sessions/'))) {
    return true;
  }

  // API key specific analytics endpoints (with dynamic IDs)
  if (baseEndpoint.match(/^\/api\/account\/api-keys\/[^\/]+\/(analytics|usage)$/)) {
    return true;
  }

  return false;
}

/**
 * Check if an API endpoint should be excluded from SESSION-based analytics tracking
 * (but still tracked when accessed via API keys)
 */
export function shouldExcludeApiEndpointFromSessionTracking(endpoint: string): boolean {
  // First check if it should be excluded entirely
  if (shouldExcludeApiEndpointFromAnalytics(endpoint)) {
    return true;
  }

  // Check session-specific exclusions (exact matches)
  if (SESSION_EXCLUDED_API_ENDPOINTS.includes(endpoint)) {
    return true;
  }

  // Check session-specific exclusions with query parameters
  // Remove query parameters for comparison
  const baseEndpoint = endpoint.split('?')[0];
  if (SESSION_EXCLUDED_API_ENDPOINTS.includes(baseEndpoint)) {
    return true;
  }

  return false;
}

/**
 * Check if a page should be excluded from analytics tracking
 */
export function shouldExcludePageFromAnalytics(pagePath: string): boolean {
  // Direct page matches
  if (EXCLUDED_PAGE_PATTERNS.some(pattern => pagePath.startsWith(pattern))) {
    return true;
  }
  
  // Pattern-based exclusions
  if (pagePath.includes('analytics') || pagePath.includes('monitoring')) {
    return true;
  }
  
  return false;
}

/**
 * Check if any endpoint (API or page) should be excluded from analytics tracking
 * This is the general function - for session-specific exclusions, use the auth method parameter
 */
export function shouldExcludeFromAnalytics(endpoint: string, authMethod?: 'session' | 'apiKey'): boolean {
  // Check if it's an API endpoint
  if (endpoint.startsWith('/api/')) {
    // Use session-specific exclusions if auth method is session
    if (authMethod === 'session') {
      return shouldExcludeApiEndpointFromSessionTracking(endpoint);
    }
    // For API keys or unknown auth method, use general exclusions
    return shouldExcludeApiEndpointFromAnalytics(endpoint);
  }

  // Check if it's a page (pages are always session-based)
  return shouldExcludePageFromAnalytics(endpoint);
}

/**
 * Get a list of all excluded patterns for debugging/logging purposes
 */
export function getExcludedPatterns() {
  return {
    apiEndpoints: EXCLUDED_API_ENDPOINTS,
    sessionExcludedApiEndpoints: SESSION_EXCLUDED_API_ENDPOINTS,
    pagePatterns: EXCLUDED_PAGE_PATTERNS,
  };
}
