/**
 * ZinTrust Redis - Redis key management utilities
 * Contains Redis key helpers and BullMQ-safe queue name generation
 */

// Redis key manager
export {
  createRedisKey,
  extractOriginalKey,
  getBullMQSafeQueueName,
  getPrefix,
  isAppKey,
  RedisKeys,
  type RedisKeyType,
} from '@tools/redis/RedisKeyManager';
