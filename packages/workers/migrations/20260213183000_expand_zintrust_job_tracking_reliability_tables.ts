import type { Blueprint, IDatabase } from '@zintrust/core';
import { MigrationSchema } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.table('zintrust_jobs', (table: Blueprint) => {
      table.string('last_error_code').nullable();
      table.timestamp('timeout_at').nullable();
      table.timestamp('heartbeat_at').nullable();
      table.timestamp('expected_completion_at').nullable();
      table.string('worker_name').nullable();
      table.string('worker_instance_id').nullable();
      table.string('worker_region').nullable();
      table.string('worker_version').nullable();
      table.timestamp('recovered_at').nullable();
      table.string('idempotency_key').nullable();

      table.index(['status', 'updated_at']);
      table.index('expected_completion_at');
      table.index('heartbeat_at');
      table.index('idempotency_key');
    });

    await schema.create('zintrust_job_heartbeats', (table: Blueprint) => {
      table.id();
      table.string('job_id');
      table.string('queue_name');
      table.string('worker_instance_id').nullable();
      table.timestamp('last_heartbeat_at').nullable();
      table.timestamp('expected_next_heartbeat_at').nullable();
      table.integer('heartbeat_interval_ms').default(10000);
      table.timestamp('created_at').nullable();
      table.timestamp('updated_at').nullable();

      table.index(['queue_name', 'expected_next_heartbeat_at']);
      table.index(['job_id', 'queue_name']);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zintrust_job_heartbeats');
  },
};
