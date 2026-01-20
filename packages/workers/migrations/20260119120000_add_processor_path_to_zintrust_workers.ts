/**
 * Migration: AddProcessorPathToWorkersTable
 * Adds processor_path column for persisted worker processors
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.table('zintrust_workers', (table: Blueprint) => {
      table.string('processor_path').nullable();
    });
  },

  async down(_db: IDatabase): Promise<void> {
    // Note: dropping columns/FKs varies by driver; SQLite/D1 requires a table rebuild.
  },
};
