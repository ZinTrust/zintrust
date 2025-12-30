/**
 * SQLite Adapter - rawQuery Tests
 * Tests raw SQL query execution with feature flag control
 */

import { FeatureFlags } from '@config/features';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { IDatabaseAdapter } from '@orm/DatabaseAdapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Skip these tests when native better-sqlite3 is not loadable in the test runtime (ABI mismatch)
let HAS_NATIVE_SQLITE = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DB = require('better-sqlite3');
  const conn = new DB(':memory:');
  conn.close();
} catch {
  HAS_NATIVE_SQLITE = false;
}

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

(HAS_NATIVE_SQLITE ? describe : describe.skip)('SQLiteAdapter - rawQuery()', () => {
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
    await adapter.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)', []);

    const result = await adapter.rawQuery('SELECT * FROM users', []);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should use ? parameter placeholders (SQLite style)', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();
    await adapter.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)', []);

    const result = await adapter.rawQuery('SELECT * FROM users WHERE id = ?', [1]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle multiple parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();
    await adapter.query(
      'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, created_at TEXT, status TEXT, role TEXT)',
      []
    );

    const result = await adapter.rawQuery(
      'SELECT * FROM users WHERE created_at > ? AND status = ? AND role = ?',
      [new Date('2024-01-01').toISOString(), 'active', 'admin']
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log warning on execution', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();
    await adapter.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)', []);

    await adapter.rawQuery('SELECT * FROM users', []);
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Raw SQL Query executed'));
  });

  it('should handle in-memory database operations', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();
    await adapter.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)', []);
    await adapter.query("INSERT INTO users (id, name) VALUES (1, 'Test User')", []);

    const result = await adapter.rawQuery<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE id = ?',
      [1]
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test User');
  });

  it('should handle complex query with aggregation', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();
    await adapter.query('CREATE TABLE IF NOT EXISTS posts (user_id INTEGER, created_at TEXT)', []);

    const result = await adapter.rawQuery(
      'SELECT user_id, COUNT(*) as post_count FROM posts WHERE created_at > ? GROUP BY user_id',
      [new Date('2024-01-01').toISOString()]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it('should support generic typing for results', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();
    await adapter.query(
      'CREATE TABLE IF NOT EXISTS posts (id INTEGER, title TEXT, content TEXT, user_id INTEGER)',
      []
    );

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
    await adapter.query('CREATE TABLE IF NOT EXISTS users (id INTEGER)', []);

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
