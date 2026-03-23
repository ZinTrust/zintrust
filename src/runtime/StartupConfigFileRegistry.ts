import * as path from '@node-singletons/path';
import mergeOverrideValues from '@runtime/OverrideValueMerge';
import { ProjectRuntime } from '@runtime/ProjectRuntime';
import useFileLoader from '@runtime/useFileLoader';

// NOTE runtime config loader
export const StartupConfigFile = {
  Broadcast: 'config/broadcast.ts',
  Cache: 'config/cache.ts',
  Database: 'config/database.ts',
  Mail: 'config/mail.ts',
  Middleware: 'config/middleware.ts',
  Notification: 'config/notification.ts',
  Queue: 'config/queue.ts',
  Storage: 'config/storage.ts',
  Workers: 'config/workers.ts',
} as const;

export type StartupConfigFileTypes =
  | typeof StartupConfigFile.Broadcast
  | typeof StartupConfigFile.Cache
  | typeof StartupConfigFile.Database
  | typeof StartupConfigFile.Mail
  | typeof StartupConfigFile.Middleware
  | typeof StartupConfigFile.Notification
  | typeof StartupConfigFile.Queue
  | typeof StartupConfigFile.Storage
  | typeof StartupConfigFile.Workers;

const cache = new Map<StartupConfigFileTypes, unknown>();
let preloaded = false;

const getWorkersStartupOverrides = (): Map<StartupConfigFileTypes, unknown> | undefined => {
  if (typeof globalThis === 'undefined') return undefined;
  const globalAny = globalThis as {
    __zintrustStartupConfigOverrides?: Map<StartupConfigFileTypes, unknown>;
  };
  return globalAny.__zintrustStartupConfigOverrides;
};

const getServiceConfigFile = (file: StartupConfigFileTypes): string | undefined => {
  const activeService = ProjectRuntime.getActiveService();
  if (activeService?.configRoot === undefined || activeService.configRoot.trim() === '') {
    return undefined;
  }

  return `${activeService.configRoot}/${path.basename(file)}`;
};

const loadStartupOverride = async (file: StartupConfigFileTypes): Promise<unknown> => {
  const overrides = getWorkersStartupOverrides();
  if (overrides?.has(file) === true) {
    return overrides.get(file);
  }

  const rootLoader = useFileLoader(file);
  const serviceFile = getServiceConfigFile(file);
  const serviceLoader = serviceFile === undefined ? undefined : useFileLoader(serviceFile);

  const hasRoot = rootLoader.exists();
  const hasService = serviceLoader?.exists() === true;

  if (!hasRoot && !hasService) {
    return undefined;
  }

  const rootOverride = hasRoot ? await rootLoader.get() : undefined;
  const serviceOverride =
    hasService && serviceLoader !== undefined ? await serviceLoader.get() : undefined;

  if (rootOverride === undefined) return serviceOverride;
  if (serviceOverride === undefined) return rootOverride;

  return mergeOverrideValues(rootOverride, serviceOverride);
};

export const StartupConfigFileRegistry = Object.freeze({
  async preload(files: readonly StartupConfigFileTypes[]): Promise<void> {
    const tasks = files.map(async (file) => {
      const value = await loadStartupOverride(file);
      if (value === undefined) {
        cache.delete(file);
        return;
      }

      cache.set(file, value);
    });
    await Promise.all(tasks);
    preloaded = true;
  },

  isPreloaded(): boolean {
    return preloaded;
  },

  get<T>(file: StartupConfigFileTypes): T | undefined {
    return cache.get(file) as T | undefined;
  },

  has(file: StartupConfigFileTypes): boolean {
    return cache.has(file);
  },

  /** Intended for tests only. */
  clear(): void {
    cache.clear();
    preloaded = false;
  },
});

export default StartupConfigFileRegistry;
