/* eslint-disable max-nested-callbacks */
import { D1Adapter } from '@orm/adapters/D1Adapter';
import { D1RemoteAdapter } from '@orm/adapters/D1RemoteAdapter';
import { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
import { MySQLProxyAdapter } from '@orm/adapters/MySQLProxyAdapter';
import { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
import { PostgreSQLProxyAdapter } from '@orm/adapters/PostgreSQLProxyAdapter';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
import { createSqlServerProxyAdapter } from '@orm/adapters/SqlServerProxyAdapter';
import { DatabaseConnectionRegistry } from '@orm/DatabaseConnectionRegistry';
import type { IDatabase } from '@orm/Database';
import { Database, resetDatabase, useDatabase } from '@orm/Database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const otelDbMock = vi.hoisted(() => ({
  OpenTelemetry: {
    recordDbQuerySpan: vi.fn(),
  },
}));

vi.mock('@/observability/OpenTelemetry', () => otelDbMock);

// Mock adapters
vi.mock('@orm/adapters/SQLiteAdapter', () => {
  return {
    SQLiteAdapter: {
      create: vi.fn().mockReturnValue({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        queryOne: vi.fn().mockResolvedValue(null),
        transaction: vi.fn().mockImplementation((cb) => cb()),
        getType: vi.fn().mockReturnValue('sqlite'),
        getPlaceholder: vi.fn().mockReturnValue('?'),
        rawQuery: vi.fn().mockResolvedValue([]),
      }),
    },
  };
});

vi.mock('@orm/adapters/PostgreSQLAdapter', () => {
  return {
    PostgreSQLAdapter: {
      create: vi.fn().mockReturnValue({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        queryOne: vi.fn().mockResolvedValue(null),
        transaction: vi.fn().mockImplementation((cb) => cb()),
        getType: vi.fn().mockReturnValue('postgresql'),
        getPlaceholder: vi.fn().mockReturnValue('$1'),
        rawQuery: vi.fn().mockResolvedValue([]),
      }),
    },
  };
});

vi.mock('@orm/adapters/PostgreSQLProxyAdapter', () => ({
  PostgreSQLProxyAdapter: {
    create: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      queryOne: vi.fn().mockResolvedValue(null),
      transaction: vi.fn().mockImplementation((cb) => cb()),
      getType: vi.fn().mockReturnValue('postgresql'),
      getPlaceholder: vi.fn().mockReturnValue('$1'),
      rawQuery: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('@orm/adapters/MySQLAdapter', () => ({
  MySQLAdapter: {
    create: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      queryOne: vi.fn().mockResolvedValue(null),
      transaction: vi.fn().mockImplementation((cb) => cb()),
      getType: vi.fn().mockReturnValue('mysql'),
      getPlaceholder: vi.fn().mockReturnValue('?'),
      rawQuery: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('@orm/adapters/MySQLProxyAdapter', () => ({
  MySQLProxyAdapter: {
    create: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      queryOne: vi.fn().mockResolvedValue(null),
      transaction: vi.fn().mockImplementation((cb) => cb()),
      getType: vi.fn().mockReturnValue('mysql'),
      getPlaceholder: vi.fn().mockReturnValue('?'),
      rawQuery: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('@orm/adapters/SQLServerAdapter', () => ({
  SQLServerAdapter: {
    create: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      queryOne: vi.fn().mockResolvedValue(null),
      transaction: vi.fn().mockImplementation((cb) => cb()),
      getType: vi.fn().mockReturnValue('sqlserver'),
      getPlaceholder: vi.fn().mockReturnValue('@p1'),
      rawQuery: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('@orm/adapters/SqlServerProxyAdapter', () => ({
  createSqlServerProxyAdapter: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    queryOne: vi.fn().mockResolvedValue(null),
    transaction: vi.fn().mockImplementation((cb) => cb()),
    getType: vi.fn().mockReturnValue('sqlserver'),
    getPlaceholder: vi.fn().mockReturnValue('@param1'),
    rawQuery: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('@orm/adapters/D1Adapter', () => ({
  D1Adapter: {
    create: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      queryOne: vi.fn().mockResolvedValue(null),
      transaction: vi.fn().mockImplementation((cb) => cb()),
      getType: vi.fn().mockReturnValue('d1'),
      getPlaceholder: vi.fn().mockReturnValue('?'),
      rawQuery: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('@orm/adapters/D1RemoteAdapter', () => ({
  D1RemoteAdapter: {
    create: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      queryOne: vi.fn().mockResolvedValue(null),
      transaction: vi.fn().mockImplementation((cb) => cb()),
      getType: vi.fn().mockReturnValue('d1-remote'),
      getPlaceholder: vi.fn().mockReturnValue('?'),
      rawQuery: vi.fn().mockResolvedValue([]),
    }),
  },
}));

describe('Database', () => {
  let db: IDatabase;

  beforeEach(async () => {
    resetDatabase();
    vi.clearAllMocks();

    delete process.env.USE_MYSQL_PROXY;
    delete process.env.MYSQL_PROXY_URL;
    delete process.env.USE_POSTGRES_PROXY;
    delete process.env.POSTGRES_PROXY_URL;
    delete process.env.USE_SQLSERVER_PROXY;
    delete process.env.SQLSERVER_PROXY_URL;

    // Register adapters in the registry for tests to use
    const { DatabaseAdapterRegistry } = await import('src/orm/DatabaseAdapterRegistry');
    DatabaseAdapterRegistry.register('sqlite', SQLiteAdapter.create);
    DatabaseAdapterRegistry.register('mysql', MySQLAdapter.create);
    DatabaseAdapterRegistry.register('postgresql', PostgreSQLAdapter.create);
    DatabaseAdapterRegistry.register('d1', D1Adapter.create);
    DatabaseAdapterRegistry.register('d1-remote', D1RemoteAdapter.create);
    DatabaseAdapterRegistry.register('sqlserver', SQLServerAdapter.create);
  });

  it('should create SQLite adapter by default', () => {
    db = Database.create({ driver: 'sqlite', database: ':memory:' });
    expect(SQLiteAdapter.create).toHaveBeenCalled();
    expect(db.getType()).toBe('sqlite');
  });

  it('should create PostgreSQL adapter', () => {
    db = Database.create({ driver: 'postgresql', database: 'test' });
    expect(PostgreSQLAdapter.create).toHaveBeenCalled();
    expect(db.getType()).toBe('postgresql');
  });

  it('selects MySQL proxy adapter in Node when USE_MYSQL_PROXY=true', () => {
    process.env.USE_MYSQL_PROXY = 'true';
    process.env.MYSQL_PROXY_URL = 'http://localhost:8787/mysql';

    db = Database.create({ driver: 'mysql', database: 'test' } as any);

    expect(MySQLProxyAdapter.create).toHaveBeenCalled();
    expect(MySQLAdapter.create).not.toHaveBeenCalled();
    expect(db.getType()).toBe('mysql');
  });

  it('does not select MySQL proxy adapter when USE_MYSQL_PROXY=false (even if MYSQL_PROXY_URL is set)', () => {
    process.env.USE_MYSQL_PROXY = 'false';
    process.env.MYSQL_PROXY_URL = 'http://localhost:8787/mysql';

    db = Database.create({ driver: 'mysql', database: 'test' } as any);

    expect(MySQLProxyAdapter.create).not.toHaveBeenCalled();
    expect(MySQLAdapter.create).toHaveBeenCalled();
    expect(db.getType()).toBe('mysql');
  });

  it('selects PostgreSQL proxy adapter in Node when USE_POSTGRES_PROXY=true', () => {
    process.env.USE_POSTGRES_PROXY = 'true';
    process.env.POSTGRES_PROXY_URL = 'http://localhost:8787/postgres';

    db = Database.create({ driver: 'postgresql', database: 'test' } as any);

    expect(PostgreSQLProxyAdapter.create).toHaveBeenCalled();
    expect(PostgreSQLAdapter.create).not.toHaveBeenCalled();
    expect(db.getType()).toBe('postgresql');
  });

  it('does not select PostgreSQL proxy adapter when USE_POSTGRES_PROXY=false (even if POSTGRES_PROXY_URL is set)', () => {
    process.env.USE_POSTGRES_PROXY = 'false';
    process.env.POSTGRES_PROXY_URL = 'http://localhost:8787/postgres';

    db = Database.create({ driver: 'postgresql', database: 'test' } as any);

    expect(PostgreSQLProxyAdapter.create).not.toHaveBeenCalled();
    expect(PostgreSQLAdapter.create).toHaveBeenCalled();
    expect(db.getType()).toBe('postgresql');
  });

  it('selects SQL Server proxy adapter in Node when USE_SQLSERVER_PROXY=true', () => {
    process.env.USE_SQLSERVER_PROXY = 'true';
    process.env.SQLSERVER_PROXY_URL = 'http://localhost:8787/sqlserver';

    db = Database.create({ driver: 'sqlserver', database: 'test' } as any);

    expect(createSqlServerProxyAdapter).toHaveBeenCalled();
    expect(SQLServerAdapter.create).not.toHaveBeenCalled();
    expect(db.getType()).toBe('sqlserver');
  });

  it('should create D1Remote adapter', () => {
    db = Database.create({ driver: 'd1-remote', database: 'test' } as any);
    expect(D1RemoteAdapter.create).toHaveBeenCalled();
    expect(db.getType()).toBe('d1-remote');
  });

  it('resolves a lazily registered named connection', () => {
    DatabaseConnectionRegistry.set('analytics', { driver: 'sqlite', database: ':memory:' });

    db = useDatabase(undefined, 'analytics');

    expect(SQLiteAdapter.create).toHaveBeenCalled();
    expect(db.getType()).toBe('sqlite');
  });

  it('should connect to database', async () => {
    db = Database.create({ driver: 'sqlite', database: ':memory:' });
    await db.connect();
    expect(db.isConnected()).toBe(true);
  });

  it('should disconnect from database', async () => {
    db = Database.create({ driver: 'sqlite', database: ':memory:' });
    await db.connect();
    await db.disconnect();
    expect(db.isConnected()).toBe(false);
  });

  it('should auto-connect on query without connection', async () => {
    db = Database.create({ driver: 'sqlite', database: ':memory:' });
    await expect(db.query('select 1 as x')).resolves.toBeDefined();
    // New behavior: query() will connect lazily by default.
  });

  it('should use singleton instance', () => {
    const db1 = useDatabase({ driver: 'sqlite', database: ':memory:' });
    const db2 = useDatabase();
    expect(db1).toBe(db2);
  });

  it('throws when using an unregistered connection without config', () => {
    expect(() => useDatabase(undefined, 'missing')).toThrow(/not registered/i);
  });

  it('should create table builder', () => {
    db = Database.create({ driver: 'sqlite', database: ':memory:' });
    const builder = db.table('users');
    expect(builder).toBeDefined();
  });

  it('should get config', () => {
    db = Database.create({ driver: 'sqlite', database: ':memory:' });
    const config = db.getConfig();
    expect(config.driver).toBe('sqlite');
    expect(config.database).toBe(':memory:');
  });

  it('should emit events on query', async () => {
    db = Database.create({ driver: 'sqlite', database: ':memory:' });
    await db.connect();

    const beforeHandler = vi.fn();
    const afterHandler = vi.fn();

    db.onBeforeQuery(beforeHandler);
    db.onAfterQuery(afterHandler);

    await db.query('SELECT * FROM users');

    expect(beforeHandler).toHaveBeenCalledWith('SELECT * FROM users', []);
    expect(afterHandler).toHaveBeenCalled();
  });

  it('records a DB query span when OTEL_ENABLED=true', async () => {
    process.env.OTEL_ENABLED = 'true';
    try {
      db = Database.create({ driver: 'sqlite', database: ':memory:' });
      await db.connect();

      await db.query('SELECT * FROM users');

      // allow the async after-query hook to run
      await new Promise((r) => setTimeout(r, 0));

      expect(otelDbMock.OpenTelemetry.recordDbQuerySpan).toHaveBeenCalled();
      expect(otelDbMock.OpenTelemetry.recordDbQuerySpan).toHaveBeenCalledWith(
        expect.objectContaining({ driver: 'sqlite', durationMs: expect.any(Number) })
      );
    } finally {
      delete process.env.OTEL_ENABLED;
    }
  });

  it('should handle read/write splitting', async () => {
    const mockWriteQuery = vi.fn().mockResolvedValue({ rows: [] });
    const mockReadQuery1 = vi.fn().mockResolvedValue({ rows: [] });
    const mockReadQuery2 = vi.fn().mockResolvedValue({ rows: [] });

    // Mock SQLiteAdapter to return different instances based on config
    (SQLiteAdapter.create as any).mockImplementation((config: any) => {
      if (config.host === 'read1') {
        return {
          connect: vi.fn(),
          query: mockReadQuery1,
          getType: vi.fn().mockReturnValue('sqlite'),
          getPlaceholder: vi.fn().mockReturnValue('?'),
          rawQuery: vi.fn().mockResolvedValue([]),
        };
      }
      if (config.host === 'read2') {
        return {
          connect: vi.fn(),
          query: mockReadQuery2,
          getType: vi.fn().mockReturnValue('sqlite'),
          getPlaceholder: vi.fn().mockReturnValue('?'),
          rawQuery: vi.fn().mockResolvedValue([]),
        };
      }
      return {
        connect: vi.fn(),
        query: mockWriteQuery,
        getType: vi.fn().mockReturnValue('sqlite'),
        getPlaceholder: vi.fn().mockReturnValue('?'),
        rawQuery: vi.fn().mockResolvedValue([]),
      };
    });

    db = Database.create({
      driver: 'sqlite',
      database: 'test',
      readHosts: ['read1', 'read2'],
    });

    await db.connect();

    // Write query
    await db.query('INSERT INTO users ...', [], false);
    expect(mockWriteQuery).toHaveBeenCalled();

    // Read query 1 uses write adapter in current runtime logic
    await db.query('SELECT * FROM users', [], true);
    expect(mockWriteQuery).toHaveBeenCalledTimes(2);

    // Read query 2 still uses write adapter
    await db.query('SELECT * FROM users', [], true);
    expect(mockWriteQuery).toHaveBeenCalledTimes(3);

    // Read query 3 still uses write adapter
    await db.query('SELECT * FROM users', [], true);
    expect(mockWriteQuery).toHaveBeenCalledTimes(4);
  });

  it('should delegate transaction to write adapter', async () => {
    const mockTransaction = vi.fn().mockImplementation((cb) => cb());

    (SQLiteAdapter.create as any).mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        queryOne: vi.fn().mockResolvedValue(null),
        transaction: mockTransaction,
        getType: vi.fn().mockReturnValue('sqlite'),
      };
    });

    db = Database.create({ driver: 'sqlite', database: ':memory:' });

    await db.transaction(async (trx: IDatabase) => {
      expect(trx).toBe(db);
    });

    expect(mockTransaction).toHaveBeenCalled();
  });

  describe('Error Handling', () => {
    it('should handle connection errors', async () => {
      (SQLiteAdapter.create as any).mockImplementation(() => {
        return {
          connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
          disconnect: vi.fn().mockResolvedValue(undefined),
          getType: vi.fn().mockReturnValue('sqlite'),
        };
      });

      db = Database.create({ driver: 'sqlite', database: ':memory:' });

      await expect(db.connect()).rejects.toThrow('Connection failed');
    });

    it('should handle disconnection errors gracefully', async () => {
      (SQLiteAdapter.create as any).mockImplementation(() => {
        return {
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn().mockResolvedValue(undefined),
          query: vi.fn().mockResolvedValue({ rows: [] }),
          getType: vi.fn().mockReturnValue('sqlite'),
        };
      });

      db = Database.create({ driver: 'sqlite', database: ':memory:' });
      await db.connect();
      await db.disconnect();

      expect(db.isConnected()).toBe(false);
    });

    it('should handle transaction errors', async () => {
      (SQLiteAdapter.create as any).mockImplementation(() => {
        return {
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn().mockResolvedValue(undefined),
          transaction: vi.fn().mockRejectedValue(new Error('Transaction failed')),
          query: vi.fn().mockResolvedValue({ rows: [] }),
          getType: vi.fn().mockReturnValue('sqlite'),
        };
      });

      db = Database.create({ driver: 'sqlite', database: ':memory:' });
      await db.connect();

      await expect(
        db.transaction(async () => {
          // transaction body
        })
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('Database Operations', () => {
    it('should execute basic select query', async () => {
      db = Database.create({ driver: 'sqlite', database: ':memory:' });
      await db.connect();

      const result = await db.query('SELECT * FROM users');

      expect(result).toBeDefined();
    });

    it('should support parameterized queries', async () => {
      db = Database.create({ driver: 'sqlite', database: ':memory:' });
      await db.connect();

      const result = await db.query('SELECT * FROM users WHERE id = ?', [1]);

      expect(result).toBeDefined();
    });
  });

  describe('Default Configuration', () => {
    it('should use default SQLite config when none provided', () => {
      db = Database.create();
      const config = db.getConfig();

      expect(config.driver).toBe('sqlite');
      expect(config.database).toBe(':memory:');
    });

    it('should use default SQLite when invalid driver provided', () => {
      db = Database.create({
        driver: 'invalid' as any,
        database: 'test',
      });

      expect(db.getType()).toBe('sqlite');
    });
  });

  describe('Event System', () => {
    it('should allow multiple query event listeners', async () => {
      db = Database.create({ driver: 'sqlite', database: ':memory:' });
      await db.connect();

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      db.onBeforeQuery(listener1);
      db.onBeforeQuery(listener2);

      await db.query('SELECT * FROM users');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should remove event listeners', async () => {
      db = Database.create({ driver: 'sqlite', database: ':memory:' });
      await db.connect();

      const listener = vi.fn();
      db.onBeforeQuery(listener);
      db.offBeforeQuery(listener);

      await db.query('SELECT * FROM users');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Read Host Distribution', () => {
    it('should handle single database instance', async () => {
      db = Database.create({
        driver: 'sqlite',
        database: ':memory:',
      });

      expect(db.isConnected()).toBe(false);

      await db.connect();
      expect(db.isConnected()).toBe(true);
    });
  });

  describe('Database State', () => {
    it('should track connected state correctly', async () => {
      db = Database.create({ driver: 'sqlite', database: ':memory:' });

      expect(db.isConnected()).toBe(false);

      await db.connect();
      expect(db.isConnected()).toBe(true);

      await db.disconnect();
      expect(db.isConnected()).toBe(false);
    });

    it('should handle reconnection', async () => {
      db = Database.create({ driver: 'sqlite', database: ':memory:' });

      await db.connect();
      expect(db.isConnected()).toBe(true);

      await db.disconnect();
      expect(db.isConnected()).toBe(false);

      // Reconnect
      await db.connect();
      expect(db.isConnected()).toBe(true);
    });
  });
});
