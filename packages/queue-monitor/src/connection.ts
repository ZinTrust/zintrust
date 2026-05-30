import {
  createRedisConnection as createCoreRedisConnection,
  type RedisConfig,
} from '@zintrust/core/redis';

export type { RedisConfig };

export const createRedisConnection = (
  ...args: Parameters<typeof createCoreRedisConnection>
): ReturnType<typeof createCoreRedisConnection> => createCoreRedisConnection(...args);
