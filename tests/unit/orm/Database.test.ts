import { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { Database, resetDatabase, useDatabase } from '@orm/Database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock adapters
vi.mock('@orm/adapters/SQLiteAdapter', () => {
  const MockAdapter = vi.fn(function () {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      queryOne: vi.fn().mockResolvedValue(null),
      transaction: vi.fn().mockImplementation((cb) => cb()),
      getType: vi.fn().mockReturnValue('sqlite'),
    };
  });
  return { SQLiteAdapter: MockAdapter };
});

vi.mock('@orm/adapters/PostgreSQLAdapter', () => {
  const MockAdapter = vi.fn(function () {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      queryOne: vi.fn().mockResolvedValue(null),
      transaction: vi.fn().mockImplementation((cb) => cb()),
      getType: vi.fn().mockReturnValue('postgresql'),
    };
  });
  return { PostgreSQLAdapter: MockAdapter };
});

vi.mock('@orm/adapters/MySQLAdapter', () => ({
  MySQLAdapter: vi.fn(),
}));

vi.mock('@orm/adapters/SQLServerAdapter', () => ({
  SQLServerAdapter: vi.fn(),
}));

vi.mock('@orm/adapters/D1Adapter', () => ({
  D1Adapter: vi.fn(),
}));

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
    resetDatabase();
    vi.clearAllMocks();
  });

  it('should create SQLite adapter by default', () => {
    db = new Database({ driver: 'sqlite', database: ':memory:' });
    expect(SQLiteAdapter).toHaveBeenCalled();
    expect(db.getType()).toBe('sqlite');
  });

  it('should create PostgreSQL adapter', () => {
    db = new Database({ driver: 'postgresql', database: 'test' });
    expect(PostgreSQLAdapter).toHaveBeenCalled();
    expect(db.getType()).toBe('postgresql');
  });

  it('should connect to database', async () => {
    db = new Database({ driver: 'sqlite', database: ':memory:' });
    await db.connect();
    expect(db.isConnected()).toBe(true);
  });

  it('should disconnect from database', async () => {
    db = new Database({ driver: 'sqlite', database: ':memory:' });
    await db.connect();
    await db.disconnect();
    expect(db.isConnected()).toBe(false);
  });

  it('should throw error on query without connection', async () => {
    db = new Database({ driver: 'sqlite', database: ':memory:' });
    const query = db.query('SELECT * FROM users');
    await expect(query).rejects.toThrow('Database not connected');
  });

  it('should use singleton instance', () => {
    const db1 = useDatabase();
    const db2 = useDatabase();
    expect(db1).toBe(db2);
  });

  it('should create table builder', () => {
    db = new Database({ driver: 'sqlite', database: ':memory:' });
    const builder = db.table('users');
    expect(builder).toBeDefined();
  });

  it('should get config', () => {
    db = new Database({ driver: 'sqlite', database: ':memory:' });
    const config = db.getConfig();
    expect(config.driver).toBe('sqlite');
    expect(config.database).toBe(':memory:');
  });

  it('should emit events on query', async () => {
    db = new Database({ driver: 'sqlite', database: ':memory:' });
    await db.connect();

    const beforeHandler = vi.fn();
    const afterHandler = vi.fn();

    db.onBeforeQuery(beforeHandler);
    db.onAfterQuery(afterHandler);

    await db.query('SELECT * FROM users');

    expect(beforeHandler).toHaveBeenCalledWith('SELECT * FROM users', []);
    expect(afterHandler).toHaveBeenCalled();
  });

  it('should handle read/write splitting', async () => {
    const mockWriteQuery = vi.fn().mockResolvedValue({ rows: [] });
    const mockReadQuery1 = vi.fn().mockResolvedValue({ rows: [] });
    const mockReadQuery2 = vi.fn().mockResolvedValue({ rows: [] });

    // Mock SQLiteAdapter to return different instances based on config
    (SQLiteAdapter as any).mockImplementation(function (config: any) {
      if (config.host === 'read1') {
        return {
          connect: vi.fn(),
          query: mockReadQuery1,
        };
      }
      if (config.host === 'read2') {
        return {
          connect: vi.fn(),
          query: mockReadQuery2,
        };
      }
      return {
        connect: vi.fn(),
        query: mockWriteQuery,
        getType: vi.fn().mockReturnValue('sqlite'),
      };
    });

    db = new Database({
      driver: 'sqlite',
      database: 'test',
      readHosts: ['read1', 'read2'],
    });

    await db.connect();

    // Write query
    await db.query('INSERT INTO users ...', [], false);
    expect(mockWriteQuery).toHaveBeenCalled();

    // Read query 1 (Round Robin)
    await db.query('SELECT * FROM users', [], true);
    expect(mockReadQuery1).toHaveBeenCalled();

    // Read query 2 (Round Robin)
    await db.query('SELECT * FROM users', [], true);
    expect(mockReadQuery2).toHaveBeenCalled();

    // Read query 3 (Round Robin - back to 1)
    await db.query('SELECT * FROM users', [], true);
    expect(mockReadQuery1).toHaveBeenCalledTimes(2);
  });

  it('should delegate transaction to write adapter', async () => {
    const mockTransaction = vi.fn().mockImplementation((cb) => cb());

    (SQLiteAdapter as any).mockImplementation(function () {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        queryOne: vi.fn().mockResolvedValue(null),
        transaction: mockTransaction,
        getType: vi.fn().mockReturnValue('sqlite'),
      };
    });

    db = new Database({ driver: 'sqlite', database: ':memory:' });

    await db.transaction(async (trx) => {
      expect(trx).toBe(db);
    });

    expect(mockTransaction).toHaveBeenCalled();
  });

  describe('Error Handling', () => {
    it('should handle connection errors', async () => {
      (SQLiteAdapter as any).mockImplementation(function () {
        return {
          connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
          disconnect: vi.fn().mockResolvedValue(undefined),
          getType: vi.fn().mockReturnValue('sqlite'),
        };
      });

      db = new Database({ driver: 'sqlite', database: ':memory:' });

      await expect(db.connect()).rejects.toThrow('Connection failed');
    });

    it('should handle disconnection errors gracefully', async () => {
      (SQLiteAdapter as any).mockImplementation(function () {
        return {
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn().mockResolvedValue(undefined),
          query: vi.fn().mockResolvedValue({ rows: [] }),
          getType: vi.fn().mockReturnValue('sqlite'),
        };
      });

      db = new Database({ driver: 'sqlite', database: ':memory:' });
      await db.connect();
      await db.disconnect();

      expect(db.isConnected()).toBe(false);
    });

    it('should handle transaction errors', async () => {
      (SQLiteAdapter as any).mockImplementation(function () {
        return {
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn().mockResolvedValue(undefined),
          transaction: vi.fn().mockRejectedValue(new Error('Transaction failed')),
          query: vi.fn().mockResolvedValue({ rows: [] }),
          getType: vi.fn().mockReturnValue('sqlite'),
        };
      });

      db = new Database({ driver: 'sqlite', database: ':memory:' });
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
      db = new Database({ driver: 'sqlite', database: ':memory:' });
      await db.connect();

      const result = await db.query('SELECT * FROM users');

      expect(result).toBeDefined();
    });

    it('should support parameterized queries', async () => {
      db = new Database({ driver: 'sqlite', database: ':memory:' });
      await db.connect();

      const result = await db.query('SELECT * FROM users WHERE id = ?', [1]);

      expect(result).toBeDefined();
    });
  });

  describe('Default Configuration', () => {
    it('should use default SQLite config when none provided', () => {
      db = new Database(undefined);
      const config = db.getConfig();

      expect(config.driver).toBe('sqlite');
      expect(config.database).toBe(':memory:');
    });

    it('should use default SQLite when invalid driver provided', () => {
      db = new Database({
        driver: 'invalid' as any,
        database: 'test',
      });

      expect(db.getType()).toBe('sqlite');
    });
  });

  describe('Event System', () => {
    it('should allow multiple query event listeners', async () => {
      db = new Database({ driver: 'sqlite', database: ':memory:' });
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
      db = new Database({ driver: 'sqlite', database: ':memory:' });
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
      db = new Database({
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
      db = new Database({ driver: 'sqlite', database: ':memory:' });

      expect(db.isConnected()).toBe(false);

      await db.connect();
      expect(db.isConnected()).toBe(true);

      await db.disconnect();
      expect(db.isConnected()).toBe(false);
    });

    it('should handle reconnection', async () => {
      db = new Database({ driver: 'sqlite', database: ':memory:' });

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
