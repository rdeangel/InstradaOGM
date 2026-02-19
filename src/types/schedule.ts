import { z } from 'zod';

// Time format regex: HH:MM in 24-hour format
const TIME_FORMAT_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Action schema (reused across window actions, once actions, recurring actions)
const actionSchema = z.object({
  operation: z.enum(['ASSIGN', 'REMOVE', 'MOVE', 'CLEAR_ALL']),
  boundaryType: z.enum(['START', 'END']),
  targetGroupUuid: z.string().optional(),
  fromGroupUuid: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

// Standalone action schema (for ONCE and RECURRING — no boundaryType needed, always START)
const standaloneActionSchema = z.object({
  operation: z.enum(['ASSIGN', 'REMOVE', 'MOVE', 'CLEAR_ALL']),
  targetGroupUuid: z.string().optional(),
  fromGroupUuid: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

// Time window schema with overnight validation
export const timeWindowSchema = z.object({
  startTime: z.string().regex(TIME_FORMAT_REGEX, 'Invalid time format. Use HH:MM (24-hour)'),
  endTime: z.string().regex(TIME_FORMAT_REGEX, 'Invalid time format. Use HH:MM (24-hour)'),
  label: z.string().max(100).optional(),
  actions: z.array(actionSchema).min(1, 'Each window must have at least one action'),
}).refine(data => {
  const [startHour, startMin] = data.startTime.split(':').map(Number);
  const [endHour, endMin] = data.endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return startMinutes < endMinutes;
}, { message: 'Start time must be before end time. Overnight windows are not supported.' });

export const scheduleDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  windows: z.array(timeWindowSchema).min(1, 'Each day must have at least one window'),
});

// Target selector schemas — discriminated by targetType
const ipListSelector = z.object({ ips: z.array(z.string().ip()).min(1) });
const hostAliasSelector = z.object({ hostAliasUuids: z.array(z.string()).min(1) });
const networkGroupSelector = z.object({ networkGroupUuid: z.string() });

export const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(0),
  scheduleType: z.enum(['COMPLEX_WEEKLY', 'ONCE', 'RECURRING']),

  // Timezone — validated against IANA timezone database
  timezone: z.string().refine(
    (tz) => {
      try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; } catch { return false; }
    },
    { message: 'Invalid IANA timezone identifier (e.g., "Europe/London", "America/New_York", "UTC")' }
  ),

  // ONCE fields
  executeAt: z.string().datetime().optional(),
  onceActions: z.array(standaloneActionSchema).optional(),

  // RECURRING fields
  cronExpression: z.string().optional(),
  recurringActions: z.array(standaloneActionSchema).optional(),

  // COMPLEX_WEEKLY fields
  days: z.array(scheduleDaySchema).optional(),

  // Targeting
  targetType: z.enum(['IP_LIST', 'HOST_ALIAS', 'NETWORK_GROUP']),
  targetSelector: z.union([ipListSelector, hostAliasSelector, networkGroupSelector]),
})
// Cross-validate targetSelector shape matches targetType
.refine(data => {
  if (data.targetType === 'IP_LIST') return 'ips' in data.targetSelector;
  if (data.targetType === 'HOST_ALIAS') return 'hostAliasUuids' in data.targetSelector;
  if (data.targetType === 'NETWORK_GROUP') return 'networkGroupUuid' in data.targetSelector;
  return false;
}, { message: 'targetSelector shape must match targetType' })
// Cross-validate schedule type has required fields
.refine(data => {
  if (data.scheduleType === 'COMPLEX_WEEKLY') {
    return data.days && data.days.length > 0;
  }
  if (data.scheduleType === 'ONCE') {
    return data.executeAt && data.onceActions && data.onceActions.length > 0;
  }
  if (data.scheduleType === 'RECURRING') {
    return data.cronExpression && data.recurringActions && data.recurringActions.length > 0;
  }
  return true;
}, { message: 'Invalid schedule configuration for the selected type' });

export const updateScheduleSchema = createScheduleSchema;

export const toggleScheduleSchema = z.object({
  enabled: z.boolean(),
});

export const executionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED']).optional(),
});

// Type exports
export type CreateScheduleRequest = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleRequest = z.infer<typeof updateScheduleSchema>;
export type ToggleScheduleRequest = z.infer<typeof toggleScheduleSchema>;
