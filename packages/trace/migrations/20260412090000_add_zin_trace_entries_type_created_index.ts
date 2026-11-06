/**
 * Migration: AddZinTraceEntriesTypeCreatedIndex
 * Adds a composite index so type-filtered, newest-first list queries read the index in order
 * instead of sorting every matching row (which also loads full content for the sort).
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

const TABLE = 'zin_trace_entries';
const INDEX_NAME = 'idx_zin_trace_type_created_id';

const hasIndex = async (db: IDatabase, tableName: string, indexName: string): Promise<boolean> => {
  const t = db.getType();

  if (t === 'mysql') {
    const rows = await db.query(
      'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name=? AND index_name=? LIMIT 1',
      [tableName, indexName],
      true
    );
    return rows.length > 0;
  }

  if (t === 'postgresql') {
    const rows = await db.query(
      "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename=? AND indexname=? LIMIT 1",
      [tableName, indexName],
      true
    );
    return rows.length > 0;
  }

  if (t === 'sqlite' || t === 'd1' || t === 'd1-remote') {
    const rows = await db.query(`PRAGMA index_list("${tableName}")`, [], true);
    return rows.some((row) => (row as { name?: unknown }).name === indexName);
  }

  if (t === 'sqlserver') {
    const rows = await db.query(
      'SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(?) AND name=?',
      [tableName, indexName],
      true
    );
    return rows.length > 0;
  }

  return false;
};

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    if (!(await schema.hasTable(TABLE))) return;
    if (await hasIndex(db, TABLE, INDEX_NAME)) return;

    await schema.table(TABLE, (table: Blueprint) => {
      table.index(['type', 'created_at', 'id'], INDEX_NAME);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    if (!(await schema.hasTable(TABLE))) return;
    if (!(await hasIndex(db, TABLE, INDEX_NAME))) return;

    if (db.getType() === 'mysql' || db.getType() === 'sqlserver') {
      await db.query(`DROP INDEX ${INDEX_NAME} ON ${TABLE}`, []);
      return;
    }

    await schema.table(TABLE, (table: Blueprint) => {
      table.dropIndex(INDEX_NAME);
    });
  },
};
