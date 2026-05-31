import { callZedgi } from './client.js';
import { createMysqlClient } from './mysql.js';
import { createPostgresClient } from './postgres.js';
import { createRedisClient } from './redis.js';
import type { ZedgiClient, ZedgiClientOptions, ZedgiServiceType } from './types.js';

export const createZedgiClient = (options: ZedgiClientOptions): ZedgiClient =>
  Object.freeze({
    redis: () => createRedisClient(options),
    postgres: () => createPostgresClient(options),
    mysql: () => createMysqlClient(options),
    call: <T = unknown>(service: ZedgiServiceType, method: string, payload?: Record<string, unknown>) =>
      callZedgi<T>(options, service, method, payload ?? {}),
  });

export { createRedisClient } from './redis.js';
export { createPostgresClient } from './postgres.js';
export { createMysqlClient } from './mysql.js';
export { callZedgi } from './client.js';

export type {
  ZedgiClient,
  ZedgiClientOptions,
  ZedgiServiceType,
  RedisClient,
  PostgresClient,
  MySQLClient,
  QueryResult,
  MysqlQueryResult,
  TransactionStatement,
} from './types.js';

export const _ZEDGI_CLIENT_VERSION = '1.0.0';
