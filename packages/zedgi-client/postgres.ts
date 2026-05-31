import { callZedgi } from './client.js';
import type { PostgresClient, QueryResult, TransactionStatement, ZedgiClientOptions } from './types.js';

export const createPostgresClient = (options: ZedgiClientOptions): PostgresClient =>
  Object.freeze({
    ping: () =>
      callZedgi<{ pong: boolean }>(options, 'postgres', 'ping'),

    query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      callZedgi<QueryResult<T>>(options, 'postgres', 'query', { sql, params: params ?? [] }),

    transaction: (statements: TransactionStatement[]) =>
      callZedgi<QueryResult[]>(options, 'postgres', 'transaction', { statements }),
  });
