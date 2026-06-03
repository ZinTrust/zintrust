/**
 * Database Adapter Interface
 * Defines contract for different database implementations
 */

import type { SupportedDriver } from '@migrations/enum';

/**
 * Read-replication constraint for a D1 session.
 *
 * - `"first-primary"`: first query in the session goes to the primary
 *   (read-your-writes without a bookmark).
 * - `"first-unconstrained"`: first query may be served by any replica
 *   (lowest latency; tolerates slightly stale reads).
 * - any other `string`: an opaque D1 bookmark that resumes a prior session's
 *   consistency point.
 */
export type D1ReadConstraint = 'first-primary' | 'first-unconstrained' | (string & {});

/**
 * Bound statement shape shared by the primary binding and a session handle.
 */
export interface ID1BoundStatement {
  all<T = unknown>(): Promise<{
    results?: T[];
    success: boolean;
    error?: string;
    meta?: Record<string, unknown>;
  }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: Record<string, unknown> }>;
}

export interface ID1PreparedStatement {
  bind(...values: unknown[]): ID1BoundStatement;
}

/**
 * Minimal D1 Database interface for type safety.
 *
 * `withSession` is optional: it is present when the bound database has read
 * replication enabled. The driver tolerates its absence and falls back to
 * direct-to-primary execution.
 */
export interface ID1Database {
  prepare(sql: string): ID1PreparedStatement;
  withSession?(constraint?: D1ReadConstraint): ID1DatabaseSession;
}

/**
 * Session-scoped handle returned by `ID1Database.withSession`.
 *
 * Carries a bookmark representing a point in the database's history so reads
 * within the session observe sequential consistency.
 */
export interface ID1DatabaseSession {
  prepare(sql: string): ID1PreparedStatement;
  getBookmark(): string | null;
}

export interface DatabaseConfig {
  d1?: ID1Database;
  driver: SupportedDriver;
  database?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  synchronize?: boolean;
  logging?: boolean;
  readHosts?: string[];
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  lastInsertId?: string | number | bigint;
  /**
   * Read-replication routing metadata, when the driver exposes it (D1).
   * `servedByPrimary` is `true` when the query hit the primary, `false` when a
   * replica served it; `servedByRegion` is the replica/primary region code.
   */
  servedByPrimary?: boolean;
  servedByRegion?: string;
}

export interface IDatabaseAdapter {
  /**
   * Connect to database
   */
  connect(): Promise<void>;

  /**
   * Disconnect from database
   */
  disconnect(): Promise<void>;

  /**
   * Execute a query
   */
  query(sql: string, parameters: unknown[]): Promise<QueryResult>;

  /**
   * Execute a query and return first result
   */
  queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null>;

  /**
   * Lightweight connection probe.
   *
   * This should be safe to call from health/readiness endpoints.
   */
  ping(): Promise<void>;

  /**
   * Execute multiple queries in transaction
   */
  transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T>;

  /**
   * Execute raw SQL query (only available when USE_RAW_QRY=true)
   * WARNING: Bypasses QueryBuilder safety. Use parameterized queries.
   */
  rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]>;

  /**
   * Ensure the migrations tracking table exists.
   *
   * This intentionally lives on the adapter so higher-level framework code
   * doesn't embed DDL SQL.
   */
  ensureMigrationsTable?(): Promise<void>;

  /**
   * Best-effort schema reset for development workflows.
   *
   * For SQL databases, this typically means dropping user tables.
   */
  resetSchema?(): Promise<void>;

  /**
   * Run `fn` inside a read-replication session (D1 only).
   *
   * Every statement issued by `fn` is routed through a session-scoped handle so
   * reads observe sequential consistency. Returns the function result together
   * with the latest bookmark to persist and replay on the next request.
   *
   * Adapters without read-replication support leave this undefined; callers
   * should fall back to executing `fn` directly with a `null` bookmark.
   */
  runReadSession?<T>(
    constraint: D1ReadConstraint,
    fn: () => Promise<T>
  ): Promise<{ result: T; bookmark: string | null }>;

  /**
   * Get database type
   */
  getType(): SupportedDriver;

  /**
   * Check connection status
   */
  isConnected(): boolean;

  /**
   * Get placeholder for parameterized query
   */
  getPlaceholder(index: number): string;
}

/**
 * Base Adapter Utilities
 * Refactored to Functional Object pattern
 */
export const BaseAdapter = Object.freeze({
  normalizeReadValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    return value.trim().toLowerCase() === 'null' ? null : value;
  },

  normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, BaseAdapter.normalizeReadValue(value)])
    );
  },

  normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((row) => BaseAdapter.normalizeRow(row));
  },

  normalizeQueryResult<T extends QueryResult>(result: T): T {
    return {
      ...result,
      rows: BaseAdapter.normalizeRows(result.rows),
    };
  },

  /**
   * Sanitize parameter value
   */
  sanitize(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'string') {
      return `'${value.replaceAll("'", "''")}'`;
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    // Support BigInt explicitly to avoid JSON.stringify errors and driver issues
    if (typeof value === 'bigint') {
      return String(value);
    }
    // Dates should be passed as ISO strings
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    // Buffer / Uint8Array -> base64 string
    // Some DB adapters expect binary types; returning base64-encoded string is a safe default
    // and prevents JSON.stringify(BigInt) errors when objects include BigInt.
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return `'${value.toString('base64')}'`;
    }
    if (value instanceof Uint8Array) {
      return `'${Buffer.from(value).toString('base64')}'`;
    }

    // For objects, convert to JSON string representation
    return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  },

  /**
   * Build parameterized query (for adapters that need it)
   */
  buildParameterizedQuery(
    sql: string,
    parameters: unknown[],
    getPlaceholder: (index: number) => string = () => '?'
  ): { sql: string; parameters: unknown[] } {
    let paramIndex = 0;
    const processedSql = sql.replaceAll('?', () => {
      paramIndex++;
      return getPlaceholder(paramIndex);
    });

    return { sql: processedSql, parameters };
  },
});
