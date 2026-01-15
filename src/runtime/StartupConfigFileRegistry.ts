import useFileLoader from '@/runtime/useFileLoader';

export const StartupConfigFile = {
  Broadcast: 'config/broadcast.ts',
  Cache: 'config/cache.ts',
  Database: 'config/database.ts',
  Mail: 'config/mail.ts',
  Middleware: 'config/middleware.ts',
  Notification: 'config/notification.ts',
  Queue: 'config/queue.ts',
  Storage: 'config/storage.ts',
} as const;

export type StartupConfigFileTyps =
  | typeof StartupConfigFile.Broadcast
  | typeof StartupConfigFile.Cache
  | typeof StartupConfigFile.Database
  | typeof StartupConfigFile.Mail
  | typeof StartupConfigFile.Middleware
  | typeof StartupConfigFile.Notification
  | typeof StartupConfigFile.Queue
  | typeof StartupConfigFile.Storage;

const cache = new Map<StartupConfigFileTyps, unknown>();
let preloaded = false;

export const StartupConfigFileRegistry = Object.freeze({
  async preload(files: readonly StartupConfigFileTyps[]): Promise<void> {
    const tasks = files.map(async (file) => {
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

  get<T>(file: StartupConfigFileTyps): T | undefined {
    return cache.get(file) as T | undefined;
  },

  has(file: StartupConfigFileTyps): boolean {
    return cache.has(file);
  },

  /** Intended for tests only. */
  clear(): void {
    cache.clear();
    preloaded = false;
  },
});

export default StartupConfigFileRegistry;
