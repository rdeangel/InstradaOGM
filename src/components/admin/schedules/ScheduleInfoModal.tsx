'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import cronstrue from 'cronstrue';
import { useOpnsenseNetworkGroups } from '@/hooks/use-opnsense-network-groups';
import type { ScheduleListItem } from './ScheduleListTable';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScheduleAction {
  operation: 'ASSIGN' | 'UNASSIGN' | 'CLEAR_ALL';
  boundaryType: 'START' | 'END';
  targetGroupUuid: string | null;
  sortOrder: number;
}

interface TimeWindow {
  id: string;
  startTime: string;
  endTime: string;
  label?: string | null;
  actions: ScheduleAction[];
}

interface ScheduleDay {
  id: string;
  dayOfWeek: number;
  windows: TimeWindow[];
}

interface ScheduleDetail {
  id: string;
  name: string;
  description: string | null;
  scheduleType: 'COMPLEX_WEEKLY' | 'ONCE' | 'RECURRING';
  enabled: boolean;
  priority: number;
  timezone: string;
  executeAt?: string | null;
  cronExpression?: string | null;
  days?: ScheduleDay[];
  onceActions?: ScheduleAction[];
  recurringActions?: ScheduleAction[];
}

interface ScheduleInfoModalProps {
  schedule: ScheduleListItem | null;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function operationLabel(op: string): string {
  switch (op) {
    case 'ASSIGN': return 'Assign';
    case 'UNASSIGN': return 'Unassign';
    case 'CLEAR_ALL': return 'Clear All';
    default: return op;
  }
}

function operationVariant(op: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (op) {
    case 'ASSIGN': return 'default';
    case 'UNASSIGN': return 'destructive';
    case 'CLEAR_ALL': return 'secondary';
    default: return 'outline';
  }
}

function boundaryLabel(b: string): string {
  return b === 'START' ? 'at start' : 'at end';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActionRow({
  action,
  groupName,
}: {
  action: ScheduleAction;
  groupName: string | undefined;
}) {
  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      <Badge variant={operationVariant(action.operation)} className="text-xs shrink-0 w-20 justify-center">
        {operationLabel(action.operation)}
      </Badge>
      {action.operation !== 'CLEAR_ALL' && (
        <span className="text-muted-foreground shrink-0 text-xs">{boundaryLabel(action.boundaryType)}</span>
      )}
      {action.operation !== 'CLEAR_ALL' && groupName && (
        <span className="font-medium truncate">{groupName}</span>
      )}
      {action.operation !== 'CLEAR_ALL' && !groupName && (
        <span className="text-muted-foreground italic text-xs">Unknown group</span>
      )}
    </div>
  );
}

function WindowBlock({
  window: win,
  groupMap,
}: {
  window: TimeWindow;
  groupMap: Map<string, string>;
}) {
  return (
    <div className="rounded-md border px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium">
          {win.startTime} – {win.endTime}
        </span>
        {win.label && (
          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{win.label}</span>
        )}
      </div>
      <div className="space-y-0.5 pl-1">
        {win.actions.map((action, i) => (
          <ActionRow
            key={i}
            action={action}
            groupName={action.targetGroupUuid ? groupMap.get(action.targetGroupUuid) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 pt-2">
      <Skeleton className="h-4 w-1/3" />
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ScheduleInfoModal({ schedule, onClose }: ScheduleInfoModalProps) {
  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { groups } = useOpnsenseNetworkGroups();

  const groupMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) {
      m.set(g.uuid, g.friendlyName ?? g.name);
    }
    return m;
  }, [groups]);

  useEffect(() => {
    if (!schedule) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/admin/schedules/${schedule.id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load schedule detail');
        return res.json();
      })
      .then((data: ScheduleDetail) => {
        setDetail(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load schedule');
        setLoading(false);
      });
  }, [schedule]);

  return (
    <Dialog open={!!schedule} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base leading-snug">
            {schedule?.name ?? 'Schedule Info'}
          </DialogTitle>
          {detail && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="text-xs">{detail.scheduleType === 'COMPLEX_WEEKLY' ? 'Weekly' : detail.scheduleType}</Badge>
              <Badge variant={detail.enabled ? 'default' : 'secondary'} className="text-xs">
                {detail.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <span className="text-xs text-muted-foreground">Priority: {detail.priority}</span>
              <span className="text-xs text-muted-foreground">TZ: {detail.timezone}</span>
            </div>
          )}
        </DialogHeader>

        <Separator className="shrink-0" />

        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 space-y-4 py-2 pr-1">
            {loading && <LoadingSkeleton />}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {detail && !loading && (
              <>
                {detail.description && (
                  <p className="text-sm text-muted-foreground">{detail.description}</p>
                )}

                {/* COMPLEX_WEEKLY */}
                {detail.scheduleType === 'COMPLEX_WEEKLY' && detail.days && (
                  <div className="space-y-4">
                    {detail.days.map(day => (
                      <div key={day.id} className="space-y-2">
                        <p className="text-sm font-semibold">{DAY_NAMES[day.dayOfWeek]}</p>
                        <div className="space-y-2 pl-2">
                          {day.windows.map(win => (
                            <WindowBlock key={win.id} window={win} groupMap={groupMap} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ONCE */}
                {detail.scheduleType === 'ONCE' && (
                  <div className="space-y-2">
                    {detail.executeAt && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Executes at: </span>
                        <span className="font-medium">
                          {new Date(detail.executeAt).toLocaleString()}
                        </span>
                      </p>
                    )}
                    <div className="space-y-1">
                      {(detail.onceActions ?? []).map((action, i) => (
                        <ActionRow
                          key={i}
                          action={action}
                          groupName={action.targetGroupUuid ? groupMap.get(action.targetGroupUuid) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* RECURRING */}
                {detail.scheduleType === 'RECURRING' && (
                  <div className="space-y-2">
                    {detail.cronExpression && (
                      <div className="space-y-0.5">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Cron: </span>
                          <span className="font-mono font-medium">{detail.cronExpression}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {(() => {
                            try { return cronstrue.toString(detail.cronExpression); }
                            catch { return null; }
                          })()}
                        </p>
                      </div>
                    )}
                    <div className="space-y-1">
                      {(detail.recurringActions ?? []).map((action, i) => (
                        <ActionRow
                          key={i}
                          action={action}
                          groupName={action.targetGroupUuid ? groupMap.get(action.targetGroupUuid) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
