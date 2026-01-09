/**
 * UserSeeder
 * Seeder for populating User table with test data
 */

import { Logger } from '@config/logger';
import { UserFactory } from '@database/factories/UserFactory';
import { Auth } from '@features/Auth';
import type { IDatabase } from '@orm/Database';

async function truncateUsersTable(db: IDatabase): Promise<void> {
  await db.table('users').where('id', 'IS NOT', null).delete();
}

function normalizeUserFactoryRecord(record: unknown): { name: string; email: string } {
  const row = record as Record<string, unknown>;
  const name = typeof row['name'] === 'string' ? row['name'] : 'User';
  const email = typeof row['email'] === 'string' ? row['email'] : `${name}@example.com`;
  return { name, email };
}

async function insertUserFactoryRecords(
  db: IDatabase,
  records: unknown[],
  getPassword: () => Promise<string>
): Promise<void> {
  await Promise.all(
    records.map(async (record) => {
      const { name, email } = normalizeUserFactoryRecord(record);
      const password = await getPassword();
      return db.table('users').insert({ name, email, password });
    })
  );
}

export const UserSeeder = Object.freeze({
  /**
   * Run the seeder
   * Populates the user table with 10 records
   */
  async run(db?: IDatabase): Promise<void> {
    if (db === undefined) {
      Logger.warn('UserSeeder.run() was called without a db instance; skipping.');
      return;
    }

    const count = 10;
    const factory = UserFactory.new();

    // Optionally truncate the table before seeding
    await truncateUsersTable(db);

    // Generate and create records
    const records = factory.count(count);

    await insertUserFactoryRecords(db, records, () => Auth.hash('password'));

    Logger.info(`✅ Seeded ${count} user records`);
  },

  /**
   * Get records from this seeder
   */
  async getRecords(
    count: number
  ): Promise<ReturnType<ReturnType<typeof UserFactory.new>['count']>> {
    const factory = UserFactory.new();
    return factory.count(count);
  },

  /**
   * Seed with specific states
   */
  async seedWithStates(db?: IDatabase): Promise<void> {
    if (db === undefined) {
      Logger.warn('UserSeeder.seedWithStates() was called without a db instance; skipping.');
      return;
    }

    const factory = UserFactory.new();

    // Create active records (50%)
    const active = factory.state('active').count(Math.ceil(10 * 0.5));
    const activePromise = insertUserFactoryRecords(db, active, () => Auth.hash('password'));

    // Create inactive records (30%)
    const inactive = factory.state('inactive').count(Math.ceil(10 * 0.3));
    const inactivePromise = insertUserFactoryRecords(db, inactive, () => Auth.hash('password'));

    // Create deleted records (20%)
    const deleted = factory.state('deleted').count(Math.ceil(10 * 0.2));
    const deletedPromise = insertUserFactoryRecords(db, deleted, () => Auth.hash('password'));

    await Promise.all([activePromise, inactivePromise, deletedPromise]);

    Logger.info(`✅ Seeded 10 user records with state distribution`);
  },

  /**
   * Seed with relationships
   */
  async seedWithRelationships(db?: IDatabase): Promise<void> {
    if (db === undefined) {
      Logger.warn('UserSeeder.seedWithRelationships() was called without a db instance; skipping.');
      return;
    }

    const factory = UserFactory.new();
    const password = await Auth.hash('password');

    const records = factory.count(10);

    // Create records with relationships (implement as needed)
    await insertUserFactoryRecords(db, records, async () => password);

    Logger.info(`✅ Seeded 10 user records with relationships`);
  },

  /**
   * Reset seeder (truncate table)
   */
  async reset(db?: IDatabase): Promise<void> {
    if (db === undefined) {
      Logger.warn('UserSeeder.reset() was called without a db instance; skipping.');
      return;
    }

    await truncateUsersTable(db);
    Logger.info('✅ Truncated users table');
  },
});
