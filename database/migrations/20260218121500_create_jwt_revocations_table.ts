/**
 * Migration: CreateJwtRevocationsTable
 * Creates a storage table for JWT token revocation (token invalidation).
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

    await schema.create('zintrust_jwt_revocations', (table: Blueprint) => {
      table.id();
      table.string('jti', 128).unique();
      table.string('sub', 191).nullable();
      table.bigInteger('expires_at_ms');
      table.timestamp('revoked_at').notNullable().default('CURRENT_TIMESTAMP');

      table.index(['expires_at_ms']);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zintrust_jwt_revocations');
  },
};
