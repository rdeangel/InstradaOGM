import { describe, expect, it } from 'vitest';
import {
  assertOpnsenseId,
  assertSafeOpnsenseEndpoint,
  InvalidOpnsenseIdError,
  InvalidOpnsensePathError,
  isOpnsenseId,
} from './opnsense-id';

describe('assertOpnsenseId', () => {
  it('accepts an RFC-4122 UUID', () => {
    expect(assertOpnsenseId('98756a01-f3a4-42d0-a321-5e5eeeb65ff4')).toBe(
      '98756a01-f3a4-42d0-a321-5e5eeeb65ff4'
    );
  });

  it('accepts numeric OpenVPN vpnid values', () => {
    expect(assertOpnsenseId('1')).toBe('1');
    expect(assertOpnsenseId('2')).toBe('2');
    expect(assertOpnsenseId('3')).toBe('3');
  });

  it('accepts underscore and hyphen within 64 characters', () => {
    expect(assertOpnsenseId('WGP-rda_s21')).toBe('WGP-rda_s21');
    expect(assertOpnsenseId('a'.repeat(64))).toHaveLength(64);
  });

  it.each([
    '../',
    '..',
    '%2e%2e',
    'foo#bar',
    'foo?bar',
    'foo/bar',
    'id;rm',
    '1.2.3.4',
    '',
    'a'.repeat(65),
    'has space',
    'dot.name',
  ])('rejects %j', (value) => {
    expect(() => assertOpnsenseId(value)).toThrow(InvalidOpnsenseIdError);
    expect(isOpnsenseId(value)).toBe(false);
  });
});

describe('assertSafeOpnsenseEndpoint', () => {
  it('accepts current call-site paths including interpolated ids', () => {
    expect(assertSafeOpnsenseEndpoint('/api/openvpn/service/restartService/1')).toBe(
      '/api/openvpn/service/restartService/1'
    );
    expect(
      assertSafeOpnsenseEndpoint(
        '/api/firewall/alias/setItem/54e7c476-6482-4ee1-8945-9d5018cce8c2'
      )
    ).toBe('/api/firewall/alias/setItem/54e7c476-6482-4ee1-8945-9d5018cce8c2');
    expect(assertSafeOpnsenseEndpoint('/api/kea/dhcpv4/search_reservation')).toBe(
      '/api/kea/dhcpv4/search_reservation'
    );
  });

  it.each([
    '/api/firewall/alias/delItem/../export',
    '/api/openvpn/service/restartService/%2e%2e',
    '/api/ipsec/sessions/connect/foo#bar',
    '/api/wireguard/client/toggleClient/foo\\bar',
    '/api/kea/dhcpv4/del_reservation/abc?x=1',
  ])('rejects %j without treating it as a safe path', (value) => {
    expect(() => assertSafeOpnsenseEndpoint(value)).toThrow(InvalidOpnsensePathError);
  });
});
