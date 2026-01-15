import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IDatabase } from '@orm/Database';
import { BaseAdapter } from '@orm/DatabaseAdapter';

import { isSqliteFamily } from '@migrations/enum';
import { MigrationBlueprint } from '@migrations/schema/Blueprint';
import { MigrationSchemaCompiler } from '@migrations/schema/SchemaCompiler';
import type { Blueprint, BlueprintCallback, SchemaBuilder } from '@migrations/schema/types';

const IDENT_RE = /^[A-Za-z_]\w*$/;

function assertIdentifier(label: string, value: string): void {
  if (!IDENT_RE.test(value)) {
    throw ErrorFactory.createValidationError(`Invalid ${label} identifier: ${value}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStringProp(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const v = value[key];
  return typeof v === 'string' ? v : null;
}

function mapNames(rows: unknown[]): string[] {
  return rows.map((r) => getStringProp(r, 'name') ?? '').filter((name) => name.length > 0);
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
