import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { runTool } from './backup-files';

function hasDocker(): boolean {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

const NAME = 'ogm-p6';
const PASSWORD = 'p@ss;$(id)';
const qIdent = (s: string) => '"' + s.replace(/"/g, '""') + '"';
const terminateSql = (db: string) =>
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db.replace(/'/g, "''")}' AND pid <> pg_backend_pid();`;

function execArgs(tool: string, args: string[]): string[] {
  return ['exec', '-e', `PGPASSWORD=${PASSWORD}`, NAME, tool, ...args];
}

describe('postgres throwaway dump/restore on 55432', () => {
  afterAll(() => {
    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' });
  });

  it.skipIf(!hasDocker())(
    'round-trips rows with a special-character password via env',
    async () => {
      spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' });
      await runTool('docker', [
        'run',
        '--rm',
        '-d',
        '--name',
        NAME,
        '-e',
        `POSTGRES_PASSWORD=${PASSWORD}`,
        '-p',
        '127.0.0.1:55432:5432',
        'postgres:16-alpine',
      ]);

      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          await runTool('docker', ['exec', NAME, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1']);
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      expect(ready).toBe(true);

      const pg = ['-h', '127.0.0.1', '-p', '5432', '-U', 'postgres'];
      await runTool('docker', execArgs('psql', [...pg, '-d', 'postgres', '-c', `CREATE DATABASE ${qIdent('ogm6')};`]));
      await runTool(
        'docker',
        execArgs('psql', [
          ...pg,
          '-d',
          'ogm6',
          '-c',
          'CREATE TABLE items (id int, name text); INSERT INTO items VALUES (1, $$alpha$$), (2, $$beta$$), (3, $$gamma$$);',
        ]),
      );
      await runTool('docker', execArgs('pg_dump', [...pg, '-d', 'ogm6', '-Fp', '-f', '/tmp/ogm6.sql']));

      try {
        await runTool('docker', execArgs('psql', [...pg, '-d', 'postgres', '-c', terminateSql('ogm6')]));
      } catch {
        // same as the app: terminate failure only warns
      }
      await runTool('docker', execArgs('psql', [...pg, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${qIdent('ogm6')};`]));
      await runTool('docker', execArgs('psql', [...pg, '-d', 'postgres', '-c', `CREATE DATABASE ${qIdent('ogm6')};`]));
      await runTool('docker', execArgs('psql', [...pg, '-d', 'ogm6', '-f', '/tmp/ogm6.sql']));

      const countFile = path.join(os.tmpdir(), 'ogm-p6-count.txt');
      await runTool(
        'docker',
        execArgs('psql', [...pg, '-d', 'ogm6', '-tAc', 'SELECT COUNT(*) FROM items']),
        { stdoutFile: countFile },
      );
      expect((await fs.readFile(countFile, 'utf8')).trim()).toBe('3');
      await fs.unlink(countFile).catch(() => undefined);
    },
    90_000,
  );
});
