import { ErrorFactory } from '@exceptions/ZintrustError';

import type { SupportedDriver } from '@migrations/enum';
import { AdaptersEnum, ColumnType, isSqliteFamily, SchOther } from '@migrations/enum';
import type {
  ColumnDefinition,
  ForeignKeyAction,
  ForeignKeyDefinition,
  IndexDefinition,
  TableDefinition,
} from '@migrations/schema/types';

const IDENT_RE = /^[A-Za-z_]\w*$/;

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
    driver === AdaptersEnum.sqlite ||
    driver === AdaptersEnum.d1 ||
    driver === AdaptersEnum.d1Remote ||
    driver === AdaptersEnum.postgresql ||
    driver === AdaptersEnum.mysql ||
    driver === AdaptersEnum.sqlserver
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
  assertIdentifier(ColumnType.SQL, ident);
  if (driver === AdaptersEnum.mysql) return `\`${ident}\``;
  return `"${ident}"`;
}

function normalizeForeignKeyAction(action: ForeignKeyAction): string {
  switch (action) {
    case ColumnType.CASCADE:
    case ColumnType.SETNULL:
    case ColumnType.RESTRICT:
    case ColumnType.NOACTION:
    case ColumnType.SETDEFAULT:
      return action;
    default:
      throw ErrorFactory.createValidationError(`Unsupported foreign key action: ${String(action)}`);
  }
}

type ColumnTypeSqlHandler = (driver: SupportedDriver, def: ColumnDefinition) => string;

const TYPE_SQL: Record<ColumnDefinition['type'], ColumnTypeSqlHandler> = Object.freeze({
  STRING: (driver, def) => {
    const len =
      typeof def.length === SchOther.NUMBER && Number.isFinite(def.length) ? def.length : 255;
    return isSqliteFamily(driver) ? ColumnType.TEXT : `${ColumnType.VARCHAR}(${len})`;
  },
  INTEGER: (driver) => (driver === AdaptersEnum.mysql ? ColumnType.INT : ColumnType.INTEGER),
  BIGINT: () => ColumnType.BIGINT,
  UUID: (driver) => {
    if (driver === AdaptersEnum.postgresql) return ColumnType.UUID;
    return isSqliteFamily(driver) ? ColumnType.TEXT : `${ColumnType.VARCHAR}(36)`;
  },
  REAL: (driver) => (driver === AdaptersEnum.sqlserver ? ColumnType.FLOAT : ColumnType.REAL),
  BOOLEAN: (driver) => (driver === AdaptersEnum.mysql ? ColumnType.TINYINT_1 : ColumnType.BOOLEAN),
  TEXT: () => ColumnType.TEXT,
  JSON: (driver) => {
    if (driver === AdaptersEnum.postgresql) return ColumnType.JSONB;
    if (driver === AdaptersEnum.mysql) return ColumnType.JSON;
    return ColumnType.TEXT;
  },
  TIMESTAMP: (driver) => {
    if (driver === AdaptersEnum.mysql) return ColumnType.DATETIME;
    if (driver === AdaptersEnum.postgresql) return ColumnType.TIMESTAMP;
    return ColumnType.TEXT;
  },
  BLOB: (driver) => (driver === AdaptersEnum.postgresql ? ColumnType.BYTEA : ColumnType.BLOB),
});

function getColumnTypeSql(driver: SupportedDriver, def: ColumnDefinition): string {
  return TYPE_SQL[def.type](driver, def);
}

function getAutoIncrementColumnSql(
  driver: SupportedDriver,
  colName: string,
  type: ColumnDefinition['type']
): string {
  const sqliteFamily = isSqliteFamily(driver);

  if (sqliteFamily) {
    return `${colName} ${ColumnType.INTEGER} ${ColumnType.PRIMARY_KEY} ${ColumnType.AUTOINCREMENT}`;
  }
  if (driver === AdaptersEnum.postgresql) {
    return `${colName} ${type === ColumnType.BIGINT ? ColumnType.BIGSERIAL : ColumnType.SERIAL} ${ColumnType.PRIMARY_KEY}`;
  }
  if (driver === AdaptersEnum.mysql) {
    const typeSql = type === ColumnType.BIGINT ? ColumnType.BIGINT : ColumnType.INT;
    return `${colName} ${typeSql} ${ColumnType.AUTO_INCREMENT} ${ColumnType.PRIMARY_KEY}`;
  }
  if (driver === AdaptersEnum.sqlserver) {
    const typeSql = type === ColumnType.BIGINT ? ColumnType.BIGINT : ColumnType.INT;
    return `${colName} ${typeSql} ${ColumnType.IDENTITY_1_1} ${ColumnType.PRIMARY_KEY}`;
  }

  throw ErrorFactory.createValidationError(`Auto-increment not supported for driver: ${driver}`);
}

function formatDefaultValueSql(
  driver: SupportedDriver,
  table: string,
  def: ColumnDefinition
): string | null {
  if (def.defaultValue === undefined) return null;

  const dv = def.defaultValue;

  if (dv === null) return ColumnType.DEFAULT_NULL;
  if (typeof dv === 'number' && Number.isFinite(dv)) return `DEFAULT ${dv}`;
  if (typeof dv === 'boolean') {
    if (driver === AdaptersEnum.postgresql) return `DEFAULT ${dv ? 'true' : 'false'}`;
    return `DEFAULT ${dv ? 1 : 0}`;
  }
  if (typeof dv === 'string') {
    if (dv === ColumnType.CURRENT_TIMESTAMP) return `DEFAULT ${ColumnType.CURRENT_TIMESTAMP}`;
    const escaped = dv.replaceAll("'", "''");
    return `DEFAULT '${escaped}'`;
  }

  throw ErrorFactory.createValidationError(`Unsupported default type for ${table}.${def.name}`);
}

function buildColumnSql(driver: SupportedDriver, table: string, def: ColumnDefinition): string {
  assertIdentifier(SchOther.TABLE, table);
  assertIdentifier(SchOther.COLUMN, def.name);

  const col = quoteIdent(driver, def.name);

  if (def.autoIncrement === true) {
    if (def.type !== ColumnType.INTEGER && def.type !== ColumnType.BIGINT) {
      throw ErrorFactory.createValidationError(
        `Auto-increment column must be INTEGER or BIGINT: ${table}.${def.name}`
      );
    }
    return getAutoIncrementColumnSql(driver, col, def.type);
  }

  const parts: string[] = [`${col} ${getColumnTypeSql(driver, def)}`];

  if (
    driver === AdaptersEnum.mysql &&
    def.unsigned === true &&
    (def.type === ColumnType.INTEGER ||
      def.type === ColumnType.BIGINT ||
      def.type === ColumnType.REAL)
  ) {
    parts.push(ColumnType.UNSIGNED);
  }

  if (def.nullable !== true) parts.push(ColumnType.NOT_NULL);
  if (def.unique === true) parts.push(ColumnType.UNIQUE);
  if (def.primary === true) parts.push(ColumnType.PRIMARY_KEY);

  const defaultSql = formatDefaultValueSql(driver, table, def);
  if (defaultSql !== null) parts.push(defaultSql);

  return parts.join(' ');
}

function buildPrimaryKeyConstraintSql(driver: SupportedDriver, columns: string[]): string {
  const cols = columns.map((c) => {
    assertIdentifier(SchOther.COLUMN, c);
    return quoteIdent(driver, c);
  });
  return `${ColumnType.PRIMARY_KEY} (${cols.join(', ')})`;
}

function buildForeignKeyConstraintSql(
  driver: SupportedDriver,
  table: string,
  fk: ForeignKeyDefinition
): string {
  assertIdentifier(SchOther.TABLE, table);
  assertIdentifier(SchOther.FOREIGN_KEY, fk.name);
  assertIdentifier(SchOther.REFERENCED_TABLE, fk.referencedTable);
  for (const c of fk.columns) assertIdentifier(SchOther.COLUMN, c);
  for (const c of fk.referencedColumns) assertIdentifier(SchOther.REFERENCED_COLUMN, c);

  const constraint = `${ColumnType.CONSTRAINT} ${quoteIdent(driver, fk.name)}`;
  const localCols = fk.columns.map((c) => quoteIdent(driver, c)).join(', ');
  const refCols = fk.referencedColumns.map((c) => quoteIdent(driver, c)).join(', ');

  const parts: string[] = [
    `${constraint} ${ColumnType.FOREIGN_KEY_S} (${localCols}) ${ColumnType.REFERENCES} ${quoteIdent(driver, fk.referencedTable)} (${refCols})`,
  ];

  if (fk.onDelete) parts.push(`${ColumnType.ON_DELETE} ${normalizeForeignKeyAction(fk.onDelete)}`);
  if (fk.onUpdate) parts.push(`${ColumnType.ON_UPDATE} ${normalizeForeignKeyAction(fk.onUpdate)}`);

  return parts.join(' ');
}

function buildCreateIndexSql(driver: SupportedDriver, table: string, idx: IndexDefinition): string {
  assertIdentifier(SchOther.TABLE, table);
  assertIdentifier(SchOther.INDEX, idx.name);
  for (const c of idx.columns) assertIdentifier(SchOther.COLUMN, c);

  const unique = idx.type === ColumnType.UNIQUE ? `${ColumnType.UNIQUE} ` : '';
  const cols = idx.columns.map((c) => quoteIdent(driver, c)).join(', ');

  return `${ColumnType.CREATE_INDEX_S} ${unique}${quoteIdent(driver, idx.name)} ${ColumnType.ON} ${quoteIdent(driver, table)} (${cols})`;
}

function buildDropIndexSql(driver: SupportedDriver, table: string, indexName: string): string {
  assertIdentifier(SchOther.TABLE, table);
  assertIdentifier(SchOther.INDEX, indexName);

  if (driver === AdaptersEnum.mysql) {
    return `${ColumnType.DROP_INDEX_S} ${quoteIdent(driver, indexName)} ${ColumnType.ON} ${quoteIdent(driver, table)}`;
  }

  return `${ColumnType.DROP_INDEX_S} ${ColumnType.IF_EXISTS} ${quoteIdent(driver, indexName)}`;
}

function buildDropTableSql(driver: SupportedDriver, table: string, ifExists: boolean): string {
  assertIdentifier(SchOther.TABLE, table);
  const ine = ifExists ? `${ColumnType.IF_EXISTS} ` : '';
  return `${ColumnType.DROP_TABLE_S} ${ine}${quoteIdent(driver, table)}`;
}

function buildCreateTableStatements(
  driver: SupportedDriver,
  def: TableDefinition,
  ifNotExists: boolean
): string[] {
  assertIdentifier(SchOther.TABLE, def.name);

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

  const ine = ifNotExists ? `${ColumnType.IF_NOT_EXISTS} ` : '';
  const createSql = `${ColumnType.CREATE_TABLE_S} ${ine}${quoteIdent(driver, def.name)} (\n${allLines.join(',\n')}\n)`;

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
    return `${ColumnType.ALTER_TABLE_S} ${quoteIdent(driver, table)} ${ColumnType.ADD_COLUMN_S} ${colSql}`;
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
    assertIdentifier(SchOther.COLUMN, col);
    statements.push(
      `${ColumnType.ALTER_TABLE_S} ${quoteIdent(driver, table)} ${ColumnType.DROP_COLUMN_S} ${quoteIdent(driver, col)}`
    );
  }

  for (const fk of plan.addForeignKeys) {
    statements.push(
      `${ColumnType.ALTER_TABLE_S} ${quoteIdent(driver, table)} ${ColumnType.ADD} ${buildForeignKeyConstraintSql(driver, table, fk)}`
    );
  }

  for (const fkName of plan.dropForeignKeys) {
    assertIdentifier(SchOther.FOREIGN_KEY, fkName);
    if (driver === AdaptersEnum.mysql) {
      statements.push(
        `${ColumnType.ALTER_TABLE_S} ${quoteIdent(driver, table)} ${ColumnType.DROP} ${ColumnType.FOREIGN_KEY_S} ${quoteIdent(driver, fkName)}`
      );
      continue;
    }
    statements.push(
      `${ColumnType.ALTER_TABLE_S} ${quoteIdent(driver, table)} ${ColumnType.DROP} ${ColumnType.CONSTRAINT} ${quoteIdent(driver, fkName)}`
    );
  }

  return statements;
}

function buildAlterTableStatements(
  driver: SupportedDriver,
  table: string,
  plan: AlterTablePlan
): string[] {
  assertIdentifier(SchOther.TABLE, table);

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
