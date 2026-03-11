'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ClientOnly } from '@/components/util/ClientOnly';
import {
  ScheduleListTable,
  type ScheduleListItem,
} from '@/components/admin/schedules/ScheduleListTable';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { AlertCircle, CalendarClock, Plus, RefreshCw } from 'lucide-react';

interface SchedulingTabProps {
  isActive?: boolean;
}

export function SchedulingTab({ isActive = true }: SchedulingTabProps) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [schedules, setSchedules] = useState<ScheduleListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledFilter, setEnabledFilter] = useState<boolean | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

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
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setIsLoading(false);
    }
  }, [enabledFilter]);

  useEffect(() => {
    if (isActive && !hasFetched) {
      setHasFetched(true);
      fetchSchedules();
    }
  }, [isActive, hasFetched, fetchSchedules]);

  return (
    <Card className="flex flex-col flex-grow min-h-0">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ClientOnly>
              <CalendarClock className={cn('text-primary', isMobile ? 'h-4 w-4' : 'h-5 w-5')} />
            </ClientOnly>
            <div>
              <CardTitle className={isMobile ? 'text-xl' : 'text-2xl'}>Scheduling</CardTitle>
              {!isMobile && (
                <CardDescription>Manage scheduled network group assignments.</CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className={cn(isMobile && 'size-9 p-0')}
              onClick={() => fetchSchedules(enabledFilter)}
              disabled={isLoading}
            >
              <ClientOnly>
                <RefreshCw className={cn('h-4 w-4', !isMobile && 'mr-2', isLoading && 'animate-spin')} />
              </ClientOnly>
              {!isMobile && 'Refresh'}
            </Button>
            <Button
              className={cn(isMobile && 'size-9 p-0')}
              onClick={() => router.push('/admin/schedules/new')}
            >
              <ClientOnly>
                <Plus className={cn('h-4 w-4', !isMobile && 'mr-2')} />
              </ClientOnly>
              {!isMobile && 'New Schedule'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-grow p-4 flex flex-col min-h-0">
        {/* Loading skeleton — only on the very first load */}
        {isLoading && !hasLoaded && (
          <div className="space-y-2 mt-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {/* Error state — only if we have no data to show */}
        {!isLoading && error && !hasLoaded && (
          <div className="flex flex-col items-center gap-4 py-12">
            <ClientOnly>
              <AlertCircle className="h-12 w-12 text-destructive" />
            </ClientOnly>
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => fetchSchedules()}>
              Retry
            </Button>
          </div>
        )}

        {/* List — stays visible after first load; dims slightly while refreshing */}
        {hasLoaded && (
          <div className={`flex flex-col flex-1 min-h-0 ${isLoading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}`}>
            <ScheduleListTable
              schedules={schedules}
              onRefresh={() => fetchSchedules(enabledFilter)}
              onEnabledFilterChange={enabled => {
                setEnabledFilter(enabled);
                fetchSchedules(enabled);
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
