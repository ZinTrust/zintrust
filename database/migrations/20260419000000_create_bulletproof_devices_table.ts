/**
 * Migration: CreateBulletproofDevicesTable
 * Creates the core-backed device store used by Bulletproof authentication.
 */
import { Schema as MigrationSchema, type Blueprint } from '@/migrations/schema';
import type { IDatabase } from '@orm/Database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('zintrust_bulletproof_devices', (table: Blueprint) => {
      table.id();
      table.string('user_id', 191).nullable();
      table.string('device_id', 191).unique();
      table.text('signing_secret');
      table.text('user_agent').nullable();
      table.timestamp('last_seen_at').notNullable().default('CURRENT_TIMESTAMP');
      table.timestamp('created_at').notNullable().default('CURRENT_TIMESTAMP');
      table.timestamp('updated_at').notNullable().default('CURRENT_TIMESTAMP');

      table.index(['user_id']);
      table.index(['last_seen_at']);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zintrust_bulletproof_devices');
  },
};
