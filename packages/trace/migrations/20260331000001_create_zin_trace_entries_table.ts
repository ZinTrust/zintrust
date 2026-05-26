/**
 * Migration: CreateZinTraceEntriesTable
 * Creates the main entries table for @zintrust/trace
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('zin_trace_entries', (table: Blueprint) => {
      table.id();
      table.uuid('uuid').unique();
      table.string('batch_id');
      table.string('family_hash').nullable();
      table.string('type');
      table.text('content');
      table.boolean('is_latest').default(true);
      table.bigInteger('created_at');

      table.index('batch_id');
      table.index('family_hash');
      table.index('created_at');
      table.index(['type', 'is_latest']);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zin_trace_entries');
  },
};
