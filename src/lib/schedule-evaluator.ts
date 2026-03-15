/**
 * schedule-evaluator.ts
 *
 * Pure, side-effect-free evaluation of ScheduledAssignment records.
 * No I/O: accepts already-fetched schedule data and a target Date, then
 * returns a typed array of EvaluationMatch entries describing every rule that
 * would be active or would fire at that moment.
 *
 * Also exports the `wallClockToUtc` and `computeNextOccurrence` timezone
 * utilities so they can be reused by the execution service without coupling
 * server-only imports into this module.
 *
 * Used by:
 *   POST /api/admin/schedules/evaluate   (dry-run evaluation at an arbitrary moment)
 *   schedule-execution-service.ts        (boundary computation loop)
 */

import { CronExpressionParser } from 'cron-parser';

// ── Constants ─────────────────────────────────────────────────────────────────

/** How close (ms) targetDate must be to a boundary time to count as a match. */
const BOUNDARY_TOLERANCE_MS = 60_000; // ±1 minute

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvaluationAction {
  operation: string;
  boundaryType: string;
  targetGroupUuid: string | null;
  fromGroupUuid: string | null;
  sortOrder: number;
}

/**
 * A single matching entry returned by `evaluateSchedulesAt`.
 * Each entry corresponds to one schedule + window pair that matches the target
 * date/time in some way (START boundary, END boundary, or active mid-run window).
 */
export interface EvaluationMatch {
  scheduleId: string;
  scheduleName: string;
  scheduleType: string;
  timezone: string;
  /**
   * Human-readable description of why this schedule matched.
   * One of:
   *   "START boundary"          – targetDate is within ±1 min of a window START
   *   "END boundary"            – targetDate is within ±1 min of a window END
   *   "Active window (mid-run)" – targetDate falls inside an active window
   *   "Fires at this time"      – ONCE or RECURRING schedule fires at targetDate
   */
  matchStatus: string;
  /** Optional user-defined label for the matched time window (COMPLEX_WEEKLY only). */
  matchedWindowLabel?: string;
  /** Wall-clock START time for the matched window (COMPLEX_WEEKLY only). */
  windowStartTime?: string;
  /** Wall-clock END time for the matched window (COMPLEX_WEEKLY only). */
  windowEndTime?: string;
  /** Actions associated with this match (filtered to the relevant boundary). */
  actions: EvaluationAction[];
  targetType: string;
  targetSelector: unknown;
}

/** Minimal schedule shape required by the evaluator. */
export interface EvaluatorSchedule {
  id: string;
  name: string;
  scheduleType: string;
  timezone: string;
  enabled: boolean;
  executeAt: Date | null;
  cronExpression: string | null;
  targetType: string;
  targetSelector: unknown;
  days: Array<{
    dayOfWeek: number;
    windows: Array<{
      id: string;
      startTime: string;
      endTime: string;
      label: string | null;
      actions: EvaluationAction[];
    }>;
  }>;
  onceActions: EvaluationAction[];
  recurringActions: EvaluationAction[];
}

// ── Timezone utilities ────────────────────────────────────────────────────────

/**
 * Convert a wall-clock YYYY-MM-DD + HH:MM in a given timezone to a UTC Date.
 * Uses the Intl round-trip technique — no external library needed.
 */
export function wallClockToUtc(dateStr: string, timeHHMM: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeHHMM.split(':').map(Number);

  const candidate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(candidate);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const tzYear = get('year');
  const tzMonth = get('month');
  const tzDay = get('day');
  const tzHour = get('hour') === 24 ? 0 : get('hour');
  const tzMinute = get('minute');
  const tzSecond = get('second');

  const tzAssumedUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
  const offsetMs = candidate.getTime() - tzAssumedUtc;
  const result = new Date(candidate.getTime() + offsetMs);

  // DST spring-forward check
  const verifyParts = formatter.formatToParts(result);
  const vGet = (type: string) => Number(verifyParts.find((p) => p.type === type)?.value ?? 0);
  const vHour = vGet('hour') === 24 ? 0 : vGet('hour');
  const vMinute = vGet('minute');

  if (vHour !== hours || vMinute !== minutes) {
    let advanced = new Date(result.getTime() + 60_000);
    for (let i = 0; i < 120; i++) {
      const ap = formatter.formatToParts(advanced);
      const ah = Number(ap.find((p) => p.type === 'hour')?.value ?? 0);
      const am = Number(ap.find((p) => p.type === 'minute')?.value ?? 0);
      if (ah > hours || (ah === hours && am >= minutes)) break;
      advanced = new Date(advanced.getTime() + 60_000);
    }
    return advanced;
  }

  return result;
}

/**
 * Compute the next occurrence of a given day-of-week + HH:MM in a timezone,
 * strictly after `after`.
 *
 * @param dayOfWeek  0 = Sunday … 6 = Saturday
 * @param timeHHMM   "HH:MM" 24-hour wall-clock time
 * @param timezone   IANA timezone string
 * @param after      Reference Date; result is strictly after this
 */
export function computeNextOccurrence(
  dayOfWeek: number,
  timeHHMM: string,
  timezone: string,
  after: Date,
): Date {
  const dowFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const tzDateStr = dateFormatter.format(after);
  const tzDow = dayNames.indexOf(dowFormatter.format(after));
  const daysUntil = (dayOfWeek - tzDow + 7) % 7;

  const buildCandidate = (daysOffset: number): Date => {
    const [yr, mo, dy] = tzDateStr.split('-').map(Number);
    const base = new Date(Date.UTC(yr, mo - 1, dy));
    base.setUTCDate(base.getUTCDate() + daysOffset);
    const yr2 = base.getUTCFullYear();
    const mo2 = String(base.getUTCMonth() + 1).padStart(2, '0');
    const dy2 = String(base.getUTCDate()).padStart(2, '0');
    return wallClockToUtc(`${yr2}-${mo2}-${dy2}`, timeHHMM, timezone);
  };

  let candidate = buildCandidate(daysUntil);
  if (candidate.getTime() <= after.getTime()) {
    candidate = buildCandidate(daysUntil + 7);
  }
  return candidate;
}

/**
 * Compute the most recent occurrence of a given day-of-week + HH:MM in a
 * timezone that is at or before `atOrBefore`.
 *
 * @param dayOfWeek  0 = Sunday … 6 = Saturday
 * @param timeHHMM   "HH:MM" 24-hour wall-clock time
 * @param timezone   IANA timezone string
 * @param atOrBefore Reference Date; result is at or before this
 */
function computeMostRecentOccurrence(
  dayOfWeek: number,
  timeHHMM: string,
  timezone: string,
  atOrBefore: Date,
): Date {
  const dowFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const tzDateStr = dateFormatter.format(atOrBefore);
  const tzDow = dayNames.indexOf(dowFormatter.format(atOrBefore));

  // Days elapsed since the last occurrence of dayOfWeek
  const daysSince = (tzDow - dayOfWeek + 7) % 7;

  const buildCandidate = (daysOffset: number): Date => {
    const [yr, mo, dy] = tzDateStr.split('-').map(Number);
    const base = new Date(Date.UTC(yr, mo - 1, dy));
    base.setUTCDate(base.getUTCDate() + daysOffset);
    const yr2 = base.getUTCFullYear();
    const mo2 = String(base.getUTCMonth() + 1).padStart(2, '0');
    const dy2 = String(base.getUTCDate()).padStart(2, '0');
    return wallClockToUtc(`${yr2}-${mo2}-${dy2}`, timeHHMM, timezone);
  };

  let candidate = buildCandidate(-daysSince);

  // If the candidate overshot (e.g., DST made it land after atOrBefore), step back 7 days
  if (candidate.getTime() > atOrBefore.getTime()) {
    candidate = buildCandidate(-daysSince - 7);
  }

  return candidate;
}

// ── Main evaluation function ──────────────────────────────────────────────────

/**
 * Evaluate all provided schedules against `targetDate` and return every
 * matching entry.
 *
 * The function is pure: it performs no I/O and does not filter by `enabled`.
 * Callers are responsible for pre-filtering schedules as desired.
 *
 * Matching rules:
 *   COMPLEX_WEEKLY
 *     – START boundary: targetDate within ±1 min of a window's wall-clock START
 *     – END boundary:   targetDate within ±1 min of a window's wall-clock END
 *     – Mid-run:        targetDate falls strictly between the most recent START
 *                       and the corresponding END for this window cycle
 *   ONCE
 *     – targetDate within ±1 min of schedule.executeAt
 *   RECURRING
 *     – targetDate within ±1 min of a cron occurrence
 */
export function evaluateSchedulesAt(
  schedules: EvaluatorSchedule[],
  targetDate: Date,
): EvaluationMatch[] {
  const matches: EvaluationMatch[] = [];

  for (const schedule of schedules) {
    // ── COMPLEX_WEEKLY ───────────────────────────────────────────────────────
    if (schedule.scheduleType === 'COMPLEX_WEEKLY') {
      for (const day of schedule.days) {
        for (const window of day.windows) {
          // ── START boundary ──────────────────────────────────────────────
          // Check both the most-recent and the next occurrence so that
          // targetDate within ±1 min of *either* side is matched.
          const prevStart = computeMostRecentOccurrence(
            day.dayOfWeek, window.startTime, schedule.timezone, targetDate,
          );
          const nextStart = computeNextOccurrence(
            day.dayOfWeek, window.startTime, schedule.timezone, targetDate,
          );
          const diffPrevStart = Math.abs(targetDate.getTime() - prevStart.getTime());
          const diffNextStart = Math.abs(targetDate.getTime() - nextStart.getTime());

          if (diffPrevStart <= BOUNDARY_TOLERANCE_MS || diffNextStart <= BOUNDARY_TOLERANCE_MS) {
            matches.push({
              scheduleId: schedule.id,
              scheduleName: schedule.name,
              scheduleType: schedule.scheduleType,
              timezone: schedule.timezone,
              matchStatus: 'START boundary',
              matchedWindowLabel: window.label ?? undefined,
              windowStartTime: window.startTime,
              windowEndTime: window.endTime,
              actions: window.actions
                .filter((a) => a.boundaryType === 'START')
                .sort((a, b) => a.sortOrder - b.sortOrder),
              targetType: schedule.targetType,
              targetSelector: schedule.targetSelector,
            });
          }

          // ── END boundary ────────────────────────────────────────────────
          const prevEnd = computeMostRecentOccurrence(
            day.dayOfWeek, window.endTime, schedule.timezone, targetDate,
          );
          const nextEnd = computeNextOccurrence(
            day.dayOfWeek, window.endTime, schedule.timezone, targetDate,
          );
          const diffPrevEnd = Math.abs(targetDate.getTime() - prevEnd.getTime());
          const diffNextEnd = Math.abs(targetDate.getTime() - nextEnd.getTime());

          if (diffPrevEnd <= BOUNDARY_TOLERANCE_MS || diffNextEnd <= BOUNDARY_TOLERANCE_MS) {
            matches.push({
              scheduleId: schedule.id,
              scheduleName: schedule.name,
              scheduleType: schedule.scheduleType,
              timezone: schedule.timezone,
              matchStatus: 'END boundary',
              matchedWindowLabel: window.label ?? undefined,
              windowStartTime: window.startTime,
              windowEndTime: window.endTime,
              actions: window.actions
                .filter((a) => a.boundaryType === 'END')
                .sort((a, b) => a.sortOrder - b.sortOrder),
              targetType: schedule.targetType,
              targetSelector: schedule.targetSelector,
            });
          }

          // ── Active window (mid-run) ──────────────────────────────────────
          // Find the most recent START strictly before targetDate (not within
          // boundary tolerance) and check that targetDate falls before the
          // corresponding END for that window cycle.
          const recentStart = computeMostRecentOccurrence(
            day.dayOfWeek, window.startTime, schedule.timezone, targetDate,
          );
          const cycleEnd = computeNextOccurrence(
            day.dayOfWeek, window.endTime, schedule.timezone, recentStart,
          );

          const pastStart = recentStart.getTime() < targetDate.getTime() - BOUNDARY_TOLERANCE_MS;
          const beforeEnd = targetDate.getTime() < cycleEnd.getTime() - BOUNDARY_TOLERANCE_MS;

          if (pastStart && beforeEnd) {
            matches.push({
              scheduleId: schedule.id,
              scheduleName: schedule.name,
              scheduleType: schedule.scheduleType,
              timezone: schedule.timezone,
              matchStatus: 'Active window (mid-run)',
              matchedWindowLabel: window.label ?? undefined,
              windowStartTime: window.startTime,
              windowEndTime: window.endTime,
              // Report the upcoming END actions — the pending stop operations
              actions: window.actions
                .filter((a) => a.boundaryType === 'END')
                .sort((a, b) => a.sortOrder - b.sortOrder),
              targetType: schedule.targetType,
              targetSelector: schedule.targetSelector,
            });
          }
        }
      }

    // ── ONCE ─────────────────────────────────────────────────────────────────
    } else if (schedule.scheduleType === 'ONCE') {
      if (!schedule.executeAt) continue;

      const diff = Math.abs(targetDate.getTime() - schedule.executeAt.getTime());
      if (diff <= BOUNDARY_TOLERANCE_MS) {
        matches.push({
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          scheduleType: schedule.scheduleType,
          timezone: schedule.timezone,
          matchStatus: 'Fires at this time',
          actions: [...schedule.onceActions].sort((a, b) => a.sortOrder - b.sortOrder),
          targetType: schedule.targetType,
          targetSelector: schedule.targetSelector,
        });
      }

    // ── RECURRING ────────────────────────────────────────────────────────────
    } else if (schedule.scheduleType === 'RECURRING') {
      if (!schedule.cronExpression) continue;

      try {
        // Start parsing from (targetDate - tolerance - 1 ms) so that the first
        // `.next()` call can land within the tolerance window of targetDate.
        const expr = CronExpressionParser.parse(schedule.cronExpression, {
          tz: schedule.timezone || 'UTC',
          currentDate: new Date(targetDate.getTime() - BOUNDARY_TOLERANCE_MS - 1),
        });

        const occurrence = expr.next().toDate();
        const diff = Math.abs(targetDate.getTime() - occurrence.getTime());

        if (diff <= BOUNDARY_TOLERANCE_MS) {
          matches.push({
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            scheduleType: schedule.scheduleType,
            timezone: schedule.timezone,
            matchStatus: 'Fires at this time',
            actions: [...schedule.recurringActions].sort((a, b) => a.sortOrder - b.sortOrder),
            targetType: schedule.targetType,
            targetSelector: schedule.targetSelector,
          });
        }
      } catch {
        // Invalid cron expression — skip this schedule silently; the execution
        // service will emit a warning when it encounters the same.
      }
    }
  }

  return matches;
}
