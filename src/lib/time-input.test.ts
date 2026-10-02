import { describe, it, expect } from 'vitest';
import { normalizeTimeInput, isValidHhMm } from './time-input';

describe('normalizeTimeInput', () => {
  it('pads unpadded hour and minute', () => {
    expect(normalizeTimeInput('9:30')).toBe('09:30');
    expect(normalizeTimeInput('9:5')).toBe('09:05');
    expect(normalizeTimeInput('0:0')).toBe('00:00');
  });

  it('accepts already padded times', () => {
    expect(normalizeTimeInput('09:30')).toBe('09:30');
    expect(normalizeTimeInput('00:00')).toBe('00:00');
    expect(normalizeTimeInput('23:59')).toBe('23:59');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeTimeInput('  8:15  ')).toBe('08:15');
  });

  it('rejects empty and malformed input', () => {
    expect(normalizeTimeInput('')).toBeNull();
    expect(normalizeTimeInput('   ')).toBeNull();
    expect(normalizeTimeInput('9')).toBeNull();
    expect(normalizeTimeInput('9:')).toBeNull();
    expect(normalizeTimeInput(':30')).toBeNull();
    expect(normalizeTimeInput('9:30:00')).toBeNull();
    expect(normalizeTimeInput('abc')).toBeNull();
    expect(normalizeTimeInput('9.30')).toBeNull();
  });

  it('rejects out-of-range hours and minutes', () => {
    expect(normalizeTimeInput('24:00')).toBeNull();
    expect(normalizeTimeInput('12:60')).toBeNull();
    expect(normalizeTimeInput('-1:00')).toBeNull();
    expect(normalizeTimeInput('12:-1')).toBeNull();
  });
});

describe('isValidHhMm', () => {
  it('accepts strict zero-padded HH:MM', () => {
    expect(isValidHhMm('00:00')).toBe(true);
    expect(isValidHhMm('09:30')).toBe(true);
    expect(isValidHhMm('23:59')).toBe(true);
  });

  it('rejects unpadded or invalid values', () => {
    expect(isValidHhMm('9:30')).toBe(false);
    expect(isValidHhMm('9:5')).toBe(false);
    expect(isValidHhMm('24:00')).toBe(false);
    expect(isValidHhMm('12:60')).toBe(false);
    expect(isValidHhMm('')).toBe(false);
    expect(isValidHhMm('09:30:00')).toBe(false);
  });
});
