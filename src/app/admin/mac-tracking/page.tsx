"use client";

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Role } from '@/types/opnsense';
import { MacTrackingClient } from '@/components/admin/MacTrackingClient';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';


export default function MacTrackingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();


  useEffect(() => {
    if (status === 'loading') return;

    // Redirect unauthenticated users to login
    if (!session || !session.user) {
      router.push('/login');
      return;
    }

    // Redirect USER role users to self-service (they don't have access)
    if (session.user.role !== Role.ADMIN && session.user.role !== Role.SUPER_ADMIN) {
      router.push('/');
    }
  }, [session, status, router]);

  // Show loading state while checking authentication
  if (status === 'loading') {
    return null;
  }

  // Don't render if not authenticated or not authorized
  if (!session || !session.user || (session.user.role !== Role.ADMIN && session.user.role !== Role.SUPER_ADMIN)) {
    return null;
  }

  return (
    <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
      <AppHeader />
      <main className="flex-grow container-responsive py-3 flex flex-col min-h-0 pb-16">
        <MacTrackingClient />
      </main>
      <AppFooter pageTitle="MAC Address Tracking" />
    </div>
  );
}
