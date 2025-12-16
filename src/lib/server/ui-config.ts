import { getGlobalSettings } from '@/lib/server/global-settings';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { userHasAnyDevicePermissions } from '@/lib/user-permissions';


export interface UIConfig {
  selfServiceEnabled: boolean;
  subtitleEnabled: boolean;
  subtitleText: string | null;
  loginPageSubtitleEnabled: boolean;
}

/**
 * Server-side function to get UI configuration data
 * This can be used in server components to get initial data
 * Uses the same logic as the /api/ui/config endpoint to ensure consistency
 */
export async function getUIConfig(): Promise<UIConfig> {
  try {
    const result = await getGlobalSettings();

    // Check if user is authenticated (same logic as API endpoint)
    const session = await getServerSession(authOptions);
    const isAuthenticated = !!session?.user;

    let selfServiceEnabled = false;

    if (isAuthenticated && session?.user?.id) {
      // For authenticated users in server-side rendering: use lightweight check only
      // Full device scope validation will happen client-side when needed
      if (!result.removeSelfServicePage) {
        // Use lightweight permission check for server-side rendering
        const hasAnyPermissions = await userHasAnyDevicePermissions(session.user.id);
        selfServiceEnabled = hasAnyPermissions;

      } else {
        // Global setting disables self-service
        selfServiceEnabled = false;
      }
    } else {
      // For unauthenticated users, use existing IP-based check
      selfServiceEnabled = result.isSelfServiceAllowed ?? true;
      logger.info(`[ui-config] Unauthenticated user - self-service enabled: ${selfServiceEnabled}`);
    }

    return {
      selfServiceEnabled,
      subtitleEnabled: result.enableApplicationSubtitle ?? false,
      subtitleText: result.subtitleText ?? null,
      loginPageSubtitleEnabled: result.enableLoginPageSubtitle ?? false,
    };
  } catch (error) {
    logger.error('Error fetching UI config server-side:', error);
    // Return defaults on error
    return {
      selfServiceEnabled: true,
      subtitleEnabled: false,
      subtitleText: null,
      loginPageSubtitleEnabled: false,
    };
  }
}
