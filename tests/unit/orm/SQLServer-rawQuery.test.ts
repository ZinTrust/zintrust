/**
 * SQL Server Adapter - rawQuery Tests
 * Tests raw SQL query execution with feature flag control
 */

import { FeatureFlags } from '@config/features';
import { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
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

describe('SQLServerAdapter - rawQuery()', () => {
  let adapter: ReturnType<typeof SQLServerAdapter.create>;

  beforeEach(() => {
    adapter = SQLServerAdapter.create({
      driver: 'sqlserver',
      host: 'localhost',
      port: 1433,
      database: 'zintrust_test',
      username: 'sa',
      password: 'Password123', // NOSONAR - test password
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

    await expect(adapter.rawQuery('SELECT * FROM users WHERE id = @param0', [1])).rejects.toThrow(
      'Raw SQL queries are disabled'
    );
  });

  it('should throw error if database not connected', async () => {
    FeatureFlags.setRawQueryEnabled(true);

    await expect(adapter.rawQuery('SELECT * FROM users', [])).rejects.toThrow(
      'Database not connected'
    );
  });

  it('should execute raw query with @param syntax', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT * FROM users WHERE id = @param0', [1]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle multiple @param placeholders', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT * FROM users WHERE created_at > @param0 AND status = @param1',
      [new Date('2024-01-01'), 'active']
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log warning on execution', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    await adapter.rawQuery('SELECT * FROM users', []);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Raw SQL Query executed'),
      expect.any(Object)
    );
  });

  it('should handle SELECT with WHERE clause', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery<{ id: number; email: string }>(
      'SELECT id, email FROM users WHERE email = @param0',
      ['user@example.com']
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle JOIN with parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT u.id, u.name, p.title FROM users u INNER JOIN posts p ON u.id = p.user_id WHERE u.id = @param0',
      [1]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle aggregate functions', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT user_id, COUNT(*) as post_count FROM posts WHERE created_at > @param0 GROUP BY user_id',
      [new Date('2023-01-01')]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should support generic typing', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    interface User {
      id: number;
      name: string;
      email: string;
      created_at: Date;
    }

    const result = await adapter.rawQuery<User>(
      'SELECT id, name, email, created_at FROM users',
      []
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle query without parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT TOP 10 * FROM users ORDER BY created_at DESC');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log error on query failure', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    try {
      await adapter.rawQuery('INVALID T-SQL SYNTAX', []);
    } catch {
      // Expected
    }
    expect(Logger.error).toHaveBeenCalled();
  });
});
