import { describe, expect, it } from 'vitest';
import { firstInvalidIpAddress, isValidIpAddress } from './network-utils';

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
});
