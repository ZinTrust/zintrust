import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IDatabase } from '@orm/Database';
import type { ColumnDefinition, ISchema } from '@orm/Schema';

const IDENT_RE = /^[A-Za-z_]\w*$/;
const INT_TYPES = new Set<ColumnDefinition['type']>([
  'integer',
  'smallInteger',
  'tinyInteger',
  'mediumInteger',
]);

function assertIdentifier(label: string, value: string): void {
  if (!IDENT_RE.test(value)) {
    throw ErrorFactory.createValidationError(`Invalid ${label} identifier: ${value}`);
  }
}

function quoteIdent(driver: string, ident: string): string {
  assertIdentifier('SQL', ident);

  // MySQL uses backticks; Postgres/SQLite accept double-quotes.
  if (driver === 'mysql') return `\`${ident}\``;
  return `"${ident}"`;
}

function getAutoIncrementSql(driver: string, col: string, type: string): string | null {
  const isSqlite = driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote';

  if (isSqlite) {
    return `${col} INTEGER PRIMARY KEY AUTOINCREMENT`;
  }
  if (driver === 'postgresql') {
    return `${col} ${type === 'bigInteger' ? 'BIGSERIAL' : 'SERIAL'} PRIMARY KEY`;
  }
  if (driver === 'mysql') {
    const base = type === 'bigInteger' ? 'BIGINT' : 'INT';
    return `${col} ${base} AUTO_INCREMENT PRIMARY KEY`;
  }
  return null;
}

function getStringTypeSql(driver: string, def: ColumnDefinition): string {
  const isSqlite = driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote';
  const len = typeof def.length === 'number' && Number.isFinite(def.length) ? def.length : 255;
  return isSqlite ? 'TEXT' : `VARCHAR(${len})`;
}

function getDecimalTypeSql(def: ColumnDefinition): string {
  const p = typeof def.precision === 'number' ? def.precision : 10;
  const s = typeof def.scale === 'number' ? def.scale : 2;
  return `DECIMAL(${p},${s})`;
}

function getDateTimeTypeSql(driver: string): string {
  if (driver === 'mysql') return 'DATETIME';
  if (driver === 'postgresql') return 'TIMESTAMP';
  return 'TEXT';
}

function getIntegerTypeSql(driver: string, type: ColumnDefinition['type']): string | null {
  if (INT_TYPES.has(type)) return driver === 'mysql' ? 'INT' : 'INTEGER';
  if (type === 'bigInteger') return 'BIGINT';
  return null;
}

function getSpecialTypeSql(driver: string, type: ColumnDefinition['type']): string | null {
  if (type === 'boolean') return driver === 'mysql' ? 'TINYINT(1)' : 'BOOLEAN';
  if (type === 'json') return driver === 'postgresql' ? 'JSONB' : 'TEXT';
  if (type === 'uuid') return driver === 'postgresql' ? 'UUID' : 'TEXT';
  return null;
}

function getColumnTypeSql(driver: string, def: ColumnDefinition): string {
  if (def.type === 'string' || def.type === 'char') return getStringTypeSql(driver, def);
  if (def.type === 'decimal') return getDecimalTypeSql(def);
  if (def.type === 'datetime' || def.type === 'timestamp') return getDateTimeTypeSql(driver);

  const intSql = getIntegerTypeSql(driver, def.type);
  if (intSql !== null) return intSql;

  const specialSql = getSpecialTypeSql(driver, def.type);
  if (specialSql !== null) return specialSql;

  return 'TEXT';
}

function getDefaultValueSql(table: string, def: ColumnDefinition): string | null {
  if (def.default === undefined) return null;

  const dv = def.default;
  if (dv === null) return 'DEFAULT NULL';
  if (typeof dv === 'number' && Number.isFinite(dv)) return `DEFAULT ${dv}`;
  if (typeof dv === 'boolean') return `DEFAULT ${dv ? 1 : 0}`;
  if (typeof dv === 'string') {
    const escaped = dv.replaceAll("'", "''");
    return `DEFAULT '${escaped}'`;
  }
  throw ErrorFactory.createValidationError(`Unsupported default type for ${table}.${def.name}`);
}

function columnSql(driver: string, table: string, def: ColumnDefinition): string {
  assertIdentifier('table', table);
  assertIdentifier('column', def.name);

  const col = quoteIdent(driver, def.name);
  const isPrimary = def.primary === true;

  if (def.autoIncrement === true && isPrimary) {
    const autoInc = getAutoIncrementSql(driver, col, def.type);
    if (autoInc !== null) return autoInc;
  }

  const parts: string[] = [`${col} ${getColumnTypeSql(driver, def)}`];

  if (def.nullable !== true) parts.push('NOT NULL');
  if (def.unique === true) parts.push('UNIQUE');
  if (isPrimary) parts.push('PRIMARY KEY');

  const defaultVal = getDefaultValueSql(table, def);
  if (defaultVal !== null) parts.push(defaultVal);

  return parts.join(' ');
}

function buildCreateTableSql(driver: string, schema: ISchema, ifNotExists: boolean): string {
  const table = schema.getTable();
  assertIdentifier('table', table);

  const tableSql = quoteIdent(driver, table);

  const cols = Array.from(schema.getColumns().values()).map((c) => c.getDefinition());
  if (cols.length === 0) {
    throw ErrorFactory.createValidationError(`Schema for table '${table}' has no columns`);
  }

  const columnLines = cols.map((d) => `  ${columnSql(driver, table, d)}`);

  const ine = ifNotExists ? 'IF NOT EXISTS ' : '';
  return `CREATE TABLE ${ine}${tableSql} (\n${columnLines.join(',\n')}\n)`;
}

export const SchemaCompiler = Object.freeze({
  async createTable(
    db: IDatabase,
    schema: ISchema,
    opts?: { ifNotExists?: boolean }
  ): Promise<void> {
    const driver = db.getType();
    const sql = buildCreateTableSql(driver, schema, opts?.ifNotExists !== false);
    await db.query(sql);
  },

  async dropTable(db: IDatabase, table: string): Promise<void> {
    const driver = db.getType();
    assertIdentifier('table', table);
    const tableSql = quoteIdent(driver, table);
    await db.query(`DROP TABLE IF EXISTS ${tableSql}`);
  },
});
