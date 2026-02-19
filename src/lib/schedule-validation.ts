import { parseExpression } from 'cron-parser';
import { getNetworkGroups } from './opnsense-api';
import { logger } from './logger';
import type { CreateScheduleRequest } from '@/types/schedule';

/**
 * Validate cron expression format
 */
export function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  try {
    parseExpression(expression);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid cron expression'
    };
  }
}

/**
 * Validate OPNsense group UUID exists
 */
export async function validateGroupUuid(uuid: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const groups = await getNetworkGroups();
    const exists = groups.some(g => g.uuid === uuid);
    return exists
      ? { valid: true }
      : { valid: false, error: `Network group with UUID ${uuid} not found in OPNsense` };
  } catch (error) {
    logger.error('Error validating group UUID:', error);
    return { valid: false, error: 'Failed to validate group UUID with OPNsense' };
  }
}

/**
 * Validate schedule action constraints
 */
export function validateAction(action: {
  operation: string;
  targetGroupUuid?: string;
  fromGroupUuid?: string;
}): { valid: boolean; error?: string } {
  if (action.operation === 'MOVE') {
    if (!action.targetGroupUuid || !action.fromGroupUuid) {
      return { valid: false, error: 'MOVE operation requires both targetGroupUuid and fromGroupUuid' };
    }
  } else if (action.operation === 'CLEAR_ALL') {
    if (action.targetGroupUuid || action.fromGroupUuid) {
      return { valid: false, error: 'CLEAR_ALL operation should not have targetGroupUuid or fromGroupUuid' };
    }
  } else if (action.operation === 'ASSIGN' || action.operation === 'REMOVE') {
    if (!action.targetGroupUuid) {
      return { valid: false, error: `${action.operation} operation requires targetGroupUuid` };
    }
  }
  return { valid: true };
}

/**
 * Check for overlapping time windows within a day
 */
export function checkWindowOverlaps(windows: Array<{ startTime: string; endTime: string }>): {
  hasOverlap: boolean;
  overlaps?: Array<{ window1: number; window2: number }>
} {
  const overlaps: Array<{ window1: number; window2: number }> = [];

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      // eslint-disable-next-line security/detect-object-injection -- i and j are controlled loop variables, not user input
      const w1Start = timeToMinutes(windows[i].startTime);
      // eslint-disable-next-line security/detect-object-injection -- i and j are controlled loop variables, not user input
      const w1End = timeToMinutes(windows[i].endTime);
      // eslint-disable-next-line security/detect-object-injection -- i and j are controlled loop variables, not user input
      const w2Start = timeToMinutes(windows[j].startTime);
      // eslint-disable-next-line security/detect-object-injection -- i and j are controlled loop variables, not user input
      const w2End = timeToMinutes(windows[j].endTime);

      if (w1Start < w2End && w2Start < w1End) {
        overlaps.push({ window1: i, window2: j });
      }
    }
  }

  return overlaps.length > 0
    ? { hasOverlap: true, overlaps }
    : { hasOverlap: false };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Shared validation for schedule data — used by both POST (create) and PUT (update) handlers.
 * Performs all validations beyond what Zod covers: cron syntax, future executeAt,
 * group UUID existence in OPNsense, action constraints, and window overlap detection.
 *
 * Returns null if validation passes, or an error response object if it fails.
 */
export async function validateScheduleData(
  data: CreateScheduleRequest
): Promise<{ message: string; status: number } | null> {
  // Validate cron expression for RECURRING type
  if (data.scheduleType === 'RECURRING' && data.cronExpression) {
    const cronValidation = validateCronExpression(data.cronExpression);
    if (!cronValidation.valid) {
      return { message: `Invalid cron expression: ${cronValidation.error}`, status: 400 };
    }
  }

  // Validate executeAt is in the future for ONCE type
  if (data.scheduleType === 'ONCE' && data.executeAt) {
    const executeTime = new Date(data.executeAt);
    if (executeTime <= new Date()) {
      return { message: 'executeAt must be in the future', status: 400 };
    }
  }

  // Collect all group UUIDs referenced in actions
  const groupUuids = new Set<string>();
  const collectGroupUuids = (actions: Array<{ targetGroupUuid?: string; fromGroupUuid?: string }>) => {
    actions.forEach(action => {
      if (action.targetGroupUuid) groupUuids.add(action.targetGroupUuid);
      if (action.fromGroupUuid) groupUuids.add(action.fromGroupUuid);
    });
  };

  // Collect from days/windows and check for window overlaps per day
  if (data.days) {
    for (const day of data.days) {
      // Check overlaps ONCE per day (not per window)
      const overlapCheck = checkWindowOverlaps(day.windows);
      if (overlapCheck.hasOverlap) {
        logger.warn(`Overlapping windows detected in day ${day.dayOfWeek}`, overlapCheck.overlaps);
        // Advisory warning only — overlapping windows within a day are logged but not rejected
      }

      for (const window of day.windows) {
        collectGroupUuids(window.actions);
      }
    }
  }
  if (data.onceActions) collectGroupUuids(data.onceActions);
  if (data.recurringActions) collectGroupUuids(data.recurringActions);

  // Validate all referenced group UUIDs exist in OPNsense
  for (const uuid of groupUuids) {
    const groupValidation = await validateGroupUuid(uuid);
    if (!groupValidation.valid) {
      return { message: groupValidation.error!, status: 400 };
    }
  }

  // Validate action constraints (MOVE needs both UUIDs, CLEAR_ALL needs neither, etc.)
  const allActions = [
    ...(data.onceActions || []).map(a => ({ ...a, boundaryType: 'START' as const })),
    ...(data.recurringActions || []).map(a => ({ ...a, boundaryType: 'START' as const })),
    ...(data.days?.flatMap(d => d.windows.flatMap(w => w.actions)) || []),
  ];

  for (const action of allActions) {
    const actionValidation = validateAction(action);
    if (!actionValidation.valid) {
      return { message: actionValidation.error!, status: 400 };
    }
  }

  return null; // All validations passed
}
