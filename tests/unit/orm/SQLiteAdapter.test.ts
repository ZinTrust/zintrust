import { SQLiteAdapter } from '@/orm/adapters/SQLiteAdapter';
import { DatabaseConfig } from '@/orm/DatabaseAdapter';
import { describe, expect, it } from 'vitest';

describe('SQLiteAdapter', () => {
  const config: DatabaseConfig = {
    driver: 'sqlite',
    database: ':memory:',
  };
  const adapter = SQLiteAdapter.create(config);

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

  it('should get parameter placeholder for index', () => {
    const placeholder = adapter.getPlaceholder(1);
    expect(placeholder).toBe('?');
  });

  it('should get parameter placeholder for different indices', () => {
    expect(adapter.getPlaceholder(0)).toBe('?');
    expect(adapter.getPlaceholder(5)).toBe('?');
    expect(adapter.getPlaceholder(10)).toBe('?');
  });
});
