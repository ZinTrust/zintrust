import { afterEach, describe, expect, it, vi } from 'vitest';

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('patch coverage: runtime + proxy helpers', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('preloads startup config overrides from workers map', async () => {
    vi.resetModules();

    const overrides = new Map();
    overrides.set('config/database.ts', { driver: 'sqlite' });
    (
      globalThis as { __zintrustStartupConfigOverrides?: Map<string, unknown> }
    ).__zintrustStartupConfigOverrides = overrides;

    const { StartupConfigFileRegistry, StartupConfigFile } =
      await import('@/runtime/StartupConfigFileRegistry');

    await StartupConfigFileRegistry.preload([StartupConfigFile.Database]);

    expect(StartupConfigFileRegistry.get(StartupConfigFile.Database)).toEqual({
      driver: 'sqlite',
    });

    delete (globalThis as { __zintrustStartupConfigOverrides?: Map<string, unknown> })
      .__zintrustStartupConfigOverrides;
    StartupConfigFileRegistry.clear();
  });

  it('detects cloudflare-like caches and handles missing globalThis', async () => {
    vi.resetModules();

    const originalCaches = (globalThis as { caches?: unknown }).caches;
    (globalThis as { caches?: unknown }).caches = {};

    const { detectRuntime } = await import('@/runtime/detectRuntime');
    const result = detectRuntime();

    expect(result.isCloudflare).toBe(true);

    if (originalCaches === undefined) {
      delete (globalThis as { caches?: unknown }).caches;
    } else {
      (globalThis as { caches?: unknown }).caches = originalCaches;
    }
  });

  it('clears middleware config cache', async () => {
    const { middlewareConfig, clearMiddlewareConfigCache } = await import('@/config/middleware');

    expect(middlewareConfig.global.length).toBeGreaterThan(0);
    expect(clearMiddlewareConfigCache()).toBeUndefined();
  });

  it('clears startup config cache in development boot', async () => {
    vi.resetModules();

    const clearSpy = vi.fn();
    const preloadSpy = vi.fn().mockResolvedValue(undefined);

    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFileRegistry: {
        clear: clearSpy,
        preload: preloadSpy,
        get: vi.fn(),
        has: vi.fn(),
        isPreloaded: vi.fn(),
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
        Workers: 'config/workers.ts',
      },
    }));

    vi.doMock('@config/StartupConfigValidator', () => ({
      StartupConfigValidator: { assertValid: vi.fn() },
    }));

    vi.doMock('@/health/StartupHealthChecks', () => ({
      StartupHealthChecks: { assertHealthy: vi.fn().mockResolvedValue(undefined) },
    }));

    vi.doMock('@registry/registerRoute', () => ({
      registerMasterRoutes: vi.fn().mockResolvedValue(undefined),
      tryImportOptional: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock('@cache/CacheRuntimeRegistration', () => ({
      registerCachesFromRuntimeConfig: vi.fn(),
    }));

    vi.doMock('@orm/DatabaseRuntimeRegistration', () => ({
      registerDatabasesFromRuntimeConfig: vi.fn(),
    }));

    vi.doMock('@tools/queue/QueueRuntimeRegistration', () => ({
      registerQueuesFromRuntimeConfig: vi.fn().mockResolvedValue(undefined),
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

    vi.doMock('@registry/worker', () => ({
      registerWorkerShutdownHook: vi.fn(),
    }));

    vi.doMock('@/config', () => ({
      cacheConfig: {},
      databaseConfig: {},
      queueConfig: {},
      storageConfig: {},
    }));

    vi.doMock('@config/broadcast', () => ({
      default: { default: 'default', drivers: {} },
    }));

    vi.doMock('@config/notification', () => ({
      default: { default: 'default', drivers: {} },
    }));

    vi.doMock('@config/features', () => ({
      FeatureFlags: { initialize: vi.fn() },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { createLifecycle } = await import('@/boot/registry/runtime');

    const lifecycle = createLifecycle({
      environment: 'development',
      resolvedBasePath: '/tmp',
      router: { getRoutes: vi.fn(), getNamedRoutes: vi.fn() } as unknown as {
        getRoutes: () => unknown;
        getNamedRoutes: () => unknown;
      },
      shutdownManager: { add: vi.fn(), run: vi.fn() },
      getBooted: () => false,
      setBooted: vi.fn(),
    });

    await lifecycle.boot();

    expect(clearSpy).toHaveBeenCalled();
  });

  it('releases stream locks and propagates socket errors', async () => {
    vi.resetModules();

    const originalVitest = process.env['VITEST'];
    delete process.env['VITEST'];

    const connectMock = vi.fn();
    vi.doMock('cloudflare:sockets', () => ({ connect: connectMock }));

    const reader = { releaseLock: vi.fn(), read: vi.fn().mockResolvedValue({ done: true }) };
    const writer = {
      releaseLock: vi.fn(),
      write: vi.fn().mockResolvedValue(undefined),
      desiredSize: 1,
      ready: Promise.resolve(),
    };

    let rejectClosed: (error: Error) => void = () => undefined;
    const closed = new Promise<void>((_, reject) => {
      rejectClosed = reject as (error: Error) => void;
    });

    const socket = {
      opened: Promise.resolve(),
      closed,
      readable: { getReader: () => reader },
      writable: { getWriter: () => writer },
      close: vi.fn().mockResolvedValue(undefined),
    };

    connectMock.mockReturnValue(socket);

    const { CloudflareSocket } = await import('@/sockets/CloudflareSocket');

    const emitter = CloudflareSocket.create('example.com', 3306);
    const errorSpy = vi.fn();
    emitter.on('error', errorSpy);

    await nextTick();
    rejectClosed(new Error('closed failure'));
    await nextTick();

    expect(reader.releaseLock).toHaveBeenCalled();
    expect(writer.releaseLock).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    if (originalVitest !== undefined) {
      process.env['VITEST'] = originalVitest;
    }
  });

  it('emits error when connect fails', async () => {
    vi.resetModules();

    const connectMock = vi.fn(() => {
      throw new Error('connect failed');
    });
    vi.doMock('cloudflare:sockets', () => ({ connect: connectMock }));

    const { CloudflareSocket } = await import('@/sockets/CloudflareSocket');

    const emitter = CloudflareSocket.create('example.com', 3306);
    const errorSpy = vi.fn();
    emitter.on('error', errorSpy);

    await nextTick();

    expect(errorSpy).toHaveBeenCalled();
  });

  it('throws config errors when bcrypt module shape is invalid', async () => {
    vi.resetModules();
    vi.doMock('bcryptjs', () => ({ default: {} }));

    const { Hash } = await import('@/security/Hash');

    await expect(Hash.hash('secret')).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
      name: 'ConfigError',
    });
  });
});
