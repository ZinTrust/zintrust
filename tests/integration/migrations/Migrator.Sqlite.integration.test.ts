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

function writeFailThenSucceedMigration(dir: string, markerFile: string): string {
  const filename = '20260101000000_fail_then_succeed.js';
  const filePath = join(dir, filename);

  const content = `import fs from 'node:fs';

export const migration = {
  async up(db) {
    if (!fs.existsSync(${JSON.stringify(markerFile)})) {
      fs.writeFileSync(${JSON.stringify(markerFile)}, '1', 'utf8');
      throw new Error('intentional failure');
    }
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

function writeSlowMigration(dir: string, sleepMs: number): string {
  const filename = '20260101000000_slow.js';
  const filePath = join(dir, filename);

  const content = `export const migration = {
  async up(db) {
    await new Promise((r) => setTimeout(r, ${sleepMs}));
    await db.query('CREATE TABLE IF NOT EXISTS slow_table (id INTEGER PRIMARY KEY AUTOINCREMENT)', []);
  },
  async down(db) {
    await db.query('DROP TABLE IF EXISTS slow_table', []);
  }
};
`;

  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function writeServiceOnlyMigration(dir: string): string {
  const filename = '20260101000001_create_service_table.js';
  const filePath = join(dir, filename);
  const content = `export const migration = {
  async up(db) {
    await db.query('CREATE TABLE IF NOT EXISTS service_only (id INTEGER PRIMARY KEY AUTOINCREMENT)', []);
  },
  async down(db) {
    await db.query('DROP TABLE IF EXISTS service_only', []);
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

  it('allows re-running a failed migration (recovery)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zintrust-migrator-'));
    const migrationsDir = join(root, 'database', 'migrations');
    mkdirSync(migrationsDir, { recursive: true });

    const marker = join(root, 'fail.marker');
    writeFailThenSucceedMigration(migrationsDir, marker);

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

      await expect(migrator.migrate()).rejects.toBeTruthy();

      const failedRow = (await db.queryOne(
        'SELECT name, status FROM migrations ORDER BY id ASC LIMIT 1',
        []
      )) as { name?: unknown; status?: unknown } | null;
      expect(failedRow?.name).toBe('20260101000000_fail_then_succeed');
      expect(failedRow?.status).toBe('failed');

      const run2 = await migrator.migrate();
      expect(run2.applied).toBe(1);

      const completedRow = (await db.queryOne(
        'SELECT name, status FROM migrations ORDER BY id ASC LIMIT 1',
        []
      )) as { name?: unknown; status?: unknown } | null;
      expect(completedRow?.name).toBe('20260101000000_fail_then_succeed');
      expect(completedRow?.status).toBe('completed');
    } finally {
      await db.disconnect();
    }
  });

  it('prevents concurrent migration runs with a lock file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zintrust-migrator-'));
    const migrationsDir = join(root, 'database', 'migrations');
    mkdirSync(migrationsDir, { recursive: true });

    writeSlowMigration(migrationsDir, 150);

    const dbFile = join(root, 'test.sqlite');
    const db = Database.create({ driver: 'sqlite', database: dbFile });
    await db.connect();

    try {
      const lockFile = join(root, '.zintrust', 'migrate.lock');

      const migrator1 = Migrator.create({
        db,
        projectRoot: root,
        globalDir: 'database/migrations',
        extension: '.js',
        separateTracking: false,
        lockFile,
      });
      const migrator2 = Migrator.create({
        db,
        projectRoot: root,
        globalDir: 'database/migrations',
        extension: '.js',
        separateTracking: false,
        lockFile,
      });

      const run1 = migrator1.migrate();
      // Give migrator1 time to acquire the lock.
      await new Promise((r) => setTimeout(r, 25));

      await expect(migrator2.migrate()).rejects.toBeTruthy();
      await run1;
    } finally {
      await db.disconnect();
    }
  });

  it('tracks global vs service migrations separately when enabled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zintrust-migrator-'));
    const globalMigrationsDir = join(root, 'database', 'migrations');
    mkdirSync(globalMigrationsDir, { recursive: true });
    writeMigration(globalMigrationsDir);

    const serviceName = 'ecommerce/users';
    const serviceMigrationsDir = join(root, 'services', serviceName, 'database', 'migrations');
    mkdirSync(serviceMigrationsDir, { recursive: true });
    writeServiceOnlyMigration(serviceMigrationsDir);

    const dbFile = join(root, 'test.sqlite');
    const db = Database.create({ driver: 'sqlite', database: dbFile });
    await db.connect();

    try {
      const migrator = Migrator.create({
        db,
        projectRoot: root,
        globalDir: 'database/migrations',
        extension: '.js',
        separateTracking: true,
        service: serviceName,
        includeGlobal: true,
      });

      const run = await migrator.migrate();
      expect(run.applied).toBe(2);

      const rows = (await db.query(
        'SELECT name, scope, service, batch, status FROM migrations ORDER BY name ASC',
        []
      )) as Array<{
        name: unknown;
        scope: unknown;
        service: unknown;
        batch: unknown;
        status: unknown;
      }>;

      expect(rows.length).toBe(2);

      const nameOf = (r: { name: unknown }): string => (typeof r.name === 'string' ? r.name : '');
      const globalRow = rows.find((r) => nameOf(r) === '20260101000000_create_users');
      expect(globalRow?.scope).toBe('global');
      expect(globalRow?.service).toBe('');
      expect(globalRow?.status).toBe('completed');
      expect(globalRow?.batch).toBe(1);

      const serviceRow = rows.find((r) => nameOf(r) === '20260101000001_create_service_table');
      expect(serviceRow?.scope).toBe('service');
      expect(serviceRow?.service).toBe(serviceName);
      expect(serviceRow?.status).toBe('completed');
      expect(serviceRow?.batch).toBe(1);
    } finally {
      await db.disconnect();
    }
  });
});
