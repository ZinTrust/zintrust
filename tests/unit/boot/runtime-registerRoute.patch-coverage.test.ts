import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRuntimeDatabaseModule = (): void => {
  vi.doMock('@orm/Database', () => ({ useDatabase: vi.fn(() => ({})) }));
};

describe('runtime/registerRoute patch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as { __zintrustRoutes?: unknown }).__zintrustRoutes;
    delete (globalThis as { CF?: unknown }).CF;
    delete (globalThis as { caches?: unknown }).caches;
    vi.restoreAllMocks();
  });

  it('registerMasterRoutes warns on Cloudflare with no global routes and handles core route import errors', async () => {
    const warnSpy = vi.fn();
    const errorSpy = vi.fn();

    vi.doMock('@config/logger', () => ({
      Logger: { warn: warnSpy, error: errorSpy, info: vi.fn(), debug: vi.fn() },
      default: { warn: warnSpy, error: errorSpy, info: vi.fn(), debug: vi.fn() },
    }));

    vi.doMock('@runtime/detectRuntime', () => ({
      detectRuntime: () => ({ isCloudflare: true }),
    }));

    vi.doMock('@/config', () => ({
      appConfig: { isDevelopment: () => true },
    }));

    vi.doMock('@core-routes/CoreRoutes', () => {
      throw new Error('core routes import failed');
    });

    const { registerMasterRoutes } = await import('@registry/registerRoute');

    await registerMasterRoutes('', { routes: [] } as any);

    expect(warnSpy).toHaveBeenCalledWith(
      'No app routes found and framework routes are unavailable. Ensure routes/api.ts exists in the project.'
    );
    expect(errorSpy).toHaveBeenCalledWith('Failed to register routes:', expect.any(Error));
  });

  it('tryImportOptionalR logs and returns undefined for missing modules', async () => {
    const errorSpy = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: { warn: vi.fn(), error: errorSpy, info: vi.fn(), debug: vi.fn() },
      default: { warn: vi.fn(), error: errorSpy, info: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));

    const { tryImportOptionalR } = await import('@registry/registerRoute');
    const result = await tryImportOptionalR('module-that-does-not-exist-xyz');
    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('createLifecycle boots runtime modules and initializes artifact directories', async () => {
    const mkdirSyncX = vi.fn();
    const existsSync = vi.fn(() => false);
    const registerWorkerRoutes = vi.fn();
    const registerQueueMonitorRoutes = vi.fn();
    const registerQueueGatewayRoutes = vi.fn();
    const createQueueMonitor = vi.fn(() => ({ registerRoutes: registerQueueMonitorRoutes }));

    vi.doMock('@node-singletons/fs', () => ({ existsSync, mkdirSync: mkdirSyncX }));
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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadWorkersModule: vi.fn(async () => ({
        WorkerInit: {},
        registerWorkerRoutes,
        WorkerFactory: {
          listPersistedRecords: vi.fn(async () => [
            { queueName: 'emails' },
            { queueName: 'notifications' },
            { queueName: 'emails' },
          ]),
        },
      })),
      loadQueueMonitorModule: vi.fn(async () => ({
        QueueMonitor: {
          create: createQueueMonitor,
        },
      })),
    }));

    vi.doMock('@runtime-config/queue', () => ({
      default: { monitor: { enabled: true, basePath: '/queue' } },
    }));

    vi.doMock('@zintrust/queue-redis', () => ({
      QueueHttpGateway: {
        create: () => ({ registerRoutes: registerQueueGatewayRoutes }),
      },
    }));

    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: true },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: { host: '127.0.0.1', port: 6379, database: 0 } } },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));

    vi.doMock('@config/env', () => ({ Env: { getBool: vi.fn(() => true) } }));

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

    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(mkdirSync).toHaveBeenCalled();
    expect(registerWorkerRoutes).toHaveBeenCalled();
    expect(registerQueueMonitorRoutes).toHaveBeenCalled();
    expect(registerQueueGatewayRoutes).toHaveBeenCalled();
    expect(createQueueMonitor).toHaveBeenCalled();
    const monitorConfig = createQueueMonitor.mock.calls[0]?.[0] as {
      knownQueues?: () => Promise<string[]>;
    };
    await expect(monitorConfig.knownQueues?.()).resolves.toEqual(['emails', 'notifications']);
  });

  it('createLifecycle only registers queue monitor routes when worker execution is disabled', async () => {
    const registerWorkerRoutes = vi.fn();
    const registerQueueMonitorRoutes = vi.fn();
    const registerQueueGatewayRoutes = vi.fn();

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadWorkersModule: vi.fn(async () => ({ WorkerInit: {}, registerWorkerRoutes })),
      loadQueueMonitorModule: vi.fn(async () => ({
        QueueMonitor: {
          create: () => ({ registerRoutes: registerQueueMonitorRoutes }),
        },
      })),
    }));

    vi.doMock('@runtime-config/queue', () => ({
      default: { monitor: { enabled: true, basePath: '/queue-monitor' } },
    }));

    vi.doMock('@zintrust/queue-redis', () => ({
      QueueHttpGateway: {
        create: () => ({ registerRoutes: registerQueueGatewayRoutes }),
      },
    }));

    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: { host: '127.0.0.1', port: 6379, database: 0 } } },
      storageConfig: {},
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

    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(registerWorkerRoutes).not.toHaveBeenCalled();
    expect(registerQueueMonitorRoutes).toHaveBeenCalled();
    expect(registerQueueGatewayRoutes).not.toHaveBeenCalled();
  });

  it('createLifecycle prefers preloaded startup queue config for queue monitor registration', async () => {
    const registerQueueMonitorRoutes = vi.fn();
    const createQueueMonitor = vi.fn(() => ({ registerRoutes: registerQueueMonitorRoutes }));

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadQueueMonitorModule: vi.fn(async () => ({
        QueueMonitor: { create: createQueueMonitor },
      })),
    }));

    vi.doMock('@runtime-config/queue', () => ({
      default: { monitor: { enabled: false, basePath: '/queue-disabled' } },
    }));

    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: {
        monitor: { enabled: false, basePath: '/queue-default' },
        drivers: { redis: { host: '127.0.0.1', port: 6379, database: 0 } },
      },
      storageConfig: {},
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
        get: vi.fn((file: string) => {
          if (file !== 'config/queue.ts') return undefined;
          return {
            monitor: { enabled: true, basePath: '/queue-monitor' },
            drivers: {
              redis: { host: 'queue-service', port: 6381, password: 'secret', database: 9 },
            },
          };
        }),
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

    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(registerQueueMonitorRoutes).toHaveBeenCalled();
    expect(createQueueMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: '/queue-monitor',
        redis: {
          host: 'queue-service',
          port: 6381,
          password: 'secret',
          db: 9,
        },
      })
    );
  });

  it('createLifecycle handles queue monitor module load failure gracefully', async () => {
    const warnSpy = vi.fn();

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadQueueMonitorModule: vi.fn(async () => {
        throw new Error('queue-monitor-missing');
      }),
    }));

    vi.doMock('@runtime-config/queue', () => ({
      default: { monitor: { enabled: true, basePath: '/queue' } },
    }));
    vi.doMock('@zintrust/queue-redis', () => ({
      QueueHttpGateway: { create: () => ({ registerRoutes: vi.fn() }) },
    }));

    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: true },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));

    vi.doMock('@config/env', () => ({ Env: { getBool: vi.fn(() => true) } }));

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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
      Logger: { info: vi.fn(), warn: warnSpy, error: vi.fn(), debug: vi.fn() },
      default: { info: vi.fn(), warn: warnSpy, error: vi.fn(), debug: vi.fn() },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');
    const lifecycle = createLifecycle({
      environment: 'production',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();
    expect(warnSpy).toHaveBeenCalledWith('Failed to load Queue Monitor module', expect.any(Error));
  });

  it('createLifecycle warns when Queue HTTP gateway module is unavailable', async () => {
    const warnSpy = vi.fn();

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
    }));
    vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
    vi.doMock('@node-singletons/url', () => ({
      pathToFileURL: vi.fn((p: string) => ({ href: `file://${p}` })),
    }));
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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadQueueMonitorModule: vi.fn(async () => ({
        QueueMonitor: { create: () => ({ registerRoutes: vi.fn() }) },
      })),
    }));

    vi.doMock('@runtime-config/queue', () => ({ default: { monitor: { enabled: false } } }));
    vi.doMock('@zintrust/queue-redis', () => {
      throw new Error('module missing');
    });

    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: true },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));

    vi.doMock('@config/env', () => ({ Env: { getBool: vi.fn(() => true) } }));

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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
      Logger: { info: vi.fn(), warn: warnSpy, error: vi.fn(), debug: vi.fn() },
      default: { info: vi.fn(), warn: warnSpy, error: vi.fn(), debug: vi.fn() },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');
    const lifecycle = createLifecycle({
      environment: 'production',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();
    expect(warnSpy).toHaveBeenCalledWith(
      'Queue HTTP gateway module is unavailable (@zintrust/queue-redis not found)'
    );
  });

  it('createLifecycle skips worker module initialization when WORKER_ENABLED=false', async () => {
    const infoSpy = vi.fn();
    const loadWorkersModuleSpy = vi.fn(async () => ({
      WorkerInit: {},
      registerWorkerRoutes: vi.fn(),
    }));
    const loadQueueMonitorModuleSpy = vi.fn(async () => ({
      QueueMonitor: { create: () => ({ registerRoutes: vi.fn() }) },
    }));

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadWorkersModule: loadWorkersModuleSpy,
      loadQueueMonitorModule: loadQueueMonitorModuleSpy,
    }));

    vi.doMock('@runtime-config/queue', () => ({
      default: { monitor: { enabled: true, basePath: '/queue' } },
    }));

    vi.doMock('@zintrust/queue-redis', () => ({
      QueueHttpGateway: {
        create: () => ({ registerRoutes: vi.fn() }),
      },
    }));

    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
      Logger: { info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      default: { info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');
    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(loadWorkersModuleSpy).not.toHaveBeenCalled();
    expect(loadQueueMonitorModuleSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      'Skipping worker route registration (WORKER_ENABLED=false).'
    );
    expect(infoSpy).toHaveBeenCalledWith(
      'Skipping worker execution/gateway initialization (WORKER_ENABLED=false).'
    );
  });

  it('createLifecycle only initializes the trace runtime when the plugin file opted in', async () => {
    const ensureSystemTraceRegisteredSpy = vi.fn(async () => undefined);
    const tryImportOptionalSpy = vi.fn(async (specifier: string) => {
      if (specifier === '@runtime/plugins/trace-runtime') {
        return {
          isAvailable: () => true,
          ensureSystemTraceRegistered: ensureSystemTraceRegisteredSpy,
        };
      }

      return undefined;
    });
    const useDatabaseSpy = vi.fn(() => ({}));

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
      registerDisksFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@tools/notification/NotificationRuntimeRegistration', () => ({
      registerNotificationChannelsFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@registry/registerRoute', () => ({
      registerMasterRoutes: vi.fn(async () => undefined),
      tryImportOptional: tryImportOptionalSpy,
    }));
    vi.doMock('@registry/worker', () => ({ registerWorkerShutdownHook: vi.fn() }));
    vi.doMock('@runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => ({ WorkerInit: {}, registerWorkerRoutes: vi.fn() })),
      loadQueueMonitorModule: vi.fn(async () => null),
    }));
    vi.doMock('@runtime-config/queue', () => ({ default: { monitor: { enabled: false } } }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));
    vi.doMock('@common/ExternalServiceUtils', () => ({
      readEnvString: vi.fn((key: string) => {
        const values: Record<string, string> = {
          TRACE_ENABLED: 'true',
          TRACE_BASE_PATH: '/trace',
          TRACE_MIDDLEWARE: '',
        };
        return values[key] ?? '';
      }),
    }));
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
    vi.doMock('@orm/Database', () => ({ useDatabase: useDatabaseSpy }));

    const { createLifecycle } = await import('@/boot/registry/runtime');

    const routerWithoutPlugin = { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any;
    const lifecycleWithoutPlugin = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: routerWithoutPlugin,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycleWithoutPlugin.boot();

    expect(tryImportOptionalSpy).not.toHaveBeenCalledWith('@runtime/plugins/trace-runtime');
    expect(routerWithoutPlugin.routes).toHaveLength(0);
    expect(useDatabaseSpy).not.toHaveBeenCalled();
    expect(ensureSystemTraceRegisteredSpy).not.toHaveBeenCalled();

    (
      globalThis as { __zintrust_system_trace_plugin_requested__?: boolean }
    ).__zintrust_system_trace_plugin_requested__ = true;

    const routerWithPlugin = { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any;
    const lifecycleWithPlugin = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: routerWithPlugin,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycleWithPlugin.boot();

    expect(tryImportOptionalSpy).toHaveBeenCalledWith('@runtime/plugins/trace-runtime');
    expect(useDatabaseSpy).not.toHaveBeenCalled();
    expect(ensureSystemTraceRegisteredSpy).toHaveBeenCalledTimes(1);
    expect(routerWithPlugin.routes).toHaveLength(0);
  });

  it('createLifecycle resolves the local trace runtime bridge from ZINTRUST_PROJECT_ROOT when cwd differs', async () => {
    const tempProjectRoot = mkdtempSync(join(tmpdir(), 'zintrust-trace-root-'));
    const alternateCwd = mkdtempSync(join(tmpdir(), 'zintrust-trace-cwd-'));
    const bridgeDir = join(tempProjectRoot, 'src', 'runtime', 'plugins');
    const bridgeFile = join(bridgeDir, 'trace-runtime.js');
    const originalCwd = process.cwd();

    mkdirSync(bridgeDir, { recursive: true });
    writeFileSync(
      bridgeFile,
      [
        'globalThis.__trace_bridge_loaded_from_project_root__ = (globalThis.__trace_bridge_loaded_from_project_root__ || 0) + 1;',
        'export const isAvailable = () => true;',
        'export const ensureSystemTraceRegistered = async () => {',
        '  globalThis.__trace_bridge_registered_from_project_root__ = true;',
        '};',
      ].join('\n'),
      'utf8'
    );

    process.chdir(alternateCwd);

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
    vi.doMock('@runtime-config/queue', () => ({ default: { monitor: { enabled: false } } }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));
    vi.doMock('@common/ExternalServiceUtils', () => ({
      readEnvString: vi.fn((key: string) => {
        const values: Record<string, string> = {
          TRACE_ENABLED: 'true',
          TRACE_AUTO_MOUNT: 'false',
          TRACE_BASE_PATH: '/trace',
          TRACE_MIDDLEWARE: '',
          ZINTRUST_PROJECT_ROOT: tempProjectRoot,
        };

        return values[key] ?? '';
      }),
    }));
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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

    (
      globalThis as { __zintrust_system_trace_plugin_requested__?: boolean }
    ).__zintrust_system_trace_plugin_requested__ = true;

    const { createLifecycle } = await import('@/boot/registry/runtime');

    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: tempProjectRoot,
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(
      (globalThis as { __trace_bridge_loaded_from_project_root__?: number })
        .__trace_bridge_loaded_from_project_root__
    ).toBe(1);
    expect(
      (globalThis as { __trace_bridge_registered_from_project_root__?: boolean })
        .__trace_bridge_registered_from_project_root__
    ).toBe(true);

    delete (globalThis as { __zintrust_system_trace_plugin_requested__?: boolean })
      .__zintrust_system_trace_plugin_requested__;
    delete (globalThis as { __trace_bridge_loaded_from_project_root__?: number })
      .__trace_bridge_loaded_from_project_root__;
    delete (globalThis as { __trace_bridge_registered_from_project_root__?: boolean })
      .__trace_bridge_registered_from_project_root__;
    process.chdir(originalCwd);
    rmSync(tempProjectRoot, { recursive: true, force: true });
    rmSync(alternateCwd, { recursive: true, force: true });
  });

  it('createLifecycle auto-mounts the trace dashboard when TRACE_AUTO_MOUNT is enabled', async () => {
    const ensureSystemTraceRegisteredSpy = vi.fn(async () => undefined);
    const registerTraceDashboardSpy = vi.fn();
    const tryImportOptionalSpy = vi.fn(async (specifier: string) => {
      if (specifier === '@runtime/plugins/trace-runtime') {
        return {
          isAvailable: () => true,
          ensureSystemTraceRegistered: ensureSystemTraceRegisteredSpy,
          registerTraceDashboard: registerTraceDashboardSpy,
        };
      }

      return undefined;
    });

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
      registerDisksFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@tools/notification/NotificationRuntimeRegistration', () => ({
      registerNotificationChannelsFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@registry/registerRoute', () => ({
      registerMasterRoutes: vi.fn(async () => undefined),
      tryImportOptional: tryImportOptionalSpy,
    }));
    vi.doMock('@registry/worker', () => ({ registerWorkerShutdownHook: vi.fn() }));
    vi.doMock('@runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => ({ WorkerInit: {}, registerWorkerRoutes: vi.fn() })),
      loadQueueMonitorModule: vi.fn(async () => null),
    }));
    vi.doMock('@runtime-config/queue', () => ({ default: { monitor: { enabled: false } } }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));
    vi.doMock('@common/ExternalServiceUtils', () => ({
      readEnvString: vi.fn((key: string) => {
        const values: Record<string, string> = {
          TRACE_ENABLED: 'true',
          TRACE_AUTO_MOUNT: 'true',
          TRACE_BASE_PATH: '/trace-live',
          TRACE_MIDDLEWARE: 'auth, admin ',
        };
        return values[key] ?? '';
      }),
    }));
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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

    const { createLifecycle } = await import('@/boot/registry/runtime');

    (
      globalThis as { __zintrust_system_trace_plugin_requested__?: boolean }
    ).__zintrust_system_trace_plugin_requested__ = true;

    const router = { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any;
    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(ensureSystemTraceRegisteredSpy).toHaveBeenCalledTimes(1);
    expect(registerTraceDashboardSpy).toHaveBeenCalledWith(router, {
      basePath: '/trace-live',
      middleware: ['auth', 'admin'],
    });
  });

  it('createLifecycle suppresses the trace dashboard hint for proxy sender mode when auto-mount is disabled', async () => {
    const ensureSystemTraceRegisteredSpy = vi.fn(async () => undefined);
    const infoSpy = vi.fn();
    const tryImportOptionalSpy = vi.fn(async (specifier: string) => {
      if (specifier === '@runtime/plugins/trace-runtime') {
        return {
          isAvailable: () => true,
          ensureSystemTraceRegistered: ensureSystemTraceRegisteredSpy,
        };
      }

      return undefined;
    });

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
      registerDisksFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@tools/notification/NotificationRuntimeRegistration', () => ({
      registerNotificationChannelsFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@registry/registerRoute', () => ({
      registerMasterRoutes: vi.fn(async () => undefined),
      tryImportOptional: tryImportOptionalSpy,
    }));
    vi.doMock('@registry/worker', () => ({ registerWorkerShutdownHook: vi.fn() }));
    vi.doMock('@runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => ({ WorkerInit: {}, registerWorkerRoutes: vi.fn() })),
      loadQueueMonitorModule: vi.fn(async () => null),
    }));
    vi.doMock('@runtime-config/queue', () => ({ default: { monitor: { enabled: false } } }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));
    vi.doMock('@common/ExternalServiceUtils', () => ({
      readEnvString: vi.fn((key: string) => {
        const values: Record<string, string> = {
          TRACE_ENABLED: 'true',
          TRACE_AUTO_MOUNT: 'false',
          TRACE_PROXY: 'true',
          TRACE_PROXY_URL: 'https://trace.example.test',
        };
        return values[key] ?? '';
      }),
    }));
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
      Logger: { info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      default: { info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock('@sockets/SocketRuntime', () => ({
      SocketFeature: { getSettings: vi.fn(() => ({ enabled: false })) },
    }));
    vi.doMock('@sockets/SocketRuntimeRegistry', () => ({
      SocketRuntimeRegistry: {
        getRuntime: vi.fn(() => ({
          isEnabled: () => false,
          describe: () => ({ transport: 'none' }),
        })),
        getRouteRegistrar: vi.fn(() => undefined),
      },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');

    (
      globalThis as { __zintrust_system_trace_plugin_requested__?: boolean }
    ).__zintrust_system_trace_plugin_requested__ = true;

    const router = { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any;
    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(ensureSystemTraceRegisteredSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalledWith(
      'System Trace runtime activated. Set TRACE_AUTO_MOUNT=true or register dashboard routes manually if needed.'
    );
  });

  it('createLifecycle reads the latest runtime database config when booting', async () => {
    const registerDatabasesFromRuntimeConfig = vi.fn();
    let runtimeDatabaseConfig = { default: 'sqlite', connections: {} };

    vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => true), mkdirSync: vi.fn() }));
    vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
    vi.doMock('@cache/CacheRuntimeRegistration', () => ({
      registerCachesFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@orm/DatabaseRuntimeRegistration', () => ({
      registerDatabasesFromRuntimeConfig,
    }));
    vi.doMock('@tools/queue/QueueRuntimeRegistration', () => ({
      registerQueuesFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@tools/broadcast/BroadcastRuntimeRegistration', () => ({
      registerBroadcastersFromRuntimeConfig: vi.fn(),
    }));
    vi.doMock('@tools/storage/StorageRuntimeRegistration', () => ({
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadWorkersModule: vi.fn(async () => ({ WorkerInit: undefined })),
      loadQueueMonitorModule: vi.fn(async () => null),
    }));
    vi.doMock('@runtime-config/queue', () => ({ default: { monitor: { enabled: false } } }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      get databaseConfig() {
        return runtimeDatabaseConfig;
      },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      get databaseConfig() {
        return runtimeDatabaseConfig;
      },
    }));
    vi.doMock('@common/ExternalServiceUtils', () => ({ readEnvString: vi.fn(() => '') }));
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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

    runtimeDatabaseConfig = {
      default: 'mysql',
      connections: {
        mysql: {
          driver: 'mysql',
          host: '127.0.0.1',
          port: 3306,
          database: 'app',
          username: 'root',
          password: 'secret',
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

    expect(registerDatabasesFromRuntimeConfig).toHaveBeenCalledWith(runtimeDatabaseConfig);
  });

  it('createLifecycle registers socket routes and logs diagnostics when a socket runtime is active', async () => {
    const infoSpy = vi.fn();
    const registerSocketRoutes = vi.fn();

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadQueueMonitorModule: vi.fn(async () => undefined),
    }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: {} },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));
    vi.doMock('@common/ExternalServiceUtils', () => ({ readEnvString: vi.fn(() => '') }));
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
      Logger: { info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      default: { info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock('@sockets/SocketRuntime', () => ({
      SocketFeature: { getSettings: vi.fn(() => ({ enabled: true })) },
    }));
    vi.doMock('@sockets/SocketRuntimeRegistry', () => ({
      SocketRuntimeRegistry: {
        getRuntime: vi.fn(() => ({
          isEnabled: () => true,
          describe: () => ({ transport: 'node', path: '/app' }),
        })),
        getRouteRegistrar: vi.fn(() => ({ registerRoutes: registerSocketRoutes })),
      },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');
    const router = { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any;

    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(registerSocketRoutes).toHaveBeenCalledWith(router);
    expect(infoSpy).toHaveBeenCalledWith('Socket runtime enabled');
    expect(infoSpy).toHaveBeenCalledWith('Transport: node');
    expect(infoSpy).toHaveBeenCalledWith('Path: /app');
  });

  it('createLifecycle throws a config error when socket route registration fails', async () => {
    const errorSpy = vi.fn();

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadQueueMonitorModule: vi.fn(async () => undefined),
    }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: {} },
      storageConfig: {},
    }));
    vi.doMock('@config/database', () => ({
      databaseConfig: { default: 'sqlite', connections: {} },
    }));
    vi.doMock('@common/ExternalServiceUtils', () => ({ readEnvString: vi.fn(() => '') }));
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
      Logger: { info: vi.fn(), warn: vi.fn(), error: errorSpy, debug: vi.fn() },
      default: { info: vi.fn(), warn: vi.fn(), error: errorSpy, debug: vi.fn() },
    }));
    vi.doMock('@sockets/SocketRuntime', () => ({
      SocketFeature: { getSettings: vi.fn(() => ({ enabled: true })) },
    }));
    vi.doMock('@sockets/SocketRuntimeRegistry', () => ({
      SocketRuntimeRegistry: {
        getRuntime: vi.fn(() => ({
          isEnabled: () => true,
          describe: () => ({ transport: 'node', path: '/app' }),
        })),
        getRouteRegistrar: vi.fn(() => ({
          registerRoutes: () => {
            throw new Error('socket route failure');
          },
        })),
      },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');

    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await expect(lifecycle.boot()).rejects.toThrow(
      /Failed to register socket compatibility routes: socket route failure/
    );
    expect(errorSpy).toHaveBeenCalledWith('Failed to register socket compatibility routes', {
      error: 'socket route failure',
    });
  });

  it('createLifecycle shutdown logs queue monitor close and shutdown hook failures', async () => {
    const queueMonitorClose = vi.fn(async () => {
      throw 'queue-monitor-close-failed';
    });
    const warnSpy = vi.fn();
    const errorSpy = vi.fn();

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadQueueMonitorModule: vi.fn(async () => ({
        QueueMonitor: {
          create: vi.fn(() => ({ registerRoutes: vi.fn(), close: queueMonitorClose })),
        },
      })),
    }));
    vi.doMock('@runtime-config/queue', () => ({
      default: { monitor: { enabled: true, basePath: '/queue-monitor' } },
    }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: { host: '127.0.0.1', port: 6379, database: 0 } } },
      storageConfig: {},
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
      Logger: { info: vi.fn(), warn: warnSpy, error: errorSpy, debug: vi.fn() },
      default: { info: vi.fn(), warn: warnSpy, error: errorSpy, debug: vi.fn() },
    }));
    vi.doMock('@sockets/SocketRuntime', () => ({
      SocketFeature: { getSettings: vi.fn(() => ({ enabled: false })) },
    }));
    vi.doMock('@sockets/SocketRuntimeRegistry', () => ({
      SocketRuntimeRegistry: {
        getRuntime: vi.fn(() => null),
        getRouteRegistrar: vi.fn(() => null),
      },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');
    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: {
        add: vi.fn(),
        run: vi.fn(async () => Promise.reject('hook-failed')),
      } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();
    await lifecycle.shutdown();

    expect(queueMonitorClose).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Queue Monitor shutdown failed',
      'queue-monitor-close-failed'
    );
    expect(errorSpy).toHaveBeenCalledWith('Shutdown hook failed:', 'hook-failed');
  });

  it('createLifecycle shutdown closes the queue monitor when it succeeds', async () => {
    const queueMonitorClose = vi.fn(async () => undefined);

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
      registerDisksFromRuntimeConfig: vi.fn(),
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
      loadQueueMonitorModule: vi.fn(async () => ({
        QueueMonitor: {
          create: vi.fn(() => ({ registerRoutes: vi.fn(), close: queueMonitorClose })),
        },
      })),
    }));
    vi.doMock('@runtime-config/queue', () => ({
      default: { monitor: { enabled: true, basePath: '/queue-monitor' } },
    }));
    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false, worker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: { host: '127.0.0.1', port: 6379, database: 0 } } },
      storageConfig: {},
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
      StartupConfigFileRegistry: { clear: vi.fn(), preload: vi.fn(async () => undefined) },
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
    vi.doMock('@sockets/SocketRuntime', () => ({
      SocketFeature: { getSettings: vi.fn(() => ({ enabled: false })) },
    }));
    vi.doMock('@sockets/SocketRuntimeRegistry', () => ({
      SocketRuntimeRegistry: {
        getRuntime: vi.fn(() => null),
        getRouteRegistrar: vi.fn(() => null),
      },
    }));
    mockRuntimeDatabaseModule();

    const { createLifecycle } = await import('@/boot/registry/runtime');
    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/workspace',
      router: { routes: [], getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as any,
      shutdownManager: { add: vi.fn(), run: vi.fn(async () => undefined) } as any,
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();
    await lifecycle.shutdown();

    expect(queueMonitorClose).toHaveBeenCalledTimes(1);
  });
});
