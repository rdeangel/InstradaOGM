import { describe, it, expect } from 'vitest';
import { normalizeDelay } from './run-in-delay';

describe('normalizeDelay', () => {
  it('keeps minutes-only values under an hour', () => {
    expect(normalizeDelay(0, 40)).toBe(40);
  });

  it('carries minute overflow into hours (90 → 1:30)', () => {
    const total = normalizeDelay(0, 90);
    expect(total).toBe(90);
    expect(Math.floor(total / 60)).toBe(1);
    expect(total % 60).toBe(30);
  });

  it('combines hours and minutes', () => {
    expect(normalizeDelay(1, 30)).toBe(90);
  });

  it('allows zero so Confirm can stay disabled', () => {
    expect(normalizeDelay(0, 0)).toBe(0);
  });

  it('clamps hours above 168 to 7 days (10080 minutes)', () => {
    expect(normalizeDelay(200, 0)).toBe(10080);
  });

  it('clamps negative minutes to 0', () => {
    expect(normalizeDelay(0, -5)).toBe(0);
  });
});
