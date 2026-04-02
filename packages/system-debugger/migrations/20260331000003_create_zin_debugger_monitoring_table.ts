/**
 * Migration: CreateZinDebuggerMonitoringTable
 * Creates the tag watchlist table for @zintrust/system-debugger
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('zin_debugger_monitoring', (table: Blueprint) => {
      table.string('tag').primary();
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zin_debugger_monitoring');
  },
};
