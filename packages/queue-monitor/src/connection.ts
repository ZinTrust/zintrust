import IORedis from 'ioredis';

export type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db?: number;
};

export const createRedisConnection = (config: RedisConfig, maxRetries = 3): IORedis => {
  return new IORedis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy: (times: number): number | null => {
      if (times > maxRetries) return null;
      return Math.min(times * 50, 2000);
    },
  });
};
