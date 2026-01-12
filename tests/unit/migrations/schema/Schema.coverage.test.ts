import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IDatabase } from '@orm/Database';

beforeEach(() => {
  vi.resetModules();
});

const makeDb = (
  driver: string,
  handler: (sql: string, params: unknown[]) => unknown[]
): IDatabase =>
  ({
    getType: () => driver,
    getAdapterInstance: () =>
      ({
        getPlaceholder: () => '?',
      }) as any,
    query: async (sql: string, params: unknown[] = []) => handler(sql, params),
    // unused for these tests
    connect: async () => undefined,
    disconnect: async () => undefined,
    isConnected: () => true,
    queryOne: async () => null,
    transaction: async (cb: any) => cb({}),
    table: (() => {
      throw new Error('not used');
    }) as any,
    onBeforeQuery: () => undefined,
    onAfterQuery: () => undefined,
    offBeforeQuery: () => undefined,
    offAfterQuery: () => undefined,
    getConfig: () => ({ driver }) as any,
    dispose: () => undefined,
  }) as unknown as IDatabase;

describe('migrations/schema/Schema (coverage)', () => {
  it('supports sqlite-family hasTable/hasColumn/getAllTables', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];

    const db = makeDb('sqlite', (sql, params) => {
      calls.push({ sql, params });

      if (sql.includes("name NOT LIKE 'sqlite_%'")) {
        return [{ name: 'users' }, { name: 'posts' }];
      }

      if (sql.includes('sqlite_master') && sql.includes("type='table'") && sql.includes('name=?')) {
        // hasTable query
        return [{}];
      }

      if (sql.startsWith('PRAGMA table_info')) {
        return [{ name: 'email' }, { name: 'id' }];
      }

      return [];
    });

    const { Schema } = await import('../../../../src/migrations/schema/Schema');
    const schema = Schema.create(db);

    expect(await schema.hasTable('users')).toBe(true);
    expect(await schema.hasColumn('users', 'email')).toBe(true);
    expect(await schema.getAllTables()).toEqual(['users', 'posts']);

    // identifier checks hit
    await expect(schema.hasColumn('bad-table', 'email')).rejects.toThrow();
  });

  it('runs create/table and executes compiled statements', async () => {
    const executed: string[] = [];

    const db = makeDb('postgresql', (sql) => {
      executed.push(sql);
      // queryExists usage in other calls returns rows length > 0
      if (sql.includes('information_schema')) return [{}];
      return [];
    });

    const { Schema } = await import('../../../../src/migrations/schema/Schema');
    const schema = Schema.create(db);

    await schema.create('users', async (t) => {
      t.id();
      t.string('email', 100).unique();
      t.timestamps();
      t.index(['email']);
    });

    expect(executed.some((s) => s.startsWith('CREATE TABLE'))).toBe(true);
    expect(executed.some((s) => s.startsWith('CREATE INDEX'))).toBe(true);

    // sqlite-family protections: dropping columns/altering FKs triggers error
    const sqliteDb = makeDb('sqlite', () => []);
    const sqliteSchema = (await import('../../../../src/migrations/schema/Schema')).Schema.create(
      sqliteDb
    );

    await expect(
      sqliteSchema.table('users', async (t) => {
        t.dropColumn('email');
      })
    ).rejects.toThrow();
  });

  it('supports postgres/mysql/sqlserver hasTable/hasColumn branches and rejects unknown driver', async () => {
    const pg = makeDb('postgresql', (sql) => (sql.includes('information_schema') ? [{}] : []));
    const mysql = makeDb('mysql', (sql) => (sql.includes('information_schema') ? [{}] : []));
    const sqlserver = makeDb('sqlserver', (sql) => (sql.includes('sys.') ? [{}] : []));

    const { Schema } = await import('../../../../src/migrations/schema/Schema');

    expect(await Schema.create(pg).hasTable('users')).toBe(true);
    expect(await Schema.create(pg).hasColumn('users', 'id')).toBe(true);

    expect(await Schema.create(mysql).hasTable('users')).toBe(true);
    expect(await Schema.create(mysql).hasColumn('users', 'id')).toBe(true);

    expect(await Schema.create(sqlserver).hasTable('users')).toBe(true);
    expect(await Schema.create(sqlserver).hasColumn('users', 'id')).toBe(true);

    const bad = makeDb('unknown', () => []);
    await expect(Schema.create(bad).hasTable('users')).rejects.toThrow();
  });
});
