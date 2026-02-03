import { cacheConfig, databaseConfig, queueConfig, storageConfig } from '@/config';
import { StartupHealthChecks } from '@/health/StartupHealthChecks';
import { registerCachesFromRuntimeConfig } from '@cache/CacheRuntimeRegistration';
import broadcastConfig from '@config/broadcast';
import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import notificationConfig from '@config/notification';
import { StartupConfigValidator } from '@config/StartupConfigValidator';
import * as path from '@node-singletons/path';
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

// eslint-disable-next-line @typescript-eslint/require-await
const dbLoader = async (): Promise<void> => {
  registerDatabasesFromRuntimeConfig(databaseConfig);
};

// eslint-disable-next-line @typescript-eslint/require-await
const queuesLoader = async (): Promise<void> => {
  registerQueuesFromRuntimeConfig(queueConfig);
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
