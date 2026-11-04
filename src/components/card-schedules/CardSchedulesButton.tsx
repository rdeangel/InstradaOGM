'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CalendarClock, Timer, Info, ExternalLink, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import cronstrue from 'cronstrue';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useGroupType } from '@/context/GroupTypeContext';
import { globalSettingsEvents } from '@/lib/events/globalSettingsEvents';
import { logger } from '@/lib/logger';
import { RunInDelayModal } from '@/components/admin/schedules/RunInDelayModal';
import { ScheduleInfoModal } from '@/components/admin/schedules/ScheduleInfoModal';
import type { ScheduleListItem } from '@/components/admin/schedules/ScheduleListTable';
import { visibleCardSchedules, type CardSchedule, type AliasKind, type GroupType } from './card-schedules';

export interface CardSchedulesButtonProps {
  kind: AliasKind;
  aliasUuid: string | null;          // null -> render nothing
  currentGroupUuids: string[];       // alias's current memberships
  groupTypes?: Record<string, GroupType>; // HOST_ALIAS only; optional
}

const EMPTY_GROUP_TYPES: Record<string, GroupType> = {};

function renderScheduleTiming(schedule: CardSchedule) {
  const clockColor = schedule.enabled
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-amber-600 dark:text-amber-400';

  if (schedule.scheduleType === 'ONCE') {
    if (!schedule.executeAt) {
      return (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          <Clock className={`h-3 w-3 shrink-0 ${clockColor}`} />
          <span>No run time configured</span>
        </div>
      );
    }
    const date = new Date(schedule.executeAt);
    if (isNaN(date.getTime())) return null;

    const isFuture = date.getTime() > Date.now();
    const relative = formatDistanceToNow(date, { addSuffix: true });
    const formattedDate = format(date, 'PP p');

    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
        <Clock className={`h-3 w-3 shrink-0 ${clockColor}`} />
        <span className="font-medium text-foreground/90">
          {schedule.enabled
            ? (isFuture ? `Runs ${relative}` : `Scheduled for ${relative}`)
            : (isFuture ? `Set to run ${relative}` : `Scheduled for ${relative}`)}
        </span>
        <span className="text-muted-foreground/60">•</span>
        <span>{formattedDate}</span>
      </div>
    );
  }

  if (schedule.scheduleType === 'RECURRING') {
    let cronText: string | null = null;
    if (schedule.cronExpression) {
      try {
        cronText = cronstrue.toString(schedule.cronExpression);
      } catch {
        cronText = schedule.cronExpression;
      }
    }

    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
        <Clock className={`h-3 w-3 shrink-0 ${clockColor}`} />
        <span className="font-medium text-foreground/90">
          {schedule.enabled
            ? (cronText || 'Recurring schedule')
            : (cronText ? `Set to repeat: ${cronText}` : 'Recurring schedule')}
        </span>
        {schedule.cronExpression && cronText !== schedule.cronExpression && (
          <>
            <span className="text-muted-foreground/60">•</span>
            <span className="font-mono text-[10px] shrink-0">{schedule.cronExpression}</span>
          </>
        )}
      </div>
    );
  }

  if (schedule.scheduleType === 'COMPLEX_WEEKLY') {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
        <Clock className={`h-3 w-3 shrink-0 ${clockColor}`} />
        <span className="font-medium text-foreground/90">
          {schedule.enabled
            ? 'Active on configured weekly time windows'
            : 'Configured for weekly time windows'}
        </span>
      </div>
    );
  }

  return null;
}

export default function CardSchedulesButton(props: CardSchedulesButtonProps) {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const { enableGroupTypes } = useGroupType();

  const [cardSchedulesEnabled, setCardSchedulesEnabled] = useState(false);
  const [schedulesList, setSchedulesList] = useState<CardSchedule[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [runInSchedule, setRunInSchedule] = useState<CardSchedule | null>(null);
  const [infoSchedule, setInfoSchedule] = useState<CardSchedule | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isAdmin = status === 'authenticated' && (session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPER_ADMIN');

  // ponytail: list fetched once per mount; no polling by spec
  const fetchAll = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const settingsRes = await fetch('/api/settings/global-full', { cache: 'no-store' });
      const data = await settingsRes.json();
      const enabled = data.cardSchedulesEnabled ?? false;
      setCardSchedulesEnabled(enabled);
      if (enabled) {
        const schedulesRes = await fetch('/api/admin/schedules?withActions=1', { cache: 'no-store' });
        if (!schedulesRes.ok) throw new Error('Failed to fetch schedules');
        const schedulesData = await schedulesRes.json();
        setSchedulesList(Array.isArray(schedulesData) ? schedulesData : []);
      }
    } catch (error) {
      logger.error('[CardSchedulesButton] fetch error:', error);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (status !== 'loading') {
      fetchAll();
    }
  }, [fetchAll, status]);

  useEffect(() => {
    const unsubscribe = globalSettingsEvents.subscribe(() => {
      fetchAll();
    });
    return unsubscribe;
  }, [fetchAll]);

  const effectiveGroupTypes = props.groupTypes ?? EMPTY_GROUP_TYPES;
  const visible = useMemo(() => {
    if (!cardSchedulesEnabled || !props.aliasUuid) return [];
    return visibleCardSchedules(
      schedulesList,
      props.kind,
      props.aliasUuid,
      props.currentGroupUuids,
      { enableGroupTypes, groupTypes: effectiveGroupTypes }
    );
  }, [cardSchedulesEnabled, schedulesList, props.kind, props.aliasUuid, props.currentGroupUuids, enableGroupTypes, effectiveGroupTypes]);

  async function handleToggle(schedule: CardSchedule, enabled: boolean) {
    setTogglingId(schedule.id);
    try {
      const res = await fetch(`/api/admin/schedules/${schedule.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      await fetchAll();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to toggle schedule.' });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleRunInConfirm({ delayMinutes }: { delayMinutes: number }) {
    if (!runInSchedule) return;
    const res = await fetch(`/api/admin/schedules/${runInSchedule.id}/run-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delayMinutes }),
    });
    if (!res.ok) {
      let message = 'Failed to reschedule.';
      try {
        const data = await res.json();
        if (typeof data?.message === 'string') message = data.message;
      } catch {
        // ignore parse errors
      }
      toast({ variant: 'destructive', title: 'Error', description: message });
      throw new Error(message);
    }
    toast({ title: 'Rescheduled', description: `Scheduled "${runInSchedule.name}" to run in ${delayMinutes}m.` });
    setRunInSchedule(null);
    await fetchAll();
  }

  if (!isAdmin || !cardSchedulesEnabled) return null;
  if (visible.length === 0 && !modalOpen) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-1.5"
              aria-label="Schedules for this alias"
              onClick={() => setModalOpen(true)}
            >
              <CalendarClock className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Schedules ({visible.length})</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Schedules</DialogTitle>
            <DialogDescription>
              Schedules targeting this alias.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            {visible.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No schedules to show.
              </div>
            ) : (
              visible.map(schedule => (
                <div
                  key={schedule.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground shadow-sm gap-3 transition-opacity",
                    !schedule.enabled && "opacity-80"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{schedule.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {schedule.scheduleType}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] h-4 px-1.5 py-0 font-medium",
                          schedule.enabled
                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                            : "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                        )}
                      >
                        {schedule.enabled ? 'On' : 'Off'}
                      </Badge>
                    </div>
                    {renderScheduleTiming(schedule)}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={schedule.enabled}
                      disabled={togglingId === schedule.id}
                      onCheckedChange={(checked) => handleToggle(schedule, checked)}
                      aria-label={`Toggle ${schedule.name}`}
                    />

                    {schedule.scheduleType === 'ONCE' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => setRunInSchedule(schedule)}
                      >
                        <Timer className="h-3.5 w-3.5" />
                        Run in
                      </Button>
                    )}

                    {(schedule.scheduleType === 'ONCE' || schedule.scheduleType === 'RECURRING') && (
                      <Button variant="ghost" size="sm" asChild className="h-8 px-2">
                        <Link href={`/admin/schedules/${schedule.id}/edit`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="sr-only">Open in editor</span>
                        </Link>
                      </Button>
                    )}

                    {schedule.scheduleType === 'COMPLEX_WEEKLY' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => setInfoSchedule(schedule)}
                      >
                        <Info className="h-3.5 w-3.5" />
                        Summary
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {runInSchedule && (
        <RunInDelayModal
          open={!!runInSchedule}
          onOpenChange={(open) => { if (!open) setRunInSchedule(null); }}
          onConfirm={handleRunInConfirm}
          scheduleName={runInSchedule.name}
        />
      )}

      {infoSchedule && (
        <ScheduleInfoModal
          schedule={infoSchedule as unknown as ScheduleListItem}
          onClose={() => setInfoSchedule(null)}
        />
      )}
    </>
  );
}
