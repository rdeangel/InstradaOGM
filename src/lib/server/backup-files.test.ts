import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findExistingBackup,
  isValidNewBackupName,
  resolveInBackups,
  runTool,
} from './backup-files';

function hasBin(cmd: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).status === 0;
}

const tmpDirs: string[] = [];

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-backups-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('isValidNewBackupName', () => {
  it('accepts letters, digits, dots, underscores, hyphens, and 100-char names', () => {
    expect(isValidNewBackupName('daily')).toBe(true);
    expect(isValidNewBackupName('pre_update.sqlite.aes')).toBe(true);
    expect(isValidNewBackupName('a-b.c_d')).toBe(true);
    expect(isValidNewBackupName('a'.repeat(100))).toBe(true);
  });

  it('rejects empty, too long, separators, shell metacharacters, and non-strings', () => {
    expect(isValidNewBackupName('')).toBe(false);
    expect(isValidNewBackupName('a'.repeat(101))).toBe(false);
    expect(isValidNewBackupName('a b')).toBe(false);
    expect(isValidNewBackupName('a/b')).toBe(false);
    expect(isValidNewBackupName('..\\x')).toBe(false);
    expect(isValidNewBackupName('x;rm -rf /')).toBe(false);
    expect(isValidNewBackupName('$(id)')).toBe(false);
    expect(isValidNewBackupName('`id`')).toBe(false);
    expect(isValidNewBackupName('a\nb')).toBe(false);
    expect(isValidNewBackupName(1)).toBe(false);
    expect(isValidNewBackupName(null)).toBe(false);
    expect(isValidNewBackupName(undefined)).toBe(false);
  });
});

describe('resolveInBackups', () => {
  it('resolves a plain name inside the backups dir', async () => {
    const dir = await makeTmp();
    const resolved = resolveInBackups('x.aes', dir);
    expect(resolved).toBe(path.join(path.resolve(dir), 'x.aes'));
    expect(resolved.startsWith(path.resolve(dir) + path.sep)).toBe(true);
  });

  it('throws for .. and . because they escape or are the dir itself', async () => {
    const dir = await makeTmp();
    expect(() => resolveInBackups('..', dir)).toThrow('Invalid backup path');
    expect(() => resolveInBackups('.', dir)).toThrow('Invalid backup path');
  });

  it('cannot escape via ../../etc/passwd because only the basename is joined', async () => {
    const dir = await makeTmp();
    const resolved = resolveInBackups('../../etc/passwd', dir);
    expect(resolved).toBe(path.join(path.resolve(dir), 'passwd'));
    expect(resolved.startsWith(path.resolve(dir) + path.sep)).toBe(true);
  });
});

describe('findExistingBackup', () => {
  it('matches legacy names, optional .aes, and rejects traversal including sibling-prefix dirs', async () => {
    const root = await makeTmp();
    const backups = path.join(root, 'backups');
    const evil = path.join(root, 'backups_evil');
    await fs.mkdir(backups);
    await fs.mkdir(evil);
    await fs.writeFile(path.join(backups, 'old name with spaces.sqlite.aes'), 'legacy');
    await fs.writeFile(path.join(backups, 'ok.sqlite.aes'), 'ok');
    await fs.writeFile(path.join(evil, 'x.aes'), 'evil');

    expect(await findExistingBackup('old name with spaces.sqlite.aes', backups)).toBe(
      path.join(backups, 'old name with spaces.sqlite.aes'),
    );
    expect(await findExistingBackup('ok.sqlite', backups)).toBe(path.join(backups, 'ok.sqlite.aes'));
    expect(await findExistingBackup('../backups_evil/x.aes', backups)).toBeNull();
    expect(await findExistingBackup('../backups_evil/x', backups)).toBeNull();
    expect(await findExistingBackup('/etc/passwd', backups)).toBeNull();
    expect(await findExistingBackup('missing', backups)).toBeNull();
    expect(await findExistingBackup(undefined, backups)).toBeNull();
  });

  it('skips a .temp directory so it is not treated as a backup file', async () => {
    const dir = await makeTmp();
    await fs.mkdir(path.join(dir, '.temp'));
    expect(await findExistingBackup('.temp', dir)).toBeNull();
  });
});

describe('runTool', () => {
  it.skipIf(!hasBin('sh'))('rejects with the child exit code', async () => {
    await expect(runTool('sh', ['-c', 'exit 3'])).rejects.toMatchObject({ code: 3 });
  });

  it.skipIf(!hasBin('echo'))('does not run argv through a shell and flushes stdout before return', async () => {
    const dir = await makeTmp();
    const pwned = path.join(dir, 'pwned');
    const stdoutFile = path.join(dir, 'out.txt');
    const payload = `$(touch ${pwned})`;

    await runTool('echo', [payload], { stdoutFile });

    const stats = await fs.stat(stdoutFile);
    expect(stats.size).toBeGreaterThan(0);
    const body = await fs.readFile(stdoutFile, 'utf8');
    expect(body).toContain(payload);
    await expect(fs.stat(pwned)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.skipIf(!hasBin('cat'))('copies stdinFile to stdoutFile', async () => {
    const dir = await makeTmp();
    const a = path.join(dir, 'a.txt');
    const b = path.join(dir, 'b.txt');
    await fs.writeFile(a, 'hello-stdin');
    await runTool('cat', [], { stdinFile: a, stdoutFile: b });
    expect(await fs.readFile(b, 'utf8')).toBe('hello-stdin');
  });

  it('rejects a missing binary without hanging', async () => {
    await expect(runTool('definitely-not-a-binary', [])).rejects.toMatchObject({ code: 'ENOENT' });
  }, 5_000);

  it.skipIf(!hasBin('sh'))('passes PGPASSWORD through env, not the shell', async () => {
    const dir = await makeTmp();
    const stdoutFile = path.join(dir, 'pw.txt');
    await runTool('sh', ['-c', 'printf %s "$PGPASSWORD"'], {
      env: { ...process.env, PGPASSWORD: 'p;$(x)' },
      stdoutFile,
    });
    expect(await fs.readFile(stdoutFile, 'utf8')).toBe('p;$(x)');
  });
});
