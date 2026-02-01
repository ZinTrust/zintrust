/**
 * Advanced Queue Implementation
 * Extends ZinTrust queue functionality with deduplication and lock management
 */

import type {
  AdvancedJobOptions,
  DeduplicationOptions,
  JobResult,
  LockProvider,
  LockProviderConfig,
  QueueConfig,
} from '@/types/Queue';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { queueConfig } from '@config/queue';
import type { QueueDriverName } from '@config/type';
import { createValidationError } from '@exceptions/ZintrustError';
import { ZintrustLang } from '@lang/lang';
import { type DeduplicationBuilder } from '@queue/DeduplicationBuilder';
import { createLockProvider, getLockProvider, registerLockProvider } from '@queue/LockProvider';
import type { BullMQPayload } from '@queue/Queue';
import { Queue, resolveLockPrefix } from '@queue/Queue';

export interface AdvancedQueue {
  enqueue(name: string, payload: BullMQPayload, options: AdvancedJobOptions): Promise<string>;
  deduplicate(id: string, builder: DeduplicationBuilder): Promise<JobResult>;
  releaseLock(key: string): Promise<void>;
  extendLock(key: string, ttl: number): Promise<boolean>;
}

/**
 * Creates an advanced queue instance with deduplication capabilities
 * @param config - Queue configuration
 * @returns {AdvancedQueue} Advanced queue instance
 */
export function createAdvancedQueue(config: QueueConfig): AdvancedQueue {
  const lockProviderName = resolveLockProviderName(config);
  const lockProvider = initializeLockProvider(lockProviderName, config);

  return {
    enqueue: async (name: string, payload: BullMQPayload, options: AdvancedJobOptions) =>
      enqueueWithDeduplication(name, payload, options, lockProvider),
    // eslint-disable-next-line @typescript-eslint/require-await
    deduplicate: async (_id: string, _builder: DeduplicationBuilder): Promise<JobResult> => {
      throw createValidationError(
        'deduplicate() method should be used via enqueue() with deduplication options'
      );
    },
    releaseLock: async (key: string): Promise<void> => releaseLock(key, lockProvider),
    extendLock: async (key: string, ttl: number): Promise<boolean> =>
      extendLock(key, ttl, lockProvider),
  };
}

/**
 * Initialize lock provider for the advanced queue
 */
function initializeLockProvider(lockProviderName: string, config: QueueConfig): LockProvider {
  // Initialize default lock provider if not exists
  const getLock = getLockProvider(lockProviderName);
  if (getLock === undefined) {
    const lockConfig: LockProviderConfig = {
      type: lockProviderName === ZintrustLang.REDIS ? ZintrustLang.REDIS : ZintrustLang.MEMORY,
      prefix: resolveLockPrefix(),
      defaultTtl: resolveDefaultLockTtl(config),
    };
    registerLockProvider(lockProviderName, createLockProvider(lockConfig));
  }

  const provider = getLockProvider(lockProviderName);
  if (provider === undefined) {
    throw createValidationError(`Failed to initialize lock provider: ${lockProviderName}`);
  }

  return provider;
}

function resolveLockProviderName(config: QueueConfig): string {
  const envProvider: QueueDriverName = queueConfig.default;
  if (
    config.lockProvider !== undefined &&
    config.lockProvider !== null &&
    config.lockProvider.length > 0
  )
    return config.lockProvider;
  if (envProvider.length > 0) return envProvider;
  return ZintrustLang.MEMORY;
}

function resolveDefaultLockTtl(config: QueueConfig): number {
  return Env.getInt(
    'QUEUE_DEFAULT_DEDUP_TTL',
    config.defaultDedupTtl ?? ZintrustLang.ZINTRUST_LOCKS_TTL
  );
}

function resolveMaxLockTtl(): number | undefined {
  const max = Env.getInt('QUEUE_MAX_LOCK_TTL', 0);
  if (max <= 0) return undefined;
  return max;
}

/**
 * Handle uniqueId validation
 */
function validateUniqueIdOptions(options: AdvancedJobOptions): void {
  if (options.uniqueId !== null && options.uniqueId !== undefined && options.uniqueId !== '') {
    const validation = validateUniqueId(options.uniqueId);
    if (!validation.valid) {
      throw createValidationError(`Invalid uniqueId: ${validation.reason}`);
    }
  }
}

function validateDeduplicationOptions(options: AdvancedJobOptions): void {
  if (!options.deduplication) return;

  const maxTtl = resolveMaxLockTtl();
  if (maxTtl !== undefined && options.deduplication.ttl !== undefined) {
    if (options.deduplication.ttl > maxTtl) {
      throw createValidationError(
        `Deduplication TTL exceeds QUEUE_MAX_LOCK_TTL (${options.deduplication.ttl} > ${maxTtl})`
      );
    }
  }
}

const QUEUE_META_KEY = '__zintrustQueueMeta';

type QueueMeta = {
  deduplicationId?: string;
  releaseAfter?: AdvancedJobOptions['deduplication'] extends { releaseAfter?: infer T }
    ? T
    : unknown;
  uniqueId?: string;
};

function shouldAttachReleaseAfterMeta(options: AdvancedJobOptions): boolean {
  if (options.deduplication?.releaseAfter === undefined) return false;
  return typeof options.deduplication.releaseAfter !== 'number';
}

function attachQueueMeta(
  payload: BullMQPayload,
  options: AdvancedJobOptions
): { payload: BullMQPayload; metaAttached: boolean } {
  if (!shouldAttachReleaseAfterMeta(options)) {
    return { payload, metaAttached: false };
  }

  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return { payload, metaAttached: false };
  }

  const meta: QueueMeta = {
    deduplicationId: options.deduplication?.id,
    releaseAfter: options.deduplication?.releaseAfter,
    uniqueId: options.uniqueId,
  };

  return {
    payload: {
      ...payload,
      [QUEUE_META_KEY]: meta,
    },
    metaAttached: true,
  };
}

/**
 * Handle deduplication logic
 */
async function handleDeduplicationLogic(
  options: AdvancedJobOptions,
  lockProvider: LockProvider,
  name: string,
  startTime: number
): Promise<string | null> {
  if (!options.deduplication) {
    return null;
  }

  const deduplicationResult = await handleDeduplication(options.deduplication, lockProvider);

  if (deduplicationResult.deduplicated) {
    Logger.info('Job deduplicated', {
      queueName: name,
      deduplicationId: options.deduplication.id,
      duration: Date.now() - startTime,
    });

    return deduplicationResult.lockId ?? ZintrustLang.DEDUPLICATED;
  }

  // Handle releaseAfter (numeric delay)
  if (
    options.deduplication?.releaseAfter !== undefined &&
    typeof options.deduplication.releaseAfter === 'number' &&
    deduplicationResult.lockId !== null &&
    deduplicationResult.lockId !== undefined &&
    deduplicationResult.lockId !== ''
  ) {
    const delay = options.deduplication.releaseAfter;
    // lockId from handleDeduplication (via acquire) already has prefix?
    // acquire returns lock.key which INCLUDES prefix.
    // releaseLock() calls lockProvider.status(key) which ADDS prefix.
    // So if we pass lockId (with prefix) to releaseLock, lockProvider.status will double prefix?
    // Let's check LockProvider.ts.
    // acquire: lockKey = `${prefix}${key}`. Returns lock.key = lockKey.
    // releaseLock (AdvancedQueue): calls lockProvider.status(key).
    // lockProvider.status: lockKey = `${prefix}${key}`.
    // So releaseLock expects 'id' (without prefix).
    // deduplicationResult.lockId is lock.key (WITH prefix).
    // deduplicationResult.id is the original ID.
    const lockId = options.deduplication.id; // Use the original ID

    // Create timeout with proper cleanup tracking
    // Using unref() to prevent blocking process exit
    // eslint-disable-next-line no-restricted-syntax
    const timeoutId = setTimeout(async () => {
      try {
        await releaseLock(lockId, lockProvider);
        Logger.debug('Released lock after delay', { lockId, delay });
      } catch (error) {
        Logger.error('Failed to release lock after delay', { lockId, error });
      }
    }, delay);

    // Prevent Node.js from keeping the event loop alive
    timeoutId.unref();
  }

  // Store lock reference for manual release info
  if (
    deduplicationResult.lockId !== null &&
    deduplicationResult.lockId !== undefined &&
    deduplicationResult.lockId !== ''
  ) {
    // In real implementation, this would be stored for later reference
    Logger.debug('Lock created for job', {
      lockId: deduplicationResult.lockId,
      deduplicationId: options.deduplication.id,
    });
  }

  return null;
}

/**
 * Enqueue a job with advanced deduplication options
 */
async function enqueueWithDeduplication(
  name: string,
  payload: BullMQPayload,
  options: AdvancedJobOptions,
  defaultLockProvider: LockProvider
): Promise<string> {
  const startTime = Date.now();

  try {
    // Handle uniqueId validation
    validateUniqueIdOptions(options);
    validateDeduplicationOptions(options);

    // Determine lock provider (uniqueVia override)
    let lockProvider = defaultLockProvider;
    if (options.uniqueVia !== null && options.uniqueVia !== undefined && options.uniqueVia !== '') {
      const customProvider = getLockProvider(options.uniqueVia);
      if (!customProvider) {
        throw createValidationError(`Lock provider not found: ${options.uniqueVia}`);
      }
      lockProvider = customProvider;
    }

    // Handle deduplication
    const deduplicationResult = await handleDeduplicationLogic(
      options,
      lockProvider,
      name,
      startTime
    );
    if (deduplicationResult !== null) {
      return deduplicationResult;
    }

    const { payload: payloadToSend, metaAttached } = attachQueueMeta(payload, options);

    if (!metaAttached && shouldAttachReleaseAfterMeta(options)) {
      Logger.warn(
        'releaseAfter condition metadata could not be attached; payload is not an object',
        {
          queueName: name,
          releaseAfter: options.deduplication?.releaseAfter,
        }
      );
    }

    // Enqueue the job using existing queue system
    const jobId = await Queue.enqueue(name, payloadToSend);

    Logger.info('Job enqueued successfully', {
      queueName: name,
      jobId,
      uniqueId: options.uniqueId,
      duration: Date.now() - startTime,
    });

    return jobId;
  } catch (error) {
    Logger.error('Failed to enqueue job', {
      queueName: name,
      uniqueId: options.uniqueId,
      error,
    });
    throw error;
  }
}

/**
 * Release a lock by key
 */
async function releaseLock(key: string, lockProvider: LockProvider): Promise<void> {
  try {
    const lockStatus = await lockProvider.status(key);
    if (!lockStatus.exists) {
      Logger.warn('Attempted to release non-existent lock', { key });
      return;
    }

    // Create lock object for release
    const lock = {
      key,
      ttl: lockStatus.ttl ?? 0,
      acquired: true,
      expires: lockStatus.expires ?? new Date(),
    };

    await lockProvider.release(lock);
    Logger.info('Lock released successfully', { key });
  } catch (error) {
    Logger.error('Failed to release lock', { key, error });
    throw error;
  }
}

/**
 * Extend a lock's TTL
 */
async function extendLock(key: string, ttl: number, lockProvider: LockProvider): Promise<boolean> {
  try {
    const lockStatus = await lockProvider.status(key);
    if (!lockStatus.exists) {
      Logger.warn('Attempted to extend non-existent lock', { key });
      return false;
    }

    // Create lock object for extension
    const lock = {
      key,
      ttl: lockStatus.ttl ?? 0,
      acquired: true,
      expires: lockStatus.expires ?? new Date(),
    };

    const extended = await lockProvider.extend(lock, ttl);

    if (extended) {
      Logger.info('Lock extended successfully', { key, ttl });
    } else {
      Logger.warn('Failed to extend lock', { key, ttl });
    }

    return extended;
  } catch (error) {
    Logger.error('Error extending lock', { key, ttl, error });
    return false;
  }
}

/**
 * Validate unique ID format and check for potential issues
 */
function validateUniqueId(uniqueId: string): { valid: boolean; reason?: string } {
  if (!uniqueId || typeof uniqueId !== 'string') {
    return { valid: false, reason: 'uniqueId must be a non-empty string' };
  }

  if (uniqueId.length > 255) {
    return { valid: false, reason: 'uniqueId must be less than 255 characters' };
  }

  if (uniqueId.includes(' ') || uniqueId.includes('\n') || uniqueId.includes('\r')) {
    return { valid: false, reason: 'uniqueId cannot contain whitespace characters' };
  }

  // Check for invalid characters
  const invalidChars = /[<>:"\\|?*]/;
  if (invalidChars.test(uniqueId)) {
    return { valid: false, reason: 'uniqueId contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Handle deduplication logic
 */
async function handleDeduplication(
  deduplicationOptions: DeduplicationOptions, // DeduplicationOptions - using any to avoid circular import
  lockProvider: LockProvider
): Promise<JobResult> {
  const { id, ttl, replace } = deduplicationOptions;

  try {
    // Check if lock already exists
    const lockStatus = await lockProvider.status(id);

    if (lockStatus.exists) {
      if (replace === true) {
        // Replace existing lock
        const newLock = await lockProvider.acquire(id, { ttl });
        return {
          id,
          deduplicated: false,
          lockId: newLock.key,
          status: ZintrustLang.QUEUED,
        };
      } else {
        // Job is deduplicated
        return {
          id,
          deduplicated: true,
          status: ZintrustLang.DEDUPLICATED,
        };
      }
    }

    // Acquire new lock
    const lock = await lockProvider.acquire(id, { ttl });

    return {
      id,
      deduplicated: false,
      lockId: lock.key,
      status: ZintrustLang.QUEUED,
    };
  } catch (error) {
    Logger.error(`Deduplication handling failed`, { id, error });
    return {
      id,
      deduplicated: false,
      status: ZintrustLang.FAILED,
    };
  }
}
