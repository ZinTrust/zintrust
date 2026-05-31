import { isNull } from '@zintrust/core/helper';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: process.env.REDIS_RPC_ENV_FILE || '.env' });

export type RedisRpcRedisOptions = Readonly<{
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
}>;

export type RedisRpcServerOptions = Readonly<{
  host: string;
  port: number;
  secret: string;
  prefix: string;
}>;

export const readString = (key: string, fallback = ''): string => {
  const value = process.env[key];
  return typeof value === 'string' && !isNull(value.trim() ) ? value.trim() : fallback;
};

export const readInt = (key: string, fallback: number): number => {
  const parsed = Number.parseInt(readString(key, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const redisConnectionOptions = (): RedisRpcRedisOptions => ({
  host: readString('REDIS_RPC_REDIS_HOST', readString('REDIS_HOST', '127.0.0.1')),
  port: readInt('REDIS_RPC_REDIS_PORT', readInt('REDIS_PORT', 6379)),
  password: readString('REDIS_RPC_REDIS_PASSWORD', readString('REDIS_PASSWORD', '')) || undefined,
  db: readInt('REDIS_RPC_REDIS_DB', readInt('REDIS_QUEUE_DB', readInt('REDIS_DB', 0))),
  maxRetriesPerRequest: null,
});

export const rpcServerOptions = (): RedisRpcServerOptions => ({
  host: readString('REDIS_RPC_HOST', '127.0.0.1'),
  port: readInt('REDIS_RPC_PORT', 8794),
  secret: readString('REDIS_RPC_SECRET', readString('REDIS_PROXY_SECRET', readString('APP_KEY', ''))),
  prefix: readString('REDIS_RPC_BULLMQ_PREFIX', readString('BULLMQ_PREFIX', 'bull')),
});
