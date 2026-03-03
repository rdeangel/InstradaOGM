'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types/opnsense';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ClientOnly } from '@/components/util/ClientOnly';
import { ScheduleForm, type ScheduleFormValues } from '@/components/admin/schedules/ScheduleForm';
import { ExecutionHistory } from '@/components/admin/schedules/ExecutionHistory';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ScheduleDayFormData } from '@/components/admin/schedules/ScheduleTimelineGrid';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, Ban, AlertCircle, ChevronLeft, CalendarClock, History } from 'lucide-react';

// Shape returned by GET /api/admin/schedules/[id]
interface ScheduleDetail {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  scheduleType: 'COMPLEX_WEEKLY' | 'ONCE' | 'RECURRING';
  timezone: string;
  executeAt: string | null;
  cronExpression: string | null;
  targetType: string;
  targetSelector: unknown;
  days?: Array<{
    dayOfWeek: number;
    windows: Array<{
      startTime: string;
      endTime: string;
      label?: string | null;
      actions: Array<{
        operation: string;
        boundaryType: 'START' | 'END';
        targetGroupUuid?: string | null;
        sortOrder: number;
      }>;
    }>;
  }>;
  onceActions?: Array<{
    operation: string;
    targetGroupUuid?: string | null;
    sortOrder: number;
  }>;
  recurringActions?: Array<{
    operation: string;
    targetGroupUuid?: string | null;
    sortOrder: number;
  }>;
}

// Normalize legacy operation names to current ones
function normalizeOp(op: string): 'ASSIGN' | 'UNASSIGN' | 'CLEAR_ALL' {
  if (op === 'REMOVE') return 'UNASSIGN';
  if (op === 'MOVE') return 'ASSIGN'; // ASSIGN now handles move semantics automatically
  if (op === 'ASSIGN' || op === 'UNASSIGN' || op === 'CLEAR_ALL') return op;
  return 'ASSIGN';
}

function mapToFormValues(schedule: ScheduleDetail): Partial<ScheduleFormValues> {
  const selector = schedule.targetSelector as Record<string, unknown>;
  return {
    name: schedule.name,
    description: schedule.description ?? '',
    enabled: schedule.enabled,
    priority: schedule.priority,
    scheduleType: schedule.scheduleType,
    timezone: schedule.timezone,
    executeAt: schedule.executeAt ? new Date(schedule.executeAt) : undefined,
    onceActions: (schedule.onceActions ?? []).map(a => ({
      operation: normalizeOp(a.operation),
      targetGroupUuid: a.targetGroupUuid ?? undefined,
      sortOrder: a.sortOrder,
    })),
    cronExpression: schedule.cronExpression ?? '',
    recurringActions: (schedule.recurringActions ?? []).map(a => ({
      operation: normalizeOp(a.operation),
      targetGroupUuid: a.targetGroupUuid ?? undefined,
      sortOrder: a.sortOrder,
    })),
    targetType: 'HOST_ALIAS',
    hostAliasUuids: (selector?.hostAliasUuids as string[]) ?? [],
  };
}

function mapToDays(schedule: ScheduleDetail): ScheduleDayFormData[] {
  const allDays: ScheduleDayFormData[] = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    windows: [],
  }));

  if (schedule.days) {
    for (const day of schedule.days) {
      const idx = allDays.findIndex(d => d.dayOfWeek === day.dayOfWeek);
      if (idx !== -1) {
        // eslint-disable-next-line security/detect-object-injection -- idx is from findIndex on a controlled array, not user input
        allDays[idx] = {
          dayOfWeek: day.dayOfWeek,
          windows: day.windows.map(w => ({
            startTime: w.startTime,
            endTime: w.endTime,
            label: w.label ?? undefined,
            actions: w.actions.map(a => ({
              operation: normalizeOp(a.operation),
              boundaryType: a.boundaryType,
              targetGroupUuid: a.targetGroupUuid ?? undefined,
              sortOrder: a.sortOrder,
            })),
          })),
        };
      }
    }
  }

  return allDays;
}

export default function EditSchedulePage() {
  const { data: session, status: authStatus } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const scheduleId = params?.id as string;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchSchedule = useCallback(async () => {
    if (!scheduleId) return;
    setIsLoadingSchedule(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/schedules/${scheduleId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Schedule not found');
      }
      const data = await res.json();
      setSchedule(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    if (
      authStatus === 'authenticated' &&
      (session?.user?.role === Role.ADMIN || session?.user?.role === Role.SUPER_ADMIN)
    ) {
      fetchSchedule();
    }
  }, [authStatus, session, fetchSchedule]);

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
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </main>
        <AppFooter pageTitle="Admin Panel" />
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
          <Button onClick={() => router.push('/')}>Go to Self-Service</Button>
        </main>
      </div>
    );
  }

  async function handleSubmit(data: unknown) {
    const res = await fetch(`/api/admin/schedules/${scheduleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message ?? 'Failed to update schedule.',
      });
      return;
    }

    toast({ title: 'Schedule updated', description: 'The schedule has been updated successfully.' });
    router.push('/admin?tab=scheduling');
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <AppHeader />
      <main className="flex-grow container mx-auto px-4 py-4 pb-16 max-w-4xl flex flex-col min-h-0">
        {/* Back navigation */}
        <Button
          variant="ghost"
          className="shrink-0 mb-3 -ml-2 gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => router.push('/admin?tab=scheduling')}
        >
          <ClientOnly><ChevronLeft className="h-4 w-4" /></ClientOnly>
          Back to Scheduling
        </Button>

        <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <CardHeader className="shrink-0 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ClientOnly><CalendarClock className="h-5 w-5 text-primary shrink-0" /></ClientOnly>
                <div className="min-w-0">
                  <CardTitle className="text-2xl truncate">
                    {isLoadingSchedule ? 'Edit Schedule' : `Edit Schedule: ${schedule?.name ?? ''}`}
                  </CardTitle>
                  {!isLoadingSchedule && schedule && (
                    <CardDescription>Modify the schedule configuration.</CardDescription>
                  )}
                </div>
              </div>
              {!isLoadingSchedule && schedule && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setHistoryOpen(true)}
                >
                  <ClientOnly><History className="h-4 w-4 mr-2" /></ClientOnly>
                  History
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-auto p-4 pt-0">
            {/* Loading skeleton */}
            {isLoadingSchedule && (
              <div className="space-y-2 mt-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-3/4" />
              </div>
            )}

            {/* Error */}
            {!isLoadingSchedule && loadError && (
              <div className="flex flex-col items-center gap-4 py-12">
                <ClientOnly><AlertCircle className="h-12 w-12 text-destructive" /></ClientOnly>
                <p className="text-muted-foreground">{loadError}</p>
                <Button variant="outline" onClick={fetchSchedule}>Retry</Button>
              </div>
            )}

            {/* Form */}
            {!isLoadingSchedule && schedule && (
              <ScheduleForm
                initialValues={mapToFormValues(schedule)}
                initialDays={schedule.scheduleType === 'COMPLEX_WEEKLY' ? mapToDays(schedule) : undefined}
                onSubmit={handleSubmit}
                submitLabel="Save Changes"
              />
            )}
          </CardContent>
        </Card>
      </main>
      <AppFooter pageTitle="Admin Panel" />

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Execution History</SheetTitle>
            <SheetDescription>
              Past executions for <strong>{schedule?.name}</strong>.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-6 py-4">
            {historyOpen && <ExecutionHistory scheduleId={scheduleId} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
