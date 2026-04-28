import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString, isObject } from '@helper/index';
import type { IDatabase } from '@orm/Database';
import { BaseAdapter } from '@orm/DatabaseAdapter';

import { isSqliteFamily } from '@migrations/enum';
import { MigrationBlueprint } from '@migrations/schema/Blueprint';
import { MigrationSchemaCompiler } from '@migrations/schema/SchemaCompiler';
import type {
  Blueprint,
  BlueprintCallback,
  ColumnDefinition,
  ForeignKeyDefinition,
  SchemaBuilder,
} from '@migrations/schema/types';

const IDENT_RE = /^[A-Za-z_]\w*$/;

function assertIdentifier(label: string, value: string): void {
  if (!IDENT_RE.test(value)) {
    throw ErrorFactory.createValidationError(`Invalid ${label} identifier: ${value}`);
  }
}

function getStringProp(value: unknown, key: string): string | null {
  if (!isObject(value)) return null;
  const v = value[key];
  return isNonEmptyString(v) ? v : null;
}

function mapNames(rows: unknown[]): string[] {
  return rows.map((r) => getStringProp(r, 'name') ?? '').filter((name) => name.length > 0);
}

type AlterTablePlan = {
  addColumns: ColumnDefinition[];
  dropColumns: string[];
  createIndexes: { name: string; columns: string[]; type: 'INDEX' | 'UNIQUE' }[];
  dropIndexes: string[];
  addForeignKeys: ForeignKeyDefinition[];
  dropForeignKeys: string[];
};

type SqliteColumnMeta = {
  name: string;
  affinity: string | null;
};

function normalizeSqliteAffinity(type: string | null): string | null {
  if (!isNonEmptyString(type)) return null;

  const normalized = type.trim().toUpperCase();
  if (normalized.includes('INT')) return 'INTEGER';
  if (
    normalized.includes('CHAR') ||
    normalized.includes('CLOB') ||
    normalized.includes('TEXT') ||
    normalized.includes('UUID') ||
    normalized.includes('DATE') ||
    normalized.includes('TIME') ||
    normalized.includes('JSON')
  ) {
    return 'TEXT';
  }
  if (normalized.includes('BLOB')) return 'BLOB';
  if (normalized.includes('REAL') || normalized.includes('FLOA') || normalized.includes('DOUB')) {
    return 'REAL';
  }

  return 'NUMERIC';
}

function getPlannedSqliteAffinity(def: ColumnDefinition): string {
  switch (def.type) {
    case 'STRING':
    case 'DATE':
    case 'UUID':
    case 'TEXT':
    case 'JSON':
    case 'TIMESTAMP':
      return 'TEXT';
    case 'INTEGER':
    case 'BIGINT':
      return 'INTEGER';
    case 'REAL':
      return 'REAL';
    case 'BLOB':
      return 'BLOB';
    case 'BOOLEAN':
      return 'NUMERIC';
    default:
      return 'NUMERIC';
  }
}

async function getSqliteTableColumns(
  db: IDatabase,
  tableName: string
): Promise<SqliteColumnMeta[]> {
  assertIdentifier('table', tableName);

  const rows = await db.query(`PRAGMA table_info("${tableName}")`, [], true);

  return rows
    .map((row) => {
      const name = getStringProp(row, 'name');
      if (!isNonEmptyString(name)) return null;
      return {
        name,
        affinity: normalizeSqliteAffinity(getStringProp(row, 'type')),
      } as SqliteColumnMeta;
    })
    .filter((row): row is SqliteColumnMeta => row !== null);
}

function getColumnAffinityLabel(affinity: string | null): string {
  return affinity ?? 'unknown';
}

function buildPlannedColumnMap(columns: ColumnDefinition[]): Map<string, string> {
  return new Map(columns.map((column) => [column.name, getPlannedSqliteAffinity(column)]));
}

function getColumnAffinity(
  columnName: string,
  existingColumns: Map<string, string | null>,
  plannedColumns: Map<string, string>
): string | null {
  return plannedColumns.get(columnName) ?? existingColumns.get(columnName) ?? null;
}

function describeSqliteForeignKey(
  tableName: string,
  fk: ForeignKeyDefinition,
  localColumns: Map<string, string | null>,
  plannedColumns: Map<string, string>,
  referencedColumns: Map<string, string | null>
): string {
  const local = fk.columns.map((column) => {
    const affinity = getColumnAffinity(column, localColumns, plannedColumns);
    return `${tableName}.${column} [${getColumnAffinityLabel(affinity)}]`;
  });

  const referenced = fk.referencedColumns.map((column) => {
    const affinity = referencedColumns.get(column) ?? null;
    return `${fk.referencedTable}.${column} [${getColumnAffinityLabel(affinity)}]`;
  });

  const hasMismatch = fk.columns.some((column, index) => {
    const localAffinity = getColumnAffinity(column, localColumns, plannedColumns);
    const referencedAffinity = referencedColumns.get(fk.referencedColumns[index]) ?? null;
    return (
      isNonEmptyString(localAffinity) &&
      isNonEmptyString(referencedAffinity) &&
      localAffinity !== referencedAffinity
    );
  });

  const mismatchSuffix = hasMismatch
    ? ' (detected SQLite affinity mismatch between local and referenced columns)'
    : '';

  return `Add foreign key "${fk.name}": ${local.join(', ')} -> ${referenced.join(', ')}${mismatchSuffix}`;
}

async function buildSqliteAlterTableDiagnostic(
  db: IDatabase,
  tableName: string,
  plan: AlterTablePlan
): Promise<string> {
  const details: string[] = [];

  if (plan.dropColumns.length > 0) {
    details.push(`Drop columns: ${plan.dropColumns.join(', ')}`);
  }

  if (plan.addForeignKeys.length > 0) {
    const localColumns = await getSqliteTableColumns(db, tableName);
    const localColumnMap = new Map(localColumns.map((column) => [column.name, column.affinity]));
    const plannedColumnMap = buildPlannedColumnMap(plan.addColumns);
    const foreignKeyDetails = await Promise.all(
      plan.addForeignKeys.map(async (fk) => {
        const referenced = await getSqliteTableColumns(db, fk.referencedTable);
        const referencedColumnMap = new Map(
          referenced.map((column) => [column.name, column.affinity])
        );

        return describeSqliteForeignKey(
          tableName,
          fk,
          localColumnMap,
          plannedColumnMap,
          referencedColumnMap
        );
      })
    );

    details.push(...foreignKeyDetails);
  }

  if (plan.dropForeignKeys.length > 0) {
    details.push(`Drop foreign keys: ${plan.dropForeignKeys.join(', ')}`);
  }

  return [
    `SQLite/D1 schema.table('${tableName}') cannot drop columns or alter foreign keys without a table rebuild.`,
    ...details,
  ].join(' ');
}

function buildParameterized(
  db: IDatabase,
  sql: string,
  parameters: unknown[]
): { sql: string; parameters: unknown[] } {
  const adapter = db.getAdapterInstance(false);
  return BaseAdapter.buildParameterizedQuery(sql, parameters, (i) => adapter.getPlaceholder(i));
}

async function queryExists(db: IDatabase, sql: string, parameters: unknown[]): Promise<boolean> {
  const built = buildParameterized(db, sql, parameters);
  const rows = await db.query(built.sql, built.parameters, true);
  return rows.length > 0;
}

async function runStatements(db: IDatabase, statements: string[]): Promise<void> {
  await statements
    .filter((sql) => sql.trim() !== '')
    .reduce(async (p, sql) => {
      await p;
      await db.query(sql, []);
    }, Promise.resolve());
}

async function schemaCreate(
  db: IDatabase,
  tableName: string,
  callback: BlueprintCallback<Blueprint>
): Promise<void> {
  const blueprint = MigrationBlueprint.create(tableName);
  await callback(blueprint);

  const statements = MigrationSchemaCompiler.compileCreateTable(
    db.getType(),
    blueprint.getDefinition(),
    {
      ifNotExists: true,
    }
  );

  await runStatements(db, statements);
}

async function schemaTable(
  db: IDatabase,
  tableName: string,
  callback: BlueprintCallback<Blueprint>
): Promise<void> {
  const blueprint = MigrationBlueprint.create(tableName);
  await callback(blueprint);

  const def = blueprint.getDefinition();
  const plan = {
    addColumns: def.columns,
    dropColumns: blueprint.getDropColumns(),
    createIndexes: def.indexes,
    dropIndexes: blueprint.getDropIndexes(),
    addForeignKeys: def.foreignKeys,
    dropForeignKeys: blueprint.getDropForeignKeys(),
  };

  if (
    isSqliteFamily(db.getType()) &&
    (plan.dropColumns.length > 0 ||
      plan.addForeignKeys.length > 0 ||
      plan.dropForeignKeys.length > 0)
  ) {
    throw ErrorFactory.createValidationError(
      await buildSqliteAlterTableDiagnostic(db, tableName, plan)
    );
  }

  const statements = MigrationSchemaCompiler.compileAlterTable(db.getType(), tableName, plan);
  await runStatements(db, statements);
}

async function schemaDrop(db: IDatabase, tableName: string, ifExists: boolean): Promise<void> {
  const sql = MigrationSchemaCompiler.compileDropTable(db.getType(), tableName, { ifExists });
  await db.query(sql, []);
}

async function schemaHasTable(db: IDatabase, tableName: string): Promise<boolean> {
  const t = db.getType();

  if (isSqliteFamily(t)) {
    return queryExists(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", [
      tableName,
    ]);
  }

  if (t === 'postgresql') {
    return queryExists(
      db,
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=? LIMIT 1",
      [tableName]
    );
  }

  if (t === 'mysql') {
    return queryExists(
      db,
      'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name=? LIMIT 1',
      [tableName]
    );
  }

  if (t === 'sqlserver') {
    return queryExists(db, 'SELECT 1 FROM sys.tables WHERE name=?', [tableName]);
  }

  throw ErrorFactory.createCliError(`Unsupported DB driver: ${t}`);
}

async function schemaHasColumn(
  db: IDatabase,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const t = db.getType();

  if (t === 'sqlite' || t === 'd1' || t === 'd1-remote') {
    assertIdentifier('table', tableName);
    assertIdentifier('column', columnName);

    const rows = await db.query(`PRAGMA table_info("${tableName}")`, [], true);
    return rows.some((r) => getStringProp(r, 'name') === columnName);
  }

  if (t === 'postgresql') {
    return queryExists(
      db,
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name=? LIMIT 1",
      [tableName, columnName]
    );
  }

  if (t === 'mysql') {
    return queryExists(
      db,
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name=? AND column_name=? LIMIT 1',
      [tableName, columnName]
    );
  }

  if (t === 'sqlserver') {
    return queryExists(db, 'SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(?) AND name=?', [
      tableName,
      columnName,
    ]);
  }

  throw ErrorFactory.createCliError(`Unsupported DB driver: ${t}`);
}

async function schemaGetAllTables(db: IDatabase): Promise<string[]> {
  const t = db.getType();

  if (t === 'sqlite' || t === 'd1' || t === 'd1-remote') {
    const rows = await db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      [],
      true
    );
    return mapNames(rows);
  }

  if (t === 'postgresql') {
    const rows = await db.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public'",
      [],
      true
    );
    return mapNames(rows);
  }

  if (t === 'mysql') {
    const rows = await db.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
      [],
      true
    );
    return mapNames(rows);
  }

  if (t === 'sqlserver') {
    const rows = await db.query('SELECT name FROM sys.tables', [], true);
    return mapNames(rows);
  }

  throw ErrorFactory.createCliError(`Unsupported DB driver: ${t}`);
}

function createSchemaBuilder(db: IDatabase): SchemaBuilder {
  return {
    create: async (tableName, callback) => schemaCreate(db, tableName, callback),
    table: async (tableName, callback) => schemaTable(db, tableName, callback),
    drop: async (tableName) => schemaDrop(db, tableName, false),
    dropIfExists: async (tableName) => schemaDrop(db, tableName, true),
    hasTable: async (tableName) => schemaHasTable(db, tableName),
    hasColumn: async (tableName, columnName) => schemaHasColumn(db, tableName, columnName),
    getAllTables: async () => schemaGetAllTables(db),
    getDb: () => db,
  };
}

export const Schema = Object.freeze({
  create: createSchemaBuilder,
});
