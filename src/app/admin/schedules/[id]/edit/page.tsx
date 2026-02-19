'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types/opnsense';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';
import { Button } from '@/components/ui/button';
import { ClientOnly } from '@/components/util/ClientOnly';
import { ScheduleForm, type ScheduleFormValues } from '@/components/admin/schedules/ScheduleForm';
import { ExecutionHistory } from '@/components/admin/schedules/ExecutionHistory';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { CardSkeleton } from '@/components/ui/card-skeleton';
import type { ScheduleDayFormData } from '@/components/admin/schedules/ScheduleTimelineGrid';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, Ban, AlertCircle } from 'lucide-react';

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
  targetType: 'IP_LIST' | 'HOST_ALIAS' | 'NETWORK_GROUP';
  targetSelector: unknown;
  days?: Array<{
    dayOfWeek: number;
    windows: Array<{
      startTime: string;
      endTime: string;
      label?: string | null;
      actions: Array<{
        operation: 'ASSIGN' | 'REMOVE' | 'MOVE' | 'CLEAR_ALL';
        boundaryType: 'START' | 'END';
        targetGroupUuid?: string | null;
        fromGroupUuid?: string | null;
        sortOrder: number;
      }>;
    }>;
  }>;
  onceActions?: Array<{
    operation: 'ASSIGN' | 'REMOVE' | 'MOVE' | 'CLEAR_ALL';
    targetGroupUuid?: string | null;
    fromGroupUuid?: string | null;
    sortOrder: number;
  }>;
  recurringActions?: Array<{
    operation: 'ASSIGN' | 'REMOVE' | 'MOVE' | 'CLEAR_ALL';
    targetGroupUuid?: string | null;
    fromGroupUuid?: string | null;
    sortOrder: number;
  }>;
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
      operation: a.operation,
      targetGroupUuid: a.targetGroupUuid ?? undefined,
      fromGroupUuid: a.fromGroupUuid ?? undefined,
      sortOrder: a.sortOrder,
    })),
    cronExpression: schedule.cronExpression ?? '',
    recurringActions: (schedule.recurringActions ?? []).map(a => ({
      operation: a.operation,
      targetGroupUuid: a.targetGroupUuid ?? undefined,
      fromGroupUuid: a.fromGroupUuid ?? undefined,
      sortOrder: a.sortOrder,
    })),
    targetType: schedule.targetType,
    ipListText:
      schedule.targetType === 'IP_LIST'
        ? ((selector?.ips as string[]) ?? []).join('\n')
        : '',
    hostAliasUuids:
      schedule.targetType === 'HOST_ALIAS'
        ? ((selector?.hostAliasUuids as string[]) ?? [])
        : [],
    networkGroupUuid:
      schedule.targetType === 'NETWORK_GROUP'
        ? ((selector?.networkGroupUuid as string) ?? '')
        : '',
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
              operation: a.operation,
              boundaryType: a.boundaryType,
              targetGroupUuid: a.targetGroupUuid ?? undefined,
              fromGroupUuid: a.fromGroupUuid ?? undefined,
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
        <AppFooter pageTitle="Edit Schedule" />
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
      throw new Error(err.message ?? 'Update failed');
    }

    toast({ title: 'Schedule updated', description: 'The schedule has been updated successfully.' });
    router.push('/admin/schedules');
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader />
      <main className="flex-grow container mx-auto px-4 py-6 pb-20 max-w-4xl">
        <h1 className="text-3xl font-bold text-foreground mb-6">
          Edit Schedule{schedule ? `: ${schedule.name}` : ''}
        </h1>

        {/* Loading skeleton */}
        {isLoadingSchedule && (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {/* Error */}
        {!isLoadingSchedule && loadError && (
          <div className="flex flex-col items-center gap-4 py-12">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={fetchSchedule}>Retry</Button>
          </div>
        )}

        {/* Form */}
        {!isLoadingSchedule && schedule && (
          <div className="space-y-8">
            <ScheduleForm
              initialValues={mapToFormValues(schedule)}
              initialDays={schedule.scheduleType === 'COMPLEX_WEEKLY' ? mapToDays(schedule) : undefined}
              onSubmit={handleSubmit}
              submitLabel="Save Changes"
            />

            {/* Execution history */}
            <Accordion type="single" collapsible>
              <AccordionItem value="history">
                <AccordionTrigger className="text-base font-medium">
                  Execution History
                </AccordionTrigger>
                <AccordionContent>
                  <ExecutionHistory scheduleId={scheduleId} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </main>
      <AppFooter pageTitle="Edit Schedule" />
    </div>
  );
}
