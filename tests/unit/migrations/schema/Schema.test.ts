import { describe, expect, it, vi } from 'vitest';

import { Schema } from '@/migrations/schema/Schema';

describe('Migration Schema builder', () => {
  it('creates and alters tables using compiled statements', async () => {
    const queries: string[] = [];
    const db = {
      getType: () => 'postgresql',
      getAdapterInstance: () => ({ getPlaceholder: (i: number) => `$${i}` }),
      query: async (sql: string) => {
        queries.push(sql);
        return [];
      },
    } as any;

    const schema = Schema.create(db);

    await schema.create('users', (table) => {
      table.id();
      table.string('email');
    });

    await schema.table('users', (table) => {
      table.string('name');
      table.dropColumn('legacy');
    });

    expect(queries.length).toBeGreaterThan(0);
  });

  it('checks table and column existence for sqlite', async () => {
    const db = {
      getType: () => 'sqlite',
      getAdapterInstance: () => ({ getPlaceholder: () => '?' }),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.startsWith('PRAGMA')) return [{ name: 'id' }];
        return [{ name: 'users' }];
      }),
    } as any;

    const schema = Schema.create(db);

    await expect(schema.hasTable('users')).resolves.toBe(true);
    await expect(schema.hasColumn('users', 'id')).resolves.toBe(true);
  });

  it('lists tables for mysql and throws on unsupported drivers', async () => {
    const db = {
      getType: () => 'mysql',
      getAdapterInstance: () => ({ getPlaceholder: () => '?' }),
      query: vi.fn().mockResolvedValue([{ name: 'users' }, { name: 'posts' }]),
    } as any;

    const schema = Schema.create(db);
    const tables = await schema.getAllTables();

    expect(tables).toEqual(['users', 'posts']);

    const unsupported = Schema.create({
      getType: () => 'oracle',
      getAdapterInstance: () => ({ getPlaceholder: () => '?' }),
      query: vi.fn(),
    } as any);

    await expect(unsupported.hasTable('users')).rejects.toThrow(/Unsupported DB driver/i);
  });
});
