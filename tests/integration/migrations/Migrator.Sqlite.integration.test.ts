import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { Migrator } from '@/migrations/Migrator';
import { Database } from '@orm/Database';

// Skip these tests when native better-sqlite3 is not loadable in the test runtime (ABI mismatch)
let HAS_NATIVE_SQLITE = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DB = require('better-sqlite3');
  const conn = new DB(':memory:');
  conn.close();
} catch {
  HAS_NATIVE_SQLITE = false;
}

function writeMigration(dir: string): string {
  const filename = '20260101000000_create_users.js';
  const filePath = join(dir, filename);

  // Keep this as plain ESM JavaScript so Node can import it without a TS loader.
  const content = `export const migration = {
  async up(db) {
    await db.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)', []);
  },
  async down(db) {
    await db.query('DROP TABLE IF EXISTS users', []);
  }
};
`;

  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

(HAS_NATIVE_SQLITE ? describe : describe.skip)('Migrator (SQLite) Integration', () => {
  it('applies and rolls back a JS migration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zintrust-migrator-'));
    const migrationsDir = join(root, 'database', 'migrations');
    mkdirSync(migrationsDir, { recursive: true });

    writeMigration(migrationsDir);

    const dbFile = join(root, 'test.sqlite');
    const db = Database.create({ driver: 'sqlite', database: dbFile });
    await db.connect();

    try {
      const migrator = Migrator.create({
        db,
        projectRoot: root,
        globalDir: 'database/migrations',
        extension: '.js',
        separateTracking: false,
      });

      const run1 = await migrator.migrate();
      expect(run1.applied).toBe(1);

      const usersTable = await db.queryOne(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
        []
      );
      expect(usersTable).toBeTruthy();

      const rows = (await db.query(
        'SELECT name, status FROM migrations ORDER BY id ASC',
        []
      )) as Array<{ name: unknown; status: unknown }>;

      expect(rows.length).toBe(1);
      expect(rows[0]?.name).toBe('20260101000000_create_users');
      expect(rows[0]?.status).toBe('completed');

      const rb = await migrator.rollbackLastBatch(1);
      expect(rb.rolledBack).toBe(1);

      const usersTableAfter = await db.queryOne(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
        []
      );
      expect(usersTableAfter).toBeNull();

      const rowsAfter = (await db.query('SELECT name FROM migrations', [])) as unknown[];
      expect(rowsAfter.length).toBe(0);
    } finally {
      await db.disconnect();
    }
  });
});
