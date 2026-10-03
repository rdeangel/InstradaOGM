import { describe, expect, it } from 'vitest';
import { safeRedirect } from './auth-redirect';

const BASE = 'https://app.example.com';

describe('safeRedirect', () => {
  it('rejects a suffix-domain that starts with the base URL string', () => {
    expect(safeRedirect('https://app.example.com.evil.tld/x', BASE, true)).toBe(BASE);
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirect('//evil.com', BASE, true)).toBe(BASE);
  });

  it('rejects backslash protocol-relative URLs that browsers treat as //', () => {
    expect(safeRedirect('/\\evil.com', BASE, true)).toBe(BASE);
  });

  it('rejects javascript: URLs', () => {
    expect(safeRedirect('javascript:alert(1)', BASE, true)).toBe(BASE);
  });

  it('rejects DNS names that look like private IP prefixes', () => {
    expect(safeRedirect('http://192.168.evil.com/', BASE, true)).toBe(BASE);
    expect(safeRedirect('https://localhost.evil.com', BASE, true)).toBe(BASE);
  });

  it('rejects a garbage string', () => {
    expect(safeRedirect('%%%% not a url', BASE, true)).toBe(BASE);
  });

  it('accepts a same-origin relative path', () => {
    expect(safeRedirect('/devices', BASE, true)).toBe(`${BASE}/devices`);
  });

  it('accepts the same origin with a path', () => {
    expect(safeRedirect('https://app.example.com/settings', BASE, true)).toBe(
      'https://app.example.com/settings',
    );
  });

  it('accepts RFC1918 IP literals when the flag is on', () => {
    expect(safeRedirect('http://10.0.0.5:3000/x', BASE, true)).toBe('http://10.0.0.5:3000/x');
    expect(safeRedirect('http://192.168.1.5/', BASE, true)).toBe('http://192.168.1.5/');
  });

  it('rejects RFC1918 IP literals when the flag is off', () => {
    expect(safeRedirect('http://10.0.0.5:3000/x', BASE, false)).toBe(BASE);
    expect(safeRedirect('http://192.168.1.5/', BASE, false)).toBe(BASE);
  });
});
