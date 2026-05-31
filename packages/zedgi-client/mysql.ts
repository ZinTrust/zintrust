import { callZedgi } from './client.js';
import type { MysqlQueryResult, MySQLClient, TransactionStatement, ZedgiClientOptions } from './types.js';

export const createMysqlClient = (options: ZedgiClientOptions): MySQLClient =>
  Object.freeze({
    ping: () =>
      callZedgi<{ pong: boolean }>(options, 'mysql', 'ping'),

    query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      callZedgi<MysqlQueryResult<T>>(options, 'mysql', 'query', { sql, params: params ?? [] }),

    transaction: (statements: TransactionStatement[]) =>
      callZedgi<MysqlQueryResult[]>(options, 'mysql', 'transaction', { statements }),
  });
