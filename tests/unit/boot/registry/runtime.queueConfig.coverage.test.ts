import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const envStrings: Record<string, string> = {
  TRACE_ENABLED: 'false',
};

vi.mock('@runtime-config/queue', () => ({}));

vi.mock('@/config', () => ({
  appConfig: { port: 7777, dockerWorker: false },
  cacheConfig: {},
  databaseConfig: { default: 'sqlite', connections: {} },
  queueConfig: {},
  storageConfig: {},
}));

vi.mock('@/health/StartupHealthChecks', () => ({
  StartupHealthChecks: { assertHealthy: vi.fn(async () => undefined) },
}));

vi.mock('@config/StartupConfigValidator', () => ({
  StartupConfigValidator: {
    validate: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
  },
}));

vi.mock('@runtime/StartupConfigFileRegistry', () => ({
  StartupConfigFile: {
    Middleware: 'Middleware',
    Cache: 'Cache',
    Database: 'Database',
    Queue: 'Queue',
    Storage: 'Storage',
    Mail: 'Mail',
    Broadcast: 'Broadcast',
    Notification: 'Notification',
  },
  StartupConfigFileRegistry: {
    clear: vi.fn(),
    preload: vi.fn(async () => undefined),
    get: vi.fn(() => undefined),
  },
}));

vi.mock('@config/features', () => ({
  FeatureFlags: { initialize: vi.fn() },
}));

vi.mock('@config/cloudflare', () => ({
  Cloudflare: { getWorkersEnv: () => null },
}));

vi.mock('@boot/registry/registerRoute', () => ({
  registerMasterRoutes: vi.fn(async () => undefined),
  tryImportOptional: vi.fn(async () => undefined),
}));

vi.mock('@common/ExternalServiceUtils', () => ({
  readEnvString: vi.fn((key: string) => envStrings[key] ?? ''),
}));

vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: vi.fn(),
}));
vi.mock('@tools/queue/QueueRuntimeRegistration', () => ({
  registerQueuesFromRuntimeConfig: vi.fn(async () => undefined),
}));
vi.mock('@cache/CacheRuntimeRegistration', () => ({
  registerCachesFromRuntimeConfig: vi.fn(),
}));

vi.mock('@/runtime/WorkersModule', () => ({
  loadWorkersModule: vi.fn(async () => undefined),
  loadQueueMonitorModule: vi.fn(async () => undefined),
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/broadcast', () => ({ default: {} }));
vi.mock('@config/notification', () => ({ default: {} }));
vi.mock('@config/middleware', () => ({
  createMiddlewareConfig: () => ({ global: [], route: {} }),
}));
vi.mock('@config/mail', () => ({ default: {} }));
vi.mock('@config/storage', () => ({ default: {} }));
vi.mock('@config/cache', () => ({ default: {} }));
vi.mock('@config/database', () => ({ databaseConfig: { default: 'sqlite', connections: {} } }));
vi.mock('@config/queue', () => ({ queueConfig: {} }));
vi.mock('@config/broadcast', () => ({ default: {} }));
vi.mock('@config/notification', () => ({ default: {} }));

vi.mock('@tools/broadcast/BroadcastRuntimeRegistration', () => ({
  registerBroadcastersFromRuntimeConfig: vi.fn(),
}));
vi.mock('@tools/notification/NotificationRuntimeRegistration', () => ({
  registerNotificationChannelsFromRuntimeConfig: vi.fn(),
}));
vi.mock('@tools/storage/StorageRuntimeRegistration', () => ({
  registerDisksFromRuntimeConfig: vi.fn(),
}));

vi.mock('@schedules/index', () => ({}));
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: { registerMany: vi.fn(), start: vi.fn(), stop: vi.fn(async () => undefined) },
}));

import { createLifecycle } from '../../../../src/boot/registry/runtime';

describe('runtime registry (coverage extras)', () => {
  afterEach(() => {
    envStrings.TRACE_ENABLED = 'false';
    delete (globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__;
    delete (globalThis as Record<string, unknown>).__zintrust_system_trace_runtime__;
    vi.restoreAllMocks();
  });

  it('boot() loads runtime queue config module and falls back to queueConfig when no default export', async () => {
    let booted = false;
    const lifecycle = createLifecycle({
      environment: 'production',
      resolvedBasePath: '/',
      router: {} as any,
      shutdownManager: { run: vi.fn(async () => undefined) } as any,
      getBooted: () => booted,
      setBooted: (v: boolean) => {
        booted = v;
      },
    });

    await expect(lifecycle.boot()).resolves.toBeUndefined();
  });

  it('boot() initializes a cached trace runtime module when requested', async () => {
    envStrings.TRACE_ENABLED = 'true';
    const ensureSystemTraceRegistered = vi.fn(async () => undefined);

    (globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__ = true;
    (globalThis as Record<string, unknown>).__zintrust_system_trace_runtime__ = {
      isAvailable: () => true,
      ensureSystemTraceRegistered,
    };

    let booted = false;
    const lifecycle = createLifecycle({
      environment: 'production',
      resolvedBasePath: '/',
      router: {} as any,
      shutdownManager: { run: vi.fn(async () => undefined) } as any,
      getBooted: () => booted,
      setBooted: (value: boolean) => {
        booted = value;
      },
    });

    await expect(lifecycle.boot()).resolves.toBeUndefined();

    expect(ensureSystemTraceRegistered).toHaveBeenCalledTimes(1);
  });

  it('boot() skips activating a local trace runtime module that reports unavailable', async () => {
    envStrings.TRACE_ENABLED = 'true';
    (globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__ = true;

    const tempProjectRoot = mkdtempSync(join(tmpdir(), 'zintrust-runtime-'));
    const pluginDir = join(tempProjectRoot, 'src', 'runtime', 'plugins');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(tempProjectRoot, 'package.json'), '{"type":"module"}\n');
    writeFileSync(
      join(pluginDir, 'trace-runtime.js'),
      [
        'export const isAvailable = () => false;',
        'export const ensureSystemTraceRegistered = async () => {',
        "  throw new Error('should not run');",
        '};',
      ].join('\n')
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempProjectRoot);
    let booted = false;
    const lifecycle = createLifecycle({
      environment: 'production',
      resolvedBasePath: '/',
      router: {} as any,
      shutdownManager: { run: vi.fn(async () => undefined) } as any,
      getBooted: () => booted,
      setBooted: (value: boolean) => {
        booted = value;
      },
    });

    await expect(lifecycle.boot()).resolves.toBeUndefined();

    const { Logger } = await import('@config/logger');
    expect(Logger.debug).toHaveBeenCalledWith(
      'System Trace is enabled but the optional package is unavailable.'
    );

    cwdSpy.mockRestore();
    rmSync(tempProjectRoot, { recursive: true, force: true });
  });
});
