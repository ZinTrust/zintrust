import { Schema as MigrationSchema, type Blueprint } from '@zintrust/core/migrations';
import type { IDatabase } from '@zintrust/core/orm';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('users', (table: Blueprint) => {
      table.id();
      table.string('name');
      table.string('email').unique();
      table.string('password');
      table.timestamp('email_verified_at').nullable();
      table.boolean('active').default(true);
      table.timestamps();
      table.timestamp('deleted_at').nullable();
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('users');
  },
};
