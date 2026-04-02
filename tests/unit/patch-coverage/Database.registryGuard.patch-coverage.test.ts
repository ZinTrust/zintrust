import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: orm/Database registry guard', () => {
  it('falls back to the built-in adapter when no adapters are registered', async () => {
    vi.resetModules();

    // Ensure the global registry is empty for this test.
    (globalThis as any).__zintrust_db_adapter_registry__ = new Map();

    vi.doMock('@exceptions/ZintrustError', () => ({
      ErrorFactory: {
        createConfigError: (message: string) => new Error(message),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    }));

    // Prevent real DB connections; we only need to reach the registry assertion.
    const fakeAdapter = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      queryOne: vi.fn(async () => null),
      ping: vi.fn(async () => undefined),
      transaction: vi.fn(async (cb: any) => cb(fakeAdapter)),
      rawQuery: vi.fn(async () => []),
      getType: () => 'sqlite',
      isConnected: () => true,
      getPlaceholder: () => '?',
    };

    vi.doMock('@orm/adapters/SQLiteAdapter', () => ({
      SQLiteAdapter: {
        create: () => fakeAdapter,
      },
    }));

    const { Database } = await import('@orm/Database');

    const db = Database.create({ driver: 'sqlite', database: ':memory:' } as any);

    await expect(db.query('select 1', [])).resolves.toEqual([]);
    expect(fakeAdapter.connect).toHaveBeenCalledTimes(1);
    expect(fakeAdapter.query).toHaveBeenCalledWith('select 1', []);
  });
});
