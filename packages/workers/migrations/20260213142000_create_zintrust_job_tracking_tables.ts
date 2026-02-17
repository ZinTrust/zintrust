import type { Blueprint, IDatabase } from '@zintrust/core';
import { MigrationSchema } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('zintrust_jobs', (table: Blueprint) => {
      table.id();
      table.string('job_id');
      table.string('queue_name');
      table.string('status');
      table.integer('attempts').default(0);
      table.integer('max_attempts').nullable();
      table.text('payload_json').notNullable();
      table.text('result_json').nullable();
      table.text('last_error').nullable();
      table.timestamp('retry_at').nullable();
      table.timestamp('created_at').nullable();
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamp('updated_at').nullable();

      table.index(['job_id', 'queue_name']);
      table.index(['queue_name', 'status']);
      table.index('updated_at');
    });

    await schema.create('zintrust_job_transitions', (table: Blueprint) => {
      table.id();
      table.string('job_id');
      table.string('queue_name');
      table.string('from_status').nullable();
      table.string('to_status');
      table.string('reason').nullable();
      table.integer('attempts').nullable();
      table.text('error').nullable();
      table.timestamp('transitioned_at').nullable();
      table.timestamps();

      table.index(['job_id', 'queue_name']);
      table.index('transitioned_at');
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zintrust_job_transitions');
    await schema.dropIfExists('zintrust_jobs');
  },
};
