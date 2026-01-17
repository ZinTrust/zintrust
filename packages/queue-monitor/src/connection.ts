import { Logger } from '@zintrust/core';
import IORedis from 'ioredis';

export type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db?: number;
};

export const createRedisConnection = (config: RedisConfig, maxRetries = 3): IORedis => {
  const client = new IORedis({
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

  if (typeof client.on === 'function') {
    client.on('error', (err: Error) => {
      try {
        if (err && err.message && err.message.includes('NOAUTH')) {
          // Provide a clearer hint for missing auth to help debugging

          Logger.error(
            '[queue-monitor][redis] NOAUTH: Redis requires authentication. Provide `password` in the queue-monitor redis config.'
          );
        }
        // eslint-disable-next-line no-console
        console.error('[queue-monitor][redis] Redis error:', err.message || err);
      } catch (error_) {
        Logger.error('_e :', error_);
        // swallow any logger errors to avoid crashing on error handler
      }
    });
  }

  return client;
};
