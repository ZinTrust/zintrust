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
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed === '' ? fallback : trimmed;
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
  secret: readString(
    'REDIS_RPC_SECRET',
    readString('REDIS_PROXY_SECRET', readString('APP_KEY', ''))
  ),
  prefix: readString('REDIS_RPC_BULLMQ_PREFIX', readString('BULLMQ_PREFIX', 'bull')),
});

/**
 * Reads custom HTTP headers from environment variables using the same convention
 * as all other ZinTrust proxies (SqlProxyAdapterUtils.parseCustomHeadersFromEnv).
 *
 * Pattern: REDIS_RPC_PROXY_HEADERS_{HEADER_NAME}=value
 *   Underscores in HEADER_NAME are converted to hyphens.
 *
 * Examples:
 *   REDIS_RPC_PROXY_HEADERS_X_Tenant_Id=abc        → x-tenant-id: abc
 *   REDIS_RPC_PROXY_HEADERS_Authorization=Bearer t  → authorization: Bearer t
 *   REDIS_RPC_PROXY_HEADERS_X_Trace_Id=xyz          → x-trace-id: xyz
 *
 * Returns undefined when no matching env vars are set (no overhead).
 */
export const rpcClientHeaders = (): Record<string, string> | undefined => {
  const PREFIX = 'REDIS_RPC_PROXY_HEADERS_';
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(PREFIX) && typeof value === 'string' && value.trim() !== '') {
      headers[key.slice(PREFIX.length).replaceAll('_', '-')] = value.trim();
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
};
