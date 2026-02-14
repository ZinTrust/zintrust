import * as RuntimeConfig from '@/config';
import { StartupHealthChecks } from '@/health/StartupHealthChecks';
import { loadQueueMonitorModule, loadWorkersModule } from '@/runtime/WorkersModule';
import { registerCachesFromRuntimeConfig } from '@cache/CacheRuntimeRegistration';
import broadcastConfig from '@config/broadcast';
import { Cloudflare } from '@config/cloudflare';
import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import notificationConfig from '@config/notification';
import { StartupConfigValidator } from '@config/StartupConfigValidator';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { registerMasterRoutes, tryImportOptional } from '@registry/registerRoute';
import type { IShutdownManager } from '@registry/type';
import { registerWorkerShutdownHook } from '@registry/worker';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';
import { registerBroadcastersFromRuntimeConfig } from '@tools/broadcast/BroadcastRuntimeRegistration';
import { registerNotificationChannelsFromRuntimeConfig } from '@tools/notification/NotificationRuntimeRegistration';
import { registerQueuesFromRuntimeConfig } from '@tools/queue/QueueRuntimeRegistration';
import { registerDisksFromRuntimeConfig } from '@tools/storage/StorageRuntimeRegistration';
import type { IRouter } from '@zintrust/core';

interface IQueueMonitor {
  create: (config: object) => { registerRoutes: (router: IRouter) => void };
}

interface IQueueMonitorModule {
  QueueMonitor: IQueueMonitor;
}

interface IQueueHttpGatewayModule {
  QueueHttpGateway: {
    create: () => { registerRoutes: (router: IRouter) => void };
  };
}

type RuntimeQueueConfig = {
  monitor?: {
    enabled?: boolean;
    basePath?: string;
  } & Record<string, unknown>;
};

const loadRuntimeQueueConfig = async (): Promise<RuntimeQueueConfig | undefined> => {
  try {
    const modulePath = '@runtime-config/queue';
    const loaded = (await import(modulePath)) as { default?: RuntimeQueueConfig };
    return loaded.default;
  } catch {
    return undefined;
  }
};
const readRuntimeConfig = <T>(key: string, fallback: T): T => {
  try {
    const value = (RuntimeConfig as Record<string, unknown>)[key];
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
};

const appConfig = readRuntimeConfig('appConfig', { port: 7777, dockerWorker: false });
const cacheConfig = readRuntimeConfig('cacheConfig', RuntimeConfig.cacheConfig);
const databaseConfig = readRuntimeConfig('databaseConfig', {
  default: 'sqlite',
  connections: {},
});
const queueConfig = readRuntimeConfig('queueConfig', RuntimeConfig.queueConfig);
const storageConfig = readRuntimeConfig('storageConfig', RuntimeConfig.storageConfig);

// eslint-disable-next-line @typescript-eslint/require-await
const dbLoader = async (): Promise<void> => {
  registerDatabasesFromRuntimeConfig(databaseConfig);
};

const queuesLoader = async (): Promise<void> => {
  await registerQueuesFromRuntimeConfig(queueConfig);
};

// eslint-disable-next-line @typescript-eslint/require-await
const cachesLoader = async (): Promise<void> => {
  registerCachesFromRuntimeConfig(cacheConfig);
};

const registerFromRuntimeConfig = async (): Promise<void> => {
  await dbLoader();
  await queuesLoader();
  await cachesLoader();
  registerBroadcastersFromRuntimeConfig({
    default: broadcastConfig.default,
    drivers: broadcastConfig.drivers,
  });

  registerDisksFromRuntimeConfig(storageConfig);
  registerNotificationChannelsFromRuntimeConfig({
    default: notificationConfig.default,
    drivers: notificationConfig.drivers,
  });
};

/**
 * Helper: Register ConnectionManager shutdown hook
 */
const registerConnectionManagerHook = (shutdownManager: IShutdownManager): void => {
  shutdownManager.add(async () => {
    try {
      const mod = await import('@orm/ConnectionManager');
      await mod.ConnectionManager.shutdownIfInitialized();
    } catch {
      /* ignore import failures in restrictive runtimes */
    }
  });
};

/**
 * Helper: Register Database reset hook
 */
const registerDatabaseResetHook = (shutdownManager: IShutdownManager): void => {
  shutdownManager.add(async () => {
    try {
      const mod = await import('@orm/Database');
      mod.resetDatabase();
    } catch {
      /* ignore import failures in restrictive runtimes */
    }
  });
};

/**
 * Helper: Register generic reset hook for modules with reset() method
 */
const registerResetHook = (
  shutdownManager: IShutdownManager,
  modulePath: string,
  exportName: string
): void => {
  shutdownManager.add(async () => {
    try {
      const mod = (await import(modulePath)) as Record<string, { reset?: () => void }>;
      const resetModule = mod[exportName];
      if (resetModule?.reset) {
        resetModule.reset();
      }
    } catch {
      /* ignore import failures in restrictive runtimes */
    }
  });
};

/**
 * Helper: Register FileLogWriter flush hook
 */
const registerFileLogFlushHook = (shutdownManager: IShutdownManager): void => {
  shutdownManager.add(async () => {
    try {
      const mod = await import('@config/FileLogWriter');
      mod.FileLogWriter.flush();
    } catch {
      /* ignore import failures in restrictive runtimes */
    }
  });
};

export const registerFrameworkShutdownHooks = (shutdownManager: IShutdownManager): void => {
  // Register framework-level shutdown hooks for long-lived resources
  registerConnectionManagerHook(shutdownManager);

  // Ensure worker management system is asked to shutdown BEFORE databases are reset
  registerWorkerShutdownHook(shutdownManager);

  // Database and cache reset
  registerDatabaseResetHook(shutdownManager);
  registerResetHook(shutdownManager, '@cache/Cache', 'Cache');

  // File logging
  registerFileLogFlushHook(shutdownManager);

  // Registry resets
  registerResetHook(shutdownManager, '@broadcast/BroadcastRegistry', 'BroadcastRegistry');

  registerResetHook(shutdownManager, '@storage/StorageDiskRegistry', 'StorageDiskRegistry');

  registerResetHook(
    shutdownManager,
    '@notification/NotificationChannelRegistry',
    'NotificationChannelRegistry'
  );

  registerResetHook(shutdownManager, '@mail/MailDriverRegistry', 'MailDriverRegistry');

  registerResetHook(shutdownManager, '@tools/queue/Queue', 'Queue');
};

const initializeArtifactDirectories = async (resolvedBasePath: string): Promise<void> => {
  if (resolvedBasePath === '') return;
  if (typeof process === 'undefined') return;
  const globalAny = globalThis as { CF?: unknown; caches?: unknown; WebSocketPair?: unknown };
  if (globalAny.CF !== undefined) return;
  if (typeof globalAny.WebSocketPair === 'function') return;
  if (globalAny.caches !== undefined) return;

  let nodeFs:
    | {
        existsSync: (path: string) => boolean;
        mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
      }
    | undefined;

  try {
    nodeFs = await import('@node-singletons/fs');
  } catch {
    return;
  }

  const dirs = ['logs', 'storage', 'tmp'];
  for (const dir of dirs) {
    const fullPath = path.join(resolvedBasePath, dir);
    try {
      if (!nodeFs.existsSync(fullPath)) {
        nodeFs.mkdirSync(fullPath, { recursive: true });
        Logger.info(`✓ Created directory: ${dir}`);
      }
    } catch (error: unknown) {
      Logger.warn(`Failed to create ${dir} directory`, error as Error);
    }
  }
};

const extractRedisConfigFromQueueConfig = (): {
  host: string;
  port: number;
  password: string;
  db: number;
} => {
  const redisConfig =
    (queueConfig as { drivers?: { redis?: Record<string, unknown> } }).drivers?.redis ?? {};
  const redisHost = typeof redisConfig['host'] === 'string' ? redisConfig['host'] : '127.0.0.1';
  const redisPort =
    typeof redisConfig['port'] === 'number' && Number.isFinite(redisConfig['port'])
      ? redisConfig['port']
      : 6379;
  const redisPassword = typeof redisConfig['password'] === 'string' ? redisConfig['password'] : '';
  const redisDb =
    typeof redisConfig['database'] === 'number' && Number.isFinite(redisConfig['database'])
      ? redisConfig['database']
      : 0;

  return {
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    db: redisDb,
  };
};

const loadAndValidateQueueMonitorModule = async (): Promise<IQueueMonitorModule | null> => {
  let workersModule: IQueueMonitorModule | null;
  try {
    workersModule = (await loadQueueMonitorModule()) as IQueueMonitorModule | null;
  } catch (error) {
    Logger.warn('Failed to load Queue Monitor module', error as Error);
    return null;
  }

  if (!workersModule || !('QueueMonitor' in workersModule)) {
    Logger.warn('Queue Monitor module not available');
    return null;
  }

  const queueMonitorModule = workersModule;
  const { QueueMonitor } = queueMonitorModule;
  if (QueueMonitor === undefined || typeof QueueMonitor.create !== 'function') {
    Logger.warn('Queue Monitor module does not expose QueueMonitor.create');
    return null;
  }

  return queueMonitorModule;
};

const initializeQueueMonitor = async (router: IRouter): Promise<void> => {
  const runQueueConfig = await loadRuntimeQueueConfig();
  const monitorConfig = runQueueConfig?.monitor;
  if (monitorConfig === undefined) {
    return;
  }
  if (monitorConfig.enabled === false) {
    return;
  }

  const queueMonitorModule = await loadAndValidateQueueMonitorModule();
  if (queueMonitorModule === null) {
    return;
  }

  const redisConfig = extractRedisConfigFromQueueConfig();
  const { QueueMonitor } = queueMonitorModule;

  const monitor = QueueMonitor.create({
    ...monitorConfig,
    redis: redisConfig,
  });

  try {
    monitor.registerRoutes(router);
  } catch (error) {
    Logger.error('Failed to register Queue Monitor routes', error);
  }
  Logger.info(
    `Queue Monitor routes registered at http://127.0.0.1:${appConfig.port}${monitorConfig.basePath ?? ''}`
  );
  Logger.info(`Queue Monitor enqueue endpoint at http://127.0.0.1:${appConfig.port}/test/enqueue`);
};

const initializeWorkers = async (router: IRouter): Promise<void> => {
  const workers = await loadWorkersModule();
  if (workers?.WorkerInit !== undefined && typeof workers.registerWorkerRoutes === 'function') {
    workers.registerWorkerRoutes(router, undefined, { middleware: undefined });
  }
};

const resolveLocalQueueRedisEntry = (): string | null => {
  if (typeof process === 'undefined' || typeof process.cwd !== 'function') return null;
  const cwd = process.cwd();
  if (cwd.trim() === '') return null;

  const localEntry = path.join(cwd, 'dist', 'packages', 'queue-redis', 'src', 'index.js');
  return existsSync(localEntry) ? localEntry : null;
};

const loadQueueHttpGatewayModule = async (): Promise<IQueueHttpGatewayModule | undefined> => {
  try {
    return (await import('@zintrust/queue-redis')) as unknown as IQueueHttpGatewayModule;
  } catch {
    const localEntry = resolveLocalQueueRedisEntry();
    if (localEntry === null) return undefined;
    const url = pathToFileURL(localEntry).href;
    return (await import(url)) as unknown as IQueueHttpGatewayModule;
  }
};

const initializeQueueHttpGateway = async (router: IRouter): Promise<void> => {
  try {
    const module = await loadQueueHttpGatewayModule();
    if (module === undefined) {
      Logger.warn('Queue HTTP gateway module is unavailable (@zintrust/queue-redis not found)');
      return;
    }

    if (
      module.QueueHttpGateway === undefined ||
      typeof module.QueueHttpGateway.create !== 'function'
    ) {
      Logger.warn('Queue HTTP gateway module does not expose QueueHttpGateway.create');
      return;
    }

    module.QueueHttpGateway.create().registerRoutes(router);
    Logger.info('Queue HTTP gateway route registered at /api/_sys/queue/rpc');
  } catch (error) {
    Logger.warn('Failed to register Queue HTTP gateway routes', error as Error);
  }
};

export const createLifecycle = (params: {
  environment: string;
  resolvedBasePath: string;
  router: IRouter;
  shutdownManager: IShutdownManager;
  getBooted: () => boolean;
  setBooted: (value: boolean) => void;
}): { boot: () => Promise<void>; shutdown: () => Promise<void> } => {
  const boot = async (): Promise<void> => {
    if (params.getBooted()) return;

    Logger.info(`🚀 Booting ZinTrust Application in ${params.environment} mode...`);

    if (params.environment === 'development') {
      // Clear config registry cache to ensure fresh config loading in watch mode
      // This fixes the issue where config/middleware.ts changes are ignored in watch mode
      StartupConfigFileRegistry.clear();
    }

    StartupConfigValidator.assertValid();

    // Preload project-owned config overrides that must be available synchronously.
    await StartupConfigFileRegistry.preload([
      StartupConfigFile.Middleware,
      StartupConfigFile.Cache,
      StartupConfigFile.Database,
      StartupConfigFile.Queue,
      StartupConfigFile.Storage,
      StartupConfigFile.Mail,
      StartupConfigFile.Broadcast,
      StartupConfigFile.Notification,
    ]);

    FeatureFlags.initialize();
    await StartupHealthChecks.assertHealthy();

    await registerFromRuntimeConfig();

    await initializeArtifactDirectories(params.resolvedBasePath);
    await registerMasterRoutes(params.resolvedBasePath, params.router);

    if (Cloudflare.getWorkersEnv() === null && appConfig.dockerWorker === false) {
      await initializeWorkers(params.router);
      await initializeQueueMonitor(params.router);
      await initializeQueueHttpGateway(params.router);
    }
    // Register service providers
    // Bootstrap services
    Logger.info('✅ Application booted successfully');

    params.setBooted(true);
  };

  const shutdown = async (): Promise<void> => {
    Logger.info('🛑 Shutting down application...');

    try {
      await params.shutdownManager.run();
    } catch (error: unknown) {
      Logger.error('Shutdown hook failed:', error as Error);
    }

    // Ensure FileLogWriter.flush is attempted even if dynamic registration failed.
    try {
      const fileLogWriter = await tryImportOptional<{ FileLogWriter: { flush: () => void } }>(
        '@config/FileLogWriter'
      );
      fileLogWriter?.FileLogWriter?.flush?.();
    } catch {
      /* best-effort */
    }

    params.setBooted(false);
    Logger.info('✅ Application shut down successfully');
  };

  return { boot, shutdown };
};
