import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase, useEnsureDbConnected } from '@orm/Database';

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
    query: async () => ({ rows: [], rowCount: 0 }),
    queryOne: async () => null,
    transaction: async <T>(fn: (adapter: any) => Promise<T>) => fn({} as any),
    rawQuery: async () => [],
    getType: () => 'sqlite',
    getPlaceholder: () => '?',
    ping: async () => undefined,
  }));

  return () => {
    if (prevFactory) {
      DatabaseAdapterRegistry.register('sqlite', prevFactory);
    } else {
      DatabaseAdapterRegistry.register('sqlite', SQLiteAdapter.create);
    }
  };
};

afterEach(async () => {
  await resetDatabase();
  vi.restoreAllMocks();
});

describe('useEnsureDbConnected (patch coverage)', () => {
  it('connects when database is not connected', async () => {
    const restore = await registerSqliteStub();
    try {
      const db = await useEnsureDbConnected({ driver: 'sqlite', database: ':memory:' }, 'default');
      expect(db.isConnected()).toBe(true);
    } finally {
      restore();
    }
  });

  it('does not call connect when already connected', async () => {
    const restore = await registerSqliteStub();
    try {
      const db = await useEnsureDbConnected({ driver: 'sqlite', database: ':memory:' }, 'default');

      // If useEnsureDbConnected tries to reconnect, this will fail the test.
      (db as any).connect = vi.fn(async () => {
        throw new Error('should not reconnect');
      });

      const again = await useEnsureDbConnected(undefined, 'default');
      expect(again).toBe(db);
      expect((db as any).connect).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
