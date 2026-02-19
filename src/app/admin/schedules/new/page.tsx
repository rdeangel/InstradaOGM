'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types/opnsense';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';
import { Button } from '@/components/ui/button';
import { ClientOnly } from '@/components/util/ClientOnly';
import { ScheduleForm } from '@/components/admin/schedules/ScheduleForm';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, Ban } from 'lucide-react';

export default function NewSchedulePage() {
  const { data: session, status: authStatus } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const timer = setTimeout(() => router.push('/login'), 10000);
      return () => clearTimeout(timer);
    }
  }, [authStatus, router]);

  useEffect(() => {
    if (!mounted) return;
    if (
      authStatus === 'authenticated' &&
      session?.user?.role !== Role.ADMIN &&
      session?.user?.role !== Role.SUPER_ADMIN
    ) {
      const timer = setTimeout(() => router.push('/'), 10000);
      return () => clearTimeout(timer);
    }
  }, [authStatus, session, router, mounted]);

  if (!mounted || authStatus === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex items-center justify-center">
          <ClientOnly><Loader2 className="h-12 w-12 animate-spin text-primary" /></ClientOnly>
        </main>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col items-center justify-center space-y-4">
          <ClientOnly><LogIn className="h-16 w-16 text-primary" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Not Authenticated</h1>
          <p className="text-muted-foreground">Please log in to continue.</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
        <AppFooter pageTitle="New Schedule" />
      </div>
    );
  }

  if (session?.user?.role !== Role.ADMIN && session?.user?.role !== Role.SUPER_ADMIN) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col items-center justify-center space-y-4">
          <ClientOnly><Ban className="h-16 w-16 text-destructive" /></ClientOnly>
          <h1 className="text-2xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
          <Button onClick={() => router.push('/')}>Go to Self-Service</Button>
        </main>
      </div>
    );
  }

  async function handleSubmit(data: unknown) {
    const res = await fetch('/api/admin/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message ?? 'Failed to create schedule.',
      });
      throw new Error(err.message ?? 'Create failed');
    }

    toast({ title: 'Schedule created', description: 'The schedule has been created successfully.' });
    router.push('/admin/schedules');
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader />
      <main className="flex-grow container mx-auto px-4 py-6 pb-20 max-w-4xl">
        <h1 className="text-3xl font-bold text-foreground mb-6">New Schedule</h1>
        <ScheduleForm onSubmit={handleSubmit} submitLabel="Create Schedule" />
      </main>
      <AppFooter pageTitle="New Schedule" />
    </div>
  );
}
