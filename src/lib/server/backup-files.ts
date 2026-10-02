/**
 * Backup filename containment and argv-only process helper.
 * Callers never pass a shell string; PGPASSWORD belongs in env only.
 */
import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { getDataPath } from '@/lib/server/data-paths';

export const BACKUP_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

export const INVALID_NEW_BACKUP_NAME_MESSAGE =
  'Invalid filename. Use only letters, digits, ".", "_" and "-" (max 100).';

export const isValidNewBackupName = (n: unknown): n is string =>
  typeof n === 'string' && BACKUP_NAME_RE.test(n);

/** join + basename + containment assert; throws on escape */
export function resolveInBackups(name: string, dir = getDataPath('backups')): string {
  const base = path.resolve(dir);
  const p = path.resolve(base, path.basename(name));
  if (!p.startsWith(base + path.sep)) throw new Error('Invalid backup path');
  return p;
}

/** Exact match against the directory listing (old odd names still work). */
export async function findExistingBackup(
  name: unknown,
  dir = getDataPath('backups'),
): Promise<string | null> {
  if (typeof name !== 'string' || !name) return null;
  // ponytail: readdir per call, fine for a backups dir
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  const hit = [name, `${name}.aes`].find((c) => files.has(c));
  return hit ? resolveInBackups(hit, dir) : null;
}

export function runTool(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; stdinFile?: string; stdoutFile?: string } = {},
): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const child = spawn(cmd, args, {
      env: opts.env ?? process.env,
      stdio: [
        opts.stdinFile ? 'pipe' : 'ignore',
        opts.stdoutFile ? 'pipe' : 'ignore',
        'pipe',
      ],
    });

    let stderr = '';
    child.stderr?.on('data', (d: Buffer | string) => {
      if (stderr.length < 64_000) stderr += d.toString();
    });

    const streams: Promise<unknown>[] = [];
    if (opts.stdoutFile && child.stdout) {
      // Wait for the write stream to finish so callers can fs.stat immediately.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      streams.push(pipeline(child.stdout, createWriteStream(opts.stdoutFile)));
    }
    if (opts.stdinFile && child.stdin) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      streams.push(pipeline(createReadStream(opts.stdinFile), child.stdin));
    }

    child.on('error', (err) => finish(() => reject(err)));
    child.on('close', (code) => {
      Promise.all(streams)
        .then(() => {
          finish(() => {
            if (code === 0) {
              resolve({ stderr });
              return;
            }
            reject(
              Object.assign(
                new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 2000)}`),
                { code },
              ),
            );
          });
        })
        .catch((err) => finish(() => reject(err)));
    });
  });
}
