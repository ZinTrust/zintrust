/**
 * QueryBuilder - Type-Safe Query Builder
 * Build queries without raw SQL
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
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

const SAFE_IDENTIFIER_PATH = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;

const assertSafeIdentifierPath = (id: string, label: string): void => {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw ErrorFactory.createDatabaseError(`Empty SQL identifier for ${label}`);
  }
  if (!SAFE_IDENTIFIER_PATH.test(trimmed)) {
    throw ErrorFactory.createDatabaseError(`Unsafe SQL identifier for ${label}`);
  }
};

const normalizeOrderDirection = (direction?: string): 'ASC' | 'DESC' => {
  if (direction === undefined || direction === null) return 'ASC';
  const trimmed = String(direction).trim();
  if (trimmed.length === 0) return 'ASC';
  const normalized = trimmed.toUpperCase();
  if (normalized === 'ASC' || normalized === 'DESC') return normalized;
  throw ErrorFactory.createDatabaseError('Unsafe ORDER BY direction');
};

const normalizeOperator = (operator: string): string => operator.trim().toUpperCase();

const ALLOWED_OPERATORS = new Set([
  '=',
  '!=',
  '<>',
  '<',
  '<=',
  '>',
  '>=',
  'LIKE',
  'NOT LIKE',
  'ILIKE',
  'NOT ILIKE',
  'IN',
  'NOT IN',
  'BETWEEN',
  'NOT BETWEEN',
  'IS',
  'IS NOT',
]);

const assertSafeOperator = (operator: string): string => {
  const normalized = normalizeOperator(operator);
  if (!ALLOWED_OPERATORS.has(normalized)) {
    throw ErrorFactory.createDatabaseError('Unsafe SQL operator');
  }
  return normalized;
};

const assertSafeLimitOffset = (value: number, label: string): void => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw ErrorFactory.createDatabaseError(`Unsafe ${label} value`);
  }
};

const isNumericLiteral = (value: string): boolean => {
  // Strict, injection-resistant numeric literal allow-list.
  // Allows: 0, 1, 1.5, 0001
  // Disallows: 1e3, 1;DROP, 1 as ok
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
};

/**
 * Build SELECT clause
 */
const buildSelectClause = (columns: string[]): string =>
  columns
    .map((c) => {
      if (c === '*') return c;
      if (isNumericLiteral(c)) return c;
      assertSafeIdentifierPath(c, 'select column');
      return escapeIdentifier(c);
    })
    .join(', ');

const compileWhere = (
  conditions: WhereClause[]
): {
  sql: string;
  parameters: unknown[];
} => {
  if (conditions.length === 0) return { sql: '', parameters: [] };

  const parameters: unknown[] = [];
  const clauses = conditions.map((clause) => {
    assertSafeIdentifierPath(clause.column, 'where column');
    const operator = assertSafeOperator(clause.operator);
    const columnSql = escapeIdentifier(clause.column);

    if (operator === 'IN' || operator === 'NOT IN') {
      if (!Array.isArray(clause.value) || clause.value.length === 0) {
        throw ErrorFactory.createDatabaseError('IN operator requires a non-empty array');
      }
      const values = clause.value as unknown[];
      const placeholders = values.map(() => '?').join(', ');
      for (const v of values) parameters.push(v);
      return `${columnSql} ${operator} (${placeholders})`;
    }

    if (operator === 'BETWEEN' || operator === 'NOT BETWEEN') {
      if (!Array.isArray(clause.value) || clause.value.length !== 2) {
        throw ErrorFactory.createDatabaseError('BETWEEN operator requires a 2-item array');
      }
      const range = clause.value as unknown[];
      parameters.push(range[0], range[1]);
      return `${columnSql} ${operator} ? AND ?`;
    }

    if (operator === 'IS' || operator === 'IS NOT') {
      if (clause.value === null || clause.value === undefined) {
        return `${columnSql} ${operator} NULL`;
      }
      parameters.push(clause.value);
      return `${columnSql} ${operator} ?`;
    }

    parameters.push(clause.value);
    return `${columnSql} ${operator} ?`;
  });

  return { sql: ` WHERE ${clauses.join(' AND ')}`, parameters };
};

/**
 * Build ORDER BY clause
 */
const buildOrderByClause = (orderBy?: { column: string; direction: 'ASC' | 'DESC' }): string => {
  if (!orderBy) return '';
  const col = orderBy.column.trim();
  if (!isNumericLiteral(col)) {
    assertSafeIdentifierPath(col, 'order by column');
  }
  const dir = normalizeOrderDirection(orderBy.direction);
  // Keep output unquoted for backwards compatibility; validation prevents injection.
  return ` ORDER BY ${col} ${dir}`;
};

/**
 * Build LIMIT and OFFSET clause
 */
const buildLimitOffsetClause = (limit?: number, offset?: number): string => {
  let sql = '';
  if (limit !== undefined && limit !== null) {
    assertSafeLimitOffset(limit, 'LIMIT');
    sql += ` LIMIT ${limit}`;
  }
  if (offset !== undefined && offset !== null) {
    assertSafeLimitOffset(offset, 'OFFSET');
    sql += ` OFFSET ${offset}`;
  }
  return sql;
};

const buildSelectQuery = (state: QueryState): { sql: string; parameters: unknown[] } => {
  if (state.tableName.length > 0) {
    assertSafeIdentifierPath(state.tableName, 'table name');
  }

  const columns = buildSelectClause(state.selectColumns);
  const fromClause = state.tableName.length > 0 ? ` FROM ${escapeIdentifier(state.tableName)}` : '';
  const where = compileWhere(state.whereConditions);
  const sql = `SELECT ${columns}${fromClause}${where.sql}${buildOrderByClause(state.orderByClause)}${buildLimitOffsetClause(
    state.limitValue,
    state.offsetValue
  )}`;
  return { sql, parameters: where.parameters };
};

const applyWhereCondition = (
  state: QueryState,
  column: string,
  operator: string | number | boolean | null,
  value?: unknown
): void => {
  const col = String(column).trim();
  assertSafeIdentifierPath(col, 'where column');

  let op: string;
  let val: unknown;

  // Shorthand: where('id', 123)
  if (value === undefined) {
    op = '=';
    val = operator;
  } else {
    if (typeof operator !== 'string') {
      throw ErrorFactory.createDatabaseError('Unsafe SQL operator');
    }
    op = assertSafeOperator(operator);
    val = value;
  }

  state.whereConditions.push({ column: col, operator: op, value: val });
};

const applyOrderByClause = (state: QueryState, column: string, direction?: string): void => {
  const col = String(column).trim();
  if (!isNumericLiteral(col)) {
    assertSafeIdentifierPath(col, 'order by column');
  }
  const dir = normalizeOrderDirection(direction);
  state.orderByClause = { column: col, direction: dir };
};

const applyLimit = (state: QueryState, count: number): void => {
  assertSafeLimitOffset(count, 'LIMIT');
  state.limitValue = count;
};

const applyOffset = (state: QueryState, count: number): void => {
  assertSafeLimitOffset(count, 'OFFSET');
  state.offsetValue = count;
};

/**
 * Execute query and return first result
 */
async function executeFirst<T>(builder: IQueryBuilder, db?: IDatabase): Promise<T | null> {
  if (!db) throw ErrorFactory.createDatabaseError('Database instance not provided to QueryBuilder');
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
  if (!db) throw ErrorFactory.createDatabaseError('Database instance not provided to QueryBuilder');
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
      applyWhereCondition(state, column, operator, value);
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
      applyOrderByClause(state, column, direction);
      return builder;
    },
    limit: (count) => {
      applyLimit(state, count);
      return builder;
    },
    offset: (count) => {
      applyOffset(state, count);
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
    toSQL: () => buildSelectQuery(state).sql,
    getParameters: () => buildSelectQuery(state).parameters,
    first: async <T>() => executeFirst<T>(builder, db),
    get: async <T>() => executeGet<T>(builder, db),
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
  create(tableOrDb: string | IDatabase, db?: IDatabase): IQueryBuilder {
    const hasTable = typeof tableOrDb === 'string';
    const tableName = hasTable ? String(tableOrDb).trim() : '';
    const database = hasTable ? db : tableOrDb;

    if (tableName.length > 0) {
      assertSafeIdentifierPath(tableName, 'table name');
    }
    const state: QueryState = {
      tableName,
      whereConditions: [],
      selectColumns: ['*'],
      joins: [],
    };

    return createBuilder(state, database);
  },

  /**
   * Ping the database connection.
   *
   * This is intentionally a tiny, dependency-free check that can be reused by
   * health/readiness endpoints without embedding SQL in route handlers.
   */
  async ping(db: IDatabase): Promise<void> {
    // Use the QueryBuilder itself to avoid embedding raw SQL at call sites.
    await QueryBuilder.create('', db).select('1').get();
  },
});
