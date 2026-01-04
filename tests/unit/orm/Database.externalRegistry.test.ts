import { describe, expect, it, vi } from 'vitest';

describe('DatabaseAdapterRegistry integration', () => {
  it('uses registered adapter factory when available', async () => {
    vi.resetModules();

    const fakeAdapter = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      isConnected: vi.fn(() => true),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      queryOne: vi.fn(async () => null),
      transaction: vi.fn(async (cb: any) => cb(fakeAdapter)),
      rawQuery: vi.fn(async () => []),
      useDatabase: vi.fn(async () => undefined),
      ping: vi.fn(async () => undefined),
      getType: vi.fn(() => 'sqlite'),
      getPlaceholder: vi.fn(() => '?'),
    };

    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    DatabaseAdapterRegistry.register('sqlite' as any, () => fakeAdapter as any);

    const { Database } = await import('@orm/Database');
    const db = Database.create({ driver: 'sqlite', database: ':memory:' } as any);

    expect(db.getAdapterInstance()).toBe(fakeAdapter);
  });
});
