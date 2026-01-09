/**
 * Migration: CreateUsersTable
 * Creates users table
 */

import type { IDatabase } from '@orm/Database';
import { Schema as MigrationSchema } from '@/migrations/schema';

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

    await schema.create('users', (table) => {
      table.id();
      table.timestamps();
    });
  },

  /**
   * Rollback migration
   */
  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('users');
  },
};
