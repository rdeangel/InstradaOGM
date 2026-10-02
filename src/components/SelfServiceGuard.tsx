import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { isUserIpInDeviceManagementScopeOptimized } from '@/lib/user-permissions';
import { getClientIp } from '@/lib/network-utils';
import { getGlobalSettings } from '@/lib/server/global-settings';

import { headers } from 'next/headers';


interface SelfServiceGuardProps {
  children: React.ReactNode;
}

/**
 * Server component that checks if self-service is disabled and redirects accordingly
 * This prevents any client components from mounting when self-service is disabled
 */
export default async function SelfServiceGuard({ children }: SelfServiceGuardProps) {
  try {
    const headersList = await headers();
    const clientIp = getClientIp({ headers: headersList });
    const settings = await getGlobalSettings(clientIp);

    // Get server session to determine authentication status
    const session = await getServerSession(authOptions);

    // Check if self-service should be blocked
    let shouldBlockSelfService = false;
    let redirectReason = '';

    // 1. Check global setting
    if (settings.removeSelfServicePage) {
      shouldBlockSelfService = true;
      redirectReason = 'Self-service is globally disabled';
    }
    // 2. For authenticated users, use full device scope validation with fallback
    // This ensures proper three-tier access control from the server-side
    else if (session?.user?.id) {
      if (!clientIp) {
        shouldBlockSelfService = true;
        redirectReason = `No client IP detected for authenticated user ${session.user.id}`;
      } else {
        // Use optimized device scope validation with network-based access optimization
        const hasAccess = await isUserIpInDeviceManagementScopeOptimized(session.user.id, clientIp);

        if (!hasAccess) {
          shouldBlockSelfService = true;
          redirectReason = `User ${session.user.id} IP ${clientIp} not in device management scope and not allowed via unauthenticated fallback`;
        }
      }
    }
    else if (!settings.isSelfServiceAllowed) {
      shouldBlockSelfService = true;
      redirectReason = 'Self-service not allowed from this network';
    }

    // If self-service should be blocked, redirect based on authentication status
    if (shouldBlockSelfService) {
      logger.debug(`Self-service blocked: ${redirectReason}`);

      if (session) {
        // Authenticated users: redirect to devices
        logger.debug('Authenticated user blocked from self-service, redirecting to /devices');
        redirect('/devices');
      } else {
        // Unauthenticated users: redirect to login
        logger.debug('Unauthenticated user blocked from self-service, redirecting to /login');
        redirect('/login');
      }
    }

    // If self-service is enabled, render children normally
    return <>{children}</>;

  } catch (error) {
    // Don't log NEXT_REDIRECT errors as they are expected behavior
    if (error && typeof error === 'object' && 'digest' in error && String(error.digest).includes('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors to let Next.js handle them
    }

    logger.error('Error checking global settings in SelfServiceGuard:', error);
    // On error, render children (fail open)
    return <>{children}</>;
  }
}
