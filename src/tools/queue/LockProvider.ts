/* eslint-disable @typescript-eslint/require-await */
/**
 * Lock Provider Implementation
 * Provides distributed lock management for job deduplication
 */

import { ErrorFactory } from '@/exceptions/ZintrustError';
import type {
  Lock,
  LockOptions,
  LockProvider,
  LockProviderConfig,
  LockStatus,
} from '@/types/Queue';
import { Logger } from '@config/logger';
import { createBaseDrivers } from '@config/queue';
import { createRedisConnection } from '@config/workers';
import { ZintrustLang } from '@lang/lang';
import type { Redis } from 'ioredis';

// Singleton Redis client for locks to avoid connection spam
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    const redisConfig = createBaseDrivers().redis;
    // Adapt queue config to worker config format if needed
    redisClient = createRedisConnection({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.database,
    });
  }
  return redisClient;
}

function createAcquireMethod(prefix: string, defaultTtl: number) {
  return async function acquire(key: string, options: LockOptions = {}): Promise<Lock> {
    const lockKey = `${prefix}${key}`;
    const ttl = options.ttl ?? defaultTtl;
    const client = getRedisClient();

    try {
      // Use SET NX PX to acquire lock
      const result = await client.set(lockKey, 'locked', 'PX', ttl, 'NX');
      const acquired = result === 'OK';
      const expires = new Date(Date.now() + ttl);

      Logger.debug(`Lock acquisition attempt`, { key: lockKey, ttl, acquired });

      return {
        key: lockKey,
        ttl,
        acquired,
        expires,
      };
    } catch (error) {
      Logger.error(`Failed to acquire lock`, { key: lockKey, error });
      throw error;
    }
  };
}

function createReleaseMethod() {
  return async function release(lock: Lock): Promise<void> {
    try {
      const client = getRedisClient();
      await client.del(lock.key);
      Logger.debug(`Lock release`, { key: lock.key });
    } catch (error) {
      Logger.error(`Failed to release lock`, { key: lock.key, error });
      throw error;
    }
  };
}

function createExtendMethod() {
  return async function extend(lock: Lock, ttl: number): Promise<boolean> {
    try {
      const client = getRedisClient();
      // Use PEXPIRE to extend
      const result = await client.pexpire(lock.key, ttl);
      const success = result === 1;

      if (success) {
        const newExpires = new Date(Date.now() + ttl);
        Logger.debug(`Lock extension`, { key: lock.key, ttl, newExpires });
        lock.ttl = ttl;
        lock.expires = newExpires;
      }

      return success;
    } catch (error) {
      Logger.error(`Failed to extend lock`, { key: lock.key, error });
      return false;
    }
  };
}

function createStatusMethod(prefix: string) {
  return async function status(key: string): Promise<LockStatus> {
    const lockKey = `${prefix}${key}`;

    try {
      const client = getRedisClient();
      const ttl = await client.pttl(lockKey);
      const exists = ttl > 0;

      Logger.debug(`Lock status check`, { key: lockKey, exists, ttl });

      return {
        exists,
        ttl: exists ? ttl : undefined,
        expires: exists ? new Date(Date.now() + ttl) : undefined,
      };
    } catch (error) {
      Logger.error(`Failed to check lock status`, { key: lockKey, error });
      return { exists: false };
    }
  };
}

function createListMethod(prefix: string) {
  return async function list(pattern: string = '*'): Promise<string[]> {
    try {
      const client = getRedisClient();
      const searchPattern = `${prefix}${pattern}`;
      const keys: string[] = [];
      let cursor = '0';

      do {
        // SCAN to avoid blocking Redis in production environments
        // eslint-disable-next-line no-await-in-loop
        const [nextCursor, batch] = await client.scan(
          cursor,
          'MATCH',
          searchPattern,
          'COUNT',
          '200'
        );
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');

      return keys.map((k) => k.replace(prefix, ''));
    } catch (error) {
      Logger.error(`Failed to list locks`, { pattern, error });
      return [];
    }
  };
}

/**
 * Redis-based Lock Provider Implementation
 */
export function createRedisLockProvider(config: LockProviderConfig): LockProvider {
  const prefix = config.prefix ?? ZintrustLang.ZINTRUST_LOCKS_PREFIX;
  const defaultTtl = config.defaultTtl ?? ZintrustLang.ZINTRUST_LOCKS_TTL;

  return {
    acquire: createAcquireMethod(prefix, defaultTtl),
    release: createReleaseMethod(),
    extend: createExtendMethod(),
    status: createStatusMethod(prefix),
    list: createListMethod(prefix),
  };
}

/**
 * Memory-based Lock Provider (for testing/sync driver)
 */
export function createMemoryLockProvider(config: LockProviderConfig): LockProvider {
  const locks = new Map<string, Lock>();
  const prefix = config.prefix ?? ZintrustLang.MEMORY_LOCKS;
  const defaultTtl = config.defaultTtl ?? ZintrustLang.ZINTRUST_LOCKS_TTL;

  return {
    async acquire(key: string, options: LockOptions = {}): Promise<Lock> {
      const lockKey = `${prefix}${key}`;
      const ttl = options.ttl ?? defaultTtl;
      const expires = new Date(Date.now() + ttl);

      if (locks.has(lockKey)) {
        const existingLock = locks.get(lockKey);
        if (existingLock !== undefined && existingLock.expires > new Date()) {
          return {
            key: lockKey,
            ttl,
            acquired: false,
            expires,
          };
        }
        // Lock expired, remove it
        locks.delete(lockKey);
      }

      const lock: Lock = {
        key: lockKey,
        ttl,
        acquired: true,
        expires,
      };

      locks.set(lockKey, lock);
      Logger.debug(`Memory lock acquired`, { key: lockKey, ttl });

      return lock;
    },

    async release(lock: Lock): Promise<void> {
      locks.delete(lock.key);
      Logger.debug(`Memory lock released`, { key: lock.key });
    },

    async extend(lock: Lock, ttl: number): Promise<boolean> {
      const existingLock = locks.get(lock.key);
      if (!existingLock) {
        return false;
      }

      existingLock.ttl = ttl;
      existingLock.expires = new Date(Date.now() + ttl);
      Logger.debug(`Memory lock extended`, { key: lock.key, ttl });

      return true;
    },

    async status(key: string): Promise<LockStatus> {
      const lockKey = `${prefix}${key}`;
      const lock = locks.get(lockKey);

      if (!lock) {
        return { exists: false };
      }

      if (lock.expires <= new Date()) {
        locks.delete(lockKey);
        return { exists: false };
      }

      return {
        exists: true,
        ttl: lock.ttl,
        expires: lock.expires,
      };
    },

    async list(pattern: string = '*'): Promise<string[]> {
      // Simple regex match for memory provider
      const regex = new RegExp(pattern.replace('*', '.*'));
      const keys: string[] = [];

      for (const key of locks.keys()) {
        const strippedKey = key.replace(prefix, '');
        if (regex.test(strippedKey)) {
          keys.push(strippedKey);
        }
      }
      return keys;
    },
  };
}

/**
 * Lock Provider Registry
 */
const lockProviders = new Map<string, LockProvider>();

export function registerLockProvider(name: string, provider: LockProvider): void {
  lockProviders.set(name, provider);
  Logger.info(`Lock provider registered`, { name });
}
export function getLockProvider(name: string): LockProvider | undefined {
  return lockProviders.get(name);
}

/**
 * Clear all registered lock providers (for testing purposes)
 * @internal
 */
export function clearLockProviders(): void {
  lockProviders.clear();
}

/**
 * Create lock provider based on configuration
 */
export function createLockProvider(config: LockProviderConfig): LockProvider {
  switch (config.type) {
    case ZintrustLang.REDIS:
      return createRedisLockProvider(config);
    case ZintrustLang.MEMORY:
      return createMemoryLockProvider(config);
    default:
      throw ErrorFactory.createConfigError(`Unsupported lock provider type: ${config.type}`);
  }
}
