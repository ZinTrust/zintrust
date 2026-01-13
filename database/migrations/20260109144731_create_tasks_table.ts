/**
 * Migration: CreateTasksTable
 * Creates tasks table
 */

import { Schema as MigrationSchema, type Blueprint } from '@/migrations/schema';
import type { IDatabase } from '@orm/Database';

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

    await schema.create('tasks', (table: Blueprint) => {
      table.id();
      table.timestamps();
    });
  },

  /**
   * Rollback migration
   */
  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('tasks');
  },
};
