/**
 * ZinTrust Redis - Redis key management utilities
 * Contains Redis key helpers and BullMQ-safe queue name generation
 */

// Redis key manager
export {
  RedisKeys,
  createRedisKey,
  extractOriginalKey,
  getBullMQSafeQueueName,
  getPrefix,
  isAppKey,
  type RedisKeyType,
} from '@tools/redis/RedisKeyManager';

// Redis connection
export type { RedisConfig } from '@config/type';
export { createRedisConnection } from '@config/workers';
