/**
 * Database Adapter Interface
 * Defines contract for different database implementations
 */

export interface DatabaseConfig {
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

export interface DatabaseAdapter {
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
   * Execute multiple queries in transaction
   */
  transaction<T>(callback: (adapter: DatabaseAdapter) => Promise<T>): Promise<T>;

  /**
   * Get database type
   */
  getType(): string;

  /**
   * Check connection status
   */
  isConnected(): boolean;
}

export abstract class BaseAdapter implements DatabaseAdapter {
  protected config: DatabaseConfig;
  protected connected = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract query(sql: string, parameters: unknown[]): Promise<QueryResult>;
  abstract queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null>;
  abstract transaction<T>(callback: (adapter: DatabaseAdapter) => Promise<T>): Promise<T>;

  public getType(): string {
    return this.config.driver;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Sanitize parameter value
   */
  protected sanitize(value: unknown): string {
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
  }

  /**
   * Build parameterized query (for adapters that need it)
   */
  protected buildParameterizedQuery(
    sql: string,
    parameters: unknown[]
  ): { sql: string; parameters: unknown[] } {
    let paramIndex = 0;
    const processedSql = sql.replaceAll('?', () => {
      paramIndex++;
      return this.getParameterPlaceholder(paramIndex);
    });

    return { sql: processedSql, parameters };
  }

  /**
   * Get database-specific parameter placeholder
   */
  protected getParameterPlaceholder(_index: number): string {
    return '?';
  }
}
