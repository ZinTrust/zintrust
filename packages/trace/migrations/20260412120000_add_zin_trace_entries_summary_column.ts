/**
 * Migration: AddZinTraceEntriesSummaryColumn
 * Adds a nullable precomputed list summary so list pages skip loading full entry content.
 * Existing rows keep NULL and are read through the content column, so no backfill is needed.
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

const TABLE = 'zin_trace_entries';
const COLUMN = 'summary';

/**
 * SQLite and D1 cannot drop columns through the schema builder, so down keeps the nullable column there.
 */
const isSqliteFamilyDriver = (driver: string): boolean =>
  driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote';

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    if (!(await schema.hasTable(TABLE))) return;
    if (await schema.hasColumn(TABLE, COLUMN)) return;

    if (db.getAdapterInstance().getType() === 'sqlserver') {
      await db.query(`ALTER TABLE ${TABLE} ADD ${COLUMN} NVARCHAR(MAX) NULL`, []);
      return;
    }

    await schema.table(TABLE, (table: Blueprint) => {
      table.text(COLUMN).nullable();
    });
  },

  async down(db: IDatabase): Promise<void> {
    if (isSqliteFamilyDriver(db.getAdapterInstance().getType())) return;

    const schema = MigrationSchema.create(db);
    if (!(await schema.hasTable(TABLE))) return;
    if (!(await schema.hasColumn(TABLE, COLUMN))) return;

    await schema.table(TABLE, (table: Blueprint) => {
      table.dropColumn(COLUMN);
    });
  },
};
