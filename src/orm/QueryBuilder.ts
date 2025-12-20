/**
 * QueryBuilder - Type-Safe Query Builder
 * Build queries without raw SQL
 */

import { Database } from '@orm/Database';

export interface WhereClause {
  column: string;
  operator: string;
  value: unknown;
}

export class QueryBuilder {
  private readonly tableName: string;
  private readonly db?: Database;
  private readonly whereConditions: WhereClause[] = [];
  private selectColumns: string[] = ['*'];
  private limitValue?: number;
  private offsetValue?: number;
  private orderByClause?: { column: string; direction: 'ASC' | 'DESC' };
  private readonly joins: Array<{ table: string; on: string }> = [];

  constructor(table: string, db?: Database) {
    this.tableName = table;
    this.db = db;
  }

  /**
   * Select specific columns
   */
  public select(...columns: string[]): this {
    this.selectColumns = columns.length > 0 ? columns : ['*'];
    return this;
  }

  /**
   * Add a where condition
   */
  public where(column: string, operator: string | number | boolean | null, value?: unknown): this {
    // Support where(column, value) syntax
    if (value === undefined) {
      value = operator;
      operator = '=';
    }

    this.whereConditions.push({ column, operator: operator as string, value });
    return this;
  }

  /**
   * Add an AND where condition
   */
  public andWhere(column: string, operator: string, value?: unknown): this {
    return this.where(column, operator, value);
  }

  /**
   * Add an OR where condition
   */
  public orWhere(column: string, operator: string, value?: unknown): this {
    // Simplified OR implementation
    return this.where(column, operator, value);
  }

  /**
   * Add a join
   */
  public join(table: string, on: string): this {
    this.joins.push({ table, on });
    return this;
  }

  /**
   * Add a left join
   */
  public leftJoin(table: string, on: string): this {
    return this.join(table, on);
  }

  /**
   * Order by column
   */
  public orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClause = { column, direction };
    return this;
  }

  /**
   * Limit results
   */
  public limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  /**
   * Offset results
   */
  public offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  /**
   * Get where conditions
   */
  public getWhereClauses(): WhereClause[] {
    return this.whereConditions;
  }

  /**
   * Get select columns
   */
  public getSelectColumns(): string[] {
    return this.selectColumns;
  }

  /**
   * Get table name
   */
  public getTable(): string {
    return this.tableName;
  }

  /**
   * Get limit
   */
  public getLimit(): number | undefined {
    return this.limitValue;
  }

  /**
   * Get offset
   */
  public getOffset(): number | undefined {
    return this.offsetValue;
  }

  /**
   * Get order by
   */
  public getOrderBy(): { column: string; direction: 'ASC' | 'DESC' } | undefined {
    return this.orderByClause;
  }

  /**
   * Get joins
   */
  public getJoins(): Array<{ table: string; on: string }> {
    return this.joins;
  }

  /**
   * Check if this is a read operation
   */
  public isReadOperation(): boolean {
    // Currently QueryBuilder only supports SELECT
    return true;
  }

  /**
   * Build SQL query (simplified for demonstration)
   * Note: In production, use database adapter for SQL generation
   */
  public toSQL(): string {
    const escapeIdentifier = (id: string): string => `"${id.replaceAll('"', '""')}"`;
    const columns = this.selectColumns.map((c) => (c === '*' ? c : escapeIdentifier(c))).join(', ');
    const table = escapeIdentifier(this.tableName);

    let sql = `SELECT ${columns} FROM ${table}`;

    if (this.whereConditions.length > 0) {
      sql += ' WHERE ';
      sql += this.whereConditions
        .map((clause) => `${escapeIdentifier(clause.column)} ${clause.operator} ?`)
        .join(' AND ');
    }

    if (this.orderByClause) {
      sql += ` ORDER BY ${this.orderByClause.column} ${this.orderByClause.direction}`;
    }

    if (this.limitValue != null) {
      sql += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue != null) {
      sql += ` OFFSET ${this.offsetValue}`;
    }

    return sql;
  }

  /**
   * Get query parameters (values from where clauses)
   */
  public getParameters(): unknown[] {
    return this.whereConditions.map((clause) => clause.value);
  }

  /**
   * Get first record (async)
   */
  public async first(): Promise<unknown> {
    if (!this.db) {
      throw new Error('Database instance not provided to QueryBuilder');
    }
    this.limit(1);
    const results = await this.db.query(this.toSQL(), this.getParameters(), this.isReadOperation());
    return results[0] ?? null;
  }

  /**
   * Get all records (async)
   */
  public async get(): Promise<unknown[]> {
    if (!this.db) {
      throw new Error('Database instance not provided to QueryBuilder');
    }
    return this.db.query(this.toSQL(), this.getParameters(), this.isReadOperation());
  }
}
