import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENDPOINT_CALL = /fetchFromOpnsense(?:<[^(]*?>)?\(\s*[`'"](\/api\/[^`'"$]+)/g;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    out.push(full);
  }
  return out;
}

describe('OPNsense endpoint naming', () => {
  it('fetchFromOpnsense paths are snake_case and not prefixed /api/opnsense/', () => {
    const found: { file: string; endpoint: string }[] = [];
    for (const file of listSourceFiles(SRC_ROOT)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(ENDPOINT_CALL)) {
        found.push({ file, endpoint: match[1] });
      }
    }

    expect(found.length).toBeGreaterThanOrEqual(40);

    for (const { file, endpoint } of found) {
      expect(endpoint.startsWith('/api/opnsense/'), `${file}: ${endpoint}`).toBe(false);
      expect(/[A-Z]/.test(endpoint), `${file}: ${endpoint}`).toBe(false);
    }
  });
});
