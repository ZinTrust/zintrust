import { mkdir, mkdtemp, rm, stat, writeFile } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
import { join } from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: Object.freeze({
    initialize: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Application directory initialization', () => {
  let originalCwd: string;
  let tempDir: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    vi.resetModules();
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

    vi.doMock('@/config', () => ({
      appConfig: {
        environment: 'test',
        port: 7777,
        dockerWorker: true,
        worker: false,
        isDevelopment: () => false,
        isProduction: () => false,
        isTesting: () => true,
      },
      queueConfig: {
        default: 'sync',
        monitor: { enabled: false },
        drivers: { redis: { host: '127.0.0.1', port: 6379, password: '', database: 0 } },
      },
      cacheConfig: {},
      storageConfig: {
        default: 'local',
        drivers: {
          local: { driver: 'local', root: 'storage/app' },
        },
      },
    }));

    vi.doMock('@/runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => null),
      loadQueueMonitorModule: vi.fn(async () => null),
    }));

    const { Application } = await import('@boot/Application');
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
    await app.shutdown();
  });
});
