import { appConfig } from '@config/app';
import { Logger } from '@config/logger';

/**
 * Redis Key Management Utility
 *
 * Centralizes Redis key prefixing using appConfigObj.prefix
 * to prevent key collisions across different applications/environments
 */

const PREFIX = appConfig.prefix;

/**
 * Creates a prefixed Redis key
 * @param key - Original key name
 * @returns Prefixed key in format: {prefix}-{key}
 */
export function createRedisKey(key: string): string {
  if (!key) {
    Logger.warn('RedisKeyManager: Empty key provided');
    return PREFIX;
  }

  // Remove leading/trailing colons and ensure proper format
  // Using safe string operations instead of regex to prevent ReDoS
  let cleanKey = key;
  while (cleanKey.startsWith(':')) {
    cleanKey = cleanKey.slice(1);
  }
  while (cleanKey.endsWith(':')) {
    cleanKey = cleanKey.slice(0, -1);
  }
  return `${PREFIX}:${cleanKey}`;
}

/**
 * Plain-object Redis Key Manager
 * Uses module-scoped lazy variables and plain functions (no classes)
 */

// Lazy cache for prefixes
let _metricsPrefix: string | undefined;
let _healthPrefix: string | undefined;
let _workerPrefix: string | undefined;
let _queuePrefix: string | undefined;
let _bullmqPrefix: string | undefined;
let _queueLockPrefix: string | undefined;
let _cachePrefix: string | undefined;
let _sessionPrefix: string | undefined;

const getMetricsPrefix = (): string => {
  _metricsPrefix ??= `${PREFIX}_metrics:`;
  return _metricsPrefix;
};

const getHealthPrefix = (): string => {
  _healthPrefix ??= `${PREFIX}_health:`;
  return _healthPrefix;
};

const getWorkerPrefix = (): string => {
  _workerPrefix ??= `${PREFIX}_worker:`;
  return _workerPrefix;
};

const getQueuePrefix = (): string => {
  _queuePrefix ??= `${PREFIX}_queue:`;
  return _queuePrefix;
};

const getBullmqPrefix = (): string => {
  _bullmqPrefix ??= `${PREFIX}_bull:`;
  return _bullmqPrefix;
};

const getQueueLockPrefix = (): string => {
  _queueLockPrefix ??= `${PREFIX}_lock:`;
  return _queueLockPrefix;
};

const getCachePrefix = (): string => {
  _cachePrefix ??= `${PREFIX}_cache:`;
  return _cachePrefix;
};

const getSessionPrefix = (): string => {
  _sessionPrefix ??= `${PREFIX}_session:`;
  return _sessionPrefix;
};

export const RedisKeys = Object.freeze({
  get metricsPrefix() {
    return getMetricsPrefix();
  },
  get healthPrefix() {
    return getHealthPrefix();
  },
  get workerPrefix() {
    return getWorkerPrefix();
  },
  get queuePrefix() {
    return getQueuePrefix();
  },
  get bullmqPrefix() {
    return getBullmqPrefix();
  },
  get queueLockPrefix() {
    return getQueueLockPrefix();
  },
  get cachePrefix() {
    return getCachePrefix();
  },
  get sessionPrefix() {
    return getSessionPrefix();
  },
  createMetricsKey(workerName: string, metricType: string, granularity: string) {
    return `${getMetricsPrefix()}${workerName}:${metricType}:${granularity}`;
  },
  createHealthKey(workerName: string) {
    return `${getHealthPrefix()}${workerName}`;
  },
  createWorkerKey(workerName: string) {
    return `${getWorkerPrefix()}${workerName}`;
  },
  createQueueKey(queueName: string) {
    return `${getQueuePrefix()}${queueName}`;
  },
  createBullMQKey(queueName: string) {
    return `${getBullmqPrefix()}${queueName}`;
  },
  createQueueLockKey(lockName: string) {
    return `${getQueueLockPrefix()}${lockName}`;
  },
  createCacheKey(cacheKey: string) {
    return `${getCachePrefix()}${cacheKey}`;
  },
  createSessionKey(sessionId: string) {
    return `${getSessionPrefix()}${sessionId}`;
  },
  reset(): void {
    _metricsPrefix = undefined;
    _healthPrefix = undefined;
    _workerPrefix = undefined;
    _queuePrefix = undefined;
    _bullmqPrefix = undefined;
    _queueLockPrefix = undefined;
    _cachePrefix = undefined;
    _sessionPrefix = undefined;
  },
});

// Note: Legacy helpers removed. Use `RedisKeys` APIs directly.

/**
 * Extracts original key from prefixed key
 * @param prefixedKey - Full prefixed key
 * @returns Original key without prefix
 */
export function extractOriginalKey(prefixedKey: string): string {
  if (!prefixedKey.startsWith(`${PREFIX}:`)) {
    return prefixedKey;
  }

  return prefixedKey.substring(`${PREFIX}:`.length);
}

/**
 * Checks if a key belongs to this application
 * @param key - Redis key to check
 * @returns True if key belongs to this application
 */
export function isAppKey(key: string): boolean {
  return key.startsWith(`${PREFIX}:`);
}

/**
 * Gets the current prefix
 * @returns Current application prefix
 */
export function getPrefix(): string {
  return PREFIX;
}

export const getBullMQSafeQueueName = (): string => {
  return PREFIX;
};

// Export types for better TypeScript support
export type RedisKeyType = 'queue' | 'bullmq' | 'worker' | 'session' | 'cache' | 'custom';

/**
 * Creates a prefixed key based on type (legacy function)
 * @deprecated Use RedisKeys methods directly
 * @param type - Type of key
 * @param key - Original key
 * @returns Prefixed key
 */
export function createKeyByType(type: RedisKeyType, key: string): string {
  switch (type) {
    case 'queue':
      return RedisKeys.createQueueKey(key);
    case 'bullmq':
      return RedisKeys.createBullMQKey(key);
    case 'worker':
      return RedisKeys.createWorkerKey(key);
    case 'session':
      return RedisKeys.createSessionKey(key);
    case 'cache':
      return RedisKeys.createCacheKey(key);
    case 'custom':
      return createRedisKey(key);
    default:
      return createRedisKey(key);
  }
}
