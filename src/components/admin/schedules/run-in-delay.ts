/** API max: 7 days in minutes. */
export const MAX_DELAY_MINUTES = 7 * 24 * 60;

/** Clamp hours+minutes into a delay of 0…10080 minutes. Minute overflow carries into hours. */
export function normalizeDelay(hours: number, minutes: number): number {
  const h = Number.isFinite(hours) ? Math.trunc(hours) : 0;
  const m = Number.isFinite(minutes) ? Math.trunc(minutes) : 0;
  return Math.min(Math.max(h * 60 + m, 0), MAX_DELAY_MINUTES);
}
