/**
 * Cluster Lock Manager
 * Distributed locking using Redis for multi-instance worker coordination
 * Sealed namespace for immutability
 */

import {
  Cloudflare,
  ErrorFactory,
  Logger,
  createRedisConnection,
  generateUuid,
  type RedisConfig,
} from '@zintrust/core';

type RedisConnection = ReturnType<typeof createRedisConnection>;

export type LockAcquisitionOptions = {
  lockKey: string;
  ttl: number; // Time-to-live in seconds
  region?: string;
  userId?: string;
};

export type LockInfo = {
  lockKey: string;
  instanceId: string;
  acquiredAt: Date;
  expiresAt: Date;
  region: string;
  userId?: string;
};

export type AuditLogEntry = {
  timestamp: Date;
  operation: 'acquire' | 'release' | 'extend' | 'force-release';
  lockKey: string;
  instanceId: string;
  userId?: string;
  reason?: string;
  success: boolean;
};

let INSTANCE_ID = '';

const createInstanceId = (): string => {
  const workers = Cloudflare.getWorkersEnv() !== null;
  const pid = typeof process !== 'undefined' && typeof process.pid === 'number' ? process.pid : 0;
  const prefix = workers ? 'worker-cf' : 'worker';
  return `${prefix}-${pid}-${Date.now()}-${generateUuid()}`;
};

const getInstanceId = (): string => {
  if (INSTANCE_ID !== '') return INSTANCE_ID;
  INSTANCE_ID = createInstanceId();
  return INSTANCE_ID;
};

// Redis key prefixes
const LOCK_PREFIX = 'worker:lock:';
const AUDIT_PREFIX = 'worker:audit:lock:';

// Internal state
let redisClient: RedisConnection | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
const activeLocks = new Map<string, LockInfo>();

/**
 * Helper: Get full Redis key for lock
 */
const getLockKey = (lockKey: string): string => {
  return `${LOCK_PREFIX}${lockKey}`;
};

/**
 * Helper: Get full Redis key for audit log
 */
const getAuditKey = (lockKey: string): string => {
  return `${AUDIT_PREFIX}${lockKey}`;
};

/**
 * Helper: Store audit log entry in Redis
 */
const auditLockOperation = async (client: RedisConnection, entry: AuditLogEntry): Promise<void> => {
  try {
    const auditKey = getAuditKey(entry.lockKey);
    const auditData = JSON.stringify(entry);

    // Store in sorted set with timestamp as score for easy retrieval
    await client.zadd(auditKey, entry.timestamp.getTime(), auditData);

    // Keep only last 1000 entries per lock
    await client.zremrangebyrank(auditKey, 0, -1001);

    // Expire audit logs after 30 days
    await client.expire(auditKey, 30 * 24 * 60 * 60);
  } catch (error) {
    Logger.error('Failed to write lock audit log', error);
    // Don't throw - audit failure shouldn't break lock operations
  }
};

/**
 * Helper: Extend lock TTL
 */
const extendLockTTL = async (
  client: RedisConnection,
  lockKey: string,
  ttl: number
): Promise<boolean> => {
  const redisKey = getLockKey(lockKey);
  const value = await client.get(redisKey);

  if (value === null || value !== getInstanceId()) {
    return false; // Lock not held by this instance
  }

  const result = await client.expire(redisKey, ttl);
  return result === 1;
};

/**
 * Helper: Start heartbeat for lock extension
 */
const startHeartbeat = (client: RedisConnection): void => {
  if (heartbeatInterval) {
    return; // Already running
  }

  heartbeatInterval = setInterval(async () => {
    const lockEntries = Array.from(activeLocks.entries());

    await Promise.allSettled(
      lockEntries.map(async ([lockKey, info]) => {
        try {
          const now = new Date();
          const timeUntilExpiry = info.expiresAt.getTime() - now.getTime();

          // Extend if less than 30 seconds until expiry
          if (timeUntilExpiry < 30000) {
            const ttl = Math.ceil(timeUntilExpiry / 1000) + 60; // Extend by 60 more seconds
            const extended = await extendLockTTL(client, lockKey, ttl);

            if (extended) {
              info.expiresAt = new Date(now.getTime() + ttl * 1000);
              Logger.debug(`Extended lock "${lockKey}" TTL to ${ttl}s`);

              await auditLockOperation(client, {
                timestamp: now,
                operation: 'extend',
                lockKey,
                instanceId: getInstanceId(),
                success: true,
              });
            } else {
              // Lost the lock
              activeLocks.delete(lockKey);
              Logger.warn(`Lost lock "${lockKey}" - it was released or taken by another instance`);
            }
          }
        } catch (error) {
          Logger.error(`Failed to extend lock "${lockKey}"`, error);
        }
      })
    );
  }, 10000); // Check every 10 seconds

  Logger.debug('Lock heartbeat started');
};

/**
 * Helper: Stop heartbeat
 */
const stopHeartbeat = (): void => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    Logger.debug('Lock heartbeat stopped');
  }
};

/**
 * Cluster Lock Manager - Sealed namespace
 */
export const ClusterLock = Object.freeze({
  /**
   * Initialize the lock manager with Redis connection
   */
  initialize(config: RedisConfig): void {
    if (redisClient) {
      Logger.warn('ClusterLock already initialized');
      return;
    }

    const client = createRedisConnection(config);
    redisClient = client;
    startHeartbeat(client);

    Logger.info('ClusterLock initialized', { instanceId: getInstanceId() });
  },

  /**
   * Acquire a distributed lock
   */
  async acquire(options: LockAcquisitionOptions): Promise<boolean> {
    if (!redisClient) {
      throw ErrorFactory.createGeneralError(
        'ClusterLock not initialized. Call initialize() first.'
      );
    }

    const { lockKey, ttl, region = 'default', userId } = options;
    const redisKey = getLockKey(lockKey);
    const now = new Date();

    try {
      // Try to acquire lock using SET NX EX (set if not exists with expiry)
      const result = await redisClient.set(redisKey, getInstanceId(), 'EX', ttl, 'NX');

      const success = result === 'OK';

      if (success) {
        const lockInfo: LockInfo = {
          lockKey,
          instanceId: getInstanceId(),
          acquiredAt: now,
          expiresAt: new Date(now.getTime() + ttl * 1000),
          region,
          userId,
        };

        activeLocks.set(lockKey, lockInfo);

        Logger.info(`Acquired lock "${lockKey}"`, {
          region,
          userId,
          ttl,
          expiresAt: lockInfo.expiresAt.toISOString(),
        });

        await auditLockOperation(redisClient, {
          timestamp: now,
          operation: 'acquire',
          lockKey,
          instanceId: getInstanceId(),
          userId,
          success: true,
        });
      } else {
        Logger.debug(`Failed to acquire lock "${lockKey}" - already held by another instance`);

        await auditLockOperation(redisClient, {
          timestamp: now,
          operation: 'acquire',
          lockKey,
          instanceId: getInstanceId(),
          userId,
          success: false,
        });
      }

      return success;
    } catch (error) {
      Logger.error(`Error acquiring lock "${lockKey}"`, error);
      throw error;
    }
  },

  /**
   * Release a distributed lock
   */
  async release(lockKey: string, userId?: string): Promise<boolean> {
    if (!redisClient) {
      throw ErrorFactory.createGeneralError('ClusterLock not initialized');
    }

    const redisKey = getLockKey(lockKey);
    const now = new Date();

    try {
      // Only release if we own the lock
      const value = await redisClient.get(redisKey);

      if (value !== INSTANCE_ID) {
        Logger.warn(`Cannot release lock "${lockKey}" - not owned by this instance`);
        return false;
      }

      await redisClient.del(redisKey);
      activeLocks.delete(lockKey);

      Logger.info(`Released lock "${lockKey}"`, { userId });

      await auditLockOperation(redisClient, {
        timestamp: now,
        operation: 'release',
        lockKey,
        instanceId: INSTANCE_ID,
        userId,
        success: true,
      });

      return true;
    } catch (error) {
      Logger.error(`Error releasing lock "${lockKey}"`, error);
      throw error;
    }
  },

  /**
   * Extend lock TTL
   */
  async extend(lockKey: string, ttl: number): Promise<boolean> {
    if (!redisClient) {
      throw ErrorFactory.createGeneralError('ClusterLock not initialized');
    }

    const extended = await extendLockTTL(redisClient, lockKey, ttl);

    if (extended) {
      const info = activeLocks.get(lockKey);
      if (info) {
        info.expiresAt = new Date(Date.now() + ttl * 1000);
      }
      Logger.debug(`Extended lock "${lockKey}" TTL to ${ttl}s`);
    }

    return extended;
  },

  /**
   * Check if lock is held by this instance
   */
  async isHeldByMe(lockKey: string): Promise<boolean> {
    if (!redisClient) {
      return false;
    }

    const redisKey = getLockKey(lockKey);
    const value = await redisClient.get(redisKey);

    return value === INSTANCE_ID;
  },

  /**
   * Force release a lock (admin operation)
   */
  async forceRelease(lockKey: string, userId: string, reason: string): Promise<boolean> {
    if (!redisClient) {
      throw ErrorFactory.createGeneralError('ClusterLock not initialized');
    }

    const redisKey = getLockKey(lockKey);
    const now = new Date();

    try {
      const currentOwner = await redisClient.get(redisKey);

      if (currentOwner === null) {
        Logger.warn(`Lock "${lockKey}" does not exist`);
        return false;
      }

      await redisClient.del(redisKey);

      // Remove from active locks if we owned it
      if (currentOwner === INSTANCE_ID) {
        activeLocks.delete(lockKey);
      }

      Logger.warn(`Force released lock "${lockKey}"`, {
        userId,
        reason,
        previousOwner: currentOwner,
      });

      await auditLockOperation(redisClient, {
        timestamp: now,
        operation: 'force-release',
        lockKey,
        instanceId: currentOwner,
        userId,
        reason,
        success: true,
      });

      return true;
    } catch (error) {
      Logger.error(`Error force releasing lock "${lockKey}"`, error);
      throw error;
    }
  },

  /**
   * List all locks
   */
  async listLocks(): Promise<ReadonlyArray<{ key: string; owner: string; region?: string }>> {
    if (!redisClient) {
      throw ErrorFactory.createGeneralError('ClusterLock not initialized');
    }

    try {
      const pattern = `${LOCK_PREFIX}*`;
      const keys = await redisClient.keys(pattern);

      const locks = await Promise.all(
        keys.map(async (key) => {
          const owner = await redisClient?.get(key);
          const lockKey = key.replace(LOCK_PREFIX, '');
          const info = activeLocks.get(lockKey);

          return {
            key: lockKey,
            owner: owner ?? 'unknown',
            region: info?.region,
          };
        })
      );

      return locks;
    } catch (error) {
      Logger.error('Error listing locks', error);
      throw error;
    }
  },

  /**
   * Get lock owner
   */
  async getLockOwner(lockKey: string): Promise<string | null> {
    if (!redisClient) {
      throw ErrorFactory.createGeneralError('ClusterLock not initialized');
    }

    const redisKey = getLockKey(lockKey);
    return redisClient.get(redisKey);
  },

  /**
   * Get locks by region
   */
  getLocksByRegion(region: string): ReadonlyArray<LockInfo> {
    const locks: LockInfo[] = [];

    for (const info of activeLocks.values()) {
      if (info.region === region) {
        locks.push({ ...info });
      }
    }

    return locks;
  },

  /**
   * Get audit log for a lock
   */
  async getAuditLog(lockKey: string, limit = 100): Promise<ReadonlyArray<AuditLogEntry>> {
    if (!redisClient) {
      throw ErrorFactory.createGeneralError('ClusterLock not initialized');
    }

    try {
      const auditKey = getAuditKey(lockKey);

      // Get latest entries (highest scores = most recent timestamps)
      const entries = await redisClient.zrevrange(auditKey, 0, limit - 1);

      return entries.map((entry) => JSON.parse(entry) as AuditLogEntry);
    } catch (error) {
      Logger.error(`Error retrieving audit log for "${lockKey}"`, error);
      return [];
    }
  },

  /**
   * Get active locks held by this instance
   */
  getActiveLocks(): ReadonlyArray<LockInfo> {
    return Array.from(activeLocks.values()).map((info) => ({ ...info }));
  },

  /**
   * Get instance ID
   */
  getInstanceId(): string {
    return INSTANCE_ID;
  },

  /**
   * Shutdown and release all locks
   */
  async shutdown(): Promise<void> {
    if (!redisClient) {
      return;
    }

    Logger.info('ClusterLock shutting down...');

    stopHeartbeat();

    // Release all active locks
    const releasePromises = Array.from(activeLocks.keys()).map(async (lockKey) =>
      ClusterLock.release(lockKey, 'system-shutdown')
    );

    await Promise.all(releasePromises);

    if (redisClient !== null) {
      await redisClient.quit();
      redisClient = null;
    }

    Logger.info('ClusterLock shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown
