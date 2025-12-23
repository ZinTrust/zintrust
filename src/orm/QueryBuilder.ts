/**
 * QueryBuilder - Type-Safe Query Builder
 * Build queries without raw SQL
 */

import { DatabaseError } from '@/exceptions/ZintrustError';
import { IDatabase } from '@orm/Database';

export interface WhereClause {
  column: string;
  operator: string;
  value: unknown;
}

export interface IQueryBuilder {
  select(...columns: string[]): IQueryBuilder;
  where(column: string, operator: string | number | boolean | null, value?: unknown): IQueryBuilder;
  andWhere(column: string, operator: string, value?: unknown): IQueryBuilder;
  orWhere(column: string, operator: string, value?: unknown): IQueryBuilder;
  join(table: string, on: string): IQueryBuilder;
  leftJoin(table: string, on: string): IQueryBuilder;
  orderBy(column: string, direction?: 'ASC' | 'DESC'): IQueryBuilder;
  limit(count: number): IQueryBuilder;
  offset(count: number): IQueryBuilder;
  getWhereClauses(): WhereClause[];
  getSelectColumns(): string[];
  getTable(): string;
  getLimit(): number | undefined;
  getOffset(): number | undefined;
  getOrderBy(): { column: string; direction: 'ASC' | 'DESC' } | undefined;
  getJoins(): Array<{ table: string; on: string }>;
  isReadOperation(): boolean;
  toSQL(): string;
  getParameters(): unknown[];
  first<T>(): Promise<T | null>;
  get<T>(): Promise<T[]>;
}

interface QueryState {
  tableName: string;
  whereConditions: WhereClause[];
  selectColumns: string[];
  limitValue?: number;
  offsetValue?: number;
  orderByClause?: { column: string; direction: 'ASC' | 'DESC' };
  joins: Array<{ table: string; on: string }>;
}

/**
 * Escape SQL identifier
 */
const escapeIdentifier = (id: string): string => `"${id.replaceAll('"', '""')}"`;

/**
 * Build SELECT clause
 */
const buildSelectClause = (columns: string[]): string =>
  columns.map((c) => (c === '*' ? c : escapeIdentifier(c))).join(', ');

/**
 * Build WHERE clause
 */
const buildWhereClause = (conditions: WhereClause[]): string => {
  if (conditions.length === 0) return '';
  const sql = conditions
    .map((clause) => `${escapeIdentifier(clause.column)} ${clause.operator} ?`)
    .join(' AND ');
  return ` WHERE ${sql}`;
};

/**
 * Build ORDER BY clause
 */
const buildOrderByClause = (orderBy?: { column: string; direction: 'ASC' | 'DESC' }): string => {
  if (!orderBy) return '';
  return ` ORDER BY ${orderBy.column} ${orderBy.direction}`;
};

/**
 * Build LIMIT and OFFSET clause
 */
const buildLimitOffsetClause = (limit?: number, offset?: number): string => {
  let sql = '';
  if (limit !== undefined && limit !== null) sql += ` LIMIT ${limit}`;
  if (offset !== undefined && offset !== null) sql += ` OFFSET ${offset}`;
  return sql;
};

/**
 * Execute query and return first result
 */
async function executeFirst<T>(builder: IQueryBuilder, db?: IDatabase): Promise<T | null> {
  if (!db) throw new DatabaseError('Database instance not provided to QueryBuilder');
  builder.limit(1);
  const results = (await db.query(
    builder.toSQL(),
    builder.getParameters(),
    builder.isReadOperation()
  )) as T[];
  return results[0] ?? null;
}

/**
 * Execute query and return all results
 */
async function executeGet<T>(builder: IQueryBuilder, db?: IDatabase): Promise<T[]> {
  if (!db) throw new DatabaseError('Database instance not provided to QueryBuilder');
  return (await db.query(
    builder.toSQL(),
    builder.getParameters(),
    builder.isReadOperation()
  )) as T[];
}

/**
 * Create the builder object
 */
function createBuilder(state: QueryState, db?: IDatabase): IQueryBuilder {
  const builder: IQueryBuilder = {
    select: (...columns) => {
      state.selectColumns = columns.length > 0 ? columns : ['*'];
      return builder;
    },
    where: (column, operator, value) => {
      if (value === undefined) {
        value = operator;
        operator = '=';
      }
      state.whereConditions.push({ column, operator: operator as string, value });
      return builder;
    },
    andWhere: (column, operator, value) => builder.where(column, operator, value),
    orWhere: (column, operator, value) => builder.where(column, operator, value),
    join: (tableJoin, on) => {
      state.joins.push({ table: tableJoin, on });
      return builder;
    },
    leftJoin: (tableJoin, on) => builder.join(tableJoin, on),
    orderBy: (column, direction = 'ASC') => {
      state.orderByClause = { column, direction };
      return builder;
    },
    limit: (count) => {
      state.limitValue = count;
      return builder;
    },
    offset: (count) => {
      state.offsetValue = count;
      return builder;
    },
    getWhereClauses: () => state.whereConditions,
    getSelectColumns: () => state.selectColumns,
    getTable: () => state.tableName,
    getLimit: () => state.limitValue,
    getOffset: () => state.offsetValue,
    getOrderBy: () => state.orderByClause,
    getJoins: () => state.joins,
    isReadOperation: () => true,
    toSQL: () => {
      const columns = buildSelectClause(state.selectColumns);
      const tableEscaped = escapeIdentifier(state.tableName);
      return `SELECT ${columns} FROM ${tableEscaped}${buildWhereClause(
        state.whereConditions
      )}${buildOrderByClause(state.orderByClause)}${buildLimitOffsetClause(
        state.limitValue,
        state.offsetValue
      )}`;
    },
    getParameters: () => state.whereConditions.map((clause) => clause.value),
    first: <T>() => executeFirst<T>(builder, db),
    get: <T>() => executeGet<T>(builder, db),
  };

  return builder;
}

/**
 * QueryBuilder - Type-Safe Query Builder
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const QueryBuilder = Object.freeze({
  /**
   * Create a new query builder instance
   */
  create(table: string, db?: IDatabase): IQueryBuilder {
    const state: QueryState = {
      tableName: table,
      whereConditions: [],
      selectColumns: ['*'],
      joins: [],
    };

    return createBuilder(state, db);
  },
});
