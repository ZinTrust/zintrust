export { BullMQRedisQueue } from './BullMQRedisQueue';
export {
  createRedisPublishClient,
  resetPublishClient,
  type RedisPublishClient,
} from './RedisPublishClient';

export type { QueueMessage } from '@zintrust/core';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_QUEUE_REDIS_VERSION = '0.1.15';
export const _ZINTRUST_QUEUE_REDIS_BUILD_DATE = '__BUILD_DATE__';
