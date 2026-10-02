'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDuration } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCoarsePointer, useIsPhone } from '@/hooks/use-mobile';
import { MAX_DELAY_MINUTES, normalizeDelay } from './run-in-delay';

export { normalizeDelay } from './run-in-delay';

const PRESETS = [
  { label: '30 minutes', delayMinutes: 30 },
  { label: '1 hour', delayMinutes: 60 },
  { label: '3 hours', delayMinutes: 180 },
] as const;

const QUICK_ADJUSTS = [
  {
    minutes: 5,
    plusLabel: '+5 min',
    minusLabel: '−5 min',
    plusAria: 'Add 5 minutes',
    minusAria: 'Subtract 5 minutes',
  },
  {
    minutes: 15,
    plusLabel: '+15 min',
    minusLabel: '−15 min',
    plusAria: 'Add 15 minutes',
    minusAria: 'Subtract 15 minutes',
  },
  {
    minutes: 60,
    plusLabel: '+1 hour',
    minusLabel: '−1 hour',
    plusAria: 'Add 1 hour',
    minusAria: 'Subtract 1 hour',
  },
] as const;

const DIGIT_RE = /^\d{0,3}$/;

export interface RunInDelayConfirmResult {
  delayMinutes: number;
  executeAt: Date;
}

interface RunInDelayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (result: RunInDelayConfirmResult) => void | Promise<void>;
  scheduleName?: string;
}

function parseDraft(raw: string): number {
  if (raw === '') return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function draftsFromTotal(total: number): { hours: string; minutes: string } {
  return {
    hours: String(Math.floor(total / 60)),
    minutes: String(total % 60).padStart(2, '0'),
  };
}

export function RunInDelayModal({
  open,
  onOpenChange,
  onConfirm,
  scheduleName,
}: RunInDelayModalProps) {
  const isPhone = useIsPhone();
  const isCoarse = useCoarsePointer();
  const [mounted, setMounted] = useState(false);
  const hoursRef = useRef<HTMLInputElement>(null);
  const minutesRef = useRef<HTMLInputElement>(null);

  const [totalMinutes, setTotalMinutes] = useState(30);
  const [hoursDraft, setHoursDraft] = useState('0');
  const [minutesDraft, setMinutesDraft] = useState('30');
  const [hitMax, setHitMax] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const drafts = draftsFromTotal(30);
    setTotalMinutes(30);
    setHoursDraft(drafts.hours);
    setMinutesDraft(drafts.minutes);
    setHitMax(false);
    setIsSubmitting(false);
    setPreviewTick(0);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted || isPhone || isCoarse) return;
    // Hooks start false; read matchMedia so a phone never autofocuses on the first paint.
    if (window.matchMedia('(max-width: 767px)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    hoursRef.current?.focus();
    hoursRef.current?.select();
  }, [open, mounted, isPhone, isCoarse]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setPreviewTick(t => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, [open]);

  const executeAt = useMemo(() => {
    void previewTick;
    return new Date(Date.now() + totalMinutes * 60_000);
  }, [totalMinutes, previewTick]);

  function applyTotal(next: number, rawTotal: number) {
    const clamped = normalizeDelay(0, next);
    const drafts = draftsFromTotal(clamped);
    setTotalMinutes(clamped);
    setHoursDraft(drafts.hours);
    setMinutesDraft(drafts.minutes);
    setHitMax(rawTotal > MAX_DELAY_MINUTES);
  }

  function commitDrafts(hours = parseDraft(hoursDraft), minutes = parseDraft(minutesDraft)) {
    applyTotal(hours * 60 + minutes, hours * 60 + minutes);
  }

  function updateFromDrafts(nextHours: string, nextMinutes: string) {
    const hours = parseDraft(nextHours);
    const minutes = parseDraft(nextMinutes);
    const rawTotal = hours * 60 + minutes;
    setTotalMinutes(normalizeDelay(hours, minutes));
    setHitMax(rawTotal > MAX_DELAY_MINUTES);
  }

  function handleSegmentChange(which: 'hours' | 'minutes', value: string) {
    if (value !== '' && !DIGIT_RE.test(value)) return;
    if (which === 'hours') {
      setHoursDraft(value);
      updateFromDrafts(value, minutesDraft);
    } else {
      setMinutesDraft(value);
      updateFromDrafts(hoursDraft, value);
    }
  }

  function nudgeSegment(which: 'hours' | 'minutes', delta: number) {
    const hours = parseDraft(hoursDraft);
    const minutes = parseDraft(minutesDraft);
    if (which === 'hours') {
      commitDrafts(Math.max(0, hours + delta), minutes);
    } else {
      commitDrafts(hours, Math.max(0, minutes + delta));
    }
  }

  async function handleConfirm() {
    const delayMinutes = normalizeDelay(parseDraft(hoursDraft), parseDraft(minutesDraft));
    if (delayMinutes < 1) return;
    setIsSubmitting(true);
    try {
      await onConfirm({
        delayMinutes,
        executeAt: new Date(Date.now() + delayMinutes * 60_000),
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const durationLabel = formatDuration({ hours, minutes });
  const confirmDisabled = isSubmitting || totalMinutes < 1;
  const hintId = 'run-in-delay-hint';
  const hint =
    hitMax
      ? 'Maximum delay is 7 days.'
      : totalMinutes < 1
        ? 'Enter at least 1 minute.'
        : null;

  const fieldClass = cn(
    'h-14 w-[6.5rem] px-1 text-center text-3xl font-semibold tabular-nums md:text-3xl'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={event => {
          event.preventDefault();
        }}
      >
        <form
          onSubmit={event => {
            event.preventDefault();
            commitDrafts();
            if (confirmDisabled) return;
            void handleConfirm();
          }}
        >
          <DialogHeader>
            <DialogTitle>Run In…</DialogTitle>
            <DialogDescription>
              {scheduleName
                ? `Reschedule "${scheduleName}" to run after a short delay.`
                : 'Set the once schedule to run after a short delay.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESETS.map(preset => (
                <Button
                  key={preset.delayMinutes}
                  type="button"
                  variant={totalMinutes === preset.delayMinutes ? 'default' : 'outline'}
                  className={cn('h-auto py-3')}
                  disabled={isSubmitting}
                  onClick={() => applyTotal(preset.delayMinutes, preset.delayMinutes)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* ponytail: inline here — one consumer. Promote to ui/duration-input.tsx on the second. */}
            <div>
              <span id="run-in-duration-label" className="sr-only">
                Delay before running
              </span>
              <div
                className="flex items-start justify-center gap-2"
                role="group"
                aria-labelledby="run-in-duration-label"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <Input
                    ref={hoursRef}
                    id="run-in-hours"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    enterKeyHint="done"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Hours"
                    aria-describedby={hint ? hintId : undefined}
                    aria-invalid={hitMax || undefined}
                    disabled={isSubmitting}
                    className={fieldClass}
                    value={hoursDraft}
                    onFocus={event => event.currentTarget.select()}
                    onChange={event => handleSegmentChange('hours', event.target.value)}
                    onBlur={() => commitDrafts()}
                    onKeyDown={event => {
                      if (event.key === ':') {
                        event.preventDefault();
                        minutesRef.current?.focus();
                        minutesRef.current?.select();
                      } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        nudgeSegment('hours', 1);
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        nudgeSegment('hours', -1);
                      }
                    }}
                  />
                  <label
                    htmlFor="run-in-hours"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    h
                  </label>
                </div>
                <span
                  className="h-14 text-3xl font-semibold leading-[3.5rem] text-muted-foreground"
                  aria-hidden
                >
                  :
                </span>
                <div className="flex flex-col items-center gap-1.5">
                  <Input
                    ref={minutesRef}
                    id="run-in-minutes"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    enterKeyHint="done"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Minutes"
                    aria-describedby={hint ? hintId : undefined}
                    aria-invalid={hitMax || undefined}
                    disabled={isSubmitting}
                    className={fieldClass}
                    value={minutesDraft}
                    onFocus={event => event.currentTarget.select()}
                    onChange={event => handleSegmentChange('minutes', event.target.value)}
                    onBlur={() => commitDrafts()}
                    onKeyDown={event => {
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        nudgeSegment('minutes', 1);
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        nudgeSegment('minutes', -1);
                      }
                    }}
                  />
                  <label
                    htmlFor="run-in-minutes"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    min
                  </label>
                </div>
              </div>
              <p
                id={hintId}
                className={cn(
                  'mt-2 min-h-5 text-center text-xs',
                  hitMax ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {hint ?? ''}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {QUICK_ADJUSTS.map(chip => (
                <Button
                  key={`plus-${chip.minutes}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 px-4 w-full"
                  disabled={isSubmitting}
                  aria-label={chip.plusAria}
                  onClick={() => {
                    const raw = totalMinutes + chip.minutes;
                    applyTotal(raw, raw);
                  }}
                >
                  {chip.plusLabel}
                </Button>
              ))}
              {QUICK_ADJUSTS.map(chip => (
                <Button
                  key={`minus-${chip.minutes}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 px-4 w-full"
                  disabled={isSubmitting || totalMinutes === 0}
                  aria-label={chip.minusAria}
                  onClick={() => {
                    const raw = totalMinutes - chip.minutes;
                    applyTotal(raw, raw);
                  }}
                >
                  {chip.minusLabel}
                </Button>
              ))}
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm" aria-live="polite">
              <p className="font-medium">
                {totalMinutes >= 1 && durationLabel ? `In ${durationLabel}` : '\u00a0'}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                Will run at (local)
                {totalMinutes >= 1 ? ` · ${format(executeAt, 'PPP p')}` : ' · —'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={confirmDisabled}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming…
                </>
              ) : (
                'Confirm'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
