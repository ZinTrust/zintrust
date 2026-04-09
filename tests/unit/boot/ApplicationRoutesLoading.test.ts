import { mkdir, mkdtemp, rm, writeFile } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
import { join } from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Application route loading', () => {
  let originalCwd: string;
  let originalQueueMonitorEnabled: string | undefined;
  let originalWorkerEnabled: string | undefined;
  let tempDir: string | undefined;
  let consoleLogSpy: ReturnType<typeof vi.spyOn> | undefined;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn> | undefined;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalQueueMonitorEnabled = process.env['QUEUE_MONITOR_ENABLED'];
    originalWorkerEnabled = process.env['WORKER_ENABLED'];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    process.chdir(originalCwd);
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
    if (originalQueueMonitorEnabled === undefined) {
      delete process.env['QUEUE_MONITOR_ENABLED'];
    } else {
      process.env['QUEUE_MONITOR_ENABLED'] = originalQueueMonitorEnabled;
    }
    if (originalWorkerEnabled === undefined) {
      delete process.env['WORKER_ENABLED'];
    } else {
      process.env['WORKER_ENABLED'] = originalWorkerEnabled;
    }
    consoleLogSpy?.mockRestore();
    consoleDebugSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  it('prefers app-local routes over framework routes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'zintrust-app-routes-'));
    await mkdir(join(tempDir, 'routes'), { recursive: true });

    // Write a minimal app-local routes module that does not rely on path aliases.
    await writeFile(
      join(tempDir, 'routes', 'api.js'),
      [
        'export function registerRoutes(router) {',
        '  const route = {',
        "    method: 'GET',",
        "    path: '/app-health',",
        '    pattern: /^\\/app-health$/,',
        '    paramNames: [],',
        '    handler: async (_req, res) => {',
        '      res.setStatus(200).json({ ok: true });',
        '    },',
        '  };',
        '  router.routes.push(route);',
        "  if (!router.routeIndex.has('GET')) router.routeIndex.set('GET', []);",
        "  router.routeIndex.get('GET').push(route);",
        '}',
        '',
      ].join('\n'),
      'utf8'
    );

    process.chdir(tempDir);

    process.env['QUEUE_MONITOR_ENABLED'] = 'false';
    process.env['WORKER_ENABLED'] = 'false';
    vi.resetModules();

    const [{ Application }, { Router }] = await Promise.all([
      import('@boot/Application'),
      import('@core-routes/Router'),
    ]);

    const app = Application.create();
    await app.boot();

    const match = Router.match(app.getRouter(), 'GET', '/app-health');
    expect(match).not.toBeNull();
  });
});
