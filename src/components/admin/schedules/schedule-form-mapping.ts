import type { ScheduleFormValues } from '@/components/admin/schedules/ScheduleForm';
import type { ScheduleDayFormData } from '@/components/admin/schedules/ScheduleTimelineGrid';

export interface ScheduleDetailForForm {
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

function normalizeOp(op: string): 'ASSIGN' | 'UNASSIGN' | 'CLEAR_ALL' {
  if (op === 'REMOVE') return 'UNASSIGN';
  if (op === 'MOVE') return 'ASSIGN';
  if (op === 'ASSIGN' || op === 'UNASSIGN' || op === 'CLEAR_ALL') return op;
  return 'ASSIGN';
}

export function mapToFormValues(schedule: ScheduleDetailForForm): Partial<ScheduleFormValues> {
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
    targetType: (schedule.targetType === 'NETWORK_ALIAS' ? 'NETWORK_ALIAS' : 'HOST_ALIAS') as 'HOST_ALIAS' | 'NETWORK_ALIAS',
    hostAliasUuids: (selector?.hostAliasUuids as string[]) ?? [],
    networkAliasUuids: (selector?.networkAliasUuids as string[]) ?? [],
  };
}

export function mapToDays(schedule: ScheduleDetailForForm): ScheduleDayFormData[] {
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

/** Stable identity of saved schedule fields used to remount the edit form. */
export function scheduleFormResetKey(schedule: ScheduleDetailForForm): string {
  return JSON.stringify({
    id: schedule.id,
    name: schedule.name,
    description: schedule.description,
    enabled: schedule.enabled,
    priority: schedule.priority,
    scheduleType: schedule.scheduleType,
    timezone: schedule.timezone,
    executeAt: schedule.executeAt ? new Date(schedule.executeAt).toISOString() : null,
    cronExpression: schedule.cronExpression,
    targetType: schedule.targetType,
    targetSelector: schedule.targetSelector,
    days: schedule.days,
    onceActions: schedule.onceActions,
    recurringActions: schedule.recurringActions,
  });
}
