/**
 * Cloudflare D1 Database Adapter
 */

import { Cloudflare } from '@config/cloudflare';
import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isObject } from '@helper/index';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
import type {
  DatabaseConfig,
  ID1Database,
  IDatabaseAdapter,
  QueryResult,
} from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';

const isRecord = (value: unknown): value is Record<string, unknown> => isObject(value);

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
};

const toInsertId = (value: unknown): string | number | bigint | undefined => {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') {
    return value;
  }
  return undefined;
};

const isMutatingSql = (sql: string): boolean => {
  const normalized = sql.trimStart().toLowerCase();
  return (
    normalized.startsWith('insert') ||
    normalized.startsWith('update') ||
    normalized.startsWith('delete') ||
    normalized.startsWith('create') ||
    normalized.startsWith('drop') ||
    normalized.startsWith('alter') ||
    normalized.startsWith('replace')
  );
};

const extractMeta = (
  value: unknown
): { changes: number; lastInsertId?: string | number | bigint } => {
  if (!isRecord(value)) return { changes: 0 };

  const changes =
    toNumber(value['changes']) ??
    toNumber(value['rows_written']) ??
    toNumber(value['rows_read']) ??
    0;

  const lastInsertId =
    toInsertId(value['lastRowId']) ??
    toInsertId(value['last_row_id']) ??
    toInsertId(value['lastInsertRowid']) ??
    toInsertId(value['last_insert_rowid']);

  return { changes, lastInsertId };
};

/**
 * Get D1 binding from config or global environment
 */
function getD1Binding(_config: DatabaseConfig): ID1Database | null {
  return Cloudflare.getD1Binding(_config);
}

/**
 * D1 adapter implementation
 */
export const D1Adapter = Object.freeze({
  /**
   * Create a new D1 adapter instance
   */
  // eslint-disable-next-line max-lines-per-function
  create(_config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;

    return {
      // eslint-disable-next-line @typescript-eslint/require-await
      async connect(): Promise<void> {
        connected = true;
        Logger.info('✓ D1 connected');
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ D1 disconnected');
      },

      async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        try {
          const stmt = db.prepare(sql);

          if (isMutatingSql(sql)) {
            const runResult = await stmt.bind(...parameters).run();
            const runRecord = runResult as { meta?: unknown };
            const meta = extractMeta(runRecord.meta);
            return {
              rows: [],
              rowCount: meta.changes,
              lastInsertId: meta.lastInsertId,
            };
          }

          const result = await stmt.bind(...parameters).all();
          const rawResult = result as { results?: Record<string, unknown>[]; meta?: unknown };
          const rows = rawResult.results ?? [];
          const metaValue = rawResult.meta;
          const meta = extractMeta(metaValue);
          return {
            rows,
            rowCount: rows.length > 0 ? rows.length : meta.changes,
            lastInsertId: meta.lastInsertId,
          };
        } catch (error) {
          throw ErrorFactory.createTryCatchError(`D1 query failed: ${sql}`, error);
        }
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        try {
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...parameters).first<Record<string, unknown>>();
          return result ?? null;
        } catch (error) {
          throw ErrorFactory.createTryCatchError(`D1 queryOne failed: ${sql}`, error);
        }
      },

      async ping(): Promise<void> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        try {
          // Use a minimal, side-effect-free query.
          await db.prepare(QueryBuilder.create('').select('1').toSQL()).bind().first();
        } catch (error) {
          throw ErrorFactory.createTryCatchError('D1 ping failed', error);
        }
      },

      async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        try {
          const result = await callback(this);
          return result;
        } catch (error) {
          throw ErrorFactory.createTryCatchError('Transaction failed', error);
        }
      },

      getType(): SupportedDriver {
        return AdaptersEnum.d1;
      },
      isConnected(): boolean {
        return connected;
      },
      async rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> {
        if (!FeatureFlags.isRawQueryEnabled()) {
          throw ErrorFactory.createConfigError('Raw SQL queries are disabled');
        }

        if (!connected) {
          throw ErrorFactory.createConnectionError('Database not connected');
        }

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        try {
          Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...(parameters ?? [])).all<T>();
          return (result.results as T[]) ?? [];
        } catch (error) {
          throw ErrorFactory.createTryCatchError(`Raw SQL query failed: ${sql}`, error);
        }
      },
      getPlaceholder(_index: number): string {
        return '?';
      },
    };
  },
});

export default D1Adapter;
