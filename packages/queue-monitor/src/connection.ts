import { createRedisConnection as createCoreRedisConnection } from '@zintrust/core';

export type { RedisConfig } from '@zintrust/core';

export const createRedisConnection = (
  ...args: Parameters<typeof createCoreRedisConnection>
): ReturnType<typeof createCoreRedisConnection> => createCoreRedisConnection(...args);
