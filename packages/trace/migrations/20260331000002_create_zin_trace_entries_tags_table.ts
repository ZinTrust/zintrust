/**
 * Migration: CreateZinTraceEntriesTagsTable
 * Creates the tag join table for @zintrust/trace
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('zin_trace_entries_tags', (table: Blueprint) => {
      table.string('entry_uuid');
      table.string('tag');

      table.unique(['entry_uuid', 'tag']);
      table.index('tag');
      table.foreign('entry_uuid').references('uuid').on('zin_trace_entries').onDelete('CASCADE');
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zin_trace_entries_tags');
  },
};
