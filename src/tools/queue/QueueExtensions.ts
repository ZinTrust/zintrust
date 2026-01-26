/**
 * Queue Extensions - Backward Compatible Extensions
 * Extends existing Queue functionality without breaking changes
 */

import type { AdvancedJobOptions, LockProviderConfig, QueueConfig } from '@/types/Queue';
import { Logger } from '@config/logger';
import { createValidationError } from '@exceptions/ZintrustError';
import { ZintrustLang } from '@lang/lang';
import { createAdvancedQueue, type AdvancedQueue } from '@queue/AdvancedQueue';
import { createDeduplicationBuilder } from '@queue/DeduplicationBuilder';
import { createLockProvider, registerLockProvider } from '@queue/LockProvider';
import { Queue } from '@queue/Queue';

// Type for extended Queue with advanced capabilities
interface ExtendedQueue {
  _advancedQueue: AdvancedQueue | null;
}

/**
 * Extend existing Queue with advanced capabilities
 * This provides a migration path for existing code
 */
export function extendQueue(config: QueueConfig): void {
  try {
    const advancedQueue = createAdvancedQueue(config);

    // Store reference for backward compatibility
    (Queue as unknown as ExtendedQueue)._advancedQueue = advancedQueue;

    Logger.info(`Queue extended with advanced capabilities`, { queueName: config.name });
  } catch (error) {
    Logger.error(`Failed to extend queue with advanced capabilities`, { error });
    throw error;
  }
}

/**
 * Enhanced enqueue method that supports advanced options
 * This can be used as a drop-in replacement for Queue.enqueue
 */
export async function enqueueAdvanced(
  name: string,
  payload: unknown,
  options: AdvancedJobOptions = {}
): Promise<string> {
  const advancedQueue = (Queue as unknown as ExtendedQueue)._advancedQueue;

  if (advancedQueue === null) {
    Logger.warn(`Advanced queue not initialized, falling back to standard enqueue`);
    return Queue.enqueue(name, payload);
  }

  return advancedQueue.enqueue(name, payload, options);
}

/**
 * Initialize default lock providers
 */
export function initializeDefaultLockProviders(): void {
  // Register memory lock provider for sync driver
  registerLockProvider(
    ZintrustLang.MEMORY,
    createLockProvider({
      type: ZintrustLang.MEMORY,
      prefix: ZintrustLang.ZINTRUST_LOCKS_PREFIX,
      defaultTtl: ZintrustLang.ZINTRUST_LOCKS_TTL,
    })
  );

  // Register Redis lock provider if Redis is available
  try {
    const redisConfig: LockProviderConfig = {
      type: ZintrustLang.REDIS,
      prefix: ZintrustLang.ZINTRUST_LOCKS_PREFIX,
      defaultTtl: ZintrustLang.ZINTRUST_LOCKS_TTL,
    };
    registerLockProvider('redis', createLockProvider(redisConfig));
    Logger.info(`Redis lock provider registered`);
  } catch (error) {
    Logger.warn(`Redis lock provider registration failed, using memory provider`, { error });
  }
}

/**
 * Get deduplication builder instance
 */
export function getDeduplicationBuilder(): ReturnType<typeof createDeduplicationBuilder> {
  return createDeduplicationBuilder();
}

/**
 * Queue utilities for lock management
 */
export const QueueLocks: {
  release: (key: string) => Promise<void>;
  extend: (key: string, ttl: number) => Promise<boolean>;
  status: (key: string) => Promise<boolean>;
} = {
  /**
   * Release a lock by key
   */
  async release(key: string): Promise<void> {
    const advancedQueue = (Queue as unknown as ExtendedQueue)._advancedQueue;
    if (advancedQueue !== null && advancedQueue !== undefined) {
      return advancedQueue.releaseLock(key);
    }
    throw createValidationError('Advanced queue not initialized. Call extendQueue() first.');
  },

  /**
   * Extend a lock's TTL
   */
  async extend(key: string, ttl: number): Promise<boolean> {
    const advancedQueue = (Queue as unknown as ExtendedQueue)._advancedQueue;
    if (advancedQueue !== null && advancedQueue !== undefined) {
      return advancedQueue.extendLock(key, ttl);
    }
    throw createValidationError('Advanced queue not initialized. Call extendQueue() first.');
  },

  /**
   * Check lock status
   */
  async status(key: string): Promise<boolean> {
    const { getLockProvider } = await import('@/tools/queue/LockProvider');
    const lockProvider = getLockProvider(ZintrustLang.MEMORY);
    if (lockProvider !== undefined) {
      const status = await lockProvider.status(key);
      return status.exists;
    }
    return false;
  },
};

/**
 * Migration helpers for existing queue code
 */
export const MigrationHelpers = {
  /**
   * Convert existing job options to advanced options
   */
  toAdvancedOptions(
    existingOptions: Record<string, unknown>,
    uniqueId?: string
  ): AdvancedJobOptions {
    return {
      ...existingOptions,
      ...(uniqueId !== null && uniqueId !== undefined && uniqueId !== '' && { uniqueId }),
    };
  },

  /**
   * Add deduplication to existing job patterns
   */
  withDeduplication(
    existingOptions: Record<string, unknown>,
    deduplicationId: string,
    ttl?: number
  ): AdvancedJobOptions {
    return {
      ...existingOptions,
      deduplication: createDeduplicationBuilder()
        .id(deduplicationId)
        .expireAfter(ttl ?? ZintrustLang.ZINTRUST_LOCKS_TTL)
        .build(),
    };
  },
};
