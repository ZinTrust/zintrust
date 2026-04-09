/**
 * Migration: WidenTraceCreatedAtForSql
 * Ensures SQL engines that treat INTEGER as 32-bit can store millisecond timestamps.
 */
import { MigrationSchema, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

type DatabaseWithDriver = IDatabase & {
  getType?: () => string;
};

const alterCreatedAt = async (db: IDatabase): Promise<void> => {
  const driver = (db as DatabaseWithDriver).getType?.() ?? 'sqlite';
  if (driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote') return;

  const schema = MigrationSchema.create(db);
  if (!(await schema.hasTable('zin_trace_entries'))) return;
  if (!(await schema.hasColumn('zin_trace_entries', 'created_at'))) return;

  if (driver === 'mysql') {
    await db.query(
      'ALTER TABLE zin_trace_entries MODIFY COLUMN created_at BIGINT UNSIGNED NOT NULL',
      []
    );
    return;
  }

  if (driver === 'postgresql') {
    await db.query(
      'ALTER TABLE zin_trace_entries ALTER COLUMN created_at TYPE BIGINT USING created_at::bigint',
      []
    );
    return;
  }

  if (driver === 'sqlserver') {
    await db.query('ALTER TABLE zin_trace_entries ALTER COLUMN created_at BIGINT NOT NULL', []);
  }
};

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    await alterCreatedAt(db);
  },

  async down(_db: IDatabase): Promise<void> {
    return;
  },
};
