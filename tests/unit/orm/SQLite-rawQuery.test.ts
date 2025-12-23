/**
 * SQLite Adapter - rawQuery Tests
 * Tests raw SQL query execution with feature flag control
 */

import { FeatureFlags } from '@config/features';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { IDatabaseAdapter } from '@orm/DatabaseAdapter';
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

describe('SQLiteAdapter - rawQuery()', () => {
  let adapter: IDatabaseAdapter;

  beforeEach(() => {
    adapter = SQLiteAdapter.create({
      driver: 'sqlite',
      database: ':memory:',
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

  it('should throw error if not connected', async () => {
    FeatureFlags.setRawQueryEnabled(true);

    await expect(adapter.rawQuery('SELECT * FROM users', [])).rejects.toThrow(
      'Database not connected'
    );
  });

  it('should execute raw query when enabled', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT * FROM users', []);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should use $N parameter placeholders (SQLite style)', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT * FROM users WHERE id = $1', [1]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle multiple parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT * FROM users WHERE created_at > $1 AND status = $2 AND role = $3',
      [new Date('2024-01-01'), 'active', 'admin']
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log warning on execution', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    await adapter.rawQuery('SELECT * FROM users', []);
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Raw SQL Query executed'));
  });

  it('should handle in-memory database operations', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE id = $1',
      [1]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle complex query with aggregation', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery(
      'SELECT user_id, COUNT(*) as post_count FROM posts WHERE created_at > $1 GROUP BY user_id',
      [new Date('2024-01-01')]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should support generic typing for results', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    interface Post {
      id: number;
      title: string;
      content: string;
      user_id: number;
    }

    const result = await adapter.rawQuery<Post>('SELECT * FROM posts', []);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle query without parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT COUNT(*) as total FROM users');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log error on query failure', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    try {
      await adapter.rawQuery('INVALID SQLITE QUERY', []);
    } catch {
      // Expected
    }
    expect(Logger.error).toHaveBeenCalled();
  });
});
