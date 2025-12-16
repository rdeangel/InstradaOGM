'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';



interface SelfServicePageGuardProps {
  children: React.ReactNode;
}

/**
 * Client-side guard that validates self-service access server-side for security.
 *
 * SECURITY NOTE: This component always validates server-side to prevent localStorage manipulation.
 * While this means we can't avoid the expensive validation on page load, it ensures security.
 */
export default function SelfServicePageGuard({ children }: SelfServicePageGuardProps) {
  const { data: session, status: authStatus } = useAuth();
  const router = useRouter();
  const [isValidating, setIsValidating] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      // Wait for auth status to be determined
      if (authStatus === 'loading') {
        return; // Still loading, wait
      }

      // For unauthenticated users, validate using API call
      if (authStatus === 'unauthenticated' || !session?.user?.id) {
        try {
          logger.info(`[SelfServicePageGuard] Validating unauthenticated user access`);

          const response = await fetch('/api/ui/config', {
            cache: 'no-store',
          });

          if (response.ok) {
            const data = await response.json();
            const enabled = data.selfServiceEnabled ?? false;

            if (enabled) {
              logger.info(`[SelfServicePageGuard] Unauthenticated user granted access`);
              setHasAccess(true);
            } else {
              logger.info(`[SelfServicePageGuard] Unauthenticated user denied access, redirecting to /login`);
              router.push('/login');
              return;
            }
          } else {
            logger.error(`[SelfServicePageGuard] API call failed for unauthenticated user, redirecting to /login`);
            router.push('/login');
            return;
          }
        } catch (error) {
          logger.error(`[SelfServicePageGuard] Error validating unauthenticated user:`, error);
          router.push('/login');
          return;
        } finally {
          setIsValidating(false);
        }
        return;
      }

      const userId = session.user.id;

      try {
        // Always validate server-side for security (no localStorage trust)
        logger.info(`[SelfServicePageGuard] Performing server-side validation for user ${userId}`);

        const response = await fetch('/api/ui/config', {
          cache: 'no-store',
        });

        if (response.ok) {
          const data = await response.json();
          const enabled = data.selfServiceEnabled ?? false;

          if (enabled) {
            setHasAccess(true);
            logger.info(`[SelfServicePageGuard] User ${userId} granted access`);
          } else {
            logger.info(`[SelfServicePageGuard] User ${userId} denied access, redirecting to /devices`);
            router.push('/devices');
            return;
          }
        } else {
          // API call failed, fail closed
          logger.error(`[SelfServicePageGuard] API call failed for user ${userId}, redirecting to /devices`);
          router.push('/devices');
          return;
        }
      } catch (error) {
        logger.error(`[SelfServicePageGuard] Error during access check for user ${userId}:`, error);
        // On error, redirect to devices page (fail closed)
        router.push('/devices');
        return;
      } finally {
        setIsValidating(false);
      }
    };

    checkAccess();
  }, [authStatus, session?.user?.id, router]);

  // Show loading state while validating
  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Validating access...</p>
        </div>
      </div>
    );
  }

  // Only render children if user has access
  if (hasAccess) {
    return <>{children}</>;
  }

  // This should not happen due to redirects, but just in case
  return null;
}


