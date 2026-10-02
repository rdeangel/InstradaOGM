import { promises as fs } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tmpRoot } = vi.hoisted(() => {
  /* eslint-disable @typescript-eslint/no-require-imports -- vi.hoisted runs before ESM imports */
  const fsSync = require('fs') as typeof import('fs');
  const osMod = require('os') as typeof import('os');
  const pathMod = require('path') as typeof import('path');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const tmpRoot = fsSync.mkdtempSync(pathMod.join(osMod.tmpdir(), 'p6-filename-'));
  fsSync.mkdirSync(pathMod.join(tmpRoot, 'backups'), { recursive: true });
  fsSync.mkdirSync(pathMod.join(tmpRoot, 'backups_evil'), { recursive: true });
  process.env.DATA_FOLDER_PATH = tmpRoot;
  return { tmpRoot };
});

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth-middleware', () => ({
  authenticateRequest: vi.fn(async () => ({
    user: { id: 'sa-1', role: 'SUPER_ADMIN' },
    method: 'session',
  })),
  handleAuthResponse: vi.fn(() => null),
  trackUsageByAuthMethod: vi.fn(),
}));
vi.mock('@/lib/server/data-paths', () => ({
  getDataPath: (...parts: string[]) => path.join(tmpRoot, ...parts),
  getBaseDataPath: () => tmpRoot,
}));

import { DELETE, GET, PATCH } from '@/app/api/settings/backup/versions/[filename]/route';

const backupsDir = path.join(tmpRoot, 'backups');
const evilDir = path.join(tmpRoot, 'backups_evil');

function params(filename: string) {
  return { params: Promise.resolve({ filename }) };
}

describe('backup versions [filename] path containment', () => {
  beforeEach(async () => {
    await fs.rm(backupsDir, { recursive: true, force: true });
    await fs.mkdir(backupsDir, { recursive: true });
    await fs.mkdir(evilDir, { recursive: true });
    await fs.writeFile(path.join(backupsDir, 'old name with spaces.sqlite.aes'), 'legacy-bytes');
    await fs.writeFile(path.join(evilDir, 'x.aes'), 'evil-bytes');
  });

  it('returns 404 for sibling-prefix traversal and leaves the sibling untouched', async () => {
    const response = await GET(
      new Request('http://localhost/api/settings/backup/versions/../backups_evil/x.aes'),
      params('../backups_evil/x.aes'),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('File not found.');
    expect(await fs.readFile(path.join(evilDir, 'x.aes'), 'utf8')).toBe('evil-bytes');
  });

  it('downloads a legacy name with spaces', async () => {
    const response = await GET(
      new Request('http://localhost/api/settings/backup/versions/old%20name%20with%20spaces.sqlite.aes'),
      params('old name with spaces.sqlite.aes'),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('legacy-bytes');
    expect(response.headers.get('content-disposition')).toContain('old name with spaces.sqlite.aes');
  });

  it('deletes a legacy name with spaces', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/settings/backup/versions/old%20name%20with%20spaces.sqlite.aes', {
        method: 'DELETE',
      }),
      params('old name with spaces.sqlite.aes'),
    );
    expect(response.status).toBe(200);
    await expect(fs.stat(path.join(backupsDir, 'old name with spaces.sqlite.aes'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a rename target with spaces', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/settings/backup/versions/old%20name%20with%20spaces.sqlite.aes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newFilename: 'bad name' }),
      }),
      params('old name with spaces.sqlite.aes'),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid filename.');
    expect(await fs.readFile(path.join(backupsDir, 'old name with spaces.sqlite.aes'), 'utf8')).toBe('legacy-bytes');
  });

  it('renames a legacy file to a valid new name and keeps the extension', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/settings/backup/versions/old%20name%20with%20spaces.sqlite.aes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newFilename: 'good' }),
      }),
      params('old name with spaces.sqlite.aes'),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.newFilename).toBe('good.sqlite.aes');
    expect(await fs.readFile(path.join(backupsDir, 'good.sqlite.aes'), 'utf8')).toBe('legacy-bytes');
    await expect(fs.stat(path.join(backupsDir, 'old name with spaces.sqlite.aes'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
