/**
 * Migration: AddWayTasksTable
 * Modifies tasks table
 */

import type { IDatabase } from '@orm/Database';
import { Schema as MigrationSchema, type Blueprint } from '@/migrations/schema';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  /**
   * Run migration
   */
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.table('tasks', (table: Blueprint) => {
      table.string('way');
      // Example:
      // table.dropColumn('old_column');
      // table.index('new_column');
    });
  },

  /**
   * Rollback migration
   */
  async down(_db: IDatabase): Promise<void> {
    // Note: dropping columns/FKs varies by driver; SQLite/D1 requires a table rebuild.
  },
};
