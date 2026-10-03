import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const PACKAGES = ['prisma', 'tsx', 'bcryptjs', 'dotenv'] as const;

describe('docker/runtime dependency pins', () => {
  it('matches the versions resolved in the root package-lock.json', () => {
    const runtimePkg = JSON.parse(
      readFileSync(join(ROOT, 'docker/runtime/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string }>;
    };

    for (const name of PACKAGES) {
      const declared = runtimePkg.dependencies[name];
      const resolved = lock.packages[`node_modules/${name}`]?.version;
      expect(declared, `${name} missing from docker/runtime/package.json`).toBeTruthy();
      expect(resolved, `${name} missing from root package-lock.json`).toBeTruthy();
      expect(declared).toBe(resolved);
    }
  });
});
