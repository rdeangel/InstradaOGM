'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getProviders } from 'next-auth/react';
import { logger } from '@/lib/logger';

export default function SSOLoadingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useAuth();
  const providerId = searchParams.get('provider');
  const [providerName, setProviderName] = useState('SSO');

  useEffect(() => {
    const fetchProviderName = async () => {
      if (providerId) {
        const providers = await getProviders();
        if (providers) {
          const currentProvider = Object.values(providers).find(p => p.id === providerId);
          if (currentProvider) {
            setProviderName(currentProvider.name);
          }
        }
      }
    };
    fetchProviderName();

    logger.debug('SSOLoadingClient useEffect: authStatus:', authStatus);
    logger.debug('SSOLoadingClient useEffect: session:', session);

    if (authStatus === 'loading') {
      // Still loading, do nothing yet
      return;
    }

    if (authStatus === 'authenticated') {
      logger.debug('SSOLoadingClient: Authenticated, redirecting to /');
      router.push('/');
    } else if (authStatus === 'unauthenticated') {
      const error = searchParams.get('error');
      if (error) {
        logger.error('SSO Sign-in error:', error);
        router.push(`/login?error=${encodeURIComponent(error)}`);
      } else {
        logger.debug('SSOLoadingClient: Unauthenticated with no error, redirecting to /login');
        router.push('/login');
      }
    }
  }, [authStatus, router, searchParams, providerId, session]); // Add session to dependency array

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground text-center">
        Logging you in with {providerName}...
        <br />
        Please wait while we redirect you.
      </p>
    </div>
  );
}