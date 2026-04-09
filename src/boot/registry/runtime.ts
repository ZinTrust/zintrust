import * as RuntimeConfig from '@/config';
import { StartupHealthChecks } from '@/health/StartupHealthChecks';
import { loadQueueMonitorModule, loadWorkersModule } from '@/runtime/WorkersModule';
import { registerCachesFromRuntimeConfig } from '@cache/CacheRuntimeRegistration';
import { readEnvString } from '@common/ExternalServiceUtils';
import broadcastConfig from '@config/broadcast';
import { Cloudflare } from '@config/cloudflare';
import { databaseConfig as liveDatabaseConfig } from '@config/database';
import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import notificationConfig from '@config/notification';
import { StartupConfigValidator } from '@config/StartupConfigValidator';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { registerMasterRoutes, tryImportOptional } from '@registry/registerRoute';
import type { IShutdownManager } from '@registry/type';
import { registerWorkerShutdownHook } from '@registry/worker';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';
import { SocketFeature } from '@sockets/SocketRuntime';
import { SocketRuntimeRegistry } from '@sockets/SocketRuntimeRegistry';
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

type GlobalTracePluginState = {
  __zintrust_system_trace_plugin_requested__?: boolean;
  __zintrust_system_trace_runtime__?: ILocalSystemTraceModule;
};

type RuntimeQueueConfig = typeof RuntimeConfig.queueConfig;

type QueueMonitorWorkerFactoryModule = {
  WorkerFactory?: {
    listPersistedRecords?: () => Promise<Array<{ queueName?: unknown }>>;
  };
};

type ILocalSystemTraceModule = {
  isAvailable?: () => boolean;
  ensureSystemTraceRegistered: () => Promise<void>;
  registerTraceDashboard?: (
    router: IRouter,
    options?: { basePath?: string; middleware?: ReadonlyArray<string> }
  ) => void;
};

const importFromExistingCandidates = async <T>(
  moduleCandidates: ReadonlyArray<string>
): Promise<T | undefined> => {
  for (const modulePath of moduleCandidates) {
    if (!existsSync(modulePath)) continue;

    try {
      const url = pathToFileURL(modulePath).href;
      // eslint-disable-next-line no-await-in-loop
      return (await import(url)) as T;
    } catch {
      // try next candidate
    }
  }

  return undefined;
};

const loadLocalSystemTraceModule = async (): Promise<ILocalSystemTraceModule | undefined> => {
  const globalTracePluginState = globalThis as unknown as GlobalTracePluginState;
  if (globalTracePluginState.__zintrust_system_trace_runtime__ !== undefined) {
    return globalTracePluginState.__zintrust_system_trace_runtime__;
  }

  const projectRoot =
    typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '';

  if (projectRoot !== '') {
    const moduleCandidates = [
      path.join(projectRoot, 'src', 'runtime', 'plugins', 'trace-runtime.ts'),
      path.join(projectRoot, 'src', 'runtime', 'plugins', 'trace-runtime.js'),
      path.join(projectRoot, 'dist', 'runtime', 'plugins', 'trace-runtime.js'),
      path.join(projectRoot, 'dist', 'src', 'runtime', 'plugins', 'trace-runtime.js'),
    ];

    const localModule =
      await importFromExistingCandidates<ILocalSystemTraceModule>(moduleCandidates);

    if (localModule !== undefined) {
      if (typeof localModule.isAvailable === 'function' && localModule.isAvailable() === false) {
        return undefined;
      }
      return localModule;
    }
  }

  return tryImportOptional<ILocalSystemTraceModule>('@runtime/plugins/trace-runtime');
};

const loadRuntimeQueueConfig = async (): Promise<RuntimeQueueConfig | undefined> => {
  const startupQueueConfig = getStartupQueueConfig();
  if (startupQueueConfig !== undefined) {
    return startupQueueConfig;
  }

  try {
    const modulePath = '@runtime-config/queue';
    const loaded = (await import(modulePath)) as { default?: RuntimeQueueConfig };
    return loaded.default ?? getQueueConfig();
  } catch {
    return getQueueConfig();
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

const getStartupQueueConfig = (): RuntimeQueueConfig | undefined => {
  const startupQueueConfig = (
    StartupConfigFileRegistry as {
      get?: (file: typeof StartupConfigFile.Queue) => unknown;
    }
  ).get?.(StartupConfigFile.Queue);

  return (startupQueueConfig as RuntimeQueueConfig | undefined) ?? undefined;
};

const getQueueConfig = (): RuntimeQueueConfig => {
  return (
    getStartupQueueConfig() ??
    (readRuntimeConfig('queueConfig', RuntimeConfig.queueConfig) as RuntimeQueueConfig)
  );
};

const appConfig = readRuntimeConfig('appConfig', {
  port: 7777,
  dockerWorker: false,
  worker: false,
});

// exported solely for tests to exercise the default detectRuntime handler

const cacheConfig = readRuntimeConfig('cacheConfig', RuntimeConfig.cacheConfig);
const storageConfig = readRuntimeConfig('storageConfig', RuntimeConfig.storageConfig);

const getDatabaseConfig = (): typeof liveDatabaseConfig => {
  return readRuntimeConfig('databaseConfig', liveDatabaseConfig);
};

// eslint-disable-next-line @typescript-eslint/require-await
const dbLoader = async (): Promise<void> => {
  registerDatabasesFromRuntimeConfig(getDatabaseConfig());
};

const queuesLoader = async (): Promise<void> => {
  await registerQueuesFromRuntimeConfig(getQueueConfig());
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
  registerResetHook(shutdownManager, '@sockets/SocketRuntimeRegistry', 'SocketRuntimeRegistry');

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

const extractRedisConfigFromQueueConfig = (
  runtimeQueueConfig?: RuntimeQueueConfig
): {
  host: string;
  port: number;
  password: string;
  db: number;
} => {
  const redisConfig =
    ((runtimeQueueConfig ?? getQueueConfig()) as { drivers?: { redis?: Record<string, unknown> } })
      .drivers?.redis ?? {};
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
    Logger.debug(
      'Queue Monitor is enabled in configuration but module failed to load or is invalid. Skipping Queue Monitor initialization.'
    );
    return;
  }

  const redisConfig = extractRedisConfigFromQueueConfig(runQueueConfig);
  const { QueueMonitor } = queueMonitorModule;

  const resolveKnownQueues = async (): Promise<string[]> => {
    try {
      const workersModule = (await loadWorkersModule()) as QueueMonitorWorkerFactoryModule | null;
      const records = await workersModule?.WorkerFactory?.listPersistedRecords?.();
      if (!Array.isArray(records)) {
        return [];
      }

      return Array.from(
        new Set(
          records
            .map((record) => record.queueName)
            .filter((queueName): queueName is string => isNonEmptyString(queueName))
        )
      ).sort((left, right) => left.localeCompare(right));
    } catch {
      return [];
    }
  };

  const monitor = QueueMonitor.create({
    ...monitorConfig,
    knownQueues: resolveKnownQueues,
    redis: redisConfig,
  });

  try {
    monitor.registerRoutes(router);
  } catch (error) {
    Logger.error('Failed to register Queue Monitor routes', error);
  }
  Logger.info(
    `Queue Monitor routes registered at http://127.0.0.1:${appConfig.port}${
      monitorConfig.basePath ?? ''
    }`
  );
  Logger.info(`Queue Monitor enqueue endpoint at http://127.0.0.1:${appConfig.port}/test/enqueue`);
};

const initializeWorkers = async (router: IRouter): Promise<void> => {
  const workers = await loadWorkersModule({ allowWhenDisabled: true });
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

const initializeScheduleHttpGateway = async (router: IRouter): Promise<void> => {
  try {
    const { ScheduleHttpGateway } = await import('@/scheduler/ScheduleHttpGateway');
    ScheduleHttpGateway.create().registerRoutes(router);
    Logger.info('Schedule HTTP gateway route registered at /api/_sys/schedule/rpc');
  } catch (error) {
    Logger.warn('Failed to register Schedule HTTP gateway routes', error as Error);
  }
};

const isTraceEnabled = (): boolean => {
  const raw = readEnvString('TRACE_ENABLED').trim().toLowerCase();
  return raw === '1' || raw === 'true';
};

const isTraceDashboardAutoMountEnabled = (): boolean => {
  const raw = readEnvString('TRACE_AUTO_MOUNT').trim().toLowerCase();
  return raw === '1' || raw === 'true';
};

const resolveTraceDashboardBasePath = (): string => {
  const raw = readEnvString('TRACE_BASE_PATH').trim();
  if (raw === '') return '/trace';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const resolveTraceDashboardMiddleware = (): ReadonlyArray<string> => {
  return readEnvString('TRACE_MIDDLEWARE')
    .split(',')
    .map((value) => value.trim())
    .filter(isNonEmptyString);
};

const isSystemTracePluginRequested = (): boolean => {
  const globalTracePluginState = globalThis as unknown as GlobalTracePluginState;
  return globalTracePluginState.__zintrust_system_trace_plugin_requested__ === true;
};

const initializeSystemTrace = async (router: IRouter): Promise<void> => {
  if (!isSystemTracePluginRequested()) {
    Logger.debug('System Trace plugin is not enabled in zintrust.plugins.*. Skipping init.');
    return;
  }

  if (!isTraceEnabled()) return;

  const traceModule =
    (await tryImportOptional<ILocalSystemTraceModule>('@runtime/plugins/trace-runtime')) ??
    (await loadLocalSystemTraceModule());
  if (traceModule === undefined) {
    Logger.debug('System Trace is enabled but the optional package is unavailable.');
    return;
  }

  try {
    await traceModule.ensureSystemTraceRegistered();
    if (traceModule.isAvailable?.() === false) {
      Logger.debug('System Trace is enabled but the optional package is unavailable.');
      return;
    }

    if (!isTraceDashboardAutoMountEnabled()) {
      Logger.info(
        'System Trace runtime activated. Set TRACE_AUTO_MOUNT=true or register dashboard routes manually if needed.'
      );
      return;
    }

    if (typeof traceModule.registerTraceDashboard !== 'function') {
      Logger.warn(
        'System Trace auto-mount requested but the optional package does not expose registerTraceDashboard.'
      );
      return;
    }

    const basePath = resolveTraceDashboardBasePath();
    const middleware = resolveTraceDashboardMiddleware();

    traceModule.registerTraceDashboard(router, {
      basePath,
      ...(middleware.length > 0 ? { middleware } : {}),
    });

    Logger.info(`System Trace dashboard auto-mounted at ${basePath}.`);
  } catch (error) {
    Logger.warn('Failed to initialize System Trace runtime', error as Error);
  }
};

const initializeSockets = (router: IRouter): void => {
  const settings = SocketFeature.getSettings();
  if (!settings.enabled) {
    return;
  }

  const runtime = SocketRuntimeRegistry.getRuntime();
  if (runtime === undefined || runtime.isEnabled() === false) {
    Logger.warn(
      'SOCKET_ENABLED=true but no socket runtime is registered. Install @zintrust/socket to activate unified socket transport.'
    );
    return;
  }

  const routeRegistrar = SocketRuntimeRegistry.getRouteRegistrar();
  if (routeRegistrar !== undefined) {
    try {
      routeRegistrar.registerRoutes(router);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error('Failed to register socket compatibility routes', {
        error: message,
      });
      throw ErrorFactory.createConfigError(
        `Failed to register socket compatibility routes: ${message}`
      );
    }
  }

  const diagnostics = runtime.describe();
  Logger.info('Socket runtime enabled');
  Logger.info(`Transport: ${diagnostics.transport}`);
  Logger.info(`Path: ${diagnostics.path}`);
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

    const startupConfigValidation = StartupConfigValidator.validate();
    if (startupConfigValidation.warnings.length > 0) {
      Logger.warn('Startup configuration warnings:', startupConfigValidation.warnings);
    }

    if (!startupConfigValidation.valid) {
      throw ErrorFactory.createConfigError('Invalid startup configuration', {
        errors: startupConfigValidation.errors,
        warnings: startupConfigValidation.warnings,
      });
    }

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
    initializeSockets(params.router);
    await initializeSystemTrace(params.router);

    if (Cloudflare.getWorkersEnv() === null && appConfig.dockerWorker === false) {
      await initializeWorkers(params.router);
      await initializeQueueMonitor(params.router);

      if (appConfig.worker === true) {
        await initializeQueueHttpGateway(params.router);
        await initializeScheduleHttpGateway(params.router);
      } else {
        Logger.info('Skipping worker execution/gateway initialization (WORKER_ENABLED=false).');
      }
    } else if (!appConfig.dockerWorker) {
      Logger.info('Skipping local worker dashboards in Cloudflare Workers runtime.');
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
  };

  return { boot, shutdown };
};
