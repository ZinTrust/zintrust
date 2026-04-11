import { describe, expect, it, vi } from 'vitest';

describe('Database null normalization', () => {
  it('normalizes null-like strings returned by adapters on read queries', async () => {
    vi.resetModules();

    const fakeAdapter = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      isConnected: vi.fn(() => true),
      query: vi.fn(async () => ({
        rows: [{ deleted_at: 'NULL', lowered: 'null', note: 'NULLABLE' }],
        rowCount: 1,
      })),
      queryOne: vi.fn(async () => ({ deleted_at: 'NULL', lowered: 'null', note: 'NULLABLE' })),
      transaction: vi.fn(async (cb: (adapter: unknown) => Promise<unknown>) => cb(fakeAdapter)),
      rawQuery: vi.fn(async () => []),
      ping: vi.fn(async () => undefined),
      getType: vi.fn(() => 'sqlite'),
      getPlaceholder: vi.fn(() => '?'),
    };

    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    DatabaseAdapterRegistry.register('sqlite' as never, () => fakeAdapter as never);

    const { Database } = await import('@orm/Database');
    const db = Database.create({ driver: 'sqlite', database: ':memory:' } as never);

    await expect(db.query('SELECT * FROM users')).resolves.toEqual([
      { deleted_at: null, lowered: null, note: 'NULLABLE' },
    ]);
    await expect(db.queryOne('SELECT * FROM users LIMIT 1')).resolves.toEqual({
      deleted_at: null,
      lowered: null,
      note: 'NULLABLE',
    });
    await expect(db.execute('SELECT * FROM users')).resolves.toEqual({
      rows: [{ deleted_at: null, lowered: null, note: 'NULLABLE' }],
      rowCount: 1,
    });
  });
});
