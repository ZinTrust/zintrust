import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRuntimeDatabaseModule = (): void => {
  vi.doMock('@orm/Database', () => ({ useDatabase: vi.fn(() => ({})) }));
};

describe('runtime storage config loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reads storage config lazily during boot before registering disks', async () => {
    let runtimeStorageConfig = {
      default: 'local',
      drivers: {
        local: { driver: 'local', root: 'storage' },
      },
    };

    const registerDisksFromRuntimeConfig = vi.fn();

    vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => true), mkdirSync: vi.fn() }));
    vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
    vi.doMock('@cache/CacheRuntimeRegistration', () => ({
      registerCachesFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@orm/DatabaseRuntimeRegistration', () => ({
      registerDatabasesFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@tools/queue/QueueRuntimeRegistration', () => ({
      registerQueuesFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@tools/broadcast/BroadcastRuntimeRegistration', () => ({
      registerBroadcastersFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@tools/storage/StorageRuntimeRegistration', () => ({
      registerDisksFromRuntimeConfig,
    }));
    vi.doMock('@tools/notification/NotificationRuntimeRegistration', () => ({
      registerNotificationChannelsFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@registry/registerRoute', () => ({
      registerMasterRoutes: vi.fn(async () => undefined),
      tryImportOptional: vi.fn(async () => undefined),
    }));
    vi.doMock('@registry/worker', () => ({ registerWorkerShutdownHook: vi.fn() }));
    vi.doMock('@runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => ({ WorkerInit: {}, registerWorkerRoutes: vi.fn() })),
      loadQueueMonitorModule: vi.fn(async () => null),
    }));
    vi.doMock('@runtime-config/queue', () => ({
      default: { monitor: { enabled: false, basePath: '/queue' } },
    }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: {
        monitor: { enabled: false, basePath: '/queue' },
        drivers: { redis: { host: '127.0.0.1', port: 6379, database: 0 } },
      },
      get storageConfig() {
        return runtimeStorageConfig;
      },
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));
    vi.doMock('@config/env', () => ({ Env: { getBool: vi.fn(() => false) } }));
    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/features', () => ({ FeatureFlags: { initialize: vi.fn() } }));
    vi.doMock('@/health/StartupHealthChecks', () => ({
      StartupHealthChecks: { assertHealthy: vi.fn(async () => undefined) },
    }));
    vi.doMock('@config/StartupConfigValidator', () => ({
      StartupConfigValidator: {
        validate: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
      },
    }));
    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFileRegistry: {
        clear: vi.fn(),
        preload: vi.fn(async () => undefined),
      },
      StartupConfigFile: {
        Middleware: 'config/middleware.ts',
        Cache: 'config/cache.ts',
        Database: 'config/database.ts',
        Queue: 'config/queue.ts',
        Storage: 'config/storage.ts',
        Mail: 'config/mail.ts',
        Broadcast: 'config/broadcast.ts',
        Notification: 'config/notification.ts',
      },
    }));
    vi.doMock('@config/broadcast', () => ({ default: { default: 'default', drivers: {} } }));
    vi.doMock('@config/notification', () => ({ default: { default: 'default', drivers: {} } }));
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');

    runtimeStorageConfig = {
      default: 'r2',
      drivers: {
        r2: {
          driver: 'r2',
          bucket: 'runtime-bucket',
          binding: 'R2_BUCKET',
          accessKeyId: 'AK',
          secretAccessKey: 'SK',
        },
      },
    };

    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(registerDisksFromRuntimeConfig).toHaveBeenCalledWith(runtimeStorageConfig);
  });
});
