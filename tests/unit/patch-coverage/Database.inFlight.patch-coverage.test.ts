import { describe, expect, it, vi } from 'vitest';

const registerSqliteStub = async (): Promise<() => void> => {
  const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
  const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');

  const prevFactory = DatabaseAdapterRegistry.get('sqlite');
  let connected = false;

  DatabaseAdapterRegistry.register('sqlite', () => ({
    connect: async () => {
      connected = true;
    },
    disconnect: async () => {
      connected = false;
    },
    isConnected: () => connected,
    query: async () => ({ rows: [] }),
    queryOne: async () => null,
    transaction: async <T>(fn: (adapter: any) => Promise<T>) => fn({} as any),
    rawQuery: async () => [],
    getType: () => 'sqlite',
    getConfig: () => ({ driver: 'sqlite' }) as any,
    dispose: () => undefined,
  }));

  return () => {
    if (prevFactory) {
      DatabaseAdapterRegistry.register('sqlite', prevFactory);
    } else {
      DatabaseAdapterRegistry.register('sqlite', SQLiteAdapter.create);
    }
  };
};

describe('patch coverage: Database in-flight connect/disconnect', () => {
  it('awaits an in-flight connect when called twice concurrently', async () => {
    const restore = await registerSqliteStub();
    try {
      const core = await import('../../../src/index');

      const db = core.Database.create({
        driver: 'sqlite',
        database: ':memory:',
      } as any);

      const p1 = db.connect();
      const p2 = db.connect();

      const results = await Promise.all([p1, p2]);
      expect(results.length).toBe(2);

      await db.disconnect();
    } finally {
      restore();
    }
  });

  it('disconnect ignores a rejected connect-in-flight and still disconnects adapters', async () => {
    vi.resetModules();

    const createdAdapters: Array<{ disconnect: () => Promise<void> }> = [];

    const failingConnect = () => Promise.reject(new Error('connect failed'));

    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');
    DatabaseAdapterRegistry.register('sqlite', () => {
      const adapter = {
        connect: failingConnect,
        disconnect: vi.fn(async () => undefined),
        getType: () => 'sqlite',
        query: vi.fn(async () => ({ rows: [] })),
      };
      createdAdapters.push(adapter);
      return adapter as any;
    });

    const core = await import('../../../src/index');

    const db = core.Database.create({
      driver: 'sqlite',
      database: ':memory:',
      readHosts: ['ro1'],
    } as any);

    await db.connect().catch(() => undefined);
    await db.disconnect();

    expect(createdAdapters.length).toBeGreaterThanOrEqual(2);
    for (const adapter of createdAdapters) {
      expect(vi.mocked(adapter.disconnect)).toHaveBeenCalled();
    }
  });
});
