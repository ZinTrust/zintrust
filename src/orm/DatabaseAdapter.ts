/**
 * Database Adapter Interface
 * Defines contract for different database implementations
 */

/**
 * Minimal D1 Database interface for type safety
 */
export interface ID1Database {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[]; success: boolean; error?: string }>;
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<{ success: boolean; error?: string }>;
    };
  };
}

export interface DatabaseConfig {
  d1?: ID1Database;
  driver: 'sqlite' | 'postgresql' | 'mysql' | 'sqlserver' | 'd1';
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
   * Get database type
   */
  getType(): string;

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
    if (typeof value === 'number') {
      return String(value);
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
