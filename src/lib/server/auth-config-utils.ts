import { getAuthConfig } from '@/lib/server/auth-config';
import { logger } from '@/lib/logger';

/**
 * Server-side utility to get authentication configuration
 * This function can only be imported by server-side code (API routes, server components, etc.)
 * and cannot be accessed from client-side code.
 */
export async function getAuthConfigServer() {
  try {
    const authConfig = await getAuthConfig();
    return { success: true, data: authConfig };
  } catch (error) {
    logger.error('Failed to fetch auth config:', error);
    return { success: false, error: 'Failed to fetch auth configuration' };
  }
} 