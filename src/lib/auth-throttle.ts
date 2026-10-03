// Single Node process only. docker-compose runs one app container.
// Counters are lost on restart. Do not use this map across replicas.

import { logAuditEvent } from './auditLog';
import { getClientIp } from './network-utils';

export type CredentialSource = 'authorize' | 'password-check';

export type ThrottleResult = {
  limited: boolean;
  retryAfterSeconds: number;
};

type Bucket = {
  failures: number;
  windowStartedAt: number;
  lockUntil: number;
};

type PairSlot = {
  lastSource: CredentialSource;
  lastAt: number;
};

type WindowBucket = {
  failures: number;
  windowStartedAt: number;
};

const COALESCE_MS = 2000;
const MAP_CAP = 10_000;
const IDENTIFIER_MAX = 320;

const NOT_LIMITED: ThrottleResult = { limited: false, retryAfterSeconds: 0 };

const DEFAULTS = {
  loginMax: 5,
  loginWindowSec: 900,
  loginLockSec: 900,
  loginIpMax: 30,
  loginIpWindowSec: 900,
  loginIpLockSec: 900,
  resetEmailMax: 3,
  resetEmailWindowSec: 3600,
  resetIpMax: 10,
  resetIpWindowSec: 3600,
} as const;

let credentialBuckets = new Map<string, Bucket>();
let pairSlots = new Map<string, PairSlot>();
let resetEmailBuckets = new Map<string, WindowBucket>();
let resetIpBuckets = new Map<string, WindowBucket>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return fallback;
  return n;
}

function isThrottleEnabled(): boolean {
  const raw = process.env.AUTH_THROTTLE_ENABLED;
  if (raw === undefined) return true;
  const normalized = raw.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'no';
}

function loginMaxFailures(): number {
  return parsePositiveInt(process.env.AUTH_LOGIN_MAX_FAILURES, DEFAULTS.loginMax);
}

function loginWindowSec(): number {
  return parsePositiveInt(process.env.AUTH_LOGIN_WINDOW_SEC, DEFAULTS.loginWindowSec);
}

function loginLockSec(): number {
  return parsePositiveInt(process.env.AUTH_LOGIN_LOCK_SEC, DEFAULTS.loginLockSec);
}

function loginIpMaxFailures(): number {
  return parsePositiveInt(process.env.AUTH_LOGIN_IP_MAX_FAILURES, DEFAULTS.loginIpMax);
}

function loginIpWindowSec(): number {
  return parsePositiveInt(process.env.AUTH_LOGIN_IP_WINDOW_SEC, DEFAULTS.loginIpWindowSec);
}

function loginIpLockSec(): number {
  return parsePositiveInt(process.env.AUTH_LOGIN_IP_LOCK_SEC, DEFAULTS.loginIpLockSec);
}

function resetEmailMax(): number {
  return parsePositiveInt(process.env.AUTH_RESET_EMAIL_MAX, DEFAULTS.resetEmailMax);
}

function resetEmailWindowSec(): number {
  return parsePositiveInt(process.env.AUTH_RESET_EMAIL_WINDOW_SEC, DEFAULTS.resetEmailWindowSec);
}

function resetIpMax(): number {
  return parsePositiveInt(process.env.AUTH_RESET_IP_MAX, DEFAULTS.resetIpMax);
}

function resetIpWindowSec(): number {
  return parsePositiveInt(process.env.AUTH_RESET_IP_WINDOW_SEC, DEFAULTS.resetIpWindowSec);
}

function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase().slice(0, IDENTIFIER_MAX);
}

function usableIp(ip: string | null): string | null {
  if (typeof ip !== 'string') return null;
  const trimmed = ip.trim();
  return trimmed === '' ? null : trimmed;
}

function accountKey(identifier: string): string {
  return `acct:${normalizeIdentifier(identifier)}`;
}

function ipKey(ip: string): string {
  return `ip:${ip}`;
}

function pairKey(identifier: string, ip: string | null): string {
  return `pair:${accountKey(identifier)}|${ip ?? 'noip'}`;
}

function retryAfterSeconds(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

function windowElapsed(startedAt: number, windowSec: number, now: number): boolean {
  return now >= startedAt + windowSec * 1000;
}

function logLockTransition(scope: 'account' | 'ip', identifier: string): void {
  const isEmail = identifier.includes('@');
  void logAuditEvent({
    action: 'LOGIN_THROTTLED',
    event: 'LOGIN_THROTTLED',
    email: isEmail ? identifier : null,
    details: isEmail ? { scope } : { scope, identifier },
  });
}

function engageLock(
  bucket: Bucket,
  lockSec: number,
  now: number,
  scope: 'account' | 'ip',
  identifier: string,
): void {
  if (bucket.lockUntil <= now) {
    bucket.lockUntil = now + lockSec * 1000;
    logLockTransition(scope, identifier);
  }
}

function credentialDecision(
  bucket: Bucket | undefined,
  max: number,
  windowSec: number,
  lockSec: number,
  now: number,
  scope: 'account' | 'ip',
  identifier: string,
  engage: boolean,
): ThrottleResult {
  if (!bucket) return NOT_LIMITED;
  if (bucket.lockUntil > now) {
    return { limited: true, retryAfterSeconds: retryAfterSeconds(bucket.lockUntil, now) };
  }
  if (windowElapsed(bucket.windowStartedAt, windowSec, now)) {
    return NOT_LIMITED;
  }
  if (bucket.failures >= max) {
    if (engage) {
      engageLock(bucket, lockSec, now, scope, identifier);
    }
    const until = bucket.lockUntil > now ? bucket.lockUntil : now + lockSec * 1000;
    return { limited: true, retryAfterSeconds: retryAfterSeconds(until, now) };
  }
  return NOT_LIMITED;
}

function incrementCredentialBucket(
  map: Map<string, Bucket>,
  key: string,
  max: number,
  windowSec: number,
  now: number,
): void {
  const existing = map.get(key);
  if (!existing || windowElapsed(existing.windowStartedAt, windowSec, now)) {
    map.set(key, { failures: 1, windowStartedAt: now, lockUntil: 0 });
    return;
  }
  if (existing.failures < max) {
    existing.failures += 1;
  }
}

function pruneMap<T extends { windowStartedAt: number; lockUntil?: number }>(
  map: Map<string, T>,
  windowSec: number,
  now: number,
): void {
  for (const [key, bucket] of map) {
    const lockUntil = bucket.lockUntil ?? 0;
    if (windowElapsed(bucket.windowStartedAt, windowSec, now) && lockUntil <= now) {
      map.delete(key);
    }
  }
}

function prunePairs(now: number): void {
  for (const [key, slot] of pairSlots) {
    if (now - slot.lastAt >= COALESCE_MS * 10) {
      pairSlots.delete(key);
    }
  }
}

function capMap<T extends { windowStartedAt: number }>(map: Map<string, T>): void {
  if (map.size <= MAP_CAP) return;
  const entries = [...map.entries()].sort((a, b) => a[1].windowStartedAt - b[1].windowStartedAt);
  let remaining = map.size - MAP_CAP;
  for (const [key] of entries) {
    if (remaining <= 0) break;
    map.delete(key);
    remaining -= 1;
  }
}

function capPairs(): void {
  if (pairSlots.size <= MAP_CAP) return;
  const entries = [...pairSlots.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt);
  let remaining = pairSlots.size - MAP_CAP;
  for (const [key] of entries) {
    if (remaining <= 0) break;
    pairSlots.delete(key);
    remaining -= 1;
  }
}

function pruneLogin(now: number): void {
  pruneMap(credentialBuckets, Math.max(loginWindowSec(), loginIpWindowSec()), now);
  prunePairs(now);
  capMap(credentialBuckets);
  capPairs();
}

function pruneReset(now: number): void {
  pruneMap(resetEmailBuckets, resetEmailWindowSec(), now);
  pruneMap(resetIpBuckets, resetIpWindowSec(), now);
  capMap(resetEmailBuckets);
  capMap(resetIpBuckets);
}

export function assertCredentialAllowed(
  identifier: string,
  ip: string | null,
  now: number = Date.now(),
): ThrottleResult {
  if (!isThrottleEnabled()) return NOT_LIMITED;

  const acct = credentialBuckets.get(accountKey(identifier));
  const accountResult = credentialDecision(
    acct,
    loginMaxFailures(),
    loginWindowSec(),
    loginLockSec(),
    now,
    'account',
    identifier,
    true,
  );
  if (accountResult.limited) return accountResult;

  const resolvedIp = usableIp(ip);
  if (!resolvedIp) return NOT_LIMITED;

  const ipBucket = credentialBuckets.get(ipKey(resolvedIp));
  return credentialDecision(
    ipBucket,
    loginIpMaxFailures(),
    loginIpWindowSec(),
    loginIpLockSec(),
    now,
    'ip',
    identifier,
    true,
  );
}

export function noteCredentialFailure(
  identifier: string,
  ip: string | null,
  source: CredentialSource,
  now: number = Date.now(),
): ThrottleResult {
  if (!isThrottleEnabled()) return NOT_LIMITED;

  pruneLogin(now);

  const already = assertCredentialAllowed(identifier, ip, now);
  if (already.limited) return already;

  const resolvedIp = usableIp(ip);
  const slotKey = pairKey(identifier, resolvedIp);
  const slot = pairSlots.get(slotKey);
  if (slot && slot.lastSource !== source && now - slot.lastAt < COALESCE_MS) {
    pairSlots.set(slotKey, { lastSource: source, lastAt: now });
    return NOT_LIMITED;
  }

  incrementCredentialBucket(
    credentialBuckets,
    accountKey(identifier),
    loginMaxFailures(),
    loginWindowSec(),
    now,
  );
  if (resolvedIp) {
    incrementCredentialBucket(
      credentialBuckets,
      ipKey(resolvedIp),
      loginIpMaxFailures(),
      loginIpWindowSec(),
      now,
    );
  }
  pairSlots.set(slotKey, { lastSource: source, lastAt: now });
  capMap(credentialBuckets);
  capPairs();
  return NOT_LIMITED;
}

export function clearCredentialFailures(identifier: string): void {
  const acct = accountKey(identifier);
  credentialBuckets.delete(acct);
  const prefix = `pair:${acct}|`;
  for (const key of pairSlots.keys()) {
    if (key.startsWith(prefix)) {
      pairSlots.delete(key);
    }
  }
}

function incrementWindowBucket(
  map: Map<string, WindowBucket>,
  key: string,
  max: number,
  windowSec: number,
  now: number,
): ThrottleResult {
  const existing = map.get(key);
  if (!existing || windowElapsed(existing.windowStartedAt, windowSec, now)) {
    map.set(key, { failures: 1, windowStartedAt: now });
    return NOT_LIMITED;
  }
  if (existing.failures >= max) {
    const until = existing.windowStartedAt + windowSec * 1000;
    return { limited: true, retryAfterSeconds: retryAfterSeconds(until, now) };
  }
  existing.failures += 1;
  return NOT_LIMITED;
}

export function noteResetRequest(
  email: string,
  ip: string | null,
  now: number = Date.now(),
): ThrottleResult {
  if (!isThrottleEnabled()) return NOT_LIMITED;

  pruneReset(now);

  const emailResult = incrementWindowBucket(
    resetEmailBuckets,
    `email:${normalizeIdentifier(email)}`,
    resetEmailMax(),
    resetEmailWindowSec(),
    now,
  );
  const resolvedIp = usableIp(ip);
  let ipResult = NOT_LIMITED;
  if (resolvedIp) {
    ipResult = incrementWindowBucket(
      resetIpBuckets,
      ipKey(resolvedIp),
      resetIpMax(),
      resetIpWindowSec(),
      now,
    );
  }
  capMap(resetEmailBuckets);
  capMap(resetIpBuckets);
  if (emailResult.limited) return emailResult;
  if (ipResult.limited) return ipResult;
  return NOT_LIMITED;
}

export function clientIpFromHeaderRecord(
  headers: Record<string, unknown> | undefined,
): string | null {
  return getClientIp({
    headers: {
      get(name: string) {
        if (!headers) return null;
        const lower = name.toLowerCase();
        let value: unknown;
        if (Object.prototype.hasOwnProperty.call(headers, name)) {
          value = headers[name];
        } else if (Object.prototype.hasOwnProperty.call(headers, lower)) {
          value = headers[lower];
        } else {
          return null;
        }
        if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
        return typeof value === 'string' ? value : null;
      },
    },
  });
}

export function resetAuthThrottleForTests(): void {
  credentialBuckets = new Map();
  pairSlots = new Map();
  resetEmailBuckets = new Map();
  resetIpBuckets = new Map();
}
