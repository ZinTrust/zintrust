import type { Blueprint, IDatabase } from '@zintrust/core';
import { MigrationSchema } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('tasks', (table: Blueprint) => {
      table.id();
      table.string('title');
      table.text('description').nullable();
      table.string('status').default('pending');
      table.integer('user_id');
      table.foreign('user_id').references('id').on('users').onDelete('CASCADE');
      table.timestamps();
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('tasks');
  },
};
