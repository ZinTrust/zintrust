import { appConfig } from '@config/app';
import { Logger } from '@zintrust/core';

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
 * Creates a prefixed queue key
 * @param queueName - Original queue name
 * @returns Prefixed queue key
 */
export function createQueueKey(queueName: string): string {
  return createRedisKey(`queue:${queueName}`);
}

/**
 * Creates a prefixed BullMQ queue key
 * BullMQ uses specific patterns like 'bull:queue-name'
 * @param queueName - Original queue name
 * @returns Prefixed BullMQ queue key
 */
export function createBullMQKey(queueName: string): string {
  return createRedisKey(`bull:${queueName}`);
}

/**
 * Creates a prefixed worker key
 * @param workerName - Original worker name
 * @returns Prefixed worker key
 */
export function createWorkerKey(workerName: string): string {
  return createRedisKey(`worker:${workerName}`);
}

/**
 * Creates a prefixed session key
 * @param sessionId - Session ID
 * @returns Prefixed session key
 */
export function createSessionKey(sessionId: string): string {
  return createRedisKey(`session:${sessionId}`);
}

/**
 * Creates a prefixed cache key
 * @param cacheKey - Cache key
 * @returns Prefixed cache key
 */
export function createCacheKey(cacheKey: string): string {
  return createRedisKey(`cache:${cacheKey}`);
}

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

// Export types for better TypeScript support
export type RedisKeyType = 'queue' | 'bullmq' | 'worker' | 'session' | 'cache' | 'custom';

/**
 * Creates a prefixed key based on type
 * @param type - Type of key
 * @param key - Original key
 * @returns Prefixed key
 */
export function createKeyByType(type: RedisKeyType, key: string): string {
  switch (type) {
    case 'queue':
      return createQueueKey(key);
    case 'bullmq':
      return createBullMQKey(key);
    case 'worker':
      return createWorkerKey(key);
    case 'session':
      return createSessionKey(key);
    case 'cache':
      return createCacheKey(key);
    case 'custom':
      return createRedisKey(key);
    default:
      return createRedisKey(key);
  }
}
