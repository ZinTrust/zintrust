/**
 * Migration: AddWorkerStatusFields
 * Adds status tracking fields to workers table
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
      table.timestamp('last_health_check').nullable();
      table.text('last_error').nullable();
      table.string('connection_state').nullable();
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.table('zintrust_workers', (table: Blueprint) => {
      table.dropColumn('last_health_check');
      table.dropColumn('last_error');
      table.dropColumn('connection_state');
    });
  },
};
