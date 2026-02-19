'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types/opnsense';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/card-skeleton';
import { ClientOnly } from '@/components/util/ClientOnly';
import {
  ScheduleListTable,
  type ScheduleListItem,
} from '@/components/admin/schedules/ScheduleListTable';
import { Loader2, LogIn, Ban, Plus, AlertCircle, RefreshCw } from 'lucide-react';

export default function SchedulesPage() {
  const { data: session, status: authStatus } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [schedules, setSchedules] = useState<ScheduleListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledFilter, setEnabledFilter] = useState<boolean | null>(null);

  const fetchSchedules = useCallback(async (enabled: boolean | null = enabledFilter) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (enabled !== null) params.set('enabled', String(enabled));
      const query = params.size > 0 ? `?${params}` : '';
      const res = await fetch(`/api/admin/schedules${query}`);
      if (!res.ok) throw new Error('Failed to fetch schedules');
      const data = await res.json();
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setIsLoading(false);
    }
  }, [enabledFilter]);

  useEffect(() => {
    if (
      authStatus === 'authenticated' &&
      (session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN)
    ) {
      fetchSchedules();
    }
  }, [authStatus, session, fetchSchedules]);

  // Redirect unauthenticated users
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const timer = setTimeout(() => router.push('/login'), 10000);
      return () => clearTimeout(timer);
    }
  }, [authStatus, router]);

  // Redirect non-admin users
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
          <p className="text-muted-foreground">Please log in to access schedule management.</p>
          <p className="text-muted-foreground">Redirecting to Login in 10 seconds...</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
        <AppFooter pageTitle="Scheduled Assignments" />
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
          <p className="text-muted-foreground">Redirecting in 10 seconds...</p>
          <Button onClick={() => router.push('/')}>Go to Self-Service</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col h-dynamic-screen overflow-hidden bg-background">
      <AppHeader />
      <main className="flex-grow container-responsive py-3 flex flex-col min-h-0 pb-16 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">Scheduled Assignments</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSchedules(enabledFilter)}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => router.push('/admin/schedules/new')}>
              <Plus className="h-4 w-4 mr-2" />
              New Schedule
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="flex flex-col items-center gap-4 py-12">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => fetchSchedules()}>
              Retry
            </Button>
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && (
          <ScheduleListTable
            schedules={schedules}
            onRefresh={() => fetchSchedules(enabledFilter)}
            onEnabledFilterChange={enabled => {
              setEnabledFilter(enabled);
              fetchSchedules(enabled);
            }}
          />
        )}
      </main>
      <AppFooter pageTitle="Scheduled Assignments" />
    </div>
  );
}
