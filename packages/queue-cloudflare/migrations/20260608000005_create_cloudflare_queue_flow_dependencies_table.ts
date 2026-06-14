import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('cf_queue_flow_dependencies', (table: Blueprint) => {
      table.string('id').primary();
      table.string('queue_name');
      table.string('parent_job_id');
      table.string('child_job_id');
      table.string('state');
      table.timestamp('created_at');
      table.timestamp('updated_at');

      table.index(['queue_name', 'parent_job_id']);
      table.index(['queue_name', 'child_job_id']);
      table.index(['queue_name', 'state']);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('cf_queue_flow_dependencies');
  },
};
