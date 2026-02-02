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

export const StartupConfigFileRegistry = Object.freeze({
  async preload(files: readonly StartupConfigFileTypes[]): Promise<void> {
    const tasks = files.map(async (file) => {
      const overrides = getWorkersStartupOverrides();
      if (overrides?.has(file) === true) {
        cache.set(file, overrides.get(file));
        return;
      }

      const loader = useFileLoader(file);
      if (!loader.exists()) {
        cache.delete(file);
        return;
      }

      const value = await loader.get();
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
