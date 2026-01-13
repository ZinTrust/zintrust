import useFileLoader from '@/runtime/useFileLoader';

export enum StartupConfigFile {
  Broadcast = 'config/broadcast.ts',
  Cache = 'config/cache.ts',
  Database = 'config/database.ts',
  Mail = 'config/mail.ts',
  Middleware = 'config/middleware.ts',
  Notification = 'config/notification.ts',
  Queue = 'config/queue.ts',
  Storage = 'config/storage.ts',
}

const cache = new Map<StartupConfigFile, unknown>();
let preloaded = false;

export const StartupConfigFileRegistry = Object.freeze({
  async preload(files: readonly StartupConfigFile[]): Promise<void> {
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

  get<T>(file: StartupConfigFile): T | undefined {
    return cache.get(file) as T | undefined;
  },

  has(file: StartupConfigFile): boolean {
    return cache.has(file);
  },

  /** Intended for tests only. */
  clear(): void {
    cache.clear();
    preloaded = false;
  },
});

export default StartupConfigFileRegistry;
