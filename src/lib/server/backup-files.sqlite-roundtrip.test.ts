import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { runTool } from './backup-files';

function hasBin(cmd: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).status === 0;
}

function hasDocker(): boolean {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

const SQLITE_IMAGE = 'rdeangel/instrada-ogm-postgres:1.2.3';

async function dumpRestore(dir: string, dbFile: string) {
  const dumpFile = path.join(dir, 'dump.sql');
  if (hasBin('sqlite3')) {
    await runTool('sqlite3', [dbFile, '.dump'], { stdoutFile: dumpFile });
    await fs.unlink(dbFile);
    await runTool('sqlite3', [dbFile], { stdinFile: dumpFile });
    return;
  }
  const dockerVol = ['run', '--rm', '--user', '0:0', '-v', `${dir}:/data`, '--entrypoint', 'sqlite3', SQLITE_IMAGE];
  await runTool('docker', [...dockerVol, '/data/scratch.db', '.dump'], { stdoutFile: dumpFile });
  await fs.unlink(dbFile);
  await runTool('docker', ['run', '--rm', '--user', '0:0', '-i', '-v', `${dir}:/data`, '--entrypoint', 'sqlite3', SQLITE_IMAGE, '/data/scratch.db'], {
    stdinFile: dumpFile,
  });
}

describe('sqlite dump/restore round-trip', () => {
  it.skipIf(!hasBin('sqlite3') && !hasDocker())(
    'preserves rows through dump and restore, including a space in the data dir',
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p6 space '));
      await fs.chmod(dir, 0o755);
      try {
        const dbFile = path.join(dir, 'scratch.db');
        const db = new DatabaseSync(dbFile);
        db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);');
        db.exec("INSERT INTO items (name) VALUES ('alpha'), ('beta'), ('gamma');");
        db.close();

        await dumpRestore(dir, dbFile);

        const restored = new DatabaseSync(dbFile);
        const row = restored.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number };
        restored.close();
        expect(row.c).toBe(3);
        const dump = await fs.readFile(path.join(dir, 'dump.sql'), 'utf8');
        expect(dump.length).toBeGreaterThan(0);
        expect(dump).toContain('alpha');
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
