'use client';

/**
 * ScheduleEvaluatorDialog
 *
 * Allows administrators to inspect which enabled schedules would be active or
 * would fire at a specific date and time without triggering any real execution.
 *
 * The dialog accepts a date + time input (interpreted as UTC), calls
 * POST /api/admin/schedules/evaluate, and renders the results as a list of
 * matched schedule cards.
 *
 * Each card shows:
 *   - Schedule name, type badge, and match status badge
 *   - Timezone and window times (COMPLEX_WEEKLY)
 *   - Target type and human-readable target summary
 *   - Actions table (operation, boundary, group UUID)
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, SearchX } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface EvaluationAction {
  operation: string;
  boundaryType: string;
  targetGroupUuid: string | null;
  /** Resolved group name from OPNsense; equals the UUID if resolution failed. */
  targetGroupName: string | null;
  fromGroupUuid: string | null;
  sortOrder: number;
}

interface EvaluationMatch {
  scheduleId: string;
  scheduleName: string;
  scheduleType: string;
  timezone: string;
  matchStatus: string;
  matchedWindowLabel?: string;
  windowStartTime?: string;
  windowEndTime?: string;
  actions: EvaluationAction[];
  targetType: string;
  targetSelector: unknown;
  targetSummary: string;
  /** Individual resolved target names — used to render per-item badges. */
  targetNames: string[];
}

interface EvaluateResponse {
  evaluatedAt: string;
  matches: EvaluationMatch[];
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface ScheduleEvaluatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Badge variant mapped to matchStatus string. */
function matchStatusVariant(
  status: string,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'START boundary') return 'default';
  if (status === 'END boundary') return 'secondary';
  if (status === 'Active window (mid-run)') return 'outline';
  return 'secondary';
}

/** Badge variant for schedule type. */
function scheduleTypeVariant(
  type: string,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (type === 'COMPLEX_WEEKLY') return 'outline';
  if (type === 'ONCE') return 'secondary';
  if (type === 'RECURRING') return 'default';
  return 'outline';
}

/** ISO date string → "YYYY-MM-DDTHH:MM" for display. */
function formatEvaluatedAt(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  } catch {
    return iso;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ScheduleEvaluatorDialog({ open, onOpenChange }: ScheduleEvaluatorDialogProps) {
  // ── State ──────────────────────────────────────────────────────────────────

  // Initialise with the current UTC date/time so the user can start immediately.
  const nowUtc = new Date();
  const defaultDate = nowUtc.toISOString().slice(0, 10);
  const defaultTime = nowUtc.toISOString().slice(11, 16);

  const [dateValue, setDateValue] = useState<string>(defaultDate);
  const [timeValue, setTimeValue] = useState<string>(defaultTime);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleEvaluate() {
    if (!dateValue || !timeValue) {
      setError('Please select both a date and a time.');
      return;
    }

    // Combine date + time into a UTC ISO 8601 string.
    // The inputs are labelled as UTC so no local-time conversion is applied.
    const isoString = `${dateValue}T${timeValue}:00.000Z`;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/schedules/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateTime: isoString }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message ?? 'Evaluation failed.');
        return;
      }

      setResult(data as EvaluateResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    onOpenChange(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Evaluate Schedule at Date / Time</DialogTitle>
          <DialogDescription>
            See which enabled rules would be active or would fire at a specific moment.
            Times are interpreted as{' '}
            <span className="font-medium text-foreground">UTC</span>. Individual schedule
            rules are evaluated against their own configured timezone.
          </DialogDescription>
        </DialogHeader>

        {/* ── Input row ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-3 py-2 shrink-0">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium" htmlFor="eval-date">
              Date (UTC)
            </label>
            <input
              id="eval-date"
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium" htmlFor="eval-time">
              Time (UTC)
            </label>
            <input
              id="eval-time"
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <Button onClick={handleEvaluate} disabled={isLoading} className="h-9">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Evaluating…
              </>
            ) : (
              'Evaluate'
            )}
          </Button>
        </div>

        {/* ── Results area ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3 min-h-0">
          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Evaluated-at label */}
          {result && (
            <p className="text-xs text-muted-foreground">
              Results for{' '}
              <span className="font-medium text-foreground">{formatEvaluatedAt(result.evaluatedAt)}</span>
            </p>
          )}

          {/* Empty state */}
          {result && result.matches.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <SearchX className="h-10 w-10" />
              <p className="text-sm">No enabled schedules match this date / time.</p>
            </div>
          )}

          {/* Match cards */}
          {result?.matches.map((match, idx) => (
            <Card key={`${match.scheduleId}-${match.matchStatus}-${idx}`} className="border">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold">{match.scheduleName}</CardTitle>
                  <Badge variant={scheduleTypeVariant(match.scheduleType)} className="text-xs">
                    {match.scheduleType}
                  </Badge>
                  <Badge variant={matchStatusVariant(match.matchStatus)} className="text-xs">
                    {match.matchStatus}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-3 space-y-3">
                {/* Meta row */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Timezone:</span>{' '}
                    {match.timezone}
                  </span>

                  {match.windowStartTime && match.windowEndTime && (
                    <span>
                      <span className="font-medium text-foreground">Window:</span>{' '}
                      {match.windowStartTime} – {match.windowEndTime}
                      {match.matchedWindowLabel && (
                        <span className="italic text-muted-foreground">
                          {' '}
                          &quot;{match.matchedWindowLabel}&quot;
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* Target row */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground shrink-0">Target:</span>
                  {match.targetType === 'HOST_ALIAS' ? (
                    match.targetNames.length > 0 ? (
                      match.targetNames.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-medium text-cyan-600 dark:text-cyan-400"
                        >
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground italic">no aliases configured</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">{match.targetSummary}</span>
                  )}
                </div>

                {/* Actions table */}
                {match.actions.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Operation
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Boundary
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Target Group
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {match.actions.map((action, ai) => (
                          <tr
                            key={ai}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-3 py-2 font-medium">{action.operation}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {action.boundaryType}
                            </td>
                            <td className="px-3 py-2">
                              {action.targetGroupName ? (
                                <span
                                  title={action.targetGroupUuid ?? undefined}
                                  className="cursor-help"
                                >
                                  {action.targetGroupName}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No actions configured for this boundary.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <DialogFooter className="shrink-0 pt-2">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
