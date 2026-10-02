import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runTool, tmpRoot } = vi.hoisted(() => {
  /* eslint-disable @typescript-eslint/no-require-imports -- vi.hoisted runs before ESM imports */
  const fsSync = require('fs') as typeof import('fs');
  const osMod = require('os') as typeof import('os');
  const pathMod = require('path') as typeof import('path');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const tmpRoot = fsSync.mkdtempSync(pathMod.join(osMod.tmpdir(), 'p6-route-'));
  fsSync.mkdirSync(pathMod.join(tmpRoot, 'backups'), { recursive: true });
  process.env.DATA_FOLDER_PATH = tmpRoot;
  return {
    runTool: vi.fn<typeof import('@/lib/server/backup-files').runTool>(
      async () => ({ stderr: '' }),
    ),
    tmpRoot,
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest: vi.fn(async () => ({
    user: { id: 'sa-1', role: 'SUPER_ADMIN', email: 'sa@example.com' },
    method: 'session',
  })),
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { $disconnect: vi.fn(), $connect: vi.fn() },
}));
vi.mock('@/lib/encryption', () => ({
  encryptFile: async (src: string, dest: string) => {
    const { copyFile } = await import('fs/promises');
    await copyFile(src, dest);
  },
  decryptFile: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock('@/lib/server/data-paths', () => ({
  getDataPath: (...parts: string[]) => path.join(tmpRoot, ...parts),
  getBaseDataPath: () => tmpRoot,
}));
vi.mock('@/lib/server/backup-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/backup-files')>();
  return { ...actual, runTool };
});

import { POST } from '@/app/api/settings/backup/route';

function backupRequest(filename?: string): Request {
  const fd = new FormData();
  fd.append('action', 'backup');
  if (filename !== undefined) fd.append('filename', filename);
  return new Request('http://localhost/api/settings/backup', { method: 'POST', body: fd });
}

describe('POST /api/settings/backup exec hardening', () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    runTool.mockImplementation(async (_cmd: string, args: string[], opts?: { stdoutFile?: string }) => {
      const fIdx = args.indexOf('-f');
      const out = opts?.stdoutFile ?? (fIdx >= 0 ? args[fIdx + 1] : undefined);
      if (out) {
        await fs.writeFile(out, 'SQL DUMP\n');
      }
      return { stderr: '' };
    });
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it('passes decoded Postgres credentials via argv and PGPASSWORD env', async () => {
    process.env.DATABASE_URL = 'postgresql://u%40x:p%40ss%3B%24(id)@db:5433/ogm';

    const response = await POST(backupRequest('daily'));
    expect(response.status).toBe(200);

    expect(runTool).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = runTool.mock.calls[0];
    expect(cmd).toBe('pg_dump');
    expect(args[0]).toBe('-h');
    expect(args[1]).toBe('db');
    expect(args[2]).toBe('-p');
    expect(args[3]).toBe('5433');
    expect(args[4]).toBe('-U');
    expect(args[5]).toBe('u@x');
    expect(args[6]).toBe('-d');
    expect(args[7]).toBe('ogm');
    expect(args[8]).toBe('-Fp');
    expect(args[9]).toBe('-f');
    const dumpPath = args[10];
    expect(dumpPath.startsWith(path.join(tmpRoot, 'backups') + path.sep)).toBe(true);
    expect(dumpPath).toMatch(/daily_\d{4}.+\.postgresql\.aes$/);
    expect(opts?.env?.PGPASSWORD).toBe('p@ss;$(id)');
    expect(args.join(' ')).not.toContain('p@ss');
  });

  it.each([
    '../x',
    'a b',
    '$(id)',
    'x;touch y',
    'a'.repeat(101),
    'a/b.sqlite.aes',
  ])('rejects illegal create name %j without calling runTool', async (filename) => {
    process.env.DATABASE_URL = 'postgresql://u:p@db:5432/ogm';
    const response = await POST(backupRequest(filename));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid filename. Use only letters, digits, ".", "_" and "-" (max 100).');
    expect(runTool).not.toHaveBeenCalled();
  });

  it('dumps SQLite through sqlite3 argv and stdoutFile', async () => {
    const dbPath = path.join(tmpRoot, 'db.sqlite');
    process.env.DATABASE_URL = `file:${dbPath}`;

    const response = await POST(backupRequest('daily'));
    expect(response.status).toBe(200);

    expect(runTool).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = runTool.mock.calls[0];
    expect(cmd).toBe('sqlite3');
    expect(args).toEqual([dbPath, '.dump']);
    expect(opts?.stdoutFile?.startsWith(path.join(tmpRoot, 'backups') + path.sep)).toBe(true);
  });
});
