/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

type EnvSnapshot = {
  AURORA_RESOURCE_ARN?: string;
  AURORA_SECRET_ARN?: string;
  AURORA_DATABASE?: string;
};

const withEnv = async (values: EnvSnapshot, fn: () => Promise<void> | void): Promise<void> => {
  const prev: EnvSnapshot = {
    AURORA_RESOURCE_ARN: process.env['AURORA_RESOURCE_ARN'],
    AURORA_SECRET_ARN: process.env['AURORA_SECRET_ARN'],
    AURORA_DATABASE: process.env['AURORA_DATABASE'],
  };

  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) {
      delete (process.env as Record<string, string>)[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    return await Promise.resolve(fn());
  } finally {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) {
        delete (process.env as Record<string, string>)[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

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

describe('ConnectionManager coverage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    const { ConnectionManager } = await import('@/orm/ConnectionManager');
    await ConnectionManager.shutdownIfInitialized();
    vi.resetAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('rejects when pool exhausted and times out', async () => {
    const restore = await registerSqliteStub();

    const { ConnectionManager } = await import('@/orm/ConnectionManager');
    const instance = ConnectionManager.getInstance({
      adapter: 'sqlite',
      database: ':memory:',
      maxConnections: 1,
    });

    try {
      await instance.getConnection('c1');
      const pending = instance.getConnection('c2');

      const rejection = expect(pending).rejects.toThrow('Connection pool exhausted');
      await new Promise((resolve) => setTimeout(resolve, 30100));
      await rejection;
      await instance.closeAll();
    } finally {
      restore();
    }
  }, 35000);

  it('creates a new connection when ping fails', async () => {
    const { ConnectionManager } = await import('@/orm/ConnectionManager');
    const { DatabaseAdapterRegistry } = await import('@/orm/DatabaseAdapterRegistry');
    const { PostgreSQLAdapter } = await import('@/orm/adapters/PostgreSQLAdapter');

    const prevFactory = DatabaseAdapterRegistry.get('postgresql');

    let pingFailures = 0;
    DatabaseAdapterRegistry.register('postgresql', () => {
      let connected = false;
      return {
        connect: async () => {
          connected = true;
        },
        disconnect: async () => {
          connected = false;
        },
        query: async () => ({ rows: [], rowCount: 0 }),
        queryOne: async () => null,
        ping: async () => {
          if (pingFailures > 0) throw new Error('ping failed');
        },
        transaction: async <T>(fn: (adapter: any) => Promise<T>) => fn({} as any),
        rawQuery: async () => [],
        getType: () => 'postgresql',
        isConnected: () => connected,
        getPlaceholder: () => '?',
      };
    });

    const instance = ConnectionManager.getInstance({
      adapter: 'postgresql',
      database: 'test_db',
      host: 'localhost',
    });

    const conn1 = await instance.getConnection('default');
    pingFailures = 1;
    const conn2 = await instance.getConnection('default');

    expect(conn2).not.toBe(conn1);

    if (prevFactory) {
      DatabaseAdapterRegistry.register('postgresql', prevFactory);
    } else {
      DatabaseAdapterRegistry.register('postgresql', PostgreSQLAdapter.create);
    }
  });

  it('creates connections for d1-remote adapter', async () => {
    const { ConnectionManager } = await import('@/orm/ConnectionManager');

    const instance = ConnectionManager.getInstance({
      adapter: 'd1-remote',
      database: 'db',
      maxConnections: 2,
    });

    const conn = await instance.getConnection('d1');
    expect(conn.getType()).toBe('d1-remote');
  });

  it('creates connections for sqlite adapter', async () => {
    const restore = await registerSqliteStub();
    const { ConnectionManager } = await import('@/orm/ConnectionManager');

    try {
      const instance = ConnectionManager.getInstance({
        adapter: 'sqlite',
        database: ':memory:',
        maxConnections: 2,
      });

      const conn = await instance.getConnection('sqlite');
      expect(conn.getType()).toBe('sqlite');
    } finally {
      restore();
    }
  });

  it('rejects queued waiters when shutting down', async () => {
    const restore = await registerSqliteStub();
    const { ConnectionManager } = await import('@/orm/ConnectionManager');
    const instance = ConnectionManager.getInstance({
      adapter: 'sqlite',
      database: ':memory:',
      maxConnections: 1,
    });

    try {
      await instance.getConnection('c1');
      const pending = instance.getConnection('c2');
      await new Promise((resolve) => setImmediate(resolve));

      await instance.closeAll();

      await expect(pending).rejects.toThrow('Connection manager shutting down');
    } finally {
      restore();
    }
  });

  it('rejects when creating a connection for aurora-data-api adapter', async () => {
    const { ConnectionManager } = await import('@/orm/ConnectionManager');
    const instance = ConnectionManager.getInstance({
      adapter: 'aurora-data-api',
      database: 'db',
      maxConnections: 1,
    } as any);

    await expect(instance.getConnection('default')).rejects.toThrow(
      'Aurora Data API connections should be created via getAuroraDataApiConnection()'
    );
  });

  it('cleans up idle connections on interval', async () => {
    vi.useFakeTimers();
    const restore = await registerSqliteStub();
    const { ConnectionManager } = await import('@/orm/ConnectionManager');

    try {
      const instance = ConnectionManager.getInstance({
        adapter: 'sqlite',
        database: ':memory:',
        idleTimeout: 1,
      });

      await instance.getConnection('idle');
      await instance.releaseConnection('idle');

      await vi.advanceTimersByTimeAsync(300000);

      const stats = instance.getPoolStats();
      expect(stats.total).toBe(0);
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('uses Aurora Data API client module for execute and batch', async () => {
    vi.doMock('@zintrust/client-rds-data', () => ({
      getRdsDataClient: async () => ({
        executeStatement: async () => ({
          numberOfRecordsUpdated: 1,
          records: [{ ok: true }],
        }),
      }),
      getSecretsManagerClient: async () => ({
        getSecretValue: async () => ({ SecretString: '' }),
      }),
    }));

    await withEnv(
      {
        AURORA_RESOURCE_ARN: 'arn:aws:rds:region:acct:cluster:db',
        AURORA_SECRET_ARN: 'arn:aws:secretsmanager:region:acct:secret:db',
        AURORA_DATABASE: 'db',
      },
      async () => {
        const { ConnectionManager } = await import('@/orm/ConnectionManager');
        const instance = ConnectionManager.getInstance({
          adapter: 'sqlite',
          database: ':memory:',
        });

        const client = await instance.getAuroraDataApiConnection();
        const single = await client.execute('SELECT 1', [1]);
        expect(single.numberOfRecordsUpdated).toBe(1);
        expect(single.records).toEqual([{ ok: true }]);

        const batch = await client.batch([
          { sql: 'SELECT 1', params: [1] },
          { sql: 'SELECT 2', params: [2] },
        ]);
        expect(batch).toHaveLength(2);
      }
    );
  });

  it('throws when Aurora Data API module is missing', async () => {
    const err = Object.assign(new Error("Cannot find package '@zintrust/client-rds-data'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });

    vi.doMock('@zintrust/client-rds-data', () => {
      throw err;
    });

    await withEnv(
      {
        AURORA_RESOURCE_ARN: 'arn:aws:rds:region:acct:cluster:db',
        AURORA_SECRET_ARN: 'arn:aws:secretsmanager:region:acct:secret:db',
      },
      async () => {
        const { ConnectionManager } = await import('@/orm/ConnectionManager');
        const instance = ConnectionManager.getInstance({
          adapter: 'sqlite',
          database: ':memory:',
        });

        const client = await instance.getAuroraDataApiConnection();
        await expect(client.execute('SELECT 1')).rejects.toThrow('@zintrust/client-rds-data');
      }
    );
  });

  it('throws when Aurora Data API module is missing with empty message', async () => {
    const err = Object.assign(new Error(''), { code: 'ERR_MODULE_NOT_FOUND' });

    vi.doMock('@zintrust/client-rds-data', () => {
      throw err;
    });

    await withEnv(
      {
        AURORA_RESOURCE_ARN: 'arn:aws:rds:region:acct:cluster:db',
        AURORA_SECRET_ARN: 'arn:aws:secretsmanager:region:acct:secret:db',
      },
      async () => {
        const { ConnectionManager } = await import('@/orm/ConnectionManager');
        const instance = ConnectionManager.getInstance({
          adapter: 'sqlite',
          database: ':memory:',
        });

        const client = await instance.getAuroraDataApiConnection();
        await expect(client.execute('SELECT 1')).rejects.toThrow('@zintrust/client-rds-data');
      }
    );
  });

  it('handles Secrets Manager responses', async () => {
    vi.doMock('@zintrust/client-rds-data', () => ({
      getRdsDataClient: async () => ({
        executeStatement: async () => ({ numberOfRecordsUpdated: 0, records: [] }),
      }),
      getSecretsManagerClient: async () => ({
        getSecretValue: async () => ({
          SecretString: JSON.stringify({
            username: 'user',
            password: 'pass',
            host: 'localhost',
            port: 5432,
            database: 'db',
          }),
        }),
      }),
    }));

    const { getDatabaseSecret } = await import('@/orm/ConnectionManager');
    const secret = await getDatabaseSecret('secret');
    expect(secret.username).toBe('user');
  });

  it('wraps Secrets Manager errors when client throws', async () => {
    vi.doMock('@zintrust/client-rds-data', () => ({
      getRdsDataClient: async () => ({ numberOfRecordsUpdated: 0, records: [] }),
      getSecretsManagerClient: async () => ({ SecretString: '{invalid-json' }),
    }));

    const { getDatabaseSecret } = await import('@/orm/ConnectionManager');

    await expect(getDatabaseSecret('secret')).rejects.toThrow('Failed to fetch database secret');

    vi.resetModules();
    vi.doMock('@zintrust/client-rds-data', () => ({
      getRdsDataClient: async () => ({
        executeStatement: async () => ({ numberOfRecordsUpdated: 0, records: [] }),
      }),
      getSecretsManagerClient: async () => ({
        getSecretValue: async () => {
          throw new Error('boom');
        },
      }),
    }));

    const { getDatabaseSecret: getDatabaseSecret2 } = await import('@/orm/ConnectionManager');
    await expect(getDatabaseSecret2('secret')).rejects.toThrow('Failed to fetch database secret');
  });

  it('fails Secrets Manager on empty or invalid secret', async () => {
    vi.doMock('@zintrust/client-rds-data', () => ({
      getRdsDataClient: async () => ({
        executeStatement: async () => ({ numberOfRecordsUpdated: 0, records: [] }),
      }),
      getSecretsManagerClient: async () => ({
        getSecretValue: async () => ({ SecretString: ' ' }),
      }),
    }));

    const { getDatabaseSecret } = await import('@/orm/ConnectionManager');
    await expect(getDatabaseSecret('secret')).rejects.toThrow('Failed to fetch database secret');

    vi.resetModules();
    vi.doMock('@zintrust/client-rds-data', () => ({
      getRdsDataClient: async () => ({
        executeStatement: async () => ({ numberOfRecordsUpdated: 0, records: [] }),
      }),
      getSecretsManagerClient: async () => ({
        getSecretValue: async () => ({ SecretString: JSON.stringify({ username: 'u' }) }),
      }),
    }));

    const { getDatabaseSecret: getDatabaseSecret2 } = await import('@/orm/ConnectionManager');
    await expect(getDatabaseSecret2('secret')).rejects.toThrow('Failed to fetch database secret');
  });
});
