import type { IDatabase } from '@zintrust/core/orm';

export interface Seeder {
  run(db: IDatabase): Promise<void>;
}

export const UserSeeder: Seeder = Object.freeze({
  async run(db: IDatabase): Promise<void> {
    // Example: Use UserFactory from ../factories/UserFactory
    // const users = UserFactory.count(5);
    // for (const user of users) {
    //   Insert user data into database
    //   await db.query('INSERT INTO users (name, email, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    //     user.name, user.email, user.password, user.created_at, user.updated_at
    //   ]);
    // }
  },
});
