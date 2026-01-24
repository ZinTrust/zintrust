/**
 * Migration: CreateQueueJobsTable
 * Creates queue_jobs table for database-driven queue system
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('queue_jobs', (table: Blueprint) => {
      table.uuid('id').primary();
      table.string('queue');
      table.json('payload');
      table.integer('attempts').default(0);
      table.integer('max_attempts').default(3);
      table.timestamp('reserved_at').nullable();
      table.timestamp('available_at').default('CURRENT_TIMESTAMP');
      table.timestamps();
      table.timestamp('failed_at').nullable();
      table.text('error_message').nullable();

      // Indexes for performance
      table.index('queue');
      table.index('available_at');
      table.index('reserved_at');
      table.index('failed_at');
    });

    // Create failed jobs table for dead letter queue
    await schema.create('queue_jobs_failed', (table: Blueprint) => {
      table.id();
      table.string('original_id');
      table.string('queue');
      table.json('payload');
      table.integer('attempts');
      table.timestamp('failed_at');
      table.text('error_message');
      table.timestamps();

      // Indexes for failed jobs
      table.index(['queue', 'failed_at']);
      table.index('failed_at');
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('queue_jobs_failed');
    await schema.dropIfExists('queue_jobs');
  },
};
