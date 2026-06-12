/**
 * Cloudflare D1 Database Adapter
 */

import { Cloudflare } from '@config/cloudflare';
import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isObject } from '@helper/index';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
import { createReadSessionScope, openSession } from '@orm/adapters/D1ReadSession';
import type {
  D1ReadConstraint,
  DatabaseConfig,
  ID1Database,
  ID1DatabaseSession,
  IDatabaseAdapter,
  QueryResult,
} from '@orm/DatabaseAdapter';
import { BaseAdapter } from '@orm/DatabaseAdapter';
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
 * Extract read-replication routing metadata from a D1 result `meta`, when D1
 * exposes it. Returns an empty object when replication is off (no such fields).
 */
const extractServedBy = (
  value: unknown
): { servedByPrimary?: boolean; servedByRegion?: string } => {
  if (!isRecord(value)) return {};
  const out: { servedByPrimary?: boolean; servedByRegion?: string } = {};
  const primary = value['served_by_primary'];
  if (typeof primary === 'boolean') out.servedByPrimary = primary;
  const region = value['served_by_region'];
  if (typeof region === 'string' && region.trim() !== '') out.servedByRegion = region;
  return out;
};

/**
 * Get D1 binding from config or global environment
 */
function getD1Binding(_config: DatabaseConfig): ID1Database | null {
  return Cloudflare.getD1Binding(_config);
}

/**
 * Normalize D1 bind parameters to handle integer-to-TEXT column compatibility.
 *
 * Workerd's D1 API binds every JavaScript number parameter as a float64 (REAL).
 * When SQLite compares a REAL operand against a column with TEXT affinity,
 * the operand is cast using the column's affinity, producing '2.0' — which
 * never equals a stored '2' from PHP/PDO.
 *
 * This function converts integer-valued numbers to their canonical decimal
 * string representation to match PHP/PDO behavior for TEXT columns.
 *
 * @param parameters - The bind parameters array
 * @returns Normalized parameters with integers as strings
 */
function normalizeD1BindParameters(parameters: unknown[]): unknown[] {
  if (!Array.isArray(parameters)) return parameters;
  return parameters.map((value) =>
    typeof value === 'number' && Number.isInteger(value) ? String(value) : value
  );
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
    const sessionScope = createReadSessionScope();

    /**
     * Resolve the statement source for the current operation: the active
     * read-replication session handle when one is in scope, otherwise the raw
     * binding. Throws a config error when no binding is available.
     */
    const resolveExecutor = (): ID1Database | ID1DatabaseSession => {
      const active = sessionScope.peek();
      if (active !== undefined) return active.db;
      const db = getD1Binding(_config);
      if (db === null) {
        throw ErrorFactory.createConfigError('D1 database binding not found');
      }
      return db;
    };

    return {
      // eslint-disable-next-line @typescript-eslint/require-await
      async connect(): Promise<void> {
        connected = true;
        Logger.debug('✓ D1 connected');
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      async disconnect(): Promise<void> {
        connected = false;
        Logger.debug('✓ D1 disconnected');
      },

      async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = resolveExecutor();
        const normalizedParams = normalizeD1BindParameters(parameters);

        try {
          const stmt = db.prepare(sql);

          if (isMutatingSql(sql)) {
            const runResult = await stmt.bind(...normalizedParams).run();
            const runRecord = runResult as { meta?: unknown };
            const meta = extractMeta(runRecord.meta);
            return {
              rows: [],
              rowCount: meta.changes,
              lastInsertId: meta.lastInsertId,
              ...extractServedBy(runRecord.meta),
            };
          }

          const result = await stmt.bind(...normalizedParams).all();
          const rawResult = result as { results?: Record<string, unknown>[]; meta?: unknown };
          const rows = BaseAdapter.normalizeRows(rawResult.results ?? []);
          const metaValue = rawResult.meta;
          const meta = extractMeta(metaValue);
          return {
            rows,
            rowCount: rows.length > 0 ? rows.length : meta.changes,
            lastInsertId: meta.lastInsertId,
            ...extractServedBy(metaValue),
          };
        } catch (error) {
          throw ErrorFactory.createTryCatchError(`D1 query failed: ${sql}`, error);
        }
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = resolveExecutor();
        const normalizedParams = normalizeD1BindParameters(parameters);

        try {
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...normalizedParams).first<Record<string, unknown>>();
          return result === null ? null : BaseAdapter.normalizeRow(result);
        } catch (error) {
          throw ErrorFactory.createTryCatchError(`D1 queryOne failed: ${sql}`, error);
        }
      },

      async ping(): Promise<void> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = resolveExecutor();

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

      async runReadSession<T>(
        constraint: D1ReadConstraint,
        fn: () => Promise<T>
      ): Promise<{ result: T; bookmark: string | null }> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        const handle = openSession(db, constraint);
        if (handle === null) {
          // Replication not enabled on the binding: run directly against the
          // primary and report no bookmark.
          const result = await fn();
          return { result, bookmark: null };
        }

        const result = await sessionScope.run(handle, fn);
        return { result, bookmark: handle.getBookmark() };
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

        const db = resolveExecutor();
        const normalizedParams = normalizeD1BindParameters(parameters ?? []);

        try {
          Logger.warn(
            `Raw SQL Query executed: ${sql}`,
            Logger.withTraceSkipContext({ sql, parameters })
          );
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...normalizedParams).all<T>();
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
