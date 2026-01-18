/**
 * Application - Framework core entry point
 * Handles application lifecycle, booting, and environment
 */

import { appConfig, cacheConfig, databaseConfig, queueConfig, storageConfig } from '@/config';
import type { IServiceContainer } from '@/container/ServiceContainer';
import { ServiceContainer } from '@/container/ServiceContainer';
import { StartupHealthChecks } from '@/health/StartupHealthChecks';
import type { IMiddlewareStack } from '@/middleware/MiddlewareStack';
import { MiddlewareStack } from '@/middleware/MiddlewareStack';
import { type IRouter, Router } from '@/routing/Router';
import broadcastConfig from '@config/broadcast';
import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import notificationConfig from '@config/notification';
import { StartupConfigValidator } from '@config/StartupConfigValidator';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';

export interface IApplication {
  boot(): Promise<void>;
  shutdown(): Promise<void>;
  isBooted(): boolean;
  isDevelopment(): boolean;
  isProduction(): boolean;
  isTesting(): boolean;
  getEnvironment(): string;
  getRouter(): IRouter;
  getContainer(): IServiceContainer;
  getMiddlewareStack(): IMiddlewareStack;
  getBasePath(): string;
}

type RoutesModule = { registerRoutes?: (r: IRouter) => void };

type ShutdownHook = () => void | Promise<void>;

interface IShutdownManager {
  add(hook: ShutdownHook): void;
  run(): Promise<void>;
}

const ShutdownManager = Object.freeze({
  create(): IShutdownManager {
    const hooks: ShutdownHook[] = [];

    return Object.freeze({
      add(hook: ShutdownHook): void {
        hooks.push(hook);
      },
      async run(): Promise<void> {
        for (const hook of hooks) {
          // eslint-disable-next-line no-await-in-loop
          await hook();
        }
      },
    });
  },
});

const resolveBasePath = (basePath?: string): string => {
  if (typeof basePath === 'string') return basePath;
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') return process.cwd();
  return '';
};

const makeJoinFromBase =
  (resolvedBasePath: string) =>
  (subPath: string): string => {
    return resolvedBasePath.length > 0 ? `${resolvedBasePath}/${subPath}` : subPath;
  };

const registerCorePaths = (
  container: IServiceContainer,
  resolvedBasePath: string,
  joinFromBase: (subPath: string) => string
): void => {
  container.singleton('paths', {
    base: resolvedBasePath,
    app: joinFromBase('app'),
    config: joinFromBase('config'),
    database: joinFromBase('database'),
    routes: joinFromBase('routes'),
    tests: joinFromBase('tests'),
  });
};

const registerCoreInstances = (params: {
  container: IServiceContainer;
  environment: string;
  router: IRouter;
  middlewareStack: IMiddlewareStack;
  shutdownManager: IShutdownManager;
}): void => {
  params.container.singleton('env', params.environment);
  params.container.singleton('router', params.router);
  params.container.singleton('middleware', params.middlewareStack);
  params.container.singleton('container', params.container);
  params.container.singleton('shutdownManager', params.shutdownManager);
};

const registerFrameworkShutdownHooks = (shutdownManager: IShutdownManager): void => {
  // Register framework-level shutdown hooks for long-lived resources
  // ConnectionManager may not be initialized; shutdownIfInitialized is safe
  // Use dynamic import without top-level await to avoid transforming the module into an async module
  import('@orm/ConnectionManager')
    .then((mod: { ConnectionManager: { shutdownIfInitialized: () => Promise<void> } }) => {
      shutdownManager.add(async () => mod.ConnectionManager.shutdownIfInitialized());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */

  import('@orm/Database')
    .then((mod: { resetDatabase: () => void }) => {
      shutdownManager.add(() => mod.resetDatabase());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */

  import('@cache/Cache')
    .then((mod: { Cache: { reset: () => void } }) => {
      shutdownManager.add(() => mod.Cache.reset());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */

  // Flush file logging streams
  import('@config/FileLogWriter')
    .then((mod: { FileLogWriter: { flush: () => void } }) => {
      shutdownManager.add(() => mod.FileLogWriter.flush());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */

  import('@broadcast/BroadcastRegistry')
    .then((mod: { BroadcastRegistry: { reset: () => void } }) => {
      shutdownManager.add(() => mod.BroadcastRegistry.reset());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */

  import('@storage/StorageDiskRegistry')
    .then((mod: { StorageDiskRegistry: { reset: () => void } }) => {
      shutdownManager.add(() => mod.StorageDiskRegistry.reset());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */

  import('@notification/NotificationChannelRegistry')
    .then((mod: { NotificationChannelRegistry: { reset: () => void } }) => {
      shutdownManager.add(() => mod.NotificationChannelRegistry.reset());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */

  import('@mail/MailDriverRegistry')
    .then((mod: { MailDriverRegistry: { reset: () => void } }) => {
      shutdownManager.add(() => mod.MailDriverRegistry.reset());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */

  import('@tools/queue/Queue')
    .then((mod: { Queue: { reset: () => void } }) => {
      shutdownManager.add(() => mod.Queue.reset());
    })
    /* c8 ignore start */
    .catch(() => {
      /* ignore import failures in restrictive runtimes */
    });
  /* c8 ignore stop */
};

const tryImportRoutesFromAppBase = async (
  resolvedBasePath: string
): Promise<RoutesModule | undefined> => {
  if (resolvedBasePath === '') return undefined;

  const candidates = [
    // Dev (tsx)
    path.join(resolvedBasePath, 'routes', 'api.ts'),
    // Production build output
    path.join(resolvedBasePath, 'dist', 'routes', 'api.js'),
    // Fallback (in case someone transpiles without /dist)
    path.join(resolvedBasePath, 'routes', 'api.js'),
  ];

  for (const candidate of candidates) {
    try {
      const url = pathToFileURL(candidate).href;
      // eslint-disable-next-line no-await-in-loop
      return (await import(url)) as RoutesModule;
    } catch {
      // keep trying
    }
  }

  return undefined;
};

const registerRoutes = async (resolvedBasePath: string, router: IRouter): Promise<void> => {
  try {
    const mod = await tryImportRoutesFromAppBase(resolvedBasePath);
    if (typeof mod?.registerRoutes === 'function') {
      mod.registerRoutes(router);
    } else {
      const { registerRoutes: registerFrameworkRoutes } = await import('../routes/api');
      registerFrameworkRoutes(router);
    }

    // Always register core framework routes (health, metrics, doc) after app routes
    // This ensures app can override but core routes always exist
    const { registerCoreRoutes } = await import('../routing/CoreRoutes');
    registerCoreRoutes(router);
  } catch (error: unknown) {
    Logger.error('Failed to register routes:', error as Error);
  }
};

const initializeArtifactDirectories = async (resolvedBasePath: string): Promise<void> => {
  if (resolvedBasePath === '') return;
  if (typeof process === 'undefined') return;

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

const tryImportOptional = async <T>(modulePath: string): Promise<T | undefined> => {
  try {
    return (await import(modulePath)) as T;
  } catch {
    return undefined;
  }
};

const isCompiledJsModule = (): boolean => {
  // When running from dist, this module is compiled to .js and Node ESM resolution
  // requires explicit file extensions for relative imports.
  return import.meta.url.endsWith('.js');
};

const dbLoader = async (): Promise<void> => {
  const db = await tryImportOptional<{
    registerDatabasesFromRuntimeConfig?: (cfg: typeof databaseConfig) => void;
  }>(
    isCompiledJsModule()
      ? '../orm/DatabaseRuntimeRegistration.js'
      : '../orm/DatabaseRuntimeRegistration'
  );
  db?.registerDatabasesFromRuntimeConfig?.(databaseConfig);
};

const queuesLoader = async (): Promise<void> => {
  const queues = await tryImportOptional<{
    registerQueuesFromRuntimeConfig?: (cfg: typeof queueConfig) => void;
  }>(
    isCompiledJsModule()
      ? '../tools/queue/QueueRuntimeRegistration.js'
      : '../tools/queue/QueueRuntimeRegistration'
  );
  queues?.registerQueuesFromRuntimeConfig?.(queueConfig);
};

const cachesLoader = async (): Promise<void> => {
  const caches = await tryImportOptional<{
    registerCachesFromRuntimeConfig?: (cfg: typeof cacheConfig) => void;
  }>(
    isCompiledJsModule()
      ? '../cache/CacheRuntimeRegistration.js'
      : '../cache/CacheRuntimeRegistration'
  );
  caches?.registerCachesFromRuntimeConfig?.(cacheConfig);
};

const registerFromRuntimeConfig = async (): Promise<void> => {
  await dbLoader();
  await queuesLoader();
  await cachesLoader();

  const broadcasters = await tryImportOptional<{
    registerBroadcastersFromRuntimeConfig?: (cfg: {
      default: string;
      drivers: typeof broadcastConfig.drivers;
    }) => void;
  }>(
    isCompiledJsModule()
      ? '../tools/broadcast/BroadcastRuntimeRegistration.js'
      : '../tools/broadcast/BroadcastRuntimeRegistration'
  );
  broadcasters?.registerBroadcastersFromRuntimeConfig?.({
    default: broadcastConfig.default,
    drivers: broadcastConfig.drivers,
  });

  const disks = await tryImportOptional<{
    registerDisksFromRuntimeConfig?: (cfg: typeof storageConfig) => void;
  }>(
    isCompiledJsModule()
      ? '../tools/storage/StorageRuntimeRegistration.js'
      : '../tools/storage/StorageRuntimeRegistration'
  );
  disks?.registerDisksFromRuntimeConfig?.(storageConfig);

  const notifications = await tryImportOptional<{
    registerNotificationChannelsFromRuntimeConfig?: (cfg: {
      default: string;
      drivers: typeof notificationConfig.drivers;
    }) => void;
  }>(
    isCompiledJsModule()
      ? '../tools/notification/NotificationRuntimeRegistration.js'
      : '../tools/notification/NotificationRuntimeRegistration'
  );
  notifications?.registerNotificationChannelsFromRuntimeConfig?.({
    default: notificationConfig.default,
    drivers: notificationConfig.drivers,
  });
};

const createLifecycle = (params: {
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
    await registerRoutes(params.resolvedBasePath, params.router);

    // Register service providers
    // Bootstrap services

    params.setBooted(true);
    Logger.info('✅ Application booted successfully');
  };

  const shutdown = async (): Promise<void> => {
    Logger.info('🛑 Shutting down application...');

    try {
      await params.shutdownManager.run();
    } catch (error: unknown) {
      Logger.error('Shutdown hook failed:', error as Error);
    }

    Logger.info('✅ Application shut down successfully');
    params.setBooted(false);
  };

  return { boot, shutdown };
};

/**
 * Application Factory
 */
export const Application = Object.freeze({
  /**
   * Create a new application instance
   */
  create(basePath?: string): IApplication {
    const resolvedBasePath = resolveBasePath(basePath);
    const joinFromBase = makeJoinFromBase(resolvedBasePath);

    const environment = appConfig.environment;
    const container = ServiceContainer.create();
    const router = Router.createRouter();
    const middlewareStack = MiddlewareStack.create();
    const shutdownManager = ShutdownManager.create();

    let booted = false;

    registerCorePaths(container, resolvedBasePath, joinFromBase);
    registerCoreInstances({ container, environment, router, middlewareStack, shutdownManager });

    registerFrameworkShutdownHooks(shutdownManager);

    const { boot, shutdown } = createLifecycle({
      environment,
      resolvedBasePath,
      router,
      shutdownManager,
      getBooted: () => booted,
      setBooted: (value: boolean) => {
        booted = value;
      },
    });

    return {
      boot,
      shutdown,
      isBooted: (): boolean => booted,
      isDevelopment: (): boolean => appConfig.isDevelopment(),
      isProduction: (): boolean => appConfig.isProduction(),
      isTesting: (): boolean => appConfig.isTesting(),
      getEnvironment: (): string => environment,
      getRouter: (): IRouter => router,
      getContainer: (): IServiceContainer => container,
      getMiddlewareStack: (): IMiddlewareStack => middlewareStack,
      getBasePath: (): string => resolvedBasePath,
    };
  },
});

export default Application;
