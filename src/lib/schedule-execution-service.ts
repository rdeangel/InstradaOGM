// src/lib/schedule-execution-service.ts
import 'server-only';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  getNetworkGroups,
  exportAliases,
  parseGroupContent,
  batchAliasOperations,
  getBestHostAliasName,
  type BatchAliasOperation,
} from '@/lib/opnsense-api';
import { logAuditEvent } from '@/lib/auditLog';
import {
  getServiceState,
  setServiceState,
  clearServiceState,
  updateServiceActivity,
} from '@/lib/server/service-state-manager';
import { CronExpressionParser } from 'cron-parser';

// ─── Internal types ───────────────────────────────────────────────────────────

interface BoundaryEvent {
  scheduleId: string;
  scheduleType: 'COMPLEX_WEEKLY' | 'ONCE' | 'RECURRING';
  boundaryType: 'START' | 'END';
  firesAt: Date;
  windowId?: string;
  priority: number;
  retryCount: number;
}

interface ActionResult {
  operation: string;
  targetGroupUuid?: string | null;
  fromGroupUuid?: string | null;
  ip: string;
  success: boolean;
  error?: string;
}

interface NetworkAliasActionResult {
  operation: string;
  targetGroupUuid?: string | null;
  fromGroupUuid?: string | null;
  aliasName: string;
  success: boolean;
  error?: string;
}

interface ExecutionSummary {
  targetIps: string[];
  targetAliasNames?: string[];
  actionsRun: ActionResult[] | NetworkAliasActionResult[];
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  errorMessage?: string;
}

// ─── Inline mutex ─────────────────────────────────────────────────────────────

class OPNsenseMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => {
            this.locked = false;
            const next = this.queue.shift();
            if (next) next();
          });
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }
}

// ─── Timezone utilities ───────────────────────────────────────────────────────

/**
 * Convert a wall-clock YYYY-MM-DD + HH:MM in a given timezone to a UTC Date.
 * Uses the Intl round-trip technique — no external library needed.
 */
function wallClockToUtc(dateStr: string, timeHHMM: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeHHMM.split(':').map(Number);

  // Build an ISO-like string that we feed to Date, then correct for TZ offset.
  // We construct the candidate as if it were UTC, check what wall-clock time
  // that corresponds to in the target TZ, and binary-search for the offset.
  const candidate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));

  // Get the wall-clock parts in the target timezone for this candidate
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

  // Offset between what we assumed (UTC) and what TZ says
  const tzAssumedUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
  const offsetMs = candidate.getTime() - tzAssumedUtc;

  const result = new Date(candidate.getTime() + offsetMs);

  // DST spring-forward check: verify the result maps back to the intended wall clock
  const verifyParts = formatter.formatToParts(result);
  const vGet = (type: string) => Number(verifyParts.find((p) => p.type === type)?.value ?? 0);
  const vHour = vGet('hour') === 24 ? 0 : vGet('hour');
  const vMinute = vGet('minute');

  if (vHour !== hours || vMinute !== minutes) {
    // The wall-clock time doesn't exist in this timezone (spring-forward gap).
    // Advance by 1 minute until we land in a valid slot past the gap.
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
 * @param dayOfWeek  0 = Sunday … 6 = Saturday (matches Prisma schema)
 * @param timeHHMM   "HH:MM" 24-hour wall-clock time
 * @param timezone   IANA timezone string
 * @param after      Reference Date; result must be strictly after this
 */
function computeNextOccurrence(
  dayOfWeek: number,
  timeHHMM: string,
  timezone: string,
  after: Date,
): Date {
  // Get current wall-clock weekday in the target timezone
  const dowFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const tzDateStr = dateFormatter.format(after); // YYYY-MM-DD
  const tzDow = dayNames.indexOf(dowFormatter.format(after)); // 0-6

  // Days until the target weekday
  const daysUntil = (dayOfWeek - tzDow + 7) % 7;

  // Build candidate date string in target TZ
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

  // If the candidate is not strictly after `after`, advance by 7 days
  if (candidate.getTime() <= after.getTime()) {
    candidate = buildCandidate(daysUntil + 7);
  }

  return candidate;
}

// ─── ScheduleExecutionService ─────────────────────────────────────────────────

class ScheduleExecutionService {
  private isRunning = false;
  private precisionTimerId: NodeJS.Timeout | null = null;
  private reconciliationIntervalId: NodeJS.Timeout | null = null;
  private mutex = new OPNsenseMutex();
  private nextBoundaryAt: Date | null = null;
  private lastExecutedAt: Date | null = null;

  /** retryMap key: `${scheduleId}:${boundaryType}:${windowId ?? 'root'}` */
  private retryMap = new Map<string, { count: number; nextRetryAt: Date; event: BoundaryEvent }>();

  /** Boundaries currently executing — prevents concurrent duplicate firings (precision timer vs reconciliation sweep). */
  private inProgress = new Set<string>();
  /** Boundaries recently executed successfully — prevents double-execution within a 2-minute window. */
  private recentlyExecuted = new Map<string, Date>();

  // ─── Public API ─────────────────────────────────────────────────────────────

  start(): void {
    const existingState = getServiceState('schedule-execution');
    if (existingState?.isRunning) {
      logger.info('Schedule execution service already running (cross-worker guard)');
      return;
    }

    if (this.isRunning) {
      logger.warn('Schedule execution service already running in this worker');
      return;
    }

    this.isRunning = true;
    logger.info('Starting schedule execution service');

    setServiceState('schedule-execution', {
      isRunning: true,
      startedAt: new Date().toISOString(),
      workerPid: process.pid,
    });

    // Catch missed boundaries from downtime
    this.runReconciliationSweep().catch((err) =>
      logger.error('Initial reconciliation sweep failed:', err),
    );

    // Arm precision timer
    this.scheduleNextBoundary().catch((err) =>
      logger.error('Initial scheduleNextBoundary failed:', err),
    );

    // 5-minute reconciliation interval
    this.reconciliationIntervalId = setInterval(() => {
      this.runReconciliationSweep().catch((err) =>
        logger.error('Reconciliation sweep error:', err),
      );
    }, 5 * 60 * 1000);

    logger.info('Schedule execution service started');
  }

  stop(): void {
    clearServiceState('schedule-execution');

    if (this.precisionTimerId) {
      clearTimeout(this.precisionTimerId);
      this.precisionTimerId = null;
    }
    if (this.reconciliationIntervalId) {
      clearInterval(this.reconciliationIntervalId);
      this.reconciliationIntervalId = null;
    }

    this.isRunning = false;
    logger.info('Schedule execution service stopped');
  }

  getStatus(): {
    isRunning: boolean;
    precisionTimerId: NodeJS.Timeout | null;
    reconciliationIntervalId: NodeJS.Timeout | null;
    nextBoundaryAt: Date | null;
    lastExecutedAt: Date | null;
  } {
    return {
      isRunning: this.isRunning,
      precisionTimerId: this.precisionTimerId,
      reconciliationIntervalId: this.reconciliationIntervalId,
      nextBoundaryAt: this.nextBoundaryAt,
      lastExecutedAt: this.lastExecutedAt,
    };
  }

  /**
   * Call after any schedule is created, updated, enabled, or disabled.
   * Re-arms the precision timer so changes take effect immediately.
   */
  async notifyScheduleChanged(): Promise<void> {
    if (!this.isRunning) return;
    await this.scheduleNextBoundary();
  }

  // ─── Private: precision scheduling ─────────────────────────────────────────

  private async scheduleNextBoundary(): Promise<void> {
    const candidates = await this.computeAllUpcomingBoundaries();
    if (candidates.length === 0) {
      logger.debug('No upcoming schedule boundaries found');
      this.nextBoundaryAt = null;
      return;
    }

    // Sort: earliest first; ties broken by END before START, then priority asc, then scheduleId lex
    candidates.sort(compareBoundaryEvents);

    const next = candidates[0];
    this.nextBoundaryAt = next.firesAt;

    const delay = Math.max(0, next.firesAt.getTime() - Date.now());

    if (this.precisionTimerId) {
      clearTimeout(this.precisionTimerId);
    }

    this.precisionTimerId = setTimeout(() => {
      this.onPrecisionTimerFired(next.firesAt, candidates).catch((err) =>
        logger.error('fireBoundary error:', err),
      );
    }, delay);

    logger.debug(
      `Next boundary scheduled at ${next.firesAt.toISOString()} (in ${Math.round(delay / 1000)}s)`,
    );
  }

  /**
   * Called when the precision timer fires.
   * Collects all events sharing the same second (±500 ms window) and fires them in sorted order.
   */
  private async onPrecisionTimerFired(
    firedAt: Date,
    allCandidates: BoundaryEvent[],
  ): Promise<void> {
    const SAME_SECOND_WINDOW_MS = 1000;
    const sameSecond = allCandidates.filter(
      (e) => Math.abs(e.firesAt.getTime() - firedAt.getTime()) < SAME_SECOND_WINDOW_MS,
    );
    sameSecond.sort(compareBoundaryEvents);

    for (const event of sameSecond) {
      await this.fireBoundary([event]);
    }

    await this.scheduleNextBoundary();
  }

  // ─── Private: compute upcoming boundaries ──────────────────────────────────

  private async computeAllUpcomingBoundaries(): Promise<BoundaryEvent[]> {
    const now = new Date();
    const schedules = await prisma.scheduledAssignment.findMany({
      where: { enabled: true },
      include: {
        days: { include: { windows: true } },
      },
    });

    const candidates: BoundaryEvent[] = [];

    for (const schedule of schedules) {
      if (schedule.scheduleType === 'COMPLEX_WEEKLY') {
        for (const day of schedule.days) {
          for (const window of day.windows) {
            for (const boundaryType of ['START', 'END'] as const) {
              const timeHHMM =
                boundaryType === 'START' ? window.startTime : window.endTime;

              const firesAt = computeNextOccurrence(
                day.dayOfWeek,
                timeHHMM,
                schedule.timezone,
                now,
              );

              // Skip if already executed recently (within last 7 days at this exact time)
              const alreadyDone = await this.wasExecutedAt(
                schedule.id,
                boundaryType,
                firesAt,
                30,
              );
              if (alreadyDone) continue;

              candidates.push({
                scheduleId: schedule.id,
                scheduleType: 'COMPLEX_WEEKLY',
                boundaryType,
                firesAt,
                windowId: window.id,
                priority: schedule.priority,
                retryCount: 0,
              });
            }
          }
        }
      } else if (schedule.scheduleType === 'ONCE') {
        if (!schedule.executeAt) continue;
        if (schedule.executeAt <= now) continue;

        const alreadyDone = await this.wasExecutedAt(
          schedule.id,
          'START',
          schedule.executeAt,
          30,
        );
        if (alreadyDone) continue;

        candidates.push({
          scheduleId: schedule.id,
          scheduleType: 'ONCE',
          boundaryType: 'START',
          firesAt: schedule.executeAt,
          priority: schedule.priority,
          retryCount: 0,
        });
      } else if (schedule.scheduleType === 'RECURRING') {
        if (!schedule.cronExpression) continue;

        try {
          const expr = CronExpressionParser.parse(schedule.cronExpression, {
            tz: schedule.timezone || 'UTC',
          });
          const nextDate = expr.next().toDate();

          const alreadyDone = await this.wasExecutedAt(
            schedule.id,
            'START',
            nextDate,
            30,
          );
          if (alreadyDone) continue;

          candidates.push({
            scheduleId: schedule.id,
            scheduleType: 'RECURRING',
            boundaryType: 'START',
            firesAt: nextDate,
            priority: schedule.priority,
            retryCount: 0,
          });
        } catch (err) {
          logger.warn(
            `Invalid cron expression for schedule ${schedule.id}: ${schedule.cronExpression}`,
            err,
          );
        }
      }
    }

    // Include pending retries
    const nowMs = now.getTime();
    for (const [, retry] of this.retryMap) {
      if (retry.nextRetryAt.getTime() > nowMs) {
        candidates.push({
          ...retry.event,
          firesAt: retry.nextRetryAt,
          retryCount: retry.count,
        });
      }
    }

    return candidates;
  }

  /** Check whether a ScheduleExecution record exists within ±toleranceSec seconds of `expectedAt`. */
  private async wasExecutedAt(
    scheduleId: string,
    boundaryType: 'START' | 'END',
    expectedAt: Date,
    toleranceSec: number,
  ): Promise<boolean> {
    const toleranceMs = toleranceSec * 1000;
    const count = await prisma.scheduleExecution.count({
      where: {
        scheduleId,
        boundaryType,
        executedAt: {
          gte: new Date(expectedAt.getTime() - toleranceMs),
          lte: new Date(expectedAt.getTime() + toleranceMs),
        },
      },
    });
    return count > 0;
  }

  // ─── Private: fire a boundary ───────────────────────────────────────────────

  /**
   * Fire one or more boundary events sequentially, acquiring/releasing the mutex for each.
   */
  private async fireBoundary(events: BoundaryEvent[]): Promise<void> {
    for (const event of events) {
      await this.fireSingleBoundary(event);
    }
  }

  private async fireSingleBoundary(event: BoundaryEvent): Promise<void> {
    const dedupeKey = `${event.scheduleId}:${event.boundaryType}:${event.windowId ?? 'root'}`;

    if (this.inProgress.has(dedupeKey)) {
      logger.warn(`[dedup] Boundary already in progress, skipping duplicate: ${dedupeKey}`);
      return;
    }
    const recentExec = this.recentlyExecuted.get(dedupeKey);
    if (recentExec && (Date.now() - recentExec.getTime()) < 30_000) {
      logger.warn(`[dedup] Boundary recently executed at ${recentExec.toISOString()}, skipping duplicate: ${dedupeKey}`);
      return;
    }

    this.inProgress.add(dedupeKey);
    const startTime = Date.now();
    try {

    // Reload schedule with its actions
    const schedule = await prisma.scheduledAssignment.findUnique({
      where: { id: event.scheduleId },
      include: {
        days: { include: { windows: { include: { actions: true } } } },
        onceActions: true,
        recurringActions: true,
      },
    });

    if (!schedule || !schedule.enabled) {
      logger.info(
        `Schedule ${event.scheduleId} is disabled or not found, skipping boundary`,
      );
      return;
    }

    // Resolve actions for this boundary
    let actions: Array<{
      id: string;
      operation: string;
      boundaryType: string;
      targetGroupUuid: string | null;
      fromGroupUuid: string | null;
      sortOrder: number;
    }> = [];

    if (event.scheduleType === 'COMPLEX_WEEKLY' && event.windowId) {
      for (const day of schedule.days) {
        for (const window of day.windows) {
          if (window.id === event.windowId) {
            actions = window.actions.filter(
              (a) => a.boundaryType === event.boundaryType,
            );
          }
        }
      }
    } else if (event.scheduleType === 'ONCE') {
      actions = schedule.onceActions;
    } else if (event.scheduleType === 'RECURRING') {
      actions = schedule.recurringActions;
    }

    let summary: ExecutionSummary;

    if (schedule.targetType === 'NETWORK_ALIAS') {
      // ── NETWORK_ALIAS path ──────────────────────────────────────────────────
      const globalSettings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
      if (!globalSettings?.manageNetworkAliasesEnabled) {
        summary = {
          targetIps: [],
          targetAliasNames: [],
          actionsRun: [],
          status: 'SKIPPED',
          durationMs: Date.now() - startTime,
          errorMessage: 'FEATURE_DISABLED',
        };
        await logAuditEvent({
          action: 'SCHEDULE_EXECUTION_SKIPPED_FEATURE_DISABLED',
          details: { scheduleId: schedule.id, scheduleName: schedule.name, targetType: 'NETWORK_ALIAS' },
        });
      } else {
        const aliasNames = await this.resolveNetworkAliasTargets(schedule);
        if (aliasNames.length === 0) {
          summary = {
            targetIps: [],
            targetAliasNames: [],
            actionsRun: [],
            status: 'SKIPPED',
            durationMs: Date.now() - startTime,
            errorMessage: 'No network alias targets resolved',
          };
        } else {
          const release = await this.mutex.acquire();
          try {
            summary = await this.executeNetworkAliasActions(aliasNames, actions, schedule);
          } finally {
            release();
          }
        }
      }
    } else {
      // ── Existing IP/HOST_ALIAS/NETWORK_GROUP path ───────────────────────────
      // Resolve target IPs
      let targetIps: string[] = [];
      let resolveError: string | undefined;

      try {
        targetIps = await this.resolveTargets(schedule);
      } catch (err) {
        resolveError = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to resolve targets for schedule ${schedule.id}:`, err);
      }

      if (resolveError) {
        summary = {
          targetIps: [],
          actionsRun: [],
          status: 'FAILED',
          durationMs: Date.now() - startTime,
          errorMessage: resolveError,
        };
      } else if (targetIps.length === 0) {
        summary = {
          targetIps: [],
          actionsRun: [],
          status: 'SKIPPED',
          durationMs: Date.now() - startTime,
          errorMessage: 'No target IPs resolved',
        };
      } else {
        const release = await this.mutex.acquire();
        try {
          // Re-check enabled inside the mutex: toggle may have fired between the
          // initial check (above) and mutex acquisition.
          const freshSchedule = await prisma.scheduledAssignment.findUnique({
            where: { id: event.scheduleId },
            select: { enabled: true },
          });
          if (!freshSchedule?.enabled) {
            logger.info(
              `Schedule ${event.scheduleId} was disabled between enabled-check and mutex acquire, skipping execution`,
            );
            summary = {
              targetIps: [],
              actionsRun: [],
              status: 'SKIPPED',
              durationMs: Date.now() - startTime,
              errorMessage: 'Schedule disabled',
            };
          } else {
            summary = await this.executeActions(targetIps, actions, schedule);
          }
        } finally {
          release();
        }
      }
    }

    const durationMs = Date.now() - startTime;
    summary.durationMs = durationMs;

    // Write execution record
    await prisma.scheduleExecution.create({
      data: {
        scheduleId: schedule.id,
        boundaryType: event.boundaryType,
        executedAt: new Date(startTime),
        status: summary.status,
        targetIps: summary.targetIps,
        targetAliasNames: summary.targetAliasNames !== undefined ? summary.targetAliasNames : undefined,
        actionsRun: summary.actionsRun as object[],
        durationMs: summary.durationMs,
        errorMessage: summary.errorMessage,
      },
    });

    if (summary.status === 'SUCCESS' || summary.status === 'PARTIAL') {
      this.recentlyExecuted.set(dedupeKey, new Date());
    }

    // Update lastExecutedAt
    await prisma.scheduledAssignment.update({
      where: { id: schedule.id },
      data: { lastExecutedAt: new Date() },
    });

    // Disable ONCE schedule after execution
    if (event.scheduleType === 'ONCE') {
      await prisma.scheduledAssignment.update({
        where: { id: schedule.id },
        data: { enabled: false },
      });
    }

    this.lastExecutedAt = new Date();

    // Audit log
    await logAuditEvent({
      action: 'SCHEDULE_BOUNDARY_EXECUTED',
      details: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduleType: event.scheduleType,
        boundaryType: event.boundaryType,
        windowId: event.windowId,
        status: summary.status,
        targetIps: summary.targetIps,
        actionsCount: summary.actionsRun.length,
        durationMs: summary.durationMs,
        errorMessage: summary.errorMessage,
      },
    });

    logger.info(
      `Schedule boundary executed: ${schedule.name} [${event.boundaryType}] → ${summary.status} in ${durationMs}ms`,
    );

    // Retry logic
    const retryKey = `${event.scheduleId}:${event.boundaryType}:${event.windowId ?? 'root'}`;

    if (summary.status === 'SUCCESS' || summary.status === 'PARTIAL') {
      this.retryMap.delete(retryKey);
    } else {
      // FAILED or SKIPPED
      const existing = this.retryMap.get(retryKey);
      const count = (existing?.count ?? 0) + 1;

      if (count > 3) {
        logger.error(
          `Schedule ${schedule.id} boundary ${event.boundaryType} exhausted retries after ${count} attempts`,
        );
        await logAuditEvent({
          action: 'SCHEDULE_BOUNDARY_RETRY_EXHAUSTED',
          details: {
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            boundaryType: event.boundaryType,
            attempts: count,
            lastStatus: summary.status,
          },
        });
        this.retryMap.delete(retryKey);
      } else {
        const delaysMin = [5, 15, 45];
        const nextRetryMs = delaysMin[count - 1] * 60 * 1000;
        const nextRetryAt = new Date(Date.now() + nextRetryMs);

        this.retryMap.set(retryKey, {
          count,
          nextRetryAt,
          event: { ...event, retryCount: count },
        });

        logger.warn(
          `Schedule ${schedule.id} boundary ${event.boundaryType} failed (attempt ${count}), retrying at ${nextRetryAt.toISOString()}`,
        );
      }
    }
    } finally {
      this.inProgress.delete(dedupeKey);
    }
  }

  // ─── Private: resolve targets ───────────────────────────────────────────────

  private async resolveTargets(schedule: {
    targetType: string;
    targetSelector: unknown;
  }): Promise<string[]> {
    const selector = schedule.targetSelector as Record<string, unknown>;

    if (schedule.targetType === 'IP_LIST') {
      const typed = selector as { ips: string[] };
      return typed.ips ?? [];
    }

    if (schedule.targetType === 'HOST_ALIAS') {
      const typed = selector as { hostAliasUuids: string[] };
      const aliasesResponse = await exportAliases();
      const aliases = aliasesResponse?.aliases?.alias ?? {};

      const ips: string[] = [];
      for (const uuid of typed.hostAliasUuids ?? []) {
        // eslint-disable-next-line security/detect-object-injection
        const alias = aliases[uuid];
        if (!alias) {
          logger.warn(`[resolveTargets] HOST_ALIAS UUID ${uuid} not found — skipping`);
          await logAuditEvent({
            action: 'OPNSENSE_GROUP_HOST_ALIAS_SKIPPED_NOT_FOUND',
            details: { uuid },
          });
          continue;
        }
        if (alias.type !== 'host') {
          logger.warn(`[resolveTargets] HOST_ALIAS UUID ${uuid} has type '${alias.type}', expected 'host' — skipping`);
          await logAuditEvent({
            action: 'OPNSENSE_GROUP_HOST_ALIAS_SKIPPED_WRONG_TYPE',
            details: { uuid, aliasName: alias.name },
          });
          continue;
        }
        if (alias.enabled !== '1') {
          logger.warn(`[resolveTargets] HOST_ALIAS UUID ${uuid} is disabled — skipping`);
          await logAuditEvent({
            action: 'OPNSENSE_GROUP_HOST_ALIAS_SKIPPED_DISABLED',
            details: { uuid, aliasName: alias.name },
          });
          continue;
        }
        if (!alias.content || !alias.content.trim()) {
          logger.warn(`[resolveTargets] HOST_ALIAS UUID ${uuid} has empty content — skipping`);
          await logAuditEvent({
            action: 'OPNSENSE_GROUP_HOST_ALIAS_SKIPPED_EMPTY_CONTENT',
            details: { uuid, aliasName: alias.name },
          });
          continue;
        }
        const ip = alias.content.trim();
        if (ip) ips.push(ip);
      }
      return ips;
    }

    if (schedule.targetType === 'NETWORK_GROUP') {
      const typed = selector as { networkGroupUuid: string };
      const groups = await getNetworkGroups();
      const group = groups.find((g) => g.uuid === typed.networkGroupUuid);

      if (!group) return [];

      const memberAliasNames = parseGroupContent(group.rawContent, group.name);
      const aliasesResponse = await exportAliases();
      const aliases = aliasesResponse?.aliases?.alias ?? {};

      // Build name → content map for host aliases
      const nameToIp = new Map<string, string>();
      for (const [, alias] of Object.entries(aliases)) {
        if (alias.type === 'host' && alias.name && alias.content) {
          nameToIp.set(alias.name, alias.content.trim());
        }
      }

      const ips: string[] = [];
      for (const aliasName of memberAliasNames) {
        const ip = nameToIp.get(aliasName);
        if (ip) ips.push(ip);
      }
      return ips;
    }

    logger.warn(`Unknown targetType: ${schedule.targetType}`);
    return [];
  }

  // ─── Private: execute actions ───────────────────────────────────────────────

  private async executeActions(
    targetIps: string[],
    actions: Array<{
      operation: string;
      targetGroupUuid: string | null;
      fromGroupUuid: string | null;
      sortOrder: number;
    }>,
    schedule: { id: string; name: string },
  ): Promise<ExecutionSummary> {
    const sortedActions = [...actions].sort((a, b) => a.sortOrder - b.sortOrder);
    const results: ActionResult[] = [];
    let isNetworkError = false;

    // Fetch group, alias, group-type, and global settings data once upfront.
    const [allGroups, aliasesResponse, groupDisplays, globalSettings] = await Promise.all([
      getNetworkGroups(),
      exportAliases(),
      prisma.opnsenseGroupDisplay.findMany(),
      prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } }),
    ]);
    // Enrich allGroups with friendly names from groupDisplays
    allGroups.forEach((g) => {
      const display = groupDisplays.find((d) => d.opnsenseUuid === g.uuid);
      if (display) {
        g.friendlyName = display.friendlyName;
      }
    });

    const groupMap = new Map(allGroups.map((g) => [g.uuid, g]));
    const allAliases = aliasesResponse?.aliases?.alias ?? {};

    // When enableGroupTypes is false, MultiSelect is inactive and every assignment
    // must behave as SingleSelect (evict from all current groups before assigning).
    const enableGroupTypes = globalSettings?.enableGroupTypes ?? false;

    // UUID → groupType ('SingleSelect' | 'MultiSelect'); default to SingleSelect when not configured.
    const groupTypeMap = new Map<string, 'SingleSelect' | 'MultiSelect'>(
      groupDisplays.map((d) => [
        d.opnsenseUuid,
        d.groupType === 'MultiSelect' ? 'MultiSelect' : 'SingleSelect',
      ]),
    );

    // IP → alias name (for audit details and SingleSelect membership lookup)
    const ipToAliasName = new Map<string, string>();
    // alias name → IP (for CLEAR_ALL membership lookup)
    const nameToIp = new Map<string, string>();
    for (const [, alias] of Object.entries(allAliases)) {
      if (alias.type === 'host' && alias.name && alias.content) {
        const trimmed = alias.content.trim();
        ipToAliasName.set(trimmed, alias.name);
        nameToIp.set(alias.name, trimmed);
      }
    }

    // Runtime membership: ip → Set<groupUuid> — initialised from allGroups rawContent,
    // then kept up-to-date as each action executes so that subsequent ASSIGN operations
    // within the same run see the correct current membership (avoids stale-cache bugs
    // when multiple ASSIGN actions target different SingleSelect groups).
    const ipRuntimeGroups = new Map<string, Set<string>>();
    for (const group of allGroups) {
      const memberNames = parseGroupContent(group.rawContent, group.name);
      for (const name of memberNames) {
        const memberIp = nameToIp.get(name);
        if (memberIp) {
          if (!ipRuntimeGroups.has(memberIp)) ipRuntimeGroups.set(memberIp, new Set());
          ipRuntimeGroups.get(memberIp)!.add(group.uuid);
        }
      }
    }

    const trackAdd = (memberIp: string, groupUuid: string) => {
      if (!ipRuntimeGroups.has(memberIp)) ipRuntimeGroups.set(memberIp, new Set());
      ipRuntimeGroups.get(memberIp)!.add(groupUuid);
    };
    const trackRemove = (memberIp: string, groupUuid: string) => {
      ipRuntimeGroups.get(memberIp)?.delete(groupUuid);
    };

    // Common context included in every operation's audit entry
    const scheduleCtx = {
      authMethod: 'SCHEDULED',
      scheduleId: schedule.id,
      scheduleName: schedule.name,
    };

    // groupContentMap: live content state per group (array of alias names / IP entries),
    // initialised from allGroups rawContent and updated after each successful action batch.
    // Allows subsequent actions within the same run to see up-to-date group membership
    // without re-fetching OPNsense, while keeping all mutations in a single batch call.
    const groupContentMap = new Map<string, string[]>(
      allGroups.map((g) => [g.uuid, parseGroupContent(g.rawContent, g.name)]),
    );

    // Build a group-update BatchAliasOperation using the supplied content array.
    const makeGroupUpdateOp = (uuid: string, content: string[]): BatchAliasOperation => {
      const g = groupMap.get(uuid)!;
      return {
        type: 'update',
        uuid,
        payload: {
          alias: {
            enabled: g.enabled ? '1' : '0',
            name: g.name,
            type: g.type || 'networkgroup',
            content: content.join('\n'),
            description: g.description || '',
            proto: g.proto || '',
            interface: g.interface || '',
            counters: g.counters || '',
            updatefreq: g.updatefreq || '',
            categories: g.categories || '',
          },
        },
      };
    };

    // Find which item (alias name or raw IP) represents a given IP inside a content array.
    // Mirrors the lookup order used by removeIpFromGroup in opnsense-api.ts.
    const resolveItemInContent = (ip: string, content: string[]): string | null => {
      if (content.includes(ip)) return ip;
      const aliasName = ipToAliasName.get(ip);
      if (aliasName && content.includes(aliasName)) return aliasName;
      for (const [, alias] of Object.entries(allAliases)) {
        if (alias.type === 'host' && alias.content?.trim() === ip && alias.name && content.includes(alias.name)) {
          return alias.name;
        }
      }
      return null;
    };

    // Shared alias-creation helper: for any IPs missing from ipToAliasName, resolve names
    // concurrently and execute a single batchAliasOperations call, then update the maps.
    // Returns true on success, false if creation failed (caller should skip the action).
    const ensureAliasesExist = async (ips: string[]): Promise<boolean> => {
      const missing = ips.filter((ip) => !ipToAliasName.has(ip));
      if (missing.length === 0) return true;

      const creations = await Promise.all(
        missing.map(async (ip) => ({ ip, ...(await getBestHostAliasName(ip)) })),
      );
      const createOps: BatchAliasOperation[] = creations.map(({ ip, aliasName, detectedHostname }) => ({
        type: 'add',
        payload: {
          alias: {
            enabled: '1',
            name: aliasName,
            type: 'host',
            content: ip,
            description: `Auto-created host alias for IP ${ip}${detectedHostname ? ` (detected hostname: ${detectedHostname})` : ''}`,
            proto: '',
            interface: '',
            counters: '0',
            updatefreq: '',
            categories: '',
          },
        },
      }));

      const result = await batchAliasOperations(createOps);
      if (!result.success) {
        logger.error('Schedule alias creation batch failed:', result);
        return false;
      }
      for (const { ip, aliasName } of creations) {
        ipToAliasName.set(ip, aliasName);
        nameToIp.set(aliasName, ip);
      }
      return true;
    };

    for (const action of sortedActions) {
      try {
        // ── ASSIGN ────────────────────────────────────────────────────────────
        if (action.operation === 'ASSIGN') {
          if (!action.targetGroupUuid) throw new Error('targetGroupUuid is required for ASSIGN');
          const targetGroup = groupMap.get(action.targetGroupUuid);
          const targetGroupType = groupTypeMap.get(action.targetGroupUuid) ?? 'SingleSelect';

          // Phase 1: ensure every target IP has a host alias (single batch if any are missing).
          const aliasesOk = await ensureAliasesExist(targetIps);
          if (!aliasesOk) {
            for (const ip of targetIps) {
              await logAuditEvent({
                action: 'OPNSENSE_GROUP_IP_ASSIGN_FAILURE',
                details: {
                  groupId: action.targetGroupUuid,
                  groupName: targetGroup?.name ?? null,
                  groupFriendlyName: targetGroup?.friendlyName ?? null,
                  ipAddress: ip,
                  hostAliasName: ipToAliasName.get(ip) ?? null,
                  operationType: 'assign',
                  ...scheduleCtx,
                },
                reason: 'Host alias creation failed',
              });
              results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: false, error: 'Host alias creation failed' });
            }
            continue;
          }

          // Phase 2: detect SingleSelect vs MultiSelect behaviour.
          //
          //   enableGroupTypes=false → ALL groups treated as SingleSelect; evict from every
          //                           current group regardless of its configured type.
          //   enableGroupTypes=true  → evict only from other SingleSelect groups; preserve
          //                           MultiSelect memberships.
          //   target is MultiSelect  → targetIsSingleSelect=false; no eviction at all.
          //
          // For MultiSelect targets where the IP is already in the group, the operation is a
          // true no-op — skip those IPs to avoid unnecessary API calls.
          // For SingleSelect targets, always process — eviction from other SingleSelect groups
          // may still be needed even if the IP is already in the target group.
          const targetIsSingleSelect = !enableGroupTypes || targetGroupType === 'SingleSelect';

          // Partition IPs into three buckets:
          //   ipsAlreadyAssigned — true no-ops; skip entirely (no API call needed)
          //   ipsToAssign        — need actual work (add to target, and/or evict from others)
          //
          // An IP is a no-op when:
          //   a) MultiSelect target + IP already in that group  (original logic), OR
          //   b) SingleSelect target + IP already in that group + no other SingleSelect
          //      groups to evict from  (new: saves an API round-trip when state is correct)
          const ipsAlreadyAssigned: string[] = [];
          const ipsToAssign: string[] = [];
          for (const ip of targetIps) {
            const currentGroupUuids = ipRuntimeGroups.get(ip) ?? new Set<string>();
            const inTarget = currentGroupUuids.has(action.targetGroupUuid);

            if (!targetIsSingleSelect && inTarget) {
              // MultiSelect — already a member, nothing to do
              ipsAlreadyAssigned.push(ip);
            } else if (targetIsSingleSelect && inTarget) {
              // SingleSelect — already in target; skip only if no evictions are pending
              const needsEviction = [...currentGroupUuids].some((uuid) => {
                if (uuid === action.targetGroupUuid) return false;
                // When enableGroupTypes=false every group is treated as SingleSelect
                if (!enableGroupTypes) return true;
                const t = groupTypeMap.get(uuid) ?? 'SingleSelect';
                return t === 'SingleSelect';
              });
              if (needsEviction) {
                ipsToAssign.push(ip); // state partially wrong — must run full eviction
              } else {
                ipsAlreadyAssigned.push(ip); // already correct, no API call needed
              }
            } else {
              ipsToAssign.push(ip);
            }
          }

          // Emit success (no-op) results for IPs that require no change.
          for (const ip of ipsAlreadyAssigned) {
            logger.debug(`Schedule ${schedule.id}: ASSIGN skipped for ${ip} — already correctly assigned to group ${action.targetGroupUuid}, no evictions needed`);
            await logAuditEvent({
              action: 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS',
              details: {
                groupId: action.targetGroupUuid,
                groupName: targetGroup?.name ?? null,
                groupFriendlyName: targetGroup?.friendlyName ?? null,
                targetGroup: {
                  id: action.targetGroupUuid,
                  name: targetGroup?.name ?? null,
                  friendlyName: targetGroup?.friendlyName ?? null,
                },
                ipAddress: ip,
                hostAliasName: ipToAliasName.get(ip) ?? null,
                operationType: 'assign',
                skipped: true,
                skipReason: 'already_assigned',
                ...scheduleCtx,
              },
            });
            results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: true });
          }

          if (ipsToAssign.length === 0) continue;

          // Emit ATTEMPT audit events for IPs being processed.
          for (const ip of ipsToAssign) {
            await logAuditEvent({
              action: 'OPNSENSE_GROUP_IP_ASSIGN_ATTEMPT',
              details: {
                groupId: action.targetGroupUuid,
                groupName: targetGroup?.name ?? null,
                groupFriendlyName: targetGroup?.friendlyName ?? null,
                ipAddress: ip,
                hostAliasName: ipToAliasName.get(ip) ?? null,
                operationType: 'assign',
                ...scheduleCtx,
              },
            });
          }

          // Phase 3: compute new content for all affected groups.
          //
          // Uses ipRuntimeGroups (not rawContent) so sequential ASSIGN actions within the
          // same run see up-to-date membership after each batch.
          const pendingContent = new Map<string, string[]>();

          if (targetIsSingleSelect) {
            for (const ip of ipsToAssign) {
              const aliasName = ipToAliasName.get(ip);
              const currentGroupUuids = ipRuntimeGroups.get(ip) ?? new Set<string>();
              for (const currentUuid of currentGroupUuids) {
                if (currentUuid === action.targetGroupUuid) continue;
                // When enableGroupTypes=false the skip below never fires — all groups evicted.
                // When enableGroupTypes=true skip MultiSelect groups (preserve their membership).
                if (enableGroupTypes && (groupTypeMap.get(currentUuid) ?? 'SingleSelect') !== 'SingleSelect') continue;
                const currentGroup = groupMap.get(currentUuid);
                if (!currentGroup?.enabled) continue;

                await logAuditEvent({
                  action: 'OPNSENSE_GROUP_IP_MOVE_REMOVE',
                  details: {
                    operationType: 'assign',
                    sourceGroupId: currentUuid,
                    sourceGroupName: currentGroup.name,
                    sourceGroupFriendlyName: currentGroup.friendlyName ?? null,
                    targetGroupId: action.targetGroupUuid,
                    ipAddress: ip,
                    hostAliasName: aliasName ?? null,
                    ...scheduleCtx,
                  },
                });

                if (!pendingContent.has(currentUuid)) {
                  pendingContent.set(currentUuid, [...(groupContentMap.get(currentUuid) ?? [])]);
                }
                const evictContent = pendingContent.get(currentUuid)!;
                const item = resolveItemInContent(ip, evictContent);
                if (item) pendingContent.set(currentUuid, evictContent.filter((x) => x !== item));
              }
            }
          }

          // Add all aliases into the target group content.
          if (!pendingContent.has(action.targetGroupUuid)) {
            pendingContent.set(action.targetGroupUuid, [...(groupContentMap.get(action.targetGroupUuid) ?? [])]);
          }
          const targetContent = pendingContent.get(action.targetGroupUuid)!;
          for (const ip of ipsToAssign) {
            const aliasName = ipToAliasName.get(ip) ?? ip;
            if (!targetContent.includes(aliasName) && !targetContent.includes(ip)) {
              targetContent.push(aliasName);
            }
          }

          // Execute single batch for all group mutations.
          const groupOps = Array.from(pendingContent.entries()).map(([uuid, content]) => makeGroupUpdateOp(uuid, content));
          const batchResult = await batchAliasOperations(groupOps);
          const actionSuccess = batchResult.success;

          if (actionSuccess) {
            for (const [uuid, content] of pendingContent) groupContentMap.set(uuid, content);
          } else {
            logger.error(`ASSIGN batch failed for schedule ${schedule.id}:`, batchResult);
          }

          const batchErrorMsg = actionSuccess ? undefined : (batchResult.results.find((r) => r.error)?.error ?? 'Batch operation failed');

          for (const ip of ipsToAssign) {
            if (actionSuccess) {
              if (targetIsSingleSelect) {
                const currentGroupUuids = ipRuntimeGroups.get(ip) ?? new Set<string>();
                for (const currentUuid of currentGroupUuids) {
                  if (currentUuid === action.targetGroupUuid) continue;
                  if (enableGroupTypes && (groupTypeMap.get(currentUuid) ?? 'SingleSelect') !== 'SingleSelect') continue;
                  if (groupMap.get(currentUuid)?.enabled) trackRemove(ip, currentUuid);
                }
              }
              trackAdd(ip, action.targetGroupUuid);
            }
            await logAuditEvent({
              action: actionSuccess ? 'OPNSENSE_GROUP_IP_ASSIGN_SUCCESS' : 'OPNSENSE_GROUP_IP_ASSIGN_FAILURE',
              details: {
                groupId: action.targetGroupUuid,
                groupName: targetGroup?.name ?? null,
                groupFriendlyName: targetGroup?.friendlyName ?? null,
                // Structured object required by device-group-history graph (getGroupInfo lookup)
                targetGroup: {
                  id: action.targetGroupUuid,
                  name: targetGroup?.name ?? null,
                  friendlyName: targetGroup?.friendlyName ?? null,
                },
                ipAddress: ip,
                hostAliasName: ipToAliasName.get(ip) ?? null,
                operationType: 'assign',
                ...scheduleCtx,
              },
              reason: batchErrorMsg,
            });
            results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: actionSuccess, error: batchErrorMsg });
          }

          // ── UNASSIGN ──────────────────────────────────────────────────────────
        } else if (action.operation === 'UNASSIGN') {
          if (!action.targetGroupUuid) throw new Error('targetGroupUuid is required for UNASSIGN');
          const group = groupMap.get(action.targetGroupUuid);

          // Partition IPs: those actually in the group vs those that are not (no-op).
          const ipsNotInGroup: string[] = [];
          const ipsToUnassign: string[] = [];
          for (const ip of targetIps) {
            const inGroup = (ipRuntimeGroups.get(ip) ?? new Set<string>()).has(action.targetGroupUuid);
            if (inGroup) {
              ipsToUnassign.push(ip);
            } else {
              ipsNotInGroup.push(ip);
            }
          }

          // Emit success (no-op) results for IPs not in the target group.
          for (const ip of ipsNotInGroup) {
            logger.debug(`Schedule ${schedule.id}: UNASSIGN skipped for ${ip} — not in group ${action.targetGroupUuid}`);
            await logAuditEvent({
              action: 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS',
              details: {
                groupId: action.targetGroupUuid,
                groupName: group?.name ?? null,
                groupFriendlyName: group?.friendlyName ?? null,
                unassignedGroup: {
                  id: action.targetGroupUuid,
                  name: group?.name ?? null,
                  friendlyName: group?.friendlyName ?? null,
                },
                ipAddress: ip,
                hostAliasName: ipToAliasName.get(ip) ?? null,
                operationType: 'unassign',
                skipped: true,
                skipReason: 'not_assigned',
                ...scheduleCtx,
              },
            });
            results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: true });
          }

          if (ipsToUnassign.length === 0) continue;

          for (const ip of ipsToUnassign) {
            await logAuditEvent({
              action: 'OPNSENSE_GROUP_IP_UNASSIGN_ATTEMPT',
              details: {
                groupId: action.targetGroupUuid,
                groupName: group?.name ?? null,
                groupFriendlyName: group?.friendlyName ?? null,
                ipAddress: ip,
                hostAliasName: ipToAliasName.get(ip) ?? null,
                operationType: 'unassign',
                ...scheduleCtx,
              },
            });
          }

          // Compute new content: remove each IP's representative from the group.
          let newContent = [...(groupContentMap.get(action.targetGroupUuid) ?? [])];
          for (const ip of ipsToUnassign) {
            const item = resolveItemInContent(ip, newContent);
            if (item) newContent = newContent.filter((x) => x !== item);
          }

          const batchResult = await batchAliasOperations([makeGroupUpdateOp(action.targetGroupUuid, newContent)]);
          const actionSuccess = batchResult.success;

          if (actionSuccess) {
            groupContentMap.set(action.targetGroupUuid, newContent);
          } else {
            logger.error(`UNASSIGN batch failed for schedule ${schedule.id}:`, batchResult);
          }

          const batchErrorMsg = actionSuccess ? undefined : (batchResult.results.find((r) => r.error)?.error ?? 'Batch operation failed');

          for (const ip of ipsToUnassign) {
            if (actionSuccess) trackRemove(ip, action.targetGroupUuid);
            await logAuditEvent({
              action: actionSuccess ? 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS' : 'OPNSENSE_GROUP_IP_UNASSIGN_FAILURE',
              details: {
                groupId: action.targetGroupUuid,
                groupName: group?.name ?? null,
                groupFriendlyName: group?.friendlyName ?? null,
                // Structured object required by device-group-history graph (getGroupInfo lookup)
                unassignedGroup: {
                  id: action.targetGroupUuid,
                  name: group?.name ?? null,
                  friendlyName: group?.friendlyName ?? null,
                },
                ipAddress: ip,
                hostAliasName: ipToAliasName.get(ip) ?? null,
                operationType: 'unassign',
                ...scheduleCtx,
              },
              reason: batchErrorMsg,
            });
            results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: actionSuccess, error: batchErrorMsg });
          }

          // ── CLEAR_ALL ─────────────────────────────────────────────────────────
        } else if (action.operation === 'CLEAR_ALL') {
          // For each (ip, group) pair where the IP is represented in the group content,
          // collect the item to remove, emit ATTEMPT events, then execute a single batch.
          //
          // groupItemsToRemove: groupUuid → Map<ip, itemToRemove>
          const groupItemsToRemove = new Map<string, Map<string, string>>();

          for (const ip of targetIps) {
            for (const group of allGroups) {
              const content = groupContentMap.get(group.uuid) ?? [];
              const item = resolveItemInContent(ip, content);
              if (item !== null) {
                await logAuditEvent({
                  action: 'OPNSENSE_GROUP_IP_UNASSIGN_ATTEMPT',
                  details: {
                    groupId: group.uuid,
                    groupName: group.name,
                    groupFriendlyName: group.friendlyName ?? null,
                    ipAddress: ip,
                    hostAliasName: ipToAliasName.get(ip) ?? null,
                    operationType: 'clear_all',
                    ...scheduleCtx,
                  },
                });
                if (!groupItemsToRemove.has(group.uuid)) groupItemsToRemove.set(group.uuid, new Map());
                groupItemsToRemove.get(group.uuid)!.set(ip, item);
              }
            }
          }

          let actionSuccess = true;
          const newGroupContents = new Map<string, string[]>();

          if (groupItemsToRemove.size > 0) {
            for (const [groupUuid, ipItemMap] of groupItemsToRemove) {
              const current = groupContentMap.get(groupUuid) ?? [];
              const itemsToRemove = new Set(ipItemMap.values());
              newGroupContents.set(groupUuid, current.filter((x) => !itemsToRemove.has(x)));
            }
            const clearOps = Array.from(newGroupContents.entries()).map(([uuid, content]) => makeGroupUpdateOp(uuid, content));
            const batchResult = await batchAliasOperations(clearOps);
            actionSuccess = batchResult.success;

            if (actionSuccess) {
              for (const [uuid, content] of newGroupContents) groupContentMap.set(uuid, content);
            } else {
              logger.error(`CLEAR_ALL batch failed for schedule ${schedule.id}:`, batchResult);
            }
          }

          const batchErrorMsg = actionSuccess ? undefined : 'Batch operation failed';

          for (const ip of targetIps) {
            const ipWasRemoved = [...allGroups].some((g) => groupItemsToRemove.get(g.uuid)?.has(ip));

            if (!ipWasRemoved) {
              // IP wasn't a member of any managed group — true no-op, skip silently
              logger.debug(`Schedule ${schedule.id}: CLEAR_ALL skipped for ${ip} — not a member of any managed group`);
              await logAuditEvent({
                action: 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS',
                details: {
                  ipAddress: ip,
                  hostAliasName: ipToAliasName.get(ip) ?? null,
                  operationType: 'clear_all',
                  skipped: true,
                  skipReason: 'not_in_any_group',
                  ...scheduleCtx,
                },
              });
              results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: true });
              continue;
            }

            for (const group of allGroups) {
              if (groupItemsToRemove.get(group.uuid)?.has(ip)) {
                if (actionSuccess) trackRemove(ip, group.uuid);
                await logAuditEvent({
                  action: actionSuccess ? 'OPNSENSE_GROUP_IP_UNASSIGN_SUCCESS' : 'OPNSENSE_GROUP_IP_UNASSIGN_FAILURE',
                  details: {
                    groupId: group.uuid,
                    groupName: group.name,
                    groupFriendlyName: group.friendlyName ?? null,
                    // Structured object required by device-group-history graph (getGroupInfo lookup)
                    unassignedGroup: {
                      id: group.uuid,
                      name: group.name,
                      friendlyName: group.friendlyName ?? null,
                    },
                    ipAddress: ip,
                    hostAliasName: ipToAliasName.get(ip) ?? null,
                    operationType: 'clear_all',
                    ...scheduleCtx,
                  },
                  reason: batchErrorMsg,
                });
              }
            }
            results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: actionSuccess, error: batchErrorMsg });
          }

          // ── Unknown ───────────────────────────────────────────────────────────
        } else {
          for (const ip of targetIps) {
            results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: false, error: `Unknown operation: ${action.operation}` });
          }
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes('ECONNREFUSED') ||
          message.includes('ENOTFOUND') ||
          message.includes('ETIMEDOUT') ||
          message.includes('fetch failed') ||
          message.includes('network')
        ) {
          isNetworkError = true;
        }
        logger.error(`Action ${action.operation} failed for schedule ${schedule.id}:`, err);
        for (const ip of targetIps) {
          results.push({ operation: action.operation, targetGroupUuid: action.targetGroupUuid, fromGroupUuid: action.fromGroupUuid, ip, success: false, error: message });
        }
      }
    }

    // Determine overall status
    let status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';

    if (isNetworkError && results.every((r) => !r.success)) {
      status = 'SKIPPED';
    } else {
      const successCount = results.filter((r) => r.success).length;
      if (successCount === results.length) {
        status = 'SUCCESS';
      } else if (successCount === 0) {
        status = 'FAILED';
      } else {
        status = 'PARTIAL';
      }
    }

    const failedResults = results.filter((r) => !r.success);
    const errorMessage =
      failedResults.length > 0
        ? failedResults
          .map((r) => `${r.operation}(${r.ip}): ${r.error}`)
          .join('; ')
        : undefined;

    return {
      targetIps,
      actionsRun: results,
      status,
      durationMs: 0, // set by caller
      errorMessage,
    };
  }

  // ─── Private: NETWORK_ALIAS execution ────────────────────────────────────────

  private async resolveNetworkAliasTargets(schedule: { targetSelector: unknown; id?: string }): Promise<string[]> {
    const settings = await prisma.globalSettings.findFirst({ orderBy: { id: 'asc' } });
    if (!settings?.manageNetworkAliasesEnabled) {
      logger.warn(`[resolveNetworkAliasTargets] Feature disabled — skipping all aliases`);
      await logAuditEvent({
        action: 'OPNSENSE_GROUP_NETWORK_ALIAS_FEATURE_DISABLED',
        details: { scheduleId: schedule.id },
      });
      return [];
    }

    const selector = schedule.targetSelector as { networkAliasUuids?: string[] } | null;
    if (!selector || !Array.isArray(selector.networkAliasUuids)) {
      logger.error(`[resolveNetworkAliasTargets] Invalid targetSelector for schedule ${schedule.id}: ${JSON.stringify(schedule.targetSelector)}`);
      await logAuditEvent({
        action: 'OPNSENSE_GROUP_NETWORK_ALIAS_INVALID_SELECTOR',
        details: { scheduleId: schedule.id, targetSelector: schedule.targetSelector },
      });
      return [];
    }

    const uuids = selector.networkAliasUuids ?? [];
    if (uuids.length === 0) {
      logger.warn(`[resolveNetworkAliasTargets] No networkAliasUuids in targetSelector for schedule ${schedule.id}`);
      return [];
    }

    const aliasesResponse = await exportAliases();
    const aliases = aliasesResponse?.aliases?.alias ?? {};

    const names: string[] = [];
    for (const uuid of uuids) {
      // eslint-disable-next-line security/detect-object-injection
      const alias = aliases[uuid];
      if (!alias) {
        logger.warn(`[resolveNetworkAliasTargets] UUID ${uuid} not found in OPNsense — skipping`);
        await logAuditEvent({
          action: 'OPNSENSE_GROUP_NETWORK_ALIAS_SKIPPED_NOT_FOUND',
          details: { uuid, scheduleId: schedule.id },
        });
        continue;
      }
      if (alias.type !== 'network') {
        logger.warn(`[resolveNetworkAliasTargets] UUID ${uuid} has type '${alias.type}', expected 'network' — skipping`);
        await logAuditEvent({
          action: 'OPNSENSE_GROUP_NETWORK_ALIAS_SKIPPED_WRONG_TYPE',
          details: { uuid, aliasName: alias.name, scheduleId: schedule.id },
        });
        continue;
      }
      if (alias.enabled !== '1') {
        logger.warn(`[resolveNetworkAliasTargets] UUID ${uuid} is disabled — skipping`);
        await logAuditEvent({
          action: 'OPNSENSE_GROUP_NETWORK_ALIAS_SKIPPED_DISABLED',
          details: { uuid, aliasName: alias.name, scheduleId: schedule.id },
        });
        continue;
      }
      names.push(alias.name);
    }
    return names;
  }

  private async executeNetworkAliasActions(
    aliasNames: string[],
    actions: Array<{
      operation: string;
      targetGroupUuid: string | null;
      fromGroupUuid: string | null;
      sortOrder: number;
    }>,
    schedule: { id: string; name: string },
  ): Promise<ExecutionSummary> {
    const sortedActions = [...actions].sort((a, b) => a.sortOrder - b.sortOrder);
    const results: NetworkAliasActionResult[] = [];

    const [allGroups, groupDisplays] = await Promise.all([
      getNetworkGroups(),
      prisma.opnsenseGroupDisplay.findMany(),
    ]);
    allGroups.forEach((g) => {
      const display = groupDisplays.find((d) => d.opnsenseUuid === g.uuid);
      if (display) g.friendlyName = display.friendlyName;
    });

    const groupMap = new Map(allGroups.map((g) => [g.uuid, g]));

    // Live content state per group
    const groupContentMap = new Map<string, string[]>(
      allGroups.map((g) => [g.uuid, parseGroupContent(g.rawContent, g.name)]),
    );

    const makeGroupUpdateOp = (uuid: string, content: string[]): BatchAliasOperation => {
      const g = groupMap.get(uuid)!;
      return {
        type: 'update',
        uuid,
        payload: {
          alias: {
            enabled: g.enabled ? '1' : '0',
            name: g.name,
            type: g.type || 'networkgroup',
            content: content.join('\n'),
            description: g.description || '',
            proto: g.proto || '',
            interface: g.interface || '',
            counters: g.counters || '',
            updatefreq: g.updatefreq || '',
            categories: g.categories || '',
          },
        },
      };
    };

    const scheduleCtx = { authMethod: 'SCHEDULED', scheduleId: schedule.id, scheduleName: schedule.name };

    for (const action of sortedActions) {
      const ops: BatchAliasOperation[] = [];
      // For CLEAR_ALL: track which aliases were removed from which groups so we can emit
      // one history-compatible audit event per (alias, group) pair after the batch.
      const clearAllRemovals = new Map<string, string[]>(); // aliasName → [groupUuid, ...]

      if (action.operation === 'ASSIGN' && action.targetGroupUuid) {
        const currentContent = groupContentMap.get(action.targetGroupUuid) ?? [];
        // MultiSelect semantics only — no eviction
        const toAdd = aliasNames.filter(n => !currentContent.includes(n));
        if (toAdd.length > 0) {
          const newContent = [...currentContent, ...toAdd];
          groupContentMap.set(action.targetGroupUuid, newContent);
          ops.push(makeGroupUpdateOp(action.targetGroupUuid, newContent));
        }
        for (const aliasName of aliasNames) {
          await logAuditEvent({ action: 'OPNSENSE_GROUP_NETWORK_ALIAS_ASSIGN_ATTEMPT', details: { ...scheduleCtx, targetGroupUuid: action.targetGroupUuid, aliasName } });
        }
      } else if (action.operation === 'UNASSIGN' && action.targetGroupUuid) {
        const currentContent = groupContentMap.get(action.targetGroupUuid) ?? [];
        const newContent = currentContent.filter(n => !aliasNames.includes(n));
        groupContentMap.set(action.targetGroupUuid, newContent);
        ops.push(makeGroupUpdateOp(action.targetGroupUuid, newContent));
        for (const aliasName of aliasNames) {
          await logAuditEvent({ action: 'OPNSENSE_GROUP_NETWORK_ALIAS_UNASSIGN_ATTEMPT', details: { ...scheduleCtx, targetGroupUuid: action.targetGroupUuid, aliasName } });
        }
      } else if (action.operation === 'CLEAR_ALL') {
        for (const [groupUuid, currentContent] of groupContentMap.entries()) {
          const toRemove = aliasNames.filter(n => currentContent.includes(n));
          if (toRemove.length > 0) {
            const newContent = currentContent.filter(n => !aliasNames.includes(n));
            groupContentMap.set(groupUuid, newContent);
            ops.push(makeGroupUpdateOp(groupUuid, newContent));
            for (const aliasName of toRemove) {
              if (!clearAllRemovals.has(aliasName)) clearAllRemovals.set(aliasName, []);
              clearAllRemovals.get(aliasName)!.push(groupUuid);
            }
          }
        }
        for (const aliasName of aliasNames) {
          await logAuditEvent({ action: 'OPNSENSE_GROUP_NETWORK_ALIAS_CLEAR_ALL_ATTEMPT', details: { ...scheduleCtx, aliasName } });
        }
      }

      if (ops.length > 0) {
        const batchResult = await batchAliasOperations(ops);
        const success = batchResult.success;
        const batchError = success ? undefined : (batchResult.error ?? 'Batch operation failed');

        for (const aliasName of aliasNames) {
          results.push({
            operation: action.operation,
            targetGroupUuid: action.targetGroupUuid,
            fromGroupUuid: action.fromGroupUuid,
            aliasName,
            success,
            error: batchError,
          });

          if (!success) {
            // Keep operational naming for failures so they remain distinguishable in audit logs
            await logAuditEvent({
              action: `OPNSENSE_GROUP_NETWORK_ALIAS_${action.operation}_FAILURE`,
              details: { ...scheduleCtx, targetGroupUuid: action.targetGroupUuid, aliasName },
            });
          } else if (action.operation === 'ASSIGN' && action.targetGroupUuid) {
            const targetGroup = groupMap.get(action.targetGroupUuid);
            await logAuditEvent({
              action: 'NETWORK_ALIAS_GROUP_ASSIGN_SUCCESS',
              details: {
                ...scheduleCtx,
                aliasName,
                groupUuid: action.targetGroupUuid,
                groupName: targetGroup?.name ?? null,
              },
            });
          } else if (action.operation === 'UNASSIGN' && action.targetGroupUuid) {
            const targetGroup = groupMap.get(action.targetGroupUuid);
            await logAuditEvent({
              action: 'NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS',
              details: {
                ...scheduleCtx,
                aliasName,
                groupUuid: action.targetGroupUuid,
                groupName: targetGroup?.name ?? null,
              },
            });
          } else if (action.operation === 'CLEAR_ALL') {
            // Emit one history entry per group the alias was removed from
            const affectedGroups = clearAllRemovals.get(aliasName) ?? [];
            for (const groupUuid of affectedGroups) {
              const group = groupMap.get(groupUuid);
              await logAuditEvent({
                action: 'NETWORK_ALIAS_GROUP_UNASSIGN_SUCCESS',
                details: {
                  ...scheduleCtx,
                  aliasName,
                  groupUuid,
                  groupName: group?.name ?? null,
                },
              });
            }
          }
        }
      }
    }

    const failedResults = results.filter(r => !r.success);
    const allFailed = results.length > 0 && failedResults.length === results.length;
    const anyFailed = failedResults.length > 0;
    const status = allFailed ? 'FAILED' : anyFailed ? 'PARTIAL' : results.length === 0 ? 'SKIPPED' : 'SUCCESS';

    return {
      targetIps: [],
      targetAliasNames: aliasNames,
      actionsRun: results,
      status,
      durationMs: 0,
      errorMessage: failedResults.length > 0
        ? failedResults.map(r => `${r.operation}(${r.aliasName}): ${r.error}`).join('; ')
        : undefined,
    };
  }

  // ─── Private: reconciliation sweep ─────────────────────────────────────────

  private async runReconciliationSweep(): Promise<void> {
    if (!this.isRunning) return;

    updateServiceActivity('schedule-execution');

    const now = new Date();
    const windowStart = new Date(now.getTime() - 10 * 60 * 1000);

    const schedules = await prisma.scheduledAssignment.findMany({
      where: { enabled: true },
      include: {
        days: { include: { windows: true } },
      },
    });

    for (const schedule of schedules) {
      if (schedule.scheduleType === 'COMPLEX_WEEKLY') {
        for (const day of schedule.days) {
          for (const window of day.windows) {
            for (const boundaryType of ['START', 'END'] as const) {
              const timeHHMM =
                boundaryType === 'START' ? window.startTime : window.endTime;

              // Find the most recent occurrence of this boundary in the window
              const firesAt = this.findLastOccurrenceInWindow(
                day.dayOfWeek,
                timeHHMM,
                schedule.timezone,
                windowStart,
                now,
              );

              if (!firesAt) continue;

              const alreadyDone = await this.wasExecutedAt(
                schedule.id,
                boundaryType,
                firesAt,
                120,
              );

              if (!alreadyDone) {
                logger.warn(
                  `Reconciliation: missed boundary for schedule ${schedule.id} [${boundaryType}] at ${firesAt.toISOString()}, executing now`,
                );
                const missedEvent: BoundaryEvent = {
                  scheduleId: schedule.id,
                  scheduleType: 'COMPLEX_WEEKLY',
                  boundaryType,
                  firesAt,
                  windowId: window.id,
                  priority: schedule.priority,
                  retryCount: 0,
                };
                await this.fireBoundary([missedEvent]);
              }
            }
          }
        }
      } else if (schedule.scheduleType === 'ONCE') {
        if (!schedule.executeAt) continue;
        if (schedule.executeAt < windowStart || schedule.executeAt > now) continue;

        const alreadyDone = await this.wasExecutedAt(
          schedule.id,
          'START',
          schedule.executeAt,
          120,
        );

        if (!alreadyDone) {
          logger.warn(
            `Reconciliation: missed ONCE schedule ${schedule.id} at ${schedule.executeAt.toISOString()}, executing now`,
          );
          await this.fireBoundary([
            {
              scheduleId: schedule.id,
              scheduleType: 'ONCE',
              boundaryType: 'START',
              firesAt: schedule.executeAt,
              priority: schedule.priority,
              retryCount: 0,
            },
          ]);
        }
      } else if (schedule.scheduleType === 'RECURRING') {
        // For recurring, we check if there's a pending cron occurrence in the window
        if (!schedule.cronExpression) continue;

        try {
          // Check backwards from now to windowStart for missed occurrences
          const expr = CronExpressionParser.parse(schedule.cronExpression, {
            tz: schedule.timezone || 'UTC',
            currentDate: windowStart,
          });

          let occurrence = expr.next().toDate();
          while (occurrence <= now) {
            const alreadyDone = await this.wasExecutedAt(
              schedule.id,
              'START',
              occurrence,
              120,
            );

            if (!alreadyDone) {
              logger.warn(
                `Reconciliation: missed RECURRING schedule ${schedule.id} at ${occurrence.toISOString()}, executing now`,
              );
              await this.fireBoundary([
                {
                  scheduleId: schedule.id,
                  scheduleType: 'RECURRING',
                  boundaryType: 'START',
                  firesAt: occurrence,
                  priority: schedule.priority,
                  retryCount: 0,
                },
              ]);
            }

            try {
              occurrence = expr.next().toDate();
            } catch {
              break;
            }
          }
        } catch (err) {
          logger.warn(
            `Reconciliation: invalid cron for schedule ${schedule.id}:`,
            err,
          );
        }
      }
    }

    // Process pending retries that are due
    for (const [key, retry] of this.retryMap) {
      if (retry.nextRetryAt <= now) {
        logger.info(
          `Reconciliation: processing retry ${retry.count} for ${key}`,
        );
        await this.fireBoundary([retry.event]);
        // fireSingleBoundary updates retryMap, so no need to delete here
      }
    }

    // Re-arm precision timer to pick up any schedule changes
    await this.scheduleNextBoundary();
  }

  /**
   * Find the most recent occurrence of a day+time boundary that falls within [windowStart, windowEnd].
   * Returns null if no occurrence falls in the window.
   */
  private findLastOccurrenceInWindow(
    dayOfWeek: number,
    timeHHMM: string,
    timezone: string,
    windowStart: Date,
    windowEnd: Date,
  ): Date | null {
    // Work backwards from windowEnd: check if the boundary fired in the window
    const dowFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    });
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const tzDateStr = dateFormatter.format(windowEnd);
    const tzDow = dayNames.indexOf(dowFormatter.format(windowEnd));

    // Days since last occurrence of dayOfWeek
    const daysSince = (tzDow - dayOfWeek + 7) % 7;

    const [yr, mo, dy] = tzDateStr.split('-').map(Number);
    const base = new Date(Date.UTC(yr, mo - 1, dy - daysSince));
    const yr2 = base.getUTCFullYear();
    const mo2 = String(base.getUTCMonth() + 1).padStart(2, '0');
    const dy2 = String(base.getUTCDate()).padStart(2, '0');

    const occurrence = wallClockToUtc(`${yr2}-${mo2}-${dy2}`, timeHHMM, timezone);

    if (occurrence >= windowStart && occurrence <= windowEnd) {
      return occurrence;
    }

    return null;
  }
}

// ─── Comparison helper ────────────────────────────────────────────────────────

function compareBoundaryEvents(a: BoundaryEvent, b: BoundaryEvent): number {
  const timeDiff = a.firesAt.getTime() - b.firesAt.getTime();
  if (timeDiff !== 0) return timeDiff;

  // END before START
  if (a.boundaryType !== b.boundaryType) {
    return a.boundaryType === 'END' ? -1 : 1;
  }

  // Lower priority number fires first
  const priorityDiff = a.priority - b.priority;
  if (priorityDiff !== 0) return priorityDiff;

  // Lexicographic tie-break
  return a.scheduleId.localeCompare(b.scheduleId);
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const scheduleExecutionService = new ScheduleExecutionService();
