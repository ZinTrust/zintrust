import { FeatureFlags } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import type { MySQLClient, PostgresClient } from '@zedgi/zedgi-client';
import { ZedgiRuntime } from './ZedgiRuntime.js';
import type { DatabaseAdapter, QueryResult, ZedgiDatabaseConfig } from './types.js';

type ZedgiSqlResult = {
  rows?: Record<string, unknown>[];
  rowCount?: number | null;
  fields?: unknown;
};

type TransactionState = {
  statements: Array<{ sql: string; params: unknown[] }>;
};

type AdapterState = {
  connected: boolean;
  transaction?: TransactionState;
};

const isReadStatement = (sql: string): boolean => {
  const normalized = sql.trim().replace(/^\/\*[\s\S]*?\*\//, '').trim().toLowerCase();
  return (
    normalized.startsWith('select') ||
    normalized.startsWith('show') ||
    normalized.startsWith('describe') ||
    normalized.startsWith('explain') ||
    /\breturning\b/i.test(sql)
  );
};

const nativeTypeOf = (driver: ZedgiDatabaseConfig['driver']): 'mysql' | 'postgresql' =>
  driver === 'mysql-zedgi' ? 'mysql' : 'postgresql';

const normalizeResult = (result: ZedgiSqlResult): QueryResult => {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const rowCount =
    typeof result.rowCount === 'number' && Number.isFinite(result.rowCount)
      ? result.rowCount
      : rows.length;
  return { rows, rowCount };
};

const requireConnected = (state: AdapterState): void => {
  if (!state.connected) {
    throw ErrorFactory.createConfigError('Zedgi database adapter is not connected');
  }
};

const recordOrThrow = (
  state: AdapterState,
  sql: string,
  parameters: unknown[]
): QueryResult | undefined => {
  const tx = state.transaction;
  if (tx === undefined) return undefined;
  if (isReadStatement(sql)) {
    throw ErrorFactory.createConfigError(
      'Zedgi transaction callbacks cannot read intermediate query results. Only write statements can be recorded and submitted as one Zedgi batch.'
    );
  }
  tx.statements.push({ sql, params: parameters });
  return { rows: [], rowCount: 0 };
};

const createAdapter = (config: ZedgiDatabaseConfig): DatabaseAdapter => {
  const state: AdapterState = { connected: false };
  const service = (): MySQLClient | PostgresClient => ZedgiRuntime.sql(config);
  const nativeType = nativeTypeOf(config.driver);

  const adapter: DatabaseAdapter = {
    async connect(): Promise<void> {
      ZedgiRuntime.initialize();
      state.connected = true;
    },

    async disconnect(): Promise<void> {
      state.connected = false;
    },

    async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
      requireConnected(state);
      const recorded = recordOrThrow(state, sql, parameters);
      if (recorded !== undefined) return recorded;
      return normalizeResult(await service().query(sql, parameters));
    },

    async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
      requireConnected(state);
      if (state.transaction !== undefined) {
        throw ErrorFactory.createConfigError(
          'Zedgi transaction callbacks cannot use queryOne because intermediate results are unavailable before the batch is submitted.'
        );
      }
      const result = await adapter.query(sql, parameters);
      return result.rows[0] ?? null;
    },

    async ping(): Promise<void> {
      requireConnected(state);
      await service().ping();
    },

    async transaction<T>(callback: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
      requireConnected(state);
      if (state.transaction !== undefined) {
        throw ErrorFactory.createConfigError('Nested Zedgi database transactions are not supported');
      }

      const tx: TransactionState = { statements: [] };
      state.transaction = tx;
      try {
        const result = await callback(adapter);
        if (tx.statements.length > 0) {
          await service().transaction(tx.statements);
        }
        return result;
      } catch (error) {
        throw ErrorFactory.createTryCatchError(`${nativeType} Zedgi transaction failed`, error);
      } finally {
        state.transaction = undefined;
      }
    },

    async rawQuery<T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> {
      if (!FeatureFlags.isRawQueryEnabled()) {
        throw ErrorFactory.createConfigError(
          'Raw SQL queries are disabled. Set USE_RAW_QRY=true environment variable to enable.'
        );
      }
      const result = await adapter.query(sql, parameters);
      return result.rows as T[];
    },

    getType(): string {
      return nativeType;
    },

    isConnected(): boolean {
      return state.connected;
    },

    getPlaceholder(index: number): string {
      return nativeType === 'postgresql' ? `$${index}` : '?';
    },
  };

  return adapter;
};

export const ZedgiDatabaseAdapter = Object.freeze({
  create(config: ZedgiDatabaseConfig): DatabaseAdapter {
    return createAdapter(config);
  },
});

export default ZedgiDatabaseAdapter;
