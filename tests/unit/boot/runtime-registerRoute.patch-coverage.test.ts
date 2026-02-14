import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    const mkdirSync = vi.fn();
    const existsSync = vi.fn(() => false);
    const registerWorkerRoutes = vi.fn();
    const registerQueueMonitorRoutes = vi.fn();
    const registerQueueGatewayRoutes = vi.fn();

    vi.doMock('@node-singletons/fs', () => ({ existsSync, mkdirSync }));
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
      default: { monitor: { enabled: true, basePath: '/queue' } },
    }));

    vi.doMock('@zintrust/queue-redis', () => ({
      QueueHttpGateway: {
        create: () => ({ registerRoutes: registerQueueGatewayRoutes }),
      },
    }));

    vi.doMock('@/config', () => ({
      appConfig: { port: 7777, dockerWorker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: { host: '127.0.0.1', port: 6379, database: 0 } } },
      storageConfig: {},
    }));

    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/features', () => ({ FeatureFlags: { initialize: vi.fn() } }));
    vi.doMock('@/health/StartupHealthChecks', () => ({
      StartupHealthChecks: { assertHealthy: vi.fn(async () => undefined) },
    }));
    vi.doMock('@config/StartupConfigValidator', () => ({
      StartupConfigValidator: { assertValid: vi.fn() },
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
      appConfig: { port: 7777, dockerWorker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));

    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/features', () => ({ FeatureFlags: { initialize: vi.fn() } }));
    vi.doMock('@/health/StartupHealthChecks', () => ({
      StartupHealthChecks: { assertHealthy: vi.fn(async () => undefined) },
    }));
    vi.doMock('@config/StartupConfigValidator', () => ({
      StartupConfigValidator: { assertValid: vi.fn() },
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
      appConfig: { port: 7777, dockerWorker: false },
      cacheConfig: {},
      databaseConfig: { default: 'sqlite', connections: {} },
      queueConfig: { drivers: { redis: {} } },
      storageConfig: {},
    }));

    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/features', () => ({ FeatureFlags: { initialize: vi.fn() } }));
    vi.doMock('@/health/StartupHealthChecks', () => ({
      StartupHealthChecks: { assertHealthy: vi.fn(async () => undefined) },
    }));
    vi.doMock('@config/StartupConfigValidator', () => ({
      StartupConfigValidator: { assertValid: vi.fn() },
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
});
