import { ZedgiCacheDriver } from './ZedgiCacheDriver.js';
import { ZedgiDatabaseAdapter } from './ZedgiDatabaseAdapter.js';
import { createZedgiMonitorDriver } from './ZedgiMonitorDriver.js';
import { ZedgiQueueDriver } from './ZedgiQueueDriver.js';
import { createZedgiRedisExecutor } from './ZedgiRedisExecutor.js';
import { ZedgiRuntime } from './ZedgiRuntime.js';
import type { ZedgiDatabaseConfig, ZedgiQueueConfig, ZedgiRedisCacheConfig } from './types.js';

type CacheRegistry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

type DatabaseRegistry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

type QueueApi = {
  register: (driver: string, queue: unknown) => void;
};

export function registerZedgiCacheDriver(registry: CacheRegistry): void {
  registry.register('redis-zedgi', (config) =>
    ZedgiCacheDriver.create(config as ZedgiRedisCacheConfig)
  );
}

export function registerZedgiDatabaseAdapters(registry: DatabaseRegistry): void {
  const factory = (config: unknown): unknown =>
    ZedgiDatabaseAdapter.create(config as ZedgiDatabaseConfig);
  registry.register('mysql-zedgi', factory);
  registry.register('postgres-zedgi', factory);
  registry.register('pg-zedgi', (config) =>
    ZedgiDatabaseAdapter.create({
      ...(config as ZedgiDatabaseConfig),
      driver: 'postgres-zedgi',
    })
  );
}

export function registerZedgiQueueDriver(queue: QueueApi, config?: ZedgiQueueConfig): void {
  queue.register(
    'queue-zedgi',
    ZedgiQueueDriver.create(
      config ?? {
        driver: 'queue-zedgi',
      }
    )
  );
}

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@zintrust/core');
  } catch {
    return {};
  }
};

const core = (await importCore()) as {
  CacheDriverRegistry?: CacheRegistry;
  DatabaseAdapterRegistry?: DatabaseRegistry;
  Queue?: QueueApi;
  Env?: { getBool?: (key: string, fallback?: boolean) => boolean };
};

if (typeof core.CacheDriverRegistry?.register === 'function') {
  registerZedgiCacheDriver(core.CacheDriverRegistry);
}

if (typeof core.DatabaseAdapterRegistry?.register === 'function') {
  registerZedgiDatabaseAdapters(core.DatabaseAdapterRegistry);
}

if (typeof core.Queue?.register === 'function') {
  registerZedgiQueueDriver(core.Queue);
}

if (core.Env?.getBool?.('USE_ZEDGI', false) === true) {
  ZedgiRuntime.initialize();

  // Register Zedgi Redis executor for core Redis transport
  try {
    const redisModule = (await import('@zintrust/core/redis')) as never;
    const registerRedisExec = (redisModule as Record<string, unknown>).registerZedgiRedisExecutor;
    if (typeof registerRedisExec === 'function') {
      registerRedisExec(createZedgiRedisExecutor());
    }
  } catch {
    // @zintrust/core/redis may not be available in all environments
  }

  // Register Zedgi monitor driver for queue-monitor
  try {
    const monitorModule = (await import('@zintrust/queue-monitor')) as never;
    const registerMonitor = (monitorModule as Record<string, unknown>).registerZedgiMonitorDriver;
    if (typeof registerMonitor === 'function') {
      registerMonitor(createZedgiMonitorDriver);
    }
  } catch {
    // @zintrust/queue-monitor may not be available in all environments
  }
}
