/**
 * Migration: CreateWorkersTable
 * Creates workers table for persistence
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('zintrust_workers', (table: Blueprint) => {
      table.id();
      table.string('name').unique();
      table.string('queue_name');
      table.string('version').nullable();
      table.string('status').default('running');
      table.boolean('auto_start').default(false);
      table.integer('concurrency').default(1);
      table.string('region').nullable();
      table.json('features').nullable();
      table.json('infrastructure').nullable();
      table.json('datacenter').nullable();
      table.timestamps();
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zintrust_workers');
  },
};
