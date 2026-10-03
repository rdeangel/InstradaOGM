import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { generateApiKey, parsePresentedApiKey } from './api-key-format';

const PREFIXED = /^[A-Za-z0-9]{12}_[0-9a-f]{56}$/;

describe('generateApiKey', () => {
  it('matches prefix_secret, is 69 chars, and is not truncated by bcrypt', () => {
    const { prefix, plaintext } = generateApiKey();
    expect(plaintext).toMatch(PREFIXED);
    expect(plaintext).toHaveLength(69);
    expect(plaintext.startsWith(`${prefix}_`)).toBe(true);
    expect(prefix).toHaveLength(12);
    expect(bcrypt.truncates(plaintext)).toBe(false);
  });

  it('gives 1000 distinct prefixes across 1000 generations', () => {
    const prefixes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      prefixes.add(generateApiKey().prefix);
    }
    expect(prefixes.size).toBe(1000);
  });
});

describe('parsePresentedApiKey', () => {
  it('parses a generated key as prefixed with the right prefix', () => {
    const { prefix, plaintext } = generateApiKey();
    expect(parsePresentedApiKey(plaintext)).toEqual({ kind: 'prefixed', prefix });
  });

  it('parses 64 lowercase hex as legacy', () => {
    expect(parsePresentedApiKey('a'.repeat(64))).toEqual({ kind: 'legacy' });
  });

  it('rejects uppercase 64 hex', () => {
    expect(parsePresentedApiKey('A'.repeat(64))).toBeNull();
  });

  it('rejects 64 hex plus a suffix', () => {
    expect(parsePresentedApiKey(`${'a'.repeat(64)}_x`)).toBeNull();
  });

  it('rejects the wrong prefix length', () => {
    expect(parsePresentedApiKey(`abc_${'a'.repeat(56)}`)).toBeNull();
    expect(parsePresentedApiKey(`${'A'.repeat(11)}_${'a'.repeat(56)}`)).toBeNull();
    expect(parsePresentedApiKey(`${'A'.repeat(13)}_${'a'.repeat(56)}`)).toBeNull();
  });

  it('rejects a secret with non-hex characters', () => {
    expect(parsePresentedApiKey(`${'A'.repeat(12)}_${'g'.repeat(56)}`)).toBeNull();
  });

  it('rejects a 40-character random string', () => {
    expect(parsePresentedApiKey('r'.repeat(40))).toBeNull();
  });
});
