import { describe, expect, it } from 'vitest';
import {
  assertValidHostIpAddress,
  firstInvalidIpAddress,
  InvalidIpAddressError,
  isValidIpAddress,
  trimmedProvidedIpAddress,
} from './network-utils';

describe('isValidIpAddress', () => {
  it.each([
    '192.168.1.10',
    '10.0.0.5',
    '127.0.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '2001:db8::1',
    '::1',
    '::ffff:192.168.1.10',
    'fe80::1',
  ])('accepts canonical host IP %j', (ip) => {
    expect(isValidIpAddress(ip)).toBe(true);
  });

  it.each([
    '1',
    '0',
    '127.1',
    '0x7f.0.0.1',
    '0177.0.0.1',
    '2130706433',
    '01.02.03.004',
    'fe80::1%eth0',
    '10.0.0.5/24',
    '1.2.3.4;id',
  ])('rejects legacy or non-host form %j', (ip) => {
    expect(isValidIpAddress(ip)).toBe(false);
  });
});

describe('firstInvalidIpAddress', () => {
  it('returns null when every provided IP is valid', () => {
    expect(firstInvalidIpAddress(['192.168.1.10', '2001:db8::1', '::ffff:192.168.1.10'])).toBeNull();
  });

  it('skips missing and blank values', () => {
    expect(firstInvalidIpAddress([undefined, null, '', '   ', '10.0.0.1'])).toBeNull();
  });

  it.each([
    '1.2.3.4;id',
    '1.2.3.4; rm -rf /',
    '1.2.3.4$(id)',
    '1.2.3.4 | cat /etc/passwd',
    '192.168.1.1`id`',
    '::1;id',
    'not-an-ip',
  ])('rejects injection / invalid payload %j', (payload) => {
    expect(isValidIpAddress(payload)).toBe(false);
    expect(firstInvalidIpAddress([payload])).toBe(payload);
  });

  it('trims before validating', () => {
    expect(firstInvalidIpAddress(['  10.0.0.5  '])).toBeNull();
    expect(firstInvalidIpAddress(['  1.2.3.4;id  '])).toBe('1.2.3.4;id');
  });

  it.each([
    [['1.2.3.4;id'], '1.2.3.4;id'],
    [{ a: 'x' }, '[object Object]'],
    [12345, '12345'],
  ])('treats present non-string %j as invalid', (value, expected) => {
    expect(firstInvalidIpAddress([value])).toBe(expected);
  });
});

describe('trimmedProvidedIpAddress', () => {
  it('returns the trimmed string for a padded valid IP', () => {
    expect(trimmedProvidedIpAddress('  10.0.0.5  ')).toBe('10.0.0.5');
  });

  it('returns undefined for absent or blank values', () => {
    expect(trimmedProvidedIpAddress(undefined)).toBeUndefined();
    expect(trimmedProvidedIpAddress(null)).toBeUndefined();
    expect(trimmedProvidedIpAddress('   ')).toBeUndefined();
  });
});

describe('assertValidHostIpAddress', () => {
  it('returns the trimmed IP', () => {
    expect(assertValidHostIpAddress('  10.0.0.5  ')).toBe('10.0.0.5');
  });

  it.each([
    ['1.2.3.4;id'],
    [['1.2.3.4;id']],
    [{ a: 'x' }],
    [12345],
  ])('throws InvalidIpAddressError for %j', (value) => {
    expect(() => assertValidHostIpAddress(value)).toThrow(InvalidIpAddressError);
  });
});
