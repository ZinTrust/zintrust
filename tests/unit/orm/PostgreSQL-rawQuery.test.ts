/**
 * PostgreSQL Adapter - rawQuery Tests
 * Tests raw SQL query execution with feature flag control
 */

import { FeatureFlags } from '@config/features';
import { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
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

describe('PostgreSQLAdapter - rawQuery()', () => {
  let adapter: ReturnType<typeof PostgreSQLAdapter.create>;

  beforeEach(() => {
    adapter = PostgreSQLAdapter.create({
      driver: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'zintrust_test',
      username: 'postgres',
      password: 'postgres', // NOSONAR - test password
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

    await expect(adapter.rawQuery('SELECT * FROM users WHERE id = $1', [1])).rejects.toThrow(
      'Raw SQL queries are disabled'
    );
  });

  it('should throw error if database not connected', async () => {
    FeatureFlags.setRawQueryEnabled(true);

    await expect(adapter.rawQuery('SELECT * FROM users', [])).rejects.toThrow(
      'Database not connected'
    );
  });

  it('should execute raw query when enabled and connected', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT * FROM users', []);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log warning when raw query is executed', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    await adapter.rawQuery('SELECT * FROM users WHERE name = $1', ['John']);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Raw SQL Query executed'),
      expect.any(Object)
    );
  });

  it('should handle query with single parameter', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE id = $1',
      [1]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle query with multiple parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT * FROM users WHERE created_at > $1 AND status = $2',
      [new Date('2024-01-01'), 'active']
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle query with no parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT * FROM users');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle complex query with JOIN', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT u.id, u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id WHERE u.id = $1',
      [1]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log error when query fails', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    try {
      await adapter.rawQuery('INVALID SQL SYNTAX');
    } catch {
      // Expected to fail
    }
    expect(Logger.error).toHaveBeenCalled();
  });

  it('should support generic typing for results', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    interface User {
      id: number;
      email: string;
      created_at: string;
    }

    const result = await adapter.rawQuery<User>('SELECT * FROM users', []);
    expect(Array.isArray(result)).toBe(true);
  });
});
