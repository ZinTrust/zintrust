/**
 * QueryBuilder - Type-Safe Query Builder
 * Build queries without raw SQL
 */

import type { PaginationQuery, Paginator } from '@database/Paginator';
import { createPaginator } from '@database/Paginator';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IDatabase } from '@orm/Database';
import type { IModel } from '@orm/Model';
import type { IRelationship } from '@orm/Relationships';

export interface WhereClause {
  column: string;
  operator: string;
  value: unknown;
}

/**
 * Result returned from INSERT operations
 * Provides access to the created record ID, affected rows count, and the full record if available
 */
export interface InsertResult {
  id: string | number | bigint | null;
  affectedRows: number;
  insertedRecords?: Record<string, unknown>[];
}

export type SoftDeleteMode = 'exclude' | 'include' | 'only';

export interface QueryBuilderOptions {
  softDeleteColumn?: string;
  softDeleteMode?: SoftDeleteMode;
}

export interface PaginationOptions {
  baseUrl?: string;
  query?: PaginationQuery;
}

export type EagerLoadConstraint = (builder: IQueryBuilder) => IQueryBuilder;
export type EagerLoadConstraints = Record<string, EagerLoadConstraint>;

export interface IQueryBuilder {
  select(...columns: string[]): IQueryBuilder;
  selectAs(column: string, alias: string): IQueryBuilder;
  max(column: string, alias?: string): IQueryBuilder;
  where(column: string, operator: string | number | boolean | null, value?: unknown): IQueryBuilder;
  andWhere(column: string, operator: string, value?: unknown): IQueryBuilder;
  orWhere(column: string, operator: string, value?: unknown): IQueryBuilder;
  whereIn(column: string, values: unknown[]): IQueryBuilder;
  whereNotIn(column: string, values: unknown[]): IQueryBuilder;
  withTrashed(): IQueryBuilder;
  onlyTrashed(): IQueryBuilder;
  withoutTrashed(): IQueryBuilder;
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
  firstOrFail<T>(message?: string): Promise<T>;
  get<T>(): Promise<T[]>;
  raw<T>(): Promise<T[]>;
  paginate<T>(page: number, perPage: number, options?: PaginationOptions): Promise<Paginator<T>>;

  with(relation: string | EagerLoadConstraints): IQueryBuilder;
  withCount(relation: string): IQueryBuilder;
  load(models: IModel[], relation: string, constraint?: EagerLoadConstraint): Promise<void>;
  loadCount(models: IModel[], relation: string): Promise<void>;

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): Promise<InsertResult>;
  update(values: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}

interface QueryState {
  tableName: string;
  whereConditions: WhereClause[];
  selectColumns: string[];
  limitValue?: number;
  offsetValue?: number;
  orderByClauses: Array<{ column: string; direction: 'ASC' | 'DESC' }>;
  joins: Array<{ table: string; on: string }>;
  softDelete?: { column: string; mode: SoftDeleteMode };
  eagerLoads: string[];
  eagerLoadConstraints: EagerLoadConstraints;
  eagerLoadCounts: string[];
  dialect?: string;
}

/**
 * Escape SQL identifier
 */
type IdentifierQuote = {
  open: string;
  close: string;
  escape: (raw: string) => string;
};

const getIdentifierQuote = (dialect?: string): IdentifierQuote => {
  const d = (dialect ?? '').toLowerCase();

  if (d === 'mysql') {
    return {
      open: '`',
      close: '`',
      escape: (raw) => raw.replaceAll('`', '``'),
    };
  }

  if (d === 'sqlserver') {
    return {
      open: '[',
      close: ']',
      escape: (raw) => raw.replaceAll(']', ']]'),
    };
  }

  // sqlite/postgresql/d1/d1-remote: standard SQL double-quote identifiers.
  return {
    open: '"',
    close: '"',
    escape: (raw) => raw.replaceAll('"', '""'),
  };
};

const escapeIdentifier = (id: string, dialect?: string): string => {
  const q = getIdentifierQuote(dialect);
  return id
    .split('.')
    .map((part) => `${q.open}${q.escape(part)}${q.close}`)
    .join('.');
};

const SAFE_IDENTIFIER_PATH = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;
const SAFE_IDENTIFIER = /^[A-Za-z_]\w*$/;

const assertSafeIdentifierPath = (id: string, label: string): void => {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw ErrorFactory.createDatabaseError(`Empty SQL identifier for ${label}`);
  }
  if (!SAFE_IDENTIFIER_PATH.test(trimmed)) {
    throw ErrorFactory.createDatabaseError(`Unsafe SQL identifier for ${label}`);
  }
};

const assertSafeIdentifier = (id: string, label: string): void => {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw ErrorFactory.createDatabaseError(`Empty SQL identifier for ${label}`);
  }
  if (!SAFE_IDENTIFIER.test(trimmed)) {
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

type SupportedAggregateFn = 'MAX' | 'MIN' | 'COUNT' | 'SUM' | 'AVG';

const ALLOWED_AGGREGATES = new Set<SupportedAggregateFn>(['MAX', 'MIN', 'COUNT', 'SUM', 'AVG']);

const tryParseAggregateSelectExpr = (
  raw: string
): { kind: 'aggregate'; fn: SupportedAggregateFn; arg: string; alias?: string } | null => {
  // Aggregate functions: MAX(col) [AS alias]
  // Capture content greedily to avoid ReDoS from overlapping whitespace patterns (S5852)
  const agg = /^(MAX|MIN|COUNT|SUM|AVG)\(([^)]+)\)(?: AS (\S+))?$/i.exec(raw);
  if (agg === null) return null;

  const fn = agg[1]?.toUpperCase() as SupportedAggregateFn;
  const arg = (agg[2] ?? '').trim();
  const alias = (agg[3] ?? '').trim();

  if (!ALLOWED_AGGREGATES.has(fn)) return null;
  if (arg !== '*') {
    assertSafeIdentifierPath(arg, 'aggregate argument');
  }
  if (alias.length > 0) {
    assertSafeIdentifier(alias, 'aggregate alias');
  }

  return { kind: 'aggregate', fn, arg, alias: alias.length > 0 ? alias : undefined };
};

const tryParseColumnAliasSelectExpr = (
  raw: string
): { kind: 'column'; column: string; alias: string } | null => {
  // Column alias: col [AS alias]
  // Avoid catastrophic backtracking by using a linear-time separator scan.
  const upperRaw = raw.toUpperCase();
  const asIndex = upperRaw.indexOf(' AS ');
  if (asIndex === -1) return null;

  const asSeparator = { index: asIndex, 0: raw.slice(asIndex, asIndex + 4) };
  const col = raw.slice(0, asSeparator.index).trim();
  const alias = raw.slice(asSeparator.index + asSeparator[0].length).trim();

  // Alias must be a single token (no whitespace).
  if (col.length === 0 || alias.length === 0 || /\s/.test(alias)) return null;

  assertSafeIdentifierPath(col, 'select column');
  assertSafeIdentifier(alias, 'select alias');
  return { kind: 'column', column: col, alias };
};

const tryParseSelectExpr = (
  expr: string
):
  | { kind: 'all' }
  | { kind: 'literal'; value: string }
  | { kind: 'column'; column: string; alias?: string }
  | { kind: 'aggregate'; fn: SupportedAggregateFn; arg: string; alias?: string }
  | null => {
  const raw = expr.trim();
  if (raw.length === 0) {
    throw ErrorFactory.createDatabaseError('Empty SQL identifier for select column');
  }
  if (raw === '*') return { kind: 'all' };
  if (isNumericLiteral(raw)) return { kind: 'literal', value: raw };

  const aggregate = tryParseAggregateSelectExpr(raw);
  if (aggregate !== null) return aggregate;

  const aliased = tryParseColumnAliasSelectExpr(raw);
  if (aliased !== null) return aliased;

  // Plain identifier path
  assertSafeIdentifierPath(raw, 'select column');
  return { kind: 'column', column: raw };
};

/**
 * Build SELECT clause
 */
const formatSelectExpr = (
  parsed:
    | { kind: 'all' }
    | { kind: 'literal'; value: string }
    | { kind: 'column'; column: string; alias?: string }
    | { kind: 'aggregate'; fn: SupportedAggregateFn; arg: string; alias?: string },
  dialect?: string
): string => {
  if (parsed.kind === 'all') return '*';
  if (parsed.kind === 'literal') return parsed.value;

  if (parsed.kind === 'aggregate') {
    const argSql = parsed.arg === '*' ? '*' : escapeIdentifier(parsed.arg, dialect);
    const base = `${parsed.fn}(${argSql})`;
    const alias = typeof parsed.alias === 'string' && parsed.alias.length > 0 ? parsed.alias : null;
    return alias === null ? base : `${base} AS ${escapeIdentifier(alias, dialect)}`;
  }

  const base = escapeIdentifier(parsed.column, dialect);
  const alias = typeof parsed.alias === 'string' && parsed.alias.length > 0 ? parsed.alias : null;
  return alias === null ? base : `${base} AS ${escapeIdentifier(alias, dialect)}`;
};

const buildSelectClause = (columns: string[], dialect?: string): string => {
  const out: string[] = [];
  for (const c of columns) {
    const parsed = tryParseSelectExpr(String(c));
    if (parsed === null) continue;

    out.push(formatSelectExpr(parsed, dialect));
  }

  return out.join(', ');
};

const compileWhere = (
  conditions: WhereClause[],
  dialect?: string
): {
  sql: string;
  parameters: unknown[];
} => {
  if (conditions.length === 0) return { sql: '', parameters: [] };

  const parameters: unknown[] = [];
  const clauses = conditions.map((clause) => {
    assertSafeIdentifierPath(clause.column, 'where column');
    const operator = assertSafeOperator(clause.operator);
    const columnSql = escapeIdentifier(clause.column, dialect);

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

const buildSoftDeleteWhereClause = (column: string, mode: SoftDeleteMode): WhereClause | null => {
  const col = column.trim();
  if (col.length === 0) return null;
  assertSafeIdentifierPath(col, 'soft delete column');

  if (mode === 'include') return null;
  if (mode === 'only') return { column: col, operator: 'IS NOT', value: null };
  return { column: col, operator: 'IS', value: null };
};

const getEffectiveWhereConditions = (state: QueryState): WhereClause[] => {
  if (state.softDelete === undefined) return state.whereConditions;

  const clause = buildSoftDeleteWhereClause(state.softDelete.column, state.softDelete.mode);
  if (clause === null) return state.whereConditions;

  return [...state.whereConditions, clause];
};

/**
 * Build ORDER BY clause
 */
const buildOrderByClause = (
  orderByClauses: Array<{ column: string; direction: 'ASC' | 'DESC' }>,
  dialect?: string
): string => {
  if (orderByClauses.length === 0) return '';

  const parts = orderByClauses.map((orderBy) => {
    const col = orderBy.column.trim();
    let columnSql = col;

    if (!isNumericLiteral(col)) {
      assertSafeIdentifierPath(col, 'order by column');
      columnSql = escapeIdentifier(col, dialect);
    }

    const dir = normalizeOrderDirection(orderBy.direction);
    return `${columnSql} ${dir}`;
  });

  return ` ORDER BY ${parts.join(', ')}`;
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

  const columns = buildSelectClause(state.selectColumns, state.dialect);
  const fromClause =
    state.tableName.length > 0 ? ` FROM ${escapeIdentifier(state.tableName, state.dialect)}` : '';
  const where = compileWhere(getEffectiveWhereConditions(state), state.dialect);
  const sql = `SELECT ${columns}${fromClause}${where.sql}${buildOrderByClause(
    state.orderByClauses,
    state.dialect
  )}${buildLimitOffsetClause(state.limitValue, state.offsetValue)}`;
  return { sql, parameters: where.parameters };
};

const buildCountQuery = (state: QueryState): { sql: string; parameters: unknown[] } => {
  if (state.tableName.length > 0) {
    assertSafeIdentifierPath(state.tableName, 'table name');
  }

  const fromClause =
    state.tableName.length > 0 ? ` FROM ${escapeIdentifier(state.tableName, state.dialect)}` : '';
  const where = compileWhere(getEffectiveWhereConditions(state), state.dialect);
  const sql = `SELECT COUNT(*) AS total${fromClause}${where.sql}`;
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
  state.orderByClauses.push({ column: col, direction: dir });
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

async function executeFirstOrFail<T>(
  builder: IQueryBuilder,
  db: IDatabase | undefined,
  message?: string
): Promise<T> {
  const result = await executeFirst<T>(builder, db);
  if (result === null) throw ErrorFactory.createNotFoundError(message ?? 'Resource not found');
  return result;
}

const compileInsert = (
  tableName: string,
  values: Record<string, unknown> | Array<Record<string, unknown>>,
  dialect?: string
): { sql: string; parameters: unknown[] } => {
  const items = Array.isArray(values) ? values : [values];
  if (items.length === 0) {
    throw ErrorFactory.createDatabaseError('INSERT requires at least one column');
  }

  // Use keys from the first item
  const keys = Object.keys(items[0] ?? {});
  if (keys.length === 0) {
    throw ErrorFactory.createDatabaseError('INSERT requires at least one column');
  }

  assertSafeIdentifierPath(tableName, 'table name');
  for (const key of keys) assertSafeIdentifier(key, 'insert column');

  const colsSql = keys.map((k) => escapeIdentifier(k, dialect)).join(', ');

  // Single row or multi-row placeholders
  const rowPlaceholders = `(${keys.map(() => '?').join(', ')})`;
  const placeholders = items.map(() => rowPlaceholders).join(', ');

  const parameters: unknown[] = [];
  for (const item of items) {
    for (const key of keys) {
      parameters.push(item[key]);
    }
  }

  const baseSql = `INSERT INTO ${escapeIdentifier(tableName, dialect)} (${colsSql}) VALUES ${placeholders}`;
  const wantsReturning = dialect === 'postgresql' && items.length === 1;
  const sql = wantsReturning ? `${baseSql} RETURNING id` : baseSql;
  return { sql, parameters };
};

const compileUpdate = (
  tableName: string,
  values: Record<string, unknown>,
  conditions: WhereClause[],
  dialect?: string
): { sql: string; parameters: unknown[] } => {
  const keys = Object.keys(values);
  if (keys.length === 0) {
    throw ErrorFactory.createDatabaseError('UPDATE requires at least one column');
  }
  if (conditions.length === 0) {
    throw ErrorFactory.createDatabaseError('UPDATE requires at least one WHERE clause');
  }

  assertSafeIdentifierPath(tableName, 'table name');
  for (const key of keys) assertSafeIdentifier(key, 'update column');

  const setSql = keys.map((k) => `${escapeIdentifier(k, dialect)} = ?`).join(', ');
  const setParams = keys.map((k) => values[k]);
  const where = compileWhere(conditions, dialect);
  const sql = `UPDATE ${escapeIdentifier(tableName, dialect)} SET ${setSql}${where.sql}`;
  return { sql, parameters: [...setParams, ...where.parameters] };
};

const compileDelete = (
  tableName: string,
  conditions: WhereClause[],
  dialect?: string
): { sql: string; parameters: unknown[] } => {
  if (conditions.length === 0) {
    throw ErrorFactory.createDatabaseError('DELETE requires at least one WHERE clause');
  }
  assertSafeIdentifierPath(tableName, 'table name');
  const where = compileWhere(conditions, dialect);
  const sql = `DELETE FROM ${escapeIdentifier(tableName, dialect)}${where.sql}`;
  return { sql, parameters: where.parameters };
};

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

const normalizePaginationValue = (value: number, label: string): number => {
  const n = Math.trunc(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw ErrorFactory.createValidationError(`${label} must be a positive integer`);
  }
  return n;
};

async function executePaginate<T>(
  builder: IQueryBuilder,
  state: QueryState,
  db: IDatabase | undefined,
  page: number,
  perPage: number,
  options?: PaginationOptions
): Promise<Paginator<T>> {
  if (!db) throw ErrorFactory.createDatabaseError('Database instance not provided to QueryBuilder');

  const safePage = normalizePaginationValue(page, 'page');
  const safePerPage = normalizePaginationValue(perPage, 'perPage');

  const countQuery = buildCountQuery(state);
  const countRows = (await db.query(countQuery.sql, countQuery.parameters, true)) as Array<
    Record<string, unknown>
  >;

  const rawTotal = countRows.at(0)?.['total'];
  const total = typeof rawTotal === 'bigint' ? Number(rawTotal) : Number(rawTotal ?? 0);
  const sanitizedTotal = Number.isFinite(total) && total > 0 ? total : 0;

  const offset = (safePage - 1) * safePerPage;
  const prevLimit = state.limitValue;
  const prevOffset = state.offsetValue;
  state.limitValue = safePerPage;
  state.offsetValue = offset;

  const items = await executeGet<T>(builder, db);

  state.limitValue = prevLimit;
  state.offsetValue = prevOffset;

  return createPaginator({
    items,
    total: sanitizedTotal,
    perPage: safePerPage,
    currentPage: safePage,
    baseUrl: options?.baseUrl,
    query: options?.query,
  });
}

/**
 * Create the builder object
 */
function attachSelectMethods(builder: IQueryBuilder, state: QueryState): void {
  const clearDefaultStar = (): void => {
    if (state.selectColumns.length === 1 && state.selectColumns[0] === '*')
      state.selectColumns = [];
  };

  builder.select = (...columns) => {
    state.selectColumns = columns.length > 0 ? columns : ['*'];
    return builder;
  };
  builder.selectAs = (column, alias) => {
    const col = String(column).trim();
    const a = String(alias).trim();
    assertSafeIdentifierPath(col, 'select column');
    assertSafeIdentifier(a, 'select alias');
    clearDefaultStar();
    state.selectColumns.push(`${col} AS ${a}`);
    return builder;
  };
  builder.max = (column, alias = 'max') => {
    const col = String(column).trim();
    const a = String(alias).trim();
    assertSafeIdentifierPath(col, 'aggregate argument');
    assertSafeIdentifier(a, 'aggregate alias');
    clearDefaultStar();
    state.selectColumns.push(`MAX(${col}) AS ${a}`);
    return builder;
  };
}

function attachWhereMethods(builder: IQueryBuilder, state: QueryState): void {
  builder.where = (column, operator, value) => {
    applyWhereCondition(state, column, operator, value);
    return builder;
  };
  builder.andWhere = (column, operator, value) => builder.where(column, operator, value);
  builder.orWhere = (column, operator, value) => builder.where(column, operator, value);
  builder.whereIn = (column, values) => {
    builder.where(column, 'IN', values);
    return builder;
  };
  builder.whereNotIn = (column, values) => {
    builder.where(column, 'NOT IN', values);
    return builder;
  };
}

function attachSoftDeleteMethods(builder: IQueryBuilder, state: QueryState): void {
  builder.withTrashed = () => {
    if (state.softDelete === undefined) {
      state.softDelete = { column: 'deleted_at', mode: 'include' };
    } else {
      state.softDelete.mode = 'include';
    }
    return builder;
  };
  builder.onlyTrashed = () => {
    if (state.softDelete === undefined) {
      state.softDelete = { column: 'deleted_at', mode: 'only' };
    } else {
      state.softDelete.mode = 'only';
    }
    return builder;
  };
  builder.withoutTrashed = () => {
    if (state.softDelete === undefined) {
      state.softDelete = { column: 'deleted_at', mode: 'exclude' };
    } else {
      state.softDelete.mode = 'exclude';
    }
    return builder;
  };
}

function attachJoinOrderPagingMethods(builder: IQueryBuilder, state: QueryState): void {
  builder.join = (tableJoin, on) => {
    state.joins.push({ table: tableJoin, on });
    return builder;
  };
  builder.leftJoin = (tableJoin, on) => builder.join(tableJoin, on);
  builder.orderBy = (column, direction = 'ASC') => {
    applyOrderByClause(state, column, direction);
    return builder;
  };
  builder.limit = (count) => {
    applyLimit(state, count);
    return builder;
  };
  builder.offset = (count) => {
    applyOffset(state, count);
    return builder;
  };
}

function attachIntrospectionMethods(builder: IQueryBuilder, state: QueryState): void {
  builder.getWhereClauses = () => state.whereConditions;
  builder.getSelectColumns = () => state.selectColumns;
  builder.getTable = () => state.tableName;
  builder.getLimit = () => state.limitValue;
  builder.getOffset = () => state.offsetValue;
  builder.getOrderBy = () => state.orderByClauses.at(-1);
  builder.getJoins = () => state.joins;
  builder.isReadOperation = () => true;
  builder.toSQL = () => buildSelectQuery(state).sql;
  builder.getParameters = () => buildSelectQuery(state).parameters;
  // Internal method for eager loading distribution
  (builder as unknown as { getEagerLoads: () => string[] }).getEagerLoads = () => state.eagerLoads;
  (
    builder as unknown as { getEagerLoadConstraints: () => EagerLoadConstraints }
  ).getEagerLoadConstraints = () => state.eagerLoadConstraints;
  (builder as unknown as { getEagerLoadCounts: () => string[] }).getEagerLoadCounts = () =>
    state.eagerLoadCounts;
}

function attachReadExecutionMethods(
  builder: IQueryBuilder,
  state: QueryState,
  db?: IDatabase
): void {
  builder.first = async <T>() => executeFirst<T>(builder, db);
  builder.firstOrFail = async <T>(message?: string) => executeFirstOrFail<T>(builder, db, message);
  builder.get = async <T>() => executeGet<T>(builder, db);
  builder.paginate = async <T>(
    page: number,
    perPage: number,
    options: PaginationOptions | undefined
  ) => executePaginate<T>(builder, state, db, page, perPage, options);
  // raw just returns results without any hydration logic in callers
  builder.raw = async <T>() => executeGet<T>(builder, db);
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isKeyValue = (value: unknown): value is string | number =>
  typeof value === 'string' || typeof value === 'number';

const getModelIds = (models: IModel[], key: string): Array<string | number> =>
  models.map((model) => model.getAttribute(key)).filter((element) => isKeyValue(element));

const applyConstraint = (query: IQueryBuilder, constraint?: EagerLoadConstraint): IQueryBuilder => {
  if (typeof constraint === 'function') {
    return constraint(query) ?? query;
  }
  return query;
};

/**
 * Load relationship counts for a collection of models
 */
async function loadCounts(models: IModel[], relation: string, db?: IDatabase): Promise<void> {
  if (models.length === 0 || !db) return;

  const firstModel = models[0] as unknown as Record<string, () => IRelationship>;
  if (typeof firstModel[relation] !== 'function') return;

  const rel = firstModel[relation]();
  if (rel === null || rel === undefined) return;

  const relType = rel.type;

  // Only hasMany and belongsToMany support counts
  if (relType !== 'hasMany' && relType !== 'belongsToMany') {
    return;
  }

  const foreignKey = rel.foreignKey;
  const localKey = rel.localKey;

  const ids = getModelIds(models, localKey);

  if (ids.length === 0) return;

  const dialect = typeof db.getType === 'function' ? db.getType() : undefined;

  const queryCounts = async (
    sql: string,
    params: unknown[]
  ): Promise<Map<string | number, number>> => {
    const results = (await db.query(sql, params, true)) as Array<{
      key: string | number;
      count: number | bigint;
    }>;
    const map = new Map<string | number, number>();
    for (const row of results) {
      let count: number;
      if (typeof row.count === 'bigint') {
        count = Number(row.count);
      } else if (typeof row.count === 'number') {
        count = row.count;
      } else {
        count = Number(row.count ?? 0);
      }
      map.set(row.key, count);
    }
    return map;
  };

  const setCountsOnModels = (countMap: Map<string | number, number>): void => {
    for (const model of models) {
      const modelId = model.getAttribute(localKey);
      if (isKeyValue(modelId)) {
        const count = countMap.get(modelId) ?? 0;
        model.setAttribute(`${relation}_count`, count);
      } else {
        model.setAttribute(`${relation}_count`, 0);
      }
    }
  };

  if (relType === 'hasMany') {
    const relatedModel = rel.related as unknown as { query(): IQueryBuilder };
    if (typeof relatedModel?.query !== 'function') return;

    const tempQuery = relatedModel.query();
    const relatedTable = tempQuery.getTable();

    const sql = `SELECT ${escapeIdentifier(foreignKey, dialect)} as key, COUNT(*) as count FROM ${escapeIdentifier(
      relatedTable,
      dialect
    )} WHERE ${escapeIdentifier(foreignKey, dialect)} IN (${ids.map(() => '?').join(',')}) GROUP BY ${escapeIdentifier(
      foreignKey,
      dialect
    )}`;

    const countMap = await queryCounts(sql, ids);
    setCountsOnModels(countMap);
    return;
  }

  // belongsToMany
  const throughTable = rel.throughTable;
  const relatedKey = rel.relatedKey;
  if (!isNonEmptyString(throughTable) || !isNonEmptyString(relatedKey)) return;

  const sql = `SELECT ${escapeIdentifier(foreignKey, dialect)} as key, COUNT(*) as count FROM ${escapeIdentifier(
    throughTable,
    dialect
  )} WHERE ${escapeIdentifier(foreignKey, dialect)} IN (${ids.map(() => '?').join(',')}) GROUP BY ${escapeIdentifier(
    foreignKey,
    dialect
  )}`;

  const countMap = await queryCounts(sql, ids);
  setCountsOnModels(countMap);
}

const getRelationFromModels = (models: IModel[], relation: string): IRelationship | null => {
  const firstModel = models[0] as unknown as Record<string, () => IRelationship>;
  const relationFactory = firstModel?.[relation];
  if (typeof relationFactory !== 'function') return null;
  const rel = relationFactory();
  return rel ?? null;
};

const assignMorphToGroup = (
  modelsByType: Map<string, IModel[]>,
  type: string,
  model: IModel
): void => {
  const existing = modelsByType.get(type);
  if (existing) {
    existing.push(model);
  } else {
    modelsByType.set(type, [model]);
  }
};

const getModelTable = (model: IModel): string | null => {
  const tableGetter = (model as unknown as { getTable?: () => string }).getTable;
  if (typeof tableGetter !== 'function') return null;
  const table = tableGetter();
  return isNonEmptyString(table) ? table : null;
};

const buildSingleMap = (results: IModel[], key: string): Map<string | number, IModel> => {
  const map = new Map<string | number, IModel>();
  for (const result of results) {
    const resultId = result.getAttribute(key);
    if (isKeyValue(resultId)) {
      map.set(resultId, result);
    }
  }
  return map;
};

const buildBucketMap = (results: IModel[], key: string): Map<string | number, IModel[]> => {
  const buckets = new Map<string | number, IModel[]>();
  for (const result of results) {
    const resultId = result.getAttribute(key);
    if (isKeyValue(resultId)) {
      const existing = buckets.get(resultId) ?? [];
      existing.push(result);
      buckets.set(resultId, existing);
    }
  }
  return buckets;
};

const setRelationsFromBuckets = (
  models: IModel[],
  relation: string,
  localKey: string,
  buckets: Map<string | number, IModel[]>,
  isMany: boolean
): void => {
  for (const model of models) {
    const modelId = model.getAttribute(localKey);
    if (!isKeyValue(modelId)) {
      model.setRelation(relation, isMany ? [] : null);
      continue;
    }

    const bucket = buckets.get(modelId) ?? [];
    if (isMany) {
      model.setRelation(relation, bucket);
    } else {
      model.setRelation(relation, bucket[0] ?? null);
    }
  }
};

const buildParentToThroughIds = (
  throughResults: IModel[],
  throughForeignKey: string,
  secondLocalKey: string
): Map<string | number, Array<string | number>> => {
  const parentToThroughIds = new Map<string | number, Array<string | number>>();
  for (const throughItem of throughResults) {
    const parentId = throughItem.getAttribute(throughForeignKey);
    const throughId = throughItem.getAttribute(secondLocalKey);
    if (isKeyValue(parentId) && isKeyValue(throughId)) {
      const existing = parentToThroughIds.get(parentId) ?? [];
      existing.push(throughId);
      parentToThroughIds.set(parentId, existing);
    }
  }
  return parentToThroughIds;
};

const collectThroughRelated = (
  throughIds: Array<string | number>,
  relatedBuckets: Map<string | number, IModel[]>
): IModel[] => {
  const aggregated: IModel[] = [];
  for (const throughId of throughIds) {
    const bucket = relatedBuckets.get(throughId);
    if (bucket !== undefined) {
      aggregated.push(...bucket);
    }
  }
  return aggregated;
};

const setThroughRelations = (
  models: IModel[],
  relation: string,
  localKey: string,
  parentToThroughIds: Map<string | number, Array<string | number>>,
  relatedBuckets: Map<string | number, IModel[]>,
  isMany: boolean
): void => {
  for (const model of models) {
    const modelId = model.getAttribute(localKey);
    if (!isKeyValue(modelId)) {
      model.setRelation(relation, isMany ? [] : null);
      continue;
    }

    const throughIds = parentToThroughIds.get(modelId) ?? [];
    if (throughIds.length === 0) {
      model.setRelation(relation, isMany ? [] : null);
      continue;
    }

    const aggregated = collectThroughRelated(throughIds, relatedBuckets);
    if (isMany) {
      model.setRelation(relation, aggregated);
    } else {
      model.setRelation(relation, aggregated[0] ?? null);
    }
  }
};

const buildMorphToGroups = (models: IModel[], morphType: string): Map<string, IModel[]> => {
  const modelsByType = new Map<string, IModel[]>();
  for (const model of models) {
    const type = model.getAttribute(morphType);
    if (isNonEmptyString(type)) {
      assignMorphToGroup(modelsByType, type, model);
    }
  }
  return modelsByType;
};

const setMorphToRelations = (
  models: IModel[],
  relation: string,
  morphId: string,
  relatedMap: Map<string | number, IModel>
): void => {
  for (const model of models) {
    const modelId = model.getAttribute(morphId);
    if (isKeyValue(modelId)) {
      model.setRelation(relation, relatedMap.get(modelId) ?? null);
    } else {
      model.setRelation(relation, null);
    }
  }
};

const loadMorphToGroup = async (
  relation: string,
  morphId: string,
  modelsOfType: IModel[],
  relatedModel: { query: () => IQueryBuilder },
  constraint?: EagerLoadConstraint
): Promise<void> => {
  const ids = getModelIds(modelsOfType, morphId);
  if (ids.length === 0) return;

  const relatedQuery = applyConstraint(relatedModel.query(), constraint);

  const relatedResults = await relatedQuery.whereIn('id', ids).get<IModel>();
  const relatedMap = buildSingleMap(relatedResults, 'id');
  setMorphToRelations(modelsOfType, relation, morphId, relatedMap);
};

const loadMorphToRelation = async (
  models: IModel[],
  relation: string,
  rel: IRelationship,
  constraint?: EagerLoadConstraint
): Promise<boolean> => {
  if (rel.type !== 'morphTo') return false;

  const morphType = rel.morphType;
  const morphId = rel.morphId;
  const morphMap = rel.morphMap;

  if (
    !isNonEmptyString(morphType) ||
    !isNonEmptyString(morphId) ||
    morphMap === null ||
    morphMap === undefined
  ) {
    return true;
  }

  const modelsByType = buildMorphToGroups(models, morphType);

  const tasks = [...modelsByType.entries()].map(async ([type, modelsOfType]) => {
    const relatedModel = morphMap[type] as unknown as { query(): IQueryBuilder } | undefined;
    if (relatedModel === undefined || typeof relatedModel.query !== 'function') {
      return Promise.resolve(); //NOSONAR
    }

    return loadMorphToGroup(relation, morphId, modelsOfType, relatedModel, constraint);
  });

  await Promise.all(tasks);

  return true;
};

const prepareMorphOneMany = (
  models: IModel[],
  rel: IRelationship,
  localKey: string | undefined,
  morphId: string | undefined,
  morphType: string | undefined
): {
  proceed: boolean;
  ids?: Array<string | number>;
  relatedModel?: { query?: () => IQueryBuilder };
  tableName?: string;
} => {
  if (!isNonEmptyString(morphType) || !isNonEmptyString(morphId) || !isNonEmptyString(localKey)) {
    return { proceed: false };
  }

  const ids = getModelIds(models, localKey);
  if (ids.length === 0) return { proceed: false };

  const relatedModel = rel.related as unknown as { query?: () => IQueryBuilder };
  if (typeof relatedModel.query !== 'function') return { proceed: false };

  const tableName = getModelTable(models[0]);
  if (tableName === null) return { proceed: false };

  return { proceed: true, ids, relatedModel, tableName };
};

const loadMorphOneManyRelation = async (
  models: IModel[],
  relation: string,
  rel: IRelationship,
  constraint?: EagerLoadConstraint
): Promise<boolean> => {
  if (rel.type !== 'morphOne' && rel.type !== 'morphMany') return false;

  const morphType = rel.morphType;
  const morphId = rel.morphId;
  const localKey = rel.localKey;

  const prep = prepareMorphOneMany(models, rel, localKey, morphId, morphType);
  if (
    !prep.proceed ||
    prep.ids === undefined ||
    prep.relatedModel === undefined ||
    prep.tableName === undefined ||
    !isNonEmptyString(morphType) ||
    !isNonEmptyString(morphId) ||
    !isNonEmptyString(localKey)
  ) {
    return true;
  }

  const ids = prep.ids;
  const relatedModel = prep.relatedModel as { query(): IQueryBuilder };
  const tableName = prep.tableName;

  const relatedQuery = applyConstraint(relatedModel.query(), constraint)
    .where(morphType, '=', tableName)
    .whereIn(morphId, ids);

  const relatedResults = await relatedQuery.get<IModel>();
  const relatedBuckets = buildBucketMap(relatedResults, morphId);
  const isMany = rel.type === 'morphMany';
  setRelationsFromBuckets(models, relation, localKey, relatedBuckets, isMany);

  return true;
};

const loadThroughRelation = async (
  models: IModel[],
  relation: string,
  rel: IRelationship,
  constraint?: EagerLoadConstraint
): Promise<boolean> => {
  if (rel.type !== 'hasOneThrough' && rel.type !== 'hasManyThrough') return false;

  const through = rel.through;
  const throughForeignKey = rel.throughForeignKey;
  const secondLocalKey = rel.secondLocalKey;
  const foreignKey = rel.foreignKey;
  const localKey = rel.localKey;

  if (
    through === undefined ||
    through === null ||
    !isNonEmptyString(throughForeignKey) ||
    !isNonEmptyString(secondLocalKey) ||
    !isNonEmptyString(foreignKey) ||
    !isNonEmptyString(localKey)
  ) {
    return true;
  }

  const ids = getModelIds(models, localKey);
  if (ids.length === 0) return true;

  const throughModel = through as unknown as {
    query(): IQueryBuilder;
    getTable?: () => string;
  };
  const relatedModel = rel.related as unknown as {
    query(): IQueryBuilder;
    getTable?: () => string;
  };

  if (
    typeof throughModel.getTable !== 'function' ||
    typeof relatedModel.query !== 'function' ||
    typeof relatedModel.getTable !== 'function'
  ) {
    return true;
  }

  const throughTable = throughModel.getTable();
  const relatedTable = relatedModel.getTable();
  if (!isNonEmptyString(throughTable) || !isNonEmptyString(relatedTable)) return true;

  let relatedQuery = relatedModel.query();
  relatedQuery = applyConstraint(relatedQuery, constraint);

  relatedQuery = relatedQuery
    .join(throughTable, `${relatedTable}.${foreignKey} = ${throughTable}.${secondLocalKey}`)
    .whereIn(`${throughTable}.${throughForeignKey}`, ids);

  const relatedResults = await relatedQuery.get<IModel>();

  const throughQuery = throughModel.query().whereIn(throughForeignKey, ids);
  const throughResults = await throughQuery.get<IModel>();

  const parentToThroughIds = buildParentToThroughIds(
    throughResults,
    throughForeignKey,
    secondLocalKey
  );

  const relatedBuckets = buildBucketMap(relatedResults, foreignKey);

  const isMany = rel.type === 'hasManyThrough';
  setThroughRelations(models, relation, localKey, parentToThroughIds, relatedBuckets, isMany);

  return true;
};

const loadStandardRelation = async (
  models: IModel[],
  relation: string,
  rel: IRelationship,
  constraint?: EagerLoadConstraint
): Promise<boolean> => {
  const related = (rel as unknown as { related?: unknown }).related;
  if (related === null || related === undefined) return false;

  const foreignKey = rel.foreignKey;
  const localKey = rel.localKey;
  if (!isNonEmptyString(foreignKey) || !isNonEmptyString(localKey)) return false;

  const ids = getModelIds(models, localKey);
  if (ids.length === 0) return true;

  const relatedModel = rel.related as unknown as { query(): IQueryBuilder };
  if (typeof relatedModel.query !== 'function') return false;

  const relatedQuery = applyConstraint(relatedModel.query(), constraint);
  const relatedResults = await relatedQuery.whereIn(foreignKey, ids).get<IModel>();
  const relatedBuckets = buildBucketMap(relatedResults, foreignKey);
  const isMany = rel.type === 'hasMany' || rel.type === 'belongsToMany';
  setRelationsFromBuckets(models, relation, localKey, relatedBuckets, isMany);

  return true;
};

const loadRelation = async (
  models: IModel[],
  relation: string,
  constraint?: EagerLoadConstraint
): Promise<void> => {
  if (models.length === 0) return;
  const rel = getRelationFromModels(models, relation);
  if (!rel) return;

  const type = rel.type;
  if (type === 'morphTo') {
    await loadMorphToRelation(models, relation, rel, constraint);
    return;
  }
  if (type === 'morphOne' || type === 'morphMany') {
    await loadMorphOneManyRelation(models, relation, rel, constraint);
    return;
  }
  if (type === 'hasOneThrough' || type === 'hasManyThrough') {
    await loadThroughRelation(models, relation, rel, constraint);
    return;
  }
  await loadStandardRelation(models, relation, rel, constraint);
};

function attachRelationshipMethods(
  builder: IQueryBuilder,
  state: QueryState,
  db?: IDatabase
): void {
  builder.with = (relation: string | EagerLoadConstraints) => {
    if (typeof relation === 'string') {
      state.eagerLoads.push(relation);
      return builder;
    }

    for (const [name, constraint] of Object.entries(relation)) {
      if (state.eagerLoads.includes(name) === false) {
        state.eagerLoads.push(name);
      }
      state.eagerLoadConstraints[name] = constraint;
    }

    return builder;
  };

  builder.withCount = (relation: string) => {
    state.eagerLoadCounts.push(relation);
    return builder;
  };

  builder.load = async (models: IModel[], relation: string, constraint?: EagerLoadConstraint) => {
    await loadRelation(models, relation, constraint);
  };

  builder.loadCount = async (models: IModel[], relation: string) => {
    await loadCounts(models, relation, db);
  };
}

function attachWriteMethods(builder: IQueryBuilder, state: QueryState, db?: IDatabase): void {
  const ensureDb = (): IDatabase => {
    if (!db)
      throw ErrorFactory.createDatabaseError('Database instance not provided to QueryBuilder');
    return db;
  };

  builder.insert = async (values) => {
    const currentDb = ensureDb();
    const tableName = state.tableName.trim();
    if (tableName.length === 0)
      throw ErrorFactory.createDatabaseError('INSERT requires a table name');
    const compiled = compileInsert(tableName, values, state.dialect);
    const items = Array.isArray(values) ? values : [values];

    const result = await currentDb.execute(compiled.sql, compiled.parameters, false);

    // Return InsertResult with metadata
    // Note: lastInsertId typically only available for single-row inserts in most databases
    // For multi-row inserts, use the insertedRecords array
    return {
      id:
        (result.lastInsertId as string | number | bigint) ??
        (items.length === 1 ? ((items[0]?.['id'] as string | number | null) ?? null) : null),
      affectedRows: result.rowCount,
      insertedRecords: items,
    };
  };
  builder.update = async (values) => {
    const currentDb = ensureDb();
    const tableName = state.tableName.trim();
    if (tableName.length === 0)
      throw ErrorFactory.createDatabaseError('UPDATE requires a table name');
    const compiled = compileUpdate(tableName, values, state.whereConditions, state.dialect);
    await currentDb.query(compiled.sql, compiled.parameters, false);
  };
  builder.delete = async () => {
    const currentDb = ensureDb();
    const tableName = state.tableName.trim();
    if (tableName.length === 0)
      throw ErrorFactory.createDatabaseError('DELETE requires a table name');
    const compiled = compileDelete(tableName, state.whereConditions, state.dialect);
    await currentDb.query(compiled.sql, compiled.parameters, false);
  };
}

function createBuilder(state: QueryState, db?: IDatabase): IQueryBuilder {
  const builder = {} as IQueryBuilder;

  attachSelectMethods(builder, state);
  attachWhereMethods(builder, state);
  attachSoftDeleteMethods(builder, state);
  attachJoinOrderPagingMethods(builder, state);
  attachIntrospectionMethods(builder, state);
  attachReadExecutionMethods(builder, state, db);
  attachRelationshipMethods(builder, state, db);
  attachWriteMethods(builder, state, db);

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
  create(
    tableOrDb: string | IDatabase,
    db?: IDatabase,
    options: QueryBuilderOptions = {}
  ): IQueryBuilder {
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
      orderByClauses: [],
      joins: [],
      eagerLoads: [],
      eagerLoadConstraints: {},
      eagerLoadCounts: [],
      dialect: typeof database?.getType === 'function' ? database.getType() : undefined,
    };

    if (options.softDeleteColumn !== undefined && options.softDeleteColumn.trim().length > 0) {
      state.softDelete = {
        column: options.softDeleteColumn.trim(),
        mode: options.softDeleteMode ?? 'exclude',
      };
    }

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
