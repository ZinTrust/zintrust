import { BaseAdapter, DatabaseAdapter, DatabaseConfig, QueryResult } from '@/orm/DatabaseAdapter';
import { beforeEach, describe, expect, it } from 'vitest';

// Concrete implementation for testing abstract class
class TestAdapter extends BaseAdapter {
  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
    return { rows: [], rowCount: 0 };
  }

  async queryOne(_sql: string, _parameters: unknown[]): Promise<Record<string, unknown> | null> {
    return null;
  }

  async transaction<T>(callback: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    return callback(this);
  }

  protected getParameterPlaceholder(_index: number): string {
    return '?';
  }
}

describe('DatabaseAdapter - Interfaces and BaseAdapter', () => {
  let adapter: TestAdapter;
  const config: DatabaseConfig = {
    driver: 'sqlite',
    database: 'test.db',
  };

  beforeEach(() => {
    adapter = new TestAdapter(config);
  });

  describe('DatabaseConfig Interface', () => {
    it('should accept sqlite driver', () => {
      const cfg: DatabaseConfig = { driver: 'sqlite', database: 'test.db' };
      expect(cfg.driver).toBe('sqlite');
    });

    it('should accept postgresql driver', () => {
      const cfg: DatabaseConfig = { driver: 'postgresql', host: 'localhost', port: 5432 };
      expect(cfg.driver).toBe('postgresql');
    });

    it('should accept mysql driver', () => {
      const cfg: DatabaseConfig = { driver: 'mysql', host: 'localhost', port: 3306 };
      expect(cfg.driver).toBe('mysql');
    });

    it('should accept sqlserver driver', () => {
      const cfg: DatabaseConfig = { driver: 'sqlserver', host: 'localhost', port: 1433 };
      expect(cfg.driver).toBe('sqlserver');
    });

    it('should accept d1 driver', () => {
      const cfg: DatabaseConfig = { driver: 'd1', database: 'db' };
      expect(cfg.driver).toBe('d1');
    });

    it('should have optional fields', () => {
      const cfg: DatabaseConfig = {
        driver: 'sqlite',
        host: 'localhost',
        port: 5432,
        username: 'user',
        password: 'pass', // NOSONAR
        synchronize: true,
        logging: true,
        readHosts: ['host1', 'host2'],
      };
      expect(cfg.host).toBe('localhost');
      expect(cfg.port).toBe(5432);
      expect(cfg.username).toBe('user');
      expect(cfg.password).toBe('pass');
      expect(cfg.synchronize).toBe(true);
      expect(cfg.logging).toBe(true);
      expect(cfg.readHosts).toEqual(['host1', 'host2']);
    });
  });

  describe('QueryResult Interface', () => {
    it('should define rows array', () => {
      const result: QueryResult = {
        rows: [{ id: 1, name: 'Test' }],
        rowCount: 1,
      };
      expect(result.rows).toEqual([{ id: 1, name: 'Test' }]);
    });

    it('should have rowCount property', () => {
      const result: QueryResult = {
        rows: [],
        rowCount: 0,
      };
      expect(result.rowCount).toBe(0);
    });

    it('should support multiple rows', () => {
      const result: QueryResult = {
        rows: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' },
          { id: 3, name: 'User 3' },
        ],
        rowCount: 3,
      };
      expect(result.rows).toHaveLength(3);
      expect(result.rowCount).toBe(3);
    });
  });

  describe('BaseAdapter - Connection Methods', () => {
    it('should start disconnected', () => {
      expect(adapter.isConnected()).toBe(false);
    });

    it('should connect successfully', async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should handle multiple connect/disconnect cycles', async () => {
      for (let i = 0; i < 3; i++) {
        await adapter.connect();
        expect(adapter.isConnected()).toBe(true);
        await adapter.disconnect();
        expect(adapter.isConnected()).toBe(false);
      }
    });
  });

  describe('BaseAdapter - Query Methods', () => {
    it('should execute query returning empty result', async () => {
      await adapter.connect();
      const result = await adapter.query('SELECT * FROM users', []);
      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should execute queryOne returning null', async () => {
      await adapter.connect();
      const result = await adapter.queryOne('SELECT * FROM users WHERE id = ?', [1]);
      expect(result).toBeNull();
    });

    it('should support parameterized queries', async () => {
      await adapter.connect();
      const result = await adapter.query('SELECT * FROM users WHERE id = ? AND name = ?', [
        1,
        'John',
      ]);
      expect(result).toBeDefined();
    });

    it('should handle multiple parameters', async () => {
      await adapter.connect();
      const result = await adapter.query('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', [
        'John',
        'john@example.com',
        30,
      ]);
      expect(result).toBeDefined();
    });
  });

  describe('BaseAdapter - Transaction Support', () => {
    it('should execute transaction callback', async () => {
      await adapter.connect();
      const result = await adapter.transaction(async () => {
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('should pass adapter instance to callback', async () => {
      await adapter.connect();
      let capturedAdapter: DatabaseAdapter | null = null;
      await adapter.transaction(async (trx) => {
        capturedAdapter = trx;
        return true;
      });
      expect(capturedAdapter).toBeDefined();
      expect(capturedAdapter).toBe(adapter);
    });

    it('should handle transaction returning object', async () => {
      await adapter.connect();
      const result = await adapter.transaction(async () => {
        return { id: 1, created: true };
      });
      expect(result).toEqual({ id: 1, created: true });
    });

    it('should handle transaction returning array', async () => {
      await adapter.connect();
      const result = await adapter.transaction(async () => {
        return [{ id: 1 }, { id: 2 }, { id: 3 }];
      });
      expect(result).toHaveLength(3);
    });
  });

  describe('BaseAdapter - Metadata Methods', () => {
    it('should return correct driver type', () => {
      expect(adapter.getType()).toBe('sqlite');
    });

    it('should support different driver types', () => {
      const drivers: Array<DatabaseConfig['driver']> = [
        'sqlite',
        'postgresql',
        'mysql',
        'sqlserver',
        'd1',
      ];

      for (const driver of drivers) {
        const cfg: DatabaseConfig = { driver };
        const adp = new TestAdapter(cfg);
        expect(adp.getType()).toBe(driver);
      }
    });
  });

  describe('BaseAdapter - Protected Sanitize Method', () => {
    it('should sanitize null values', () => {
      const sanitized = (adapter as any).sanitize(null);
      expect(sanitized).toBe('NULL');
    });

    it('should sanitize undefined values', () => {
      const sanitized = (adapter as any).sanitize(undefined);
      expect(sanitized).toBe('NULL');
    });

    it('should sanitize string values', () => {
      const sanitized = (adapter as any).sanitize('test');
      expect(sanitized).toBe("'test'");
    });

    it('should escape single quotes in strings', () => {
      const sanitized = (adapter as any).sanitize("test'value");
      expect(sanitized).toBe("'test''value'");
    });

    it('should sanitize boolean values', () => {
      expect((adapter as any).sanitize(true)).toBe('1');
      expect((adapter as any).sanitize(false)).toBe('0');
    });

    it('should sanitize numeric values', () => {
      expect((adapter as any).sanitize(42)).toBe('42');
      expect((adapter as any).sanitize(3.14)).toBe('3.14');
      expect((adapter as any).sanitize(-100)).toBe('-100');
    });

    it('should sanitize object values by converting to JSON', () => {
      const obj = { key: 'value', nested: { prop: 123 } };
      const sanitized = (adapter as any).sanitize(obj);
      expect(sanitized).toContain('key');
      expect(sanitized).toContain('value');
    });

    it('should escape quotes in JSON-converted objects', () => {
      const obj = { key: "value's" };
      const sanitized = (adapter as any).sanitize(obj);
      expect(sanitized).toContain("''");
    });

    it('should sanitize array values by converting to JSON', () => {
      const arr = [1, 2, 3];
      const sanitized = (adapter as any).sanitize(arr);
      expect(sanitized).toContain('1');
      expect(sanitized).toContain('2');
      expect(sanitized).toContain('3');
    });
  });

  describe('DatabaseAdapter Interface Implementation', () => {
    it('should implement all required methods', () => {
      const methods: (keyof DatabaseAdapter)[] = [
        'connect',
        'disconnect',
        'query',
        'queryOne',
        'transaction',
        'getType',
        'isConnected',
      ];

      for (const method of methods) {
        expect(typeof adapter[method]).toBe('function');
      }
    });

    it('should be instance of DatabaseAdapter', () => {
      expect(adapter).toHaveProperty('connect');
      expect(adapter).toHaveProperty('disconnect');
      expect(adapter).toHaveProperty('query');
      expect(adapter).toHaveProperty('queryOne');
      expect(adapter).toHaveProperty('transaction');
      expect(adapter).toHaveProperty('getType');
      expect(adapter).toHaveProperty('isConnected');
    });
  });
});
