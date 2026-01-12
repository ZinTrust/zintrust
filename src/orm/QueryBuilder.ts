/**
 * QueryBuilder - Type-Safe Query Builder
 * Build queries without raw SQL
 */

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
  id: string | number | null;
  affectedRows: number;
  insertedRecords?: Record<string, unknown>[];
}

export type SoftDeleteMode = 'exclude' | 'include' | 'only';

export interface QueryBuilderOptions {
  softDeleteColumn?: string;
  softDeleteMode?: SoftDeleteMode;
}

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

  with(relation: string): IQueryBuilder;
  load(models: IModel[], relation: string): Promise<void>;

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

  const sql = `INSERT INTO ${escapeIdentifier(tableName, dialect)} (${colsSql}) VALUES ${placeholders}`;
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
}

function attachReadExecutionMethods(builder: IQueryBuilder, db?: IDatabase): void {
  builder.first = async <T>() => executeFirst<T>(builder, db);
  builder.firstOrFail = async <T>(message?: string) => executeFirstOrFail<T>(builder, db, message);
  builder.get = async <T>() => executeGet<T>(builder, db);
  // raw just returns results without any hydration logic in callers
  builder.raw = async <T>() => executeGet<T>(builder, db);
}

function attachRelationshipMethods(builder: IQueryBuilder, state: QueryState): void {
  builder.with = (relation: string) => {
    state.eagerLoads.push(relation);
    return builder;
  };

  builder.load = async (models: IModel[], relation: string) => {
    if (models.length === 0) return;

    // We assume the first model can give us the relationship definition
    const firstModel = models[0] as unknown as Record<string, () => IRelationship>;
    if (typeof firstModel[relation] !== 'function') return;

    const rel = firstModel[relation]();
    if (rel === null || rel === undefined) return;

    const related = (rel as unknown as { related?: unknown }).related;
    if (related === null || related === undefined) return;

    const foreignKey = rel.foreignKey;
    const localKey = rel.localKey;

    const ids = models
      .map((m) => m.getAttribute(localKey))
      .filter((id): id is string | number => id !== null && id !== undefined);

    if (ids.length === 0) return;

    // Call query on the related model
    const relatedModel = rel.related as unknown as { query(): IQueryBuilder };
    if (typeof relatedModel.query !== 'function') return;

    const relatedResults = await relatedModel.query().whereIn(foreignKey, ids).get<IModel>();

    // Map results back to models
    for (const model of models) {
      const modelId = model.getAttribute(localKey);
      if (rel.type === 'hasMany' || rel.type === 'belongsToMany') {
        const filtered = relatedResults.filter((r) => r.getAttribute(foreignKey) === modelId);
        model.setRelation(relation, filtered);
      } else {
        const found = relatedResults.find((r) => r.getAttribute(foreignKey) === modelId);
        model.setRelation(relation, found ?? null);
      }
    }
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

    await currentDb.query(compiled.sql, compiled.parameters, false);

    // Return InsertResult with metadata
    // Note: lastInsertId typically only available for single-row inserts in most databases
    // For multi-row inserts, use the insertedRecords array
    return {
      id: items.length === 1 ? ((items[0]?.['id'] as string | number | null) ?? null) : null,
      affectedRows: items.length,
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
  attachReadExecutionMethods(builder, db);
  attachRelationshipMethods(builder, state);
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
