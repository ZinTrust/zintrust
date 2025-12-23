import { PostgreSQLAdapter } from '@/orm/adapters/PostgreSQLAdapter';
import { DatabaseConfig } from '@/orm/DatabaseAdapter';
import { describe, expect, it } from 'vitest';

describe('PostgreSQLAdapter', () => {
  const config: DatabaseConfig = {
    driver: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    username: 'user',
    password: 'password', // NOSONAR
  };
  const adapter = PostgreSQLAdapter.create(config);

  it('should connect successfully', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
  });

  it('should disconnect successfully', async () => {
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should throw if querying when not connected', async () => {
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow('Database not connected');
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

  it('should handle transaction errors', async () => {
    await adapter.connect();
    const error = new Error('Transaction failed');
    await expect(
      adapter.transaction(async () => {
        throw error;
      })
    ).rejects.toThrow('Transaction failed');
  });

  it('should get parameter placeholder', () => {
    const placeholder = adapter.getPlaceholder(1);
    expect(placeholder).toBe('$1');
  });

  it('should get parameter placeholder for different indices', () => {
    expect(adapter.getPlaceholder(0)).toBe('$0');
    expect(adapter.getPlaceholder(5)).toBe('$5');
  });

  it('should handle connection error', async () => {
    const errorConfig: DatabaseConfig = { ...config, host: 'error' };
    const errorAdapter = PostgreSQLAdapter.create(errorConfig);
    await expect(errorAdapter.connect()).rejects.toThrow(
      'Failed to connect to PostgreSQL: Connection failed'
    );
  });

  it('should handle config with custom port', async () => {
    const customConfig: DatabaseConfig = { ...config, port: 5433 };
    const customAdapter = PostgreSQLAdapter.create(customConfig);
    await customAdapter.connect();
    expect(customAdapter.isConnected()).toBe(true);
  });

  it('should handle config without port (default port)', async () => {
    const { port: _, ...configWithoutPort } = config;
    const defaultAdapter = PostgreSQLAdapter.create(configWithoutPort as DatabaseConfig);
    await defaultAdapter.connect();
    expect(defaultAdapter.isConnected()).toBe(true);
  });
});
