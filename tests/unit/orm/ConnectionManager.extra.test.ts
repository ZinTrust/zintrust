import { ConnectionManager } from '@orm/ConnectionManager';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const registerSqliteStub = async (): Promise<() => void> => {
  const { DatabaseAdapterRegistry } = await import('@/orm/DatabaseAdapterRegistry');
  const { SQLiteAdapter } = await import('@/orm/adapters/SQLiteAdapter');

  const prevFactory = DatabaseAdapterRegistry.get('sqlite');
  let connected = false;

  DatabaseAdapterRegistry.register('sqlite', () => ({
    connect: async () => {
      connected = true;
    },
    disconnect: async () => {
      connected = false;
    },
    query: async () => ({ rows: [], rowCount: 0 }),
    queryOne: async () => null,
    ping: async () => undefined,
    transaction: async <T>(fn: (adapter: any) => Promise<T>) => fn({} as any),
    rawQuery: async () => [],
    getType: () => 'sqlite',
    isConnected: () => connected,
    getPlaceholder: () => '?',
  }));

  return () => {
    if (prevFactory) {
      DatabaseAdapterRegistry.register('sqlite', prevFactory);
    } else {
      DatabaseAdapterRegistry.register('sqlite', SQLiteAdapter.create);
    }
  };
};

describe('ConnectionManager (extra tests)', () => {
  beforeEach(async () => {
    // Ensure any existing instance is shut down
    await ConnectionManager.shutdownIfInitialized();
  });

  afterEach(async () => {
    await ConnectionManager.shutdownIfInitialized();
  });

  it('creates, releases and reuses a connection and reports pool stats', async () => {
    const restore = await registerSqliteStub();
    const cfg = { adapter: 'sqlite', database: 'testdb', maxConnections: 2 } as const;

    try {
      // initialize instance
      const instance = ConnectionManager.getInstance(cfg);

      const conn = await instance.getConnection('default');
      expect(conn).toBeDefined();
      expect(conn.getType()).toBe('sqlite');

      const stats1 = instance.getPoolStats();
      expect(stats1.total).toBe(1);
      expect(stats1.active).toBe(1);
      expect(stats1.idle).toBe(0);

      // release connection back to pool
      await instance.releaseConnection('default');
      const stats2 = instance.getPoolStats();
      expect(stats2.total).toBe(1);
      expect(stats2.active).toBe(0);
      expect(stats2.idle).toBe(1);

      // get connection again (should reuse existing healthy connection)
      const conn2 = await instance.getConnection('default');
      expect(conn2).toBe(conn);

      // enable rds proxy mutates config safely
      await instance.enableRdsProxy('rds-proxy.local');

      // aurora data api connection exposes execute that throws config error
      const a = await instance.getAuroraDataApiConnection();
      await expect(a.execute('SELECT 1')).rejects.toThrow(
        /Aurora Data API requires AURORA_RESOURCE_ARN and AURORA_SECRET_ARN env vars/
      );

      // close everything
      await instance.closeAll();
      const stats3 = instance.getPoolStats();
      expect(stats3.total).toBe(0);
    } finally {
      restore();
    }
  });

  it('returns an instance after shutdownIfInitialized if previously initialized', async () => {
    await ConnectionManager.shutdownIfInitialized();
    expect(() => ConnectionManager.getInstance()).toThrow(
      'ConnectionManager not initialized. Call getInstance(config) first.'
    );

    const restore = await registerSqliteStub();
    try {
      const inst = ConnectionManager.getInstance({
        adapter: 'sqlite',
        database: 'testdb',
      });
      expect(inst).toBeDefined();
      expect(typeof inst.getConnection).toBe('function');
    } finally {
      restore();
    }
  });
});
