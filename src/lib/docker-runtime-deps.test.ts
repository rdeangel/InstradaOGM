import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

describe('docker/runtime dependency pins', () => {
  it('matches the versions resolved in the root package-lock.json', () => {
    const runtimePkg = JSON.parse(
      readFileSync(join(ROOT, 'docker/runtime/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string }>;
    };

    expect(runtimePkg.dependencies).toEqual({
      bcryptjs: lock.packages['node_modules/bcryptjs']?.version,
      dotenv: lock.packages['node_modules/dotenv']?.version,
      prisma: lock.packages['node_modules/prisma']?.version,
      tsx: lock.packages['node_modules/tsx']?.version,
    });
  });
});
