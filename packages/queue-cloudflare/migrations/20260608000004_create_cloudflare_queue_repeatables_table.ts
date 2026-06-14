import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core/database';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('cf_queue_repeatables', (table: Blueprint) => {
      table.string('id').primary();
      table.string('queue_name');
      table.string('name');
      table.text('payload');
      table.string('cron').nullable();
      table.integer('every_ms').nullable();
      table.timestamp('start_at').nullable();
      table.timestamp('end_at').nullable();
      table.integer('limit_count').nullable();
      table.integer('run_count').default(0);
      table.timestamp('next_run_at');
      table.boolean('active').default(true);
      table.timestamp('created_at');
      table.timestamp('updated_at');

      table.index(['active', 'next_run_at']);
      table.index(['queue_name', 'active']);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('cf_queue_repeatables');
  },
};
