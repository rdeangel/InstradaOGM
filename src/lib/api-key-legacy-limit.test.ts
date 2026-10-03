import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_MEMO_MAX,
  legacyMemo,
  resetLegacyStateForTests,
  takeLegacyApiKeyScan,
} from './api-key-legacy-limit';

const T0 = 1_700_000_000_000;

afterEach(() => {
  vi.useRealTimers();
  resetLegacyStateForTests();
});

describe('takeLegacyApiKeyScan', () => {
  it('rejects the 6th scan from the same IP inside the window', () => {
    vi.useFakeTimers({ now: T0 });
    for (let i = 0; i < 5; i++) {
      expect(takeLegacyApiKeyScan('10.0.0.1')).toBe(true);
    }
    expect(takeLegacyApiKeyScan('10.0.0.1')).toBe(false);
  });

  it('rejects the 31st scan across IPs inside the process window', () => {
    vi.useFakeTimers({ now: T0 });
    for (let i = 0; i < 30; i++) {
      expect(takeLegacyApiKeyScan(`10.0.0.${i}`)).toBe(true);
    }
    expect(takeLegacyApiKeyScan('10.1.1.1')).toBe(false);
  });

  it('resets the per-IP window after 60s', () => {
    vi.useFakeTimers({ now: T0 });
    for (let i = 0; i < 5; i++) {
      expect(takeLegacyApiKeyScan('10.0.0.1')).toBe(true);
    }
    expect(takeLegacyApiKeyScan('10.0.0.1')).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(takeLegacyApiKeyScan('10.0.0.1')).toBe(true);
  });
});

describe('legacyMemo', () => {
  it('drops the oldest entry when the 1001st is inserted', () => {
    for (let i = 0; i < LEGACY_MEMO_MAX + 1; i++) {
      legacyMemo.set(`k${i}`, `id-${i}`);
    }
    expect(legacyMemo.get('k0')).toBeUndefined();
    expect(legacyMemo.get('k1')).toBe('id-1');
    expect(legacyMemo.get(`k${LEGACY_MEMO_MAX}`)).toBe(`id-${LEGACY_MEMO_MAX}`);
  });
});
