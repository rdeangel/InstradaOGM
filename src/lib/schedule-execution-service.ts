// src/lib/schedule-execution-service.ts
import 'server-only';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  addIpToGroup,
  removeIpFromGroup,
  getNetworkGroups,
  exportAliases,
  parseGroupContent,
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

interface ExecutionSummary {
  targetIps: string[];
  actionsRun: ActionResult[];
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
    const startTime = Date.now();

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

    // Resolve target IPs
    let targetIps: string[] = [];
    let resolveError: string | undefined;

    try {
      targetIps = await this.resolveTargets(schedule);
    } catch (err) {
      resolveError = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to resolve targets for schedule ${schedule.id}:`, err);
    }

    let summary: ExecutionSummary;

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
        summary = await this.executeActions(targetIps, actions, schedule);
      } finally {
        release();
      }
    }

    const durationMs = Date.now() - startTime;
    summary.durationMs = durationMs;

    // Write execution record
    await prisma.scheduleExecution.create({
      data: {
        scheduleId: schedule.id,
        boundaryType: event.boundaryType,
        executedAt: new Date(),
        status: summary.status,
        targetIps: summary.targetIps,
        actionsRun: summary.actionsRun as object[],
        durationMs: summary.durationMs,
        errorMessage: summary.errorMessage,
      },
    });

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
        if (alias?.content) {
          // Host alias content is a single IP string (possibly with whitespace)
          const ip = alias.content.trim();
          if (ip) ips.push(ip);
        }
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
    schedule: { id: string },
  ): Promise<ExecutionSummary> {
    const sortedActions = [...actions].sort((a, b) => a.sortOrder - b.sortOrder);
    const results: ActionResult[] = [];
    let isNetworkError = false;

    for (const action of sortedActions) {
      for (const ip of targetIps) {
        const result: ActionResult = {
          operation: action.operation,
          targetGroupUuid: action.targetGroupUuid,
          fromGroupUuid: action.fromGroupUuid,
          ip,
          success: false,
        };

        try {
          if (action.operation === 'ASSIGN') {
            if (!action.targetGroupUuid) throw new Error('targetGroupUuid is required for ASSIGN');
            const res = await addIpToGroup(action.targetGroupUuid, ip);
            result.success = res.success;
            if (!res.success) result.error = res.message;
          } else if (action.operation === 'REMOVE') {
            if (!action.targetGroupUuid) throw new Error('targetGroupUuid is required for REMOVE');
            const res = await removeIpFromGroup(action.targetGroupUuid, ip);
            result.success = res.success;
            if (!res.success) result.error = res.message;
          } else if (action.operation === 'MOVE') {
            if (!action.fromGroupUuid) throw new Error('fromGroupUuid is required for MOVE');
            if (!action.targetGroupUuid) throw new Error('targetGroupUuid is required for MOVE');
            const removeRes = await removeIpFromGroup(action.fromGroupUuid, ip);
            if (!removeRes.success) {
              result.error = `Remove failed: ${removeRes.message}`;
            } else {
              const addRes = await addIpToGroup(action.targetGroupUuid, ip);
              result.success = addRes.success;
              if (!addRes.success) result.error = `Add failed: ${addRes.message}`;
              else result.success = true;
            }
          } else if (action.operation === 'CLEAR_ALL') {
            // Remove the IP from every group it belongs to.
            // Group content is alias names, not IPs — build a name→IP map first.
            const [groups, aliasesResponse] = await Promise.all([
              getNetworkGroups(),
              exportAliases(),
            ]);
            const allAliases = aliasesResponse?.aliases?.alias ?? {};
            const nameToIp = new Map<string, string>();
            for (const [, alias] of Object.entries(allAliases)) {
              if (alias.type === 'host' && alias.name && alias.content) {
                nameToIp.set(alias.name, alias.content.trim());
              }
            }

            let allCleared = true;
            for (const group of groups) {
              const memberNames = parseGroupContent(group.rawContent, group.name);
              // Find any alias in this group whose resolved IP matches the target IP
              const matchingAlias = memberNames.find((name) => nameToIp.get(name) === ip);
              if (matchingAlias !== undefined) {
                const res = await removeIpFromGroup(group.uuid, ip);
                if (!res.success) {
                  allCleared = false;
                  result.error = res.message;
                }
              }
            }
            result.success = allCleared;
          } else {
            result.error = `Unknown operation: ${action.operation}`;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.error = message;

          // Detect network errors (OPNsense unreachable)
          if (
            message.includes('ECONNREFUSED') ||
            message.includes('ENOTFOUND') ||
            message.includes('ETIMEDOUT') ||
            message.includes('fetch failed') ||
            message.includes('network')
          ) {
            isNetworkError = true;
          }

          logger.error(
            `Action ${action.operation} failed for IP ${ip} in schedule ${schedule.id}:`,
            err,
          );
        }

        results.push(result);
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
                30,
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
          30,
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
              30,
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
