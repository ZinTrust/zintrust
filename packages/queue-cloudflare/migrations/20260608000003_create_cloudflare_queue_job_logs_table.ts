import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('cf_queue_job_logs', (table: Blueprint) => {
      table.string('id').primary();
      table.string('job_id');
      table.string('queue_name');
      table.string('level');
      table.text('message');
      table.text('data').nullable();
      table.timestamp('created_at');

      table.index(['job_id', 'queue_name']);
      table.index(['queue_name', 'level', 'created_at']);
      table.index('created_at');
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('cf_queue_job_logs');
  },
};
