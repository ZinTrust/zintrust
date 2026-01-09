import { ErrorFactory } from '@exceptions/ZintrustError';

import type {
  ColumnDefinition,
  ForeignKeyAction,
  ForeignKeyDefinition,
  IndexDefinition,
  TableDefinition,
} from '@/migrations/schema/types';

const IDENT_RE = /^[A-Za-z_]\w*$/;

type SupportedDriver = 'sqlite' | 'd1' | 'd1-remote' | 'postgresql' | 'mysql' | 'sqlserver';

type AlterTablePlan = {
  addColumns: ColumnDefinition[];
  dropColumns: string[];
  createIndexes: IndexDefinition[];
  dropIndexes: string[];
  addForeignKeys: ForeignKeyDefinition[];
  dropForeignKeys: string[];
};

function isSupportedDriver(driver: string): driver is SupportedDriver {
  return (
    driver === 'sqlite' ||
    driver === 'd1' ||
    driver === 'd1-remote' ||
    driver === 'postgresql' ||
    driver === 'mysql' ||
    driver === 'sqlserver'
  );
}

function assertIdentifier(label: string, value: string): void {
  if (!IDENT_RE.test(value)) {
    throw ErrorFactory.createValidationError(`Invalid ${label} identifier: ${value}`);
  }
}

function requireSupportedDriver(driver: string): SupportedDriver {
  if (!isSupportedDriver(driver)) {
    throw ErrorFactory.createValidationError(`Unsupported DB driver: ${driver}`);
  }
  return driver;
}

function quoteIdent(driver: SupportedDriver, ident: string): string {
  assertIdentifier('SQL', ident);
  if (driver === 'mysql') return `\`${ident}\``;
  return `"${ident}"`;
}

function isSqliteFamily(driver: SupportedDriver): boolean {
  return driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote';
}

function normalizeForeignKeyAction(action: ForeignKeyAction): string {
  switch (action) {
    case 'CASCADE':
    case 'SET NULL':
    case 'RESTRICT':
    case 'NO ACTION':
    case 'SET DEFAULT':
      return action;
    default:
      throw ErrorFactory.createValidationError(`Unsupported foreign key action: ${String(action)}`);
  }
}

type ColumnTypeSqlHandler = (driver: SupportedDriver, def: ColumnDefinition) => string;

const TYPE_SQL: Record<ColumnDefinition['type'], ColumnTypeSqlHandler> = Object.freeze({
  STRING: (driver, def) => {
    const len = typeof def.length === 'number' && Number.isFinite(def.length) ? def.length : 255;
    return isSqliteFamily(driver) ? 'TEXT' : `VARCHAR(${len})`;
  },
  INTEGER: (driver) => (driver === 'mysql' ? 'INT' : 'INTEGER'),
  REAL: (driver) => (driver === 'sqlserver' ? 'FLOAT' : 'REAL'),
  BOOLEAN: (driver) => (driver === 'mysql' ? 'TINYINT(1)' : 'BOOLEAN'),
  TEXT: () => 'TEXT',
  JSON: (driver) => {
    if (driver === 'postgresql') return 'JSONB';
    if (driver === 'mysql') return 'JSON';
    return 'TEXT';
  },
  TIMESTAMP: (driver) => {
    if (driver === 'mysql') return 'DATETIME';
    if (driver === 'postgresql') return 'TIMESTAMP';
    return 'TEXT';
  },
  BLOB: () => 'BLOB',
});

function getColumnTypeSql(driver: SupportedDriver, def: ColumnDefinition): string {
  return TYPE_SQL[def.type](driver, def);
}

function getAutoIncrementColumnSql(driver: SupportedDriver, colName: string): string {
  const sqliteFamily = isSqliteFamily(driver);

  if (sqliteFamily) {
    return `${colName} INTEGER PRIMARY KEY AUTOINCREMENT`;
  }
  if (driver === 'postgresql') {
    return `${colName} SERIAL PRIMARY KEY`;
  }
  if (driver === 'mysql') {
    return `${colName} INT AUTO_INCREMENT PRIMARY KEY`;
  }
  if (driver === 'sqlserver') {
    return `${colName} INT IDENTITY(1,1) PRIMARY KEY`;
  }

  throw ErrorFactory.createValidationError(`Auto-increment not supported for driver: ${driver}`);
}

function formatDefaultValueSql(table: string, def: ColumnDefinition): string | null {
  if (def.defaultValue === undefined) return null;

  const dv = def.defaultValue;

  if (dv === null) return 'DEFAULT NULL';
  if (typeof dv === 'number' && Number.isFinite(dv)) return `DEFAULT ${dv}`;
  if (typeof dv === 'boolean') return `DEFAULT ${dv ? 1 : 0}`;
  if (typeof dv === 'string') {
    if (dv === 'CURRENT_TIMESTAMP') return 'DEFAULT CURRENT_TIMESTAMP';
    const escaped = dv.replaceAll("'", "''");
    return `DEFAULT '${escaped}'`;
  }

  throw ErrorFactory.createValidationError(`Unsupported default type for ${table}.${def.name}`);
}

function buildColumnSql(driver: SupportedDriver, table: string, def: ColumnDefinition): string {
  assertIdentifier('table', table);
  assertIdentifier('column', def.name);

  const col = quoteIdent(driver, def.name);

  if (def.autoIncrement === true) {
    if (def.type !== 'INTEGER') {
      throw ErrorFactory.createValidationError(
        `Auto-increment column must be INTEGER: ${table}.${def.name}`
      );
    }
    return getAutoIncrementColumnSql(driver, col);
  }

  const parts: string[] = [`${col} ${getColumnTypeSql(driver, def)}`];

  if (
    driver === 'mysql' &&
    def.unsigned === true &&
    (def.type === 'INTEGER' || def.type === 'REAL')
  ) {
    parts.push('UNSIGNED');
  }

  if (def.nullable !== true) parts.push('NOT NULL');
  if (def.unique === true) parts.push('UNIQUE');
  if (def.primary === true) parts.push('PRIMARY KEY');

  const defaultSql = formatDefaultValueSql(table, def);
  if (defaultSql !== null) parts.push(defaultSql);

  return parts.join(' ');
}

function buildPrimaryKeyConstraintSql(driver: SupportedDriver, columns: string[]): string {
  const cols = columns.map((c) => {
    assertIdentifier('column', c);
    return quoteIdent(driver, c);
  });
  return `PRIMARY KEY (${cols.join(', ')})`;
}

function buildForeignKeyConstraintSql(
  driver: SupportedDriver,
  table: string,
  fk: ForeignKeyDefinition
): string {
  assertIdentifier('table', table);
  assertIdentifier('foreign key', fk.name);
  assertIdentifier('referenced table', fk.referencedTable);
  for (const c of fk.columns) assertIdentifier('column', c);
  for (const c of fk.referencedColumns) assertIdentifier('referenced column', c);

  const constraint = `CONSTRAINT ${quoteIdent(driver, fk.name)}`;
  const localCols = fk.columns.map((c) => quoteIdent(driver, c)).join(', ');
  const refCols = fk.referencedColumns.map((c) => quoteIdent(driver, c)).join(', ');

  const parts: string[] = [
    `${constraint} FOREIGN KEY (${localCols}) REFERENCES ${quoteIdent(driver, fk.referencedTable)} (${refCols})`,
  ];

  if (fk.onDelete) parts.push(`ON DELETE ${normalizeForeignKeyAction(fk.onDelete)}`);
  if (fk.onUpdate) parts.push(`ON UPDATE ${normalizeForeignKeyAction(fk.onUpdate)}`);

  return parts.join(' ');
}

function buildCreateIndexSql(driver: SupportedDriver, table: string, idx: IndexDefinition): string {
  assertIdentifier('table', table);
  assertIdentifier('index', idx.name);
  for (const c of idx.columns) assertIdentifier('column', c);

  const unique = idx.type === 'UNIQUE' ? 'UNIQUE ' : '';
  const cols = idx.columns.map((c) => quoteIdent(driver, c)).join(', ');

  return `CREATE ${unique}INDEX ${quoteIdent(driver, idx.name)} ON ${quoteIdent(driver, table)} (${cols})`;
}

function buildDropIndexSql(driver: SupportedDriver, table: string, indexName: string): string {
  assertIdentifier('table', table);
  assertIdentifier('index', indexName);

  if (driver === 'mysql') {
    return `DROP INDEX ${quoteIdent(driver, indexName)} ON ${quoteIdent(driver, table)}`;
  }

  return `DROP INDEX IF EXISTS ${quoteIdent(driver, indexName)}`;
}

function buildDropTableSql(driver: SupportedDriver, table: string, ifExists: boolean): string {
  assertIdentifier('table', table);
  const ine = ifExists ? 'IF EXISTS ' : '';
  return `DROP TABLE ${ine}${quoteIdent(driver, table)}`;
}

function buildCreateTableStatements(
  driver: SupportedDriver,
  def: TableDefinition,
  ifNotExists: boolean
): string[] {
  assertIdentifier('table', def.name);

  if (def.columns.length === 0) {
    throw ErrorFactory.createValidationError(`Schema for table '${def.name}' has no columns`);
  }

  const primaryCols = def.columns.filter((c) => c.primary === true).map((c) => c.name);

  const colLines = def.columns.map((c) => buildColumnSql(driver, def.name, c));

  const constraints: string[] = [];
  if (primaryCols.length > 1) constraints.push(buildPrimaryKeyConstraintSql(driver, primaryCols));

  for (const fk of def.foreignKeys) {
    constraints.push(buildForeignKeyConstraintSql(driver, def.name, fk));
  }

  const allLines = [...colLines, ...constraints].map((l) => `  ${l}`);

  const ine = ifNotExists ? 'IF NOT EXISTS ' : '';
  const createSql = `CREATE TABLE ${ine}${quoteIdent(driver, def.name)} (\n${allLines.join(',\n')}\n)`;

  const statements: string[] = [createSql];

  for (const idx of def.indexes) {
    statements.push(buildCreateIndexSql(driver, def.name, idx));
  }

  return statements;
}

function compileAddColumns(
  driver: SupportedDriver,
  table: string,
  cols: ColumnDefinition[]
): string[] {
  return cols.map((col) => {
    const colSql = buildColumnSql(driver, table, col);
    return `ALTER TABLE ${quoteIdent(driver, table)} ADD COLUMN ${colSql}`;
  });
}

function compileIndexOps(driver: SupportedDriver, table: string, plan: AlterTablePlan): string[] {
  const create = plan.createIndexes.map((idx) => buildCreateIndexSql(driver, table, idx));
  const drop = plan.dropIndexes.map((idx) => buildDropIndexSql(driver, table, idx));
  return [...create, ...drop];
}

function compileAdvancedAlterOps(
  driver: SupportedDriver,
  table: string,
  plan: AlterTablePlan
): string[] {
  const needs =
    plan.dropColumns.length > 0 ||
    plan.addForeignKeys.length > 0 ||
    plan.dropForeignKeys.length > 0;
  if (!needs) return [];

  if (isSqliteFamily(driver)) {
    throw ErrorFactory.createValidationError(
      'SQLite/D1 does not support dropping columns or altering foreign keys safely (table rebuild required)'
    );
  }

  const statements: string[] = [];

  for (const col of plan.dropColumns) {
    assertIdentifier('column', col);
    statements.push(
      `ALTER TABLE ${quoteIdent(driver, table)} DROP COLUMN ${quoteIdent(driver, col)}`
    );
  }

  for (const fk of plan.addForeignKeys) {
    statements.push(
      `ALTER TABLE ${quoteIdent(driver, table)} ADD ${buildForeignKeyConstraintSql(driver, table, fk)}`
    );
  }

  for (const fkName of plan.dropForeignKeys) {
    assertIdentifier('foreign key', fkName);
    if (driver === 'mysql') {
      statements.push(
        `ALTER TABLE ${quoteIdent(driver, table)} DROP FOREIGN KEY ${quoteIdent(driver, fkName)}`
      );
      continue;
    }
    statements.push(
      `ALTER TABLE ${quoteIdent(driver, table)} DROP CONSTRAINT ${quoteIdent(driver, fkName)}`
    );
  }

  return statements;
}

function buildAlterTableStatements(
  driver: SupportedDriver,
  table: string,
  plan: AlterTablePlan
): string[] {
  assertIdentifier('table', table);

  return [
    ...compileAddColumns(driver, table, plan.addColumns),
    ...compileIndexOps(driver, table, plan),
    ...compileAdvancedAlterOps(driver, table, plan),
  ];
}

export const MigrationSchemaCompiler = Object.freeze({
  compileCreateTable(
    driver: string,
    def: TableDefinition,
    opts?: { ifNotExists?: boolean }
  ): string[] {
    const d = requireSupportedDriver(driver);
    return buildCreateTableStatements(d, def, opts?.ifNotExists !== false);
  },

  compileDropTable(driver: string, table: string, opts?: { ifExists?: boolean }): string {
    const d = requireSupportedDriver(driver);
    return buildDropTableSql(d, table, opts?.ifExists !== false);
  },

  compileAlterTable(driver: string, table: string, plan: AlterTablePlan): string[] {
    const d = requireSupportedDriver(driver);
    return buildAlterTableStatements(d, table, plan);
  },
});
