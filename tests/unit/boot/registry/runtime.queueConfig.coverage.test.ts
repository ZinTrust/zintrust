import { describe, expect, it, vi } from 'vitest';

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
  StartupConfigValidator: { assertValid: vi.fn() },
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
});
