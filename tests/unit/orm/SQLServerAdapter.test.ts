import { SQLServerAdapter } from '@/orm/adapters/SQLServerAdapter';
import { DatabaseConfig } from '@/orm/DatabaseAdapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Logger module to track method calls
vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    scope: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }),
  },
}));

// Import mocked Logger after vi.mock
import { Logger } from '@config/logger';

describe('SQLServerAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const config: DatabaseConfig = {
    driver: 'sqlserver',
    host: 'localhost',
    port: 1433,
    database: 'test_db',
    username: 'sa',
    password: 'password', // NOSONAR
  };
  const adapter = SQLServerAdapter.create(config);

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
    const disconnectedAdapter = SQLServerAdapter.create(config);
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
    const result = await adapter.queryOne('SELECT * FROM users WHERE id = 1', []);
    expect(result).toBeNull();
  });

  it('should execute transaction callback', async () => {
    await adapter.connect();
    const result = await adapter.transaction(async (_trx) => {
      return 'success';
    });
    expect(result).toBe('success');
  });

  it('should handle transaction with complex object', async () => {
    await adapter.connect();
    const result = await adapter.transaction(async () => {
      return { id: 1, name: 'Test' };
    });
    expect(result).toEqual({ id: 1, name: 'Test' });
  });

  it('should get parameter placeholder with index', async () => {
    await adapter.connect();
    const placeholder = adapter.getPlaceholder(0);
    expect(placeholder).toBe('@param0');
  });

  it('should get parameter placeholder with different index', async () => {
    await adapter.connect();
    const placeholder = adapter.getPlaceholder(5);
    expect(placeholder).toBe('@param5');
  });

  it('should handle config with custom port', async () => {
    const customConfig: DatabaseConfig = {
      ...config,
      port: 1434,
    };
    const customAdapter = SQLServerAdapter.create(customConfig);
    await customAdapter.connect();
    expect(customAdapter.isConnected()).toBe(true);
  });

  it('should handle config without port (default port)', async () => {
    const { port: _, ...configWithoutPort } = config;
    const defaultAdapter = SQLServerAdapter.create(configWithoutPort as any);
    await defaultAdapter.connect();
    expect(defaultAdapter.isConnected()).toBe(true);
  });

  it('should handle connection error', async () => {
    const errorConfig: DatabaseConfig = { ...config, host: 'error' };
    const errorAdapter = SQLServerAdapter.create(errorConfig);
    await expect(errorAdapter.connect()).rejects.toThrow(
      'Failed to connect to SQL Server: Error: Connection failed'
    );
    expect(errorAdapter.isConnected()).toBe(false);
  });

  it('should handle transaction error', async () => {
    await adapter.connect();
    await expect(
      adapter.transaction(async () => {
        throw new Error('Transaction failed');
      })
    ).rejects.toThrow('Transaction failed');
    expect(Logger.error).toHaveBeenCalled();
  });
});
