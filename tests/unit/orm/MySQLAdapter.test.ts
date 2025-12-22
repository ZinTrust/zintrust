import { MySQLAdapter } from '@/orm/adapters/MySQLAdapter';
import { DatabaseConfig } from '@/orm/DatabaseAdapter';
import { Logger } from '@config/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MySQLAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const config: DatabaseConfig = {
    driver: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'test_db',
    username: 'root',
    password: 'password', // NOSONAR
  };
  const adapter = new MySQLAdapter(config);

  it('should create adapter instance', () => {
    expect(adapter).toBeDefined();
  });

  it('should connect successfully', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
  });

  it('should disconnect successfully', async () => {
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should throw if querying when not connected', async () => {
    const disconnectedAdapter = new MySQLAdapter(config);
    await expect(disconnectedAdapter.query('SELECT 1', [])).rejects.toThrow(
      'Database not connected'
    );
  });

  it('should return empty result for query (mock implementation)', async () => {
    await adapter.connect();
    const result = await adapter.query('SELECT * FROM users', []);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('should return null for queryOne (mock implementation)', async () => {
    await adapter.connect();
    const result = await adapter.queryOne('SELECT * FROM users LIMIT 1', []);
    expect(result).toBeNull();
  });

  it('should execute transaction callback', async () => {
    await adapter.connect();
    const result = await adapter.transaction(async (_trx) => {
      return 'success';
    });
    expect(result).toBe('success');
  });

  it('should handle transaction with connection pool', async () => {
    await adapter.connect();
    const result = await adapter.transaction(async () => {
      return { userId: 1 };
    });
    expect(result).toEqual({ userId: 1 });
  });

  it('should get parameter placeholder', async () => {
    await adapter.connect();
    const placeholder = (adapter as any).getParameterPlaceholder(0);
    expect(placeholder).toBe('?');
  });

  it('should handle config with custom port', async () => {
    const customConfig: DatabaseConfig = {
      ...config,
      port: 3307,
    };
    const customAdapter = new MySQLAdapter(customConfig);
    await customAdapter.connect();
    expect(customAdapter.isConnected()).toBe(true);
  });

  it('should handle config without port (default port)', async () => {
    const { port: _, ...configWithoutPort } = config;
    const defaultAdapter = new MySQLAdapter(configWithoutPort as any);
    await defaultAdapter.connect();
    expect(defaultAdapter.isConnected()).toBe(true);
  });

  it('should handle connection error', async () => {
    const errorAdapter = new MySQLAdapter(config);
    const loggerSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {
      throw new Error('Connection failed');
    });

    await expect(errorAdapter.connect()).rejects.toThrow(
      'Failed to connect to MySQL: Error: Connection failed'
    );
    expect(errorAdapter.isConnected()).toBe(false);

    loggerSpy.mockRestore();
  });

  it('should handle transaction error and rollback', async () => {
    await adapter.connect();
    const mockConnection = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (adapter as any).pool = {
      getConnection: vi.fn().mockResolvedValue(mockConnection),
    };

    await expect(
      adapter.transaction(async () => {
        throw new Error('Transaction failed');
      })
    ).rejects.toThrow('Transaction failed');

    expect(mockConnection.query).toHaveBeenCalledWith('START TRANSACTION');
    expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockConnection.release).toHaveBeenCalled();
  });

  it('should handle transaction error with non-error object', async () => {
    await adapter.connect();
    const mockConnection = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (adapter as any).pool = {
      getConnection: vi.fn().mockResolvedValue(mockConnection),
    };

    await expect(
      adapter.transaction(async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'string error';
      })
    ).rejects.toBe('string error');

    expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('should handle transaction success with connection pool', async () => {
    await adapter.connect();
    const mockConnection = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (adapter as any).pool = {
      getConnection: vi.fn().mockResolvedValue(mockConnection),
    };

    const result = await adapter.transaction(async () => {
      return 'success';
    });

    expect(result).toBe('success');
    expect(mockConnection.query).toHaveBeenCalledWith('START TRANSACTION');
    expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
    expect(mockConnection.release).toHaveBeenCalled();
  });
});
