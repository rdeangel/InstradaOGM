import crypto from 'crypto';

export const API_KEY_PREFIX_LENGTH = 12;
export const API_KEY_SECRET_BYTES = 28; // 12 + 1 + 56 = 69 ≤ 72: bcrypt ignores bytes past 72
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PREFIXED = new RegExp(`^([A-Za-z0-9]{${API_KEY_PREFIX_LENGTH}})_[0-9a-f]{${API_KEY_SECRET_BYTES * 2}}$`);
const LEGACY = /^[0-9a-f]{64}$/; // every key issued since v1.0.0 (randomBytes(32).toString('hex'))

export function generateApiKey(): { prefix: string; plaintext: string } {
  // ponytail: modulo bias over 62 is irrelevant for a public 71-bit id; secret half is unbiased hex
  const prefix = Array.from(crypto.randomBytes(API_KEY_PREFIX_LENGTH), (b) => ALPHABET[b % 62]).join('');
  return { prefix, plaintext: `${prefix}_${crypto.randomBytes(API_KEY_SECRET_BYTES).toString('hex')}` };
}

export type ParsedApiKey = { kind: 'prefixed'; prefix: string } | { kind: 'legacy' } | null;

export function parsePresentedApiKey(key: string): ParsedApiKey {
  const m = PREFIXED.exec(key);
  if (m) return { kind: 'prefixed', prefix: m[1] };
  return LEGACY.test(key) ? { kind: 'legacy' } : null;
}
