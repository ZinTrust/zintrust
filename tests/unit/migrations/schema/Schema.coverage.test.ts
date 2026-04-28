/* eslint-disable max-nested-callbacks -- mock-heavy coverage tests intentionally nest builder callbacks */

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

  it('reports sqlite foreign-key alter diagnostics with detected type mismatches', async () => {
    const db = makeDb('sqlite', (sql) => {
      if (sql === 'PRAGMA table_info("memberships")') {
        return [{ name: 'id', type: 'INTEGER' }];
      }

      if (sql === 'PRAGMA table_info("users")') {
        return [{ name: 'id', type: 'INTEGER' }];
      }

      return [];
    });

    const { Schema } = await import('../../../../src/migrations/schema/Schema');

    await expect(
      Schema.create(db).table('memberships', async (t) => {
        t.string('requested_by_user_id', 191).nullable();
        t.foreign('requested_by_user_id', 'fk_memberships_requested_by_user')
          .references('id')
          .on('users')
          .onDelete('SET NULL');
      })
    ).rejects.toThrow(
      /Add foreign key "fk_memberships_requested_by_user": memberships\.requested_by_user_id \[TEXT\] -> users\.id \[INTEGER\] \(detected SQLite affinity mismatch between local and referenced columns\)/
    );
  });

  it('covers sqlite affinity normalization families and planned affinity mapping in alter diagnostics', async () => {
    const db = makeDb('sqlite', (sql) => {
      if (sql === 'PRAGMA table_info("documents")') {
        return [
          { name: 'existing_json', type: 'JSON' },
          { name: 'existing_blob', type: 'BLOB' },
          { name: 'existing_real', type: 'DOUBLE PRECISION' },
          { name: 'existing_numeric', type: 'DECIMAL(10,2)' },
        ];
      }

      if (sql === 'PRAGMA table_info("archive")') {
        return [
          { name: 'blob_ref', type: 'BLOB' },
          { name: 'real_ref', type: 'DOUBLE' },
          { name: 'numeric_ref', type: 'DECIMAL' },
          { name: 'json_ref', type: 'JSON' },
        ];
      }

      return [];
    });

    const { Schema } = await import('../../../../src/migrations/schema/Schema');

    await expect(
      Schema.create(db).table('documents', async (t) => {
        t.integer('added_integer');
        t.bigInteger('added_bigint');
        t.real('added_real');
        t.blob('added_blob');
        t.boolean('added_boolean');
        t.foreign('added_blob', 'fk_documents_blob').references('blob_ref').on('archive');
        t.dropColumn('legacy_payload');
        t.dropForeign('fk_documents_legacy');
      })
    ).rejects.toThrow(
      /Drop columns: legacy_payload.*Add foreign key "fk_documents_blob": documents\.added_blob \[BLOB\] -> archive\.blob_ref \[BLOB\].*Drop foreign keys: fk_documents_legacy/
    );
  });

  it('covers default planned affinity fallback and drop-foreign-only sqlite alter guard', async () => {
    const db = makeDb('sqlite', (sql) => {
      if (sql === 'PRAGMA table_info("documents")') {
        return [{ name: 'id', type: 'INTEGER' }];
      }

      if (sql === 'PRAGMA table_info("archive")') {
        return [{ name: 'id', type: 'INTEGER' }];
      }

      return [];
    });

    const { Schema } = await import('../../../../src/migrations/schema/Schema');

    await expect(
      Schema.create(db).table('documents', async (t) => {
        t.string('mystery_column');
        t.foreign('mystery_column', 'fk_documents_mystery').references('id').on('archive');

        const originalGetDefinition = t.getDefinition.bind(t);
        (t as typeof t & { getDefinition: typeof t.getDefinition }).getDefinition = () => {
          const definition = originalGetDefinition();
          return {
            ...definition,
            columns: definition.columns.map((column) =>
              column.name === 'mystery_column' ? { ...column, type: 'DECIMAL' as never } : column
            ),
          };
        };
      })
    ).rejects.toThrow(
      /Add foreign key "fk_documents_mystery": documents\.mystery_column \[NUMERIC\] -> archive\.id \[INTEGER\] \(detected SQLite affinity mismatch between local and referenced columns\)/
    );
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
