/**
 * MySQL Adapter - rawQuery Tests
 * Tests raw SQL query execution with feature flag control
 */

import { FeatureFlags } from '@config/features';
import { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('MySQLAdapter - rawQuery()', () => {
  let adapter: ReturnType<typeof MySQLAdapter.create>;

  beforeEach(() => {
    adapter = MySQLAdapter.create({
      driver: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'zintrust_test',
      username: 'root',
      password: 'password', // NOSONAR - test password
    });
    FeatureFlags.setRawQueryEnabled(true);
    // Clear any previous calls
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    FeatureFlags.reset();
  });

  it('should throw error when rawQuery is disabled', async () => {
    FeatureFlags.setRawQueryEnabled(false);
    await adapter.connect();

    await expect(adapter.rawQuery('SELECT * FROM users WHERE id = ?', [1])).rejects.toThrow(
      'Raw SQL queries are disabled'
    );
  });

  it('should throw error if database not connected', async () => {
    FeatureFlags.setRawQueryEnabled(true);

    await expect(adapter.rawQuery('SELECT * FROM users', [])).rejects.toThrow(
      'Database not connected'
    );
  });

  it('should execute raw query with ? placeholders', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT * FROM users WHERE id = ?', [1]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle multiple ? placeholders', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT * FROM users WHERE created_at > ? AND status = ?',
      [new Date('2024-01-01'), 'active']
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log warning on query execution', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    await adapter.rawQuery('SELECT * FROM users WHERE name = ?', ['Jane']);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Raw SQL Query executed'),
      expect.any(Object)
    );
  });

  it('should handle SELECT query', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery<{ id: number; name: string }>(
      'SELECT id, name FROM users',
      []
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle JOIN query', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT u.id, u.name, COUNT(p.id) as post_count FROM users u LEFT JOIN posts p ON u.id = p.user_id GROUP BY u.id WHERE u.id = ?',
      [1]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle query without parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT * FROM users LIMIT 10');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should support generic typing', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    interface User {
      id: number;
      email: string;
      role: string;
    }

    const result = await adapter.rawQuery<User>('SELECT * FROM users', []);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log error on query failure', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    try {
      await adapter.rawQuery('INVALID MYSQL SYNTAX', []);
    } catch {
      // Expected
    }
    expect(Logger.error).toHaveBeenCalled();
  });
});
