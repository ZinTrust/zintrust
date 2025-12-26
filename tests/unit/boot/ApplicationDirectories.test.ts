import { Application } from '@boot/Application';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Application directory initialization', () => {
  let originalCwd: string;
  let tempDir: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('creates logs, storage, and tmp directories on boot', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'zintrust-app-dirs-'));

    // Provide an app-local routes module so boot() doesn't depend on framework routes.
    await mkdir(join(tempDir, 'routes'), { recursive: true });
    await writeFile(
      join(tempDir, 'routes', 'api.js'),
      ['export function registerRoutes(_router) {', '  // no-op for this test', '}', ''].join('\n'),
      'utf8'
    );

    const app = Application.create(tempDir);
    await app.boot();

    const logs = await stat(join(tempDir, 'logs'));
    const storage = await stat(join(tempDir, 'storage'));
    const tmp = await stat(join(tempDir, 'tmp'));

    expect(logs.isDirectory()).toBe(true);
    expect(storage.isDirectory()).toBe(true);
    expect(tmp.isDirectory()).toBe(true);

    // Boot should be idempotent
    await app.boot();
  });
});
