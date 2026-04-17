/**
 * Migration: CreateUsersTable
 * Creates users table
 */

import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core';

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

    await schema.create('users', (table: Blueprint) => {
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
