import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('cf_queue_jobs', (table: Blueprint) => {
      table.string('id').primary();
      table.string('queue_name');
      table.string('name');
      table.text('payload');
      table.text('opts').nullable();
      table.string('state');
      table.integer('priority').default(0);
      table.integer('attempts').default(0);
      table.integer('max_attempts').default(1);
      table.text('progress').nullable();
      table.text('result').nullable();
      table.text('error').nullable();
      table.string('dedupe_key').nullable();
      table.string('idempotency_key').nullable();
      table.timestamp('available_at');
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamp('failed_at').nullable();
      table.timestamp('stalled_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');

      table.index(['queue_name', 'state', 'priority', 'available_at']);
      table.index(['queue_name', 'dedupe_key']);
      table.index(['queue_name', 'idempotency_key']);
      table.index(['queue_name', 'updated_at']);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('cf_queue_jobs');
  },
};
