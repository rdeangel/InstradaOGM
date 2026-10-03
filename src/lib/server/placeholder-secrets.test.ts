import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { placeholderSecretWarnings } from './placeholder-secrets';

const REPO_ROOT = join(__dirname, '../../..');
const EXAMPLE_FILES = [
  '.env.example',
  '.env.development.example',
  '.env.production.example',
];

const REAL_AUTH = 'xK9mQ2pL7wR4tY6uI0oA5sD8fG1hJ3kN';
const REAL_BACKUP = 'a1b2c3d4e5f6789012345678abcdef12fedcba0987654321abcdef1234567890';

function exampleAssignments(): { file: string; name: string; value: string }[] {
  const found: { file: string; name: string; value: string }[] = [];
  for (const file of EXAMPLE_FILES) {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');
    for (const match of text.matchAll(
      /^(?:export\s+)?(NEXTAUTH_SECRET|BACKUP_ENCRYPTION_SECRET_KEY)\s*=\s*(.*)$/gm,
    )) {
      const name = match[1];
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      found.push({ file, name, value });
    }
  }
  return found;
}

describe('placeholderSecretWarnings', () => {
  it('flags every NEXTAUTH_SECRET and BACKUP_ENCRYPTION_SECRET_KEY in the example env files', () => {
    const assignments = exampleAssignments();
    expect(assignments.length).toBeGreaterThan(0);
    for (const { file, name, value } of assignments) {
      const env = {
        NEXTAUTH_SECRET: REAL_AUTH,
        BACKUP_ENCRYPTION_SECRET_KEY: REAL_BACKUP,
        [name]: value,
      };
      const warnings = placeholderSecretWarnings(env);
      expect(warnings.length, `${file} ${name}=${value}`).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes(name))).toBe(true);
    }
  });

  it('does not flag a real openssl-rand shaped value', () => {
    expect(
      placeholderSecretWarnings({
        NEXTAUTH_SECRET: REAL_AUTH,
        BACKUP_ENCRYPTION_SECRET_KEY: REAL_BACKUP,
      }),
    ).toEqual([]);
  });

  it('never includes the secret value in a warning', () => {
    const secret = 'REPLACE_ME_this_exact_value_must_not_appear';
    const backup = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const warnings = placeholderSecretWarnings({
      NEXTAUTH_SECRET: secret,
      BACKUP_ENCRYPTION_SECRET_KEY: backup,
    });
    expect(warnings.length).toBeGreaterThan(0);
    const joined = warnings.join('\n');
    expect(joined).not.toContain(secret);
    expect(joined).not.toContain(backup);
  });
});
