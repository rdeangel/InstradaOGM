/** Strict zero-padded 24-hour HH:MM. */
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Accepts unpadded times like `9:30` and returns zero-padded `09:30`.
 * Returns null when the input is not a valid 24-hour time.
 */
export function normalizeTimeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** True only for strict zero-padded HH:MM (`00:00`–`23:59`). */
export function isValidHhMm(value: string): boolean {
  return HH_MM_RE.test(value);
}
