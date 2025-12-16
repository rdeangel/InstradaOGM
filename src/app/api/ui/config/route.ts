import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getGlobalSettingsServer } from '@/lib/server/global-settings-utils';
import { authenticateRequest, handleAuthResponse, trackUsageByAuthMethod } from '@/lib/auth-middleware';
import { isUserIpInDeviceManagementScopeOptimized, userHasAnyDevicePermissions } from '@/lib/user-permissions';

export async function GET(request: Request) {
  try {
    const { getClientIp } = await import('@/lib/network-utils');
    const clientIp = getClientIp(request);
    const result = await getGlobalSettingsServer(clientIp);

    if (!result.success || !result.data) {
      logger.error('Failed to fetch global settings for UI config API');
      return NextResponse.json({ error: 'Failed to fetch UI configuration' }, { status: 500 });
    }

    // Check if user is authenticated (supports both session and API key authentication)
    const auth = await authenticateRequest(request);

    // Check for rate limiting errors
    if (auth.user) {
      const authError = handleAuthResponse(auth);
      if (authError) return authError;
    }

    const isAuthenticated = !!auth.user;

    logger.info(`[ui-config] Authentication status: ${isAuthenticated ? 'authenticated' : 'unauthenticated'}, method: ${auth.method || 'none'}`);

    // Return different data based on authentication status
    if (isAuthenticated && auth.user?.id) {
      // Check if this is a lightweight request (for basic UI config)
      const url = new URL(request.url);
      const isLightweight = url.searchParams.get('lightweight') === 'true';

      let selfServiceEnabled = false;

      if (!result.data.removeSelfServicePage) {
        if (isLightweight) {
          // Lightweight check: only verify user has device permissions (no IP validation)
          const hasAnyPermissions = await userHasAnyDevicePermissions(auth.user.id);
          selfServiceEnabled = hasAnyPermissions;

        } else {
          // Full validation: perform device scope check with IP validation
          if (clientIp) {
            const isInDeviceScope = await isUserIpInDeviceManagementScopeOptimized(auth.user.id, clientIp);
            selfServiceEnabled = isInDeviceScope;
          } else {
            // No IP detected, deny access
            selfServiceEnabled = false;
          }
        }
      } else {
        // Global setting disables self-service
        selfServiceEnabled = false;
        logger.info(`[ui-config] API: Self-service globally disabled for authenticated user ${auth.user.id}`);
      }

      // Authenticated users get full custom configuration
      const authenticatedConfig = {
        // Group type behavior flags
        groupTypesEnabled: result.data.enableGroupTypes || false,
        selfServiceMultiSelectEnabled: result.data.enableSelfServiceMultiSelect ?? true,

        // Assignment behavior mode
        assignmentMode: result.data.enableGroupTypes ? 'smart' : 'moveOnly',

        // Self-service availability - now includes device management scope check
        selfServiceEnabled,

        // Registration availability
        registrationEnabled: result.data.enableRegistration,

        // Renaming features
        selfServiceRenamingEnabled: result.data.enableRenamingSelfServicePage,
        deviceManagementRenamingEnabled: result.data.enableRenamingDeviceManagementPage,

        // Custom group type labels (actual organizational names)
        groupTypeConfig: {
          showTypeIndicators: result.data.enableGroupTypes && result.data.enableSelfServiceMultiSelect,
          singleSelectLabel: result.data.singleSelectName || 'Single Select',
          multiSelectLabel: result.data.multiSelectName || 'Multi Select',
          singleSelectIcon: result.data.singleSelectIcon || 'DEFAULT',
          multiSelectIcon: result.data.multiSelectIcon || 'DEFAULT'
        },

        // MAC tracking settings
        macTrackingEnabled: result.data.enableMacTracking || false,

        // Application subtitle settings
        subtitleEnabled: result.data.enableApplicationSubtitle || false,
        subtitleText: result.data.subtitleText || null,

        // Current IP for reference
        currentIp: clientIp
      };

      // Track usage for authenticated requests
      if (auth && auth.user) {
        await trackUsageByAuthMethod(request, auth, 200);
      }

      logger.info(`[ui-config] Authenticated user config - selfServiceEnabled: ${authenticatedConfig.selfServiceEnabled}, removeSelfServicePage: ${result.data.removeSelfServicePage}`);
      return NextResponse.json(authenticatedConfig);
    } else {
      // Unauthenticated users get secure/generic configuration
      const secureUIConfig = {
        // Group type behavior flags (no custom names or sensitive settings)
        groupTypesEnabled: result.data.enableGroupTypes || false,
        selfServiceMultiSelectEnabled: result.data.enableSelfServiceMultiSelect ?? true,

        // Assignment behavior mode
        assignmentMode: result.data.enableGroupTypes ? 'smart' : 'moveOnly',

        // Self-service availability - for unauthenticated users, use full IP-based check
        selfServiceEnabled: result.data.isSelfServiceAllowed,

        // Registration availability
        registrationEnabled: result.data.enableRegistration,

        // Renaming features
        selfServiceRenamingEnabled: result.data.enableRenamingSelfServicePage,
        deviceManagementRenamingEnabled: result.data.enableRenamingDeviceManagementPage,

        // Generic group type labels (no custom organizational names)
        groupTypeConfig: {
          showTypeIndicators: result.data.enableGroupTypes && result.data.enableSelfServiceMultiSelect,
          singleSelectLabel: 'Primary Group',
          multiSelectLabel: 'Additional Groups',
          singleSelectIcon: 'dot',
          multiSelectIcon: 'dots'
        },

        // MAC tracking settings (available to unauthenticated users for navigation)
        macTrackingEnabled: result.data.enableMacTracking || false,

        // Application subtitle settings (available to unauthenticated users for header display)
        subtitleEnabled: result.data.enableApplicationSubtitle || false,
        subtitleText: result.data.subtitleText || null
      };

      // Track usage for authenticated requests (even if not fully authenticated)
      if (auth && auth.user) {
        await trackUsageByAuthMethod(request, auth, 200);
      }

      return NextResponse.json(secureUIConfig);
    }
  } catch (error) {
    logger.error('Error in UI config API:', error);

    // Try to track usage for authenticated requests (even failed ones)
    try {
      const auth = await authenticateRequest(request);
      if (auth && auth.user) {
        await trackUsageByAuthMethod(request, auth, 500);
      }
    } catch (trackingError) {
      logger.error('Error tracking usage in UI config API:', trackingError);
    }

    return NextResponse.json({ error: 'Failed to fetch UI configuration' }, { status: 500 });
  }
}
