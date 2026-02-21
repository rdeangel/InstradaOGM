'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { Loader2 } from 'lucide-react';
import { ClientOnly } from '@/components/util/ClientOnly';

export default function SchedulesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin?tab=scheduling');
  }, [router]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader />
      <main className="flex-grow flex items-center justify-center">
        <ClientOnly>
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </ClientOnly>
      </main>
    </div>
  );
}
