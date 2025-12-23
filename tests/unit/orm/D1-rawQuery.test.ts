/**
 * D1 Adapter - rawQuery Tests
 * Tests raw SQL query execution with feature flag control
 * Mocks Cloudflare Workers D1 environment
 */

import { FeatureFlags } from '@config/features';
import { D1Adapter } from '@orm/adapters/D1Adapter';
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

describe('D1Adapter - rawQuery()', () => {
  let adapter: IDatabaseAdapter;
  let mockD1Database: any;

  beforeEach(() => {
    // Mock D1 database in global environment
    mockD1Database = {
      prepare: vi.fn((_sql: string) => ({
        bind: vi.fn((..._params: unknown[]) => ({
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
        })),
      })),
    };

    (globalThis as any).env = {
      DB: mockD1Database,
    };

    adapter = D1Adapter.create({
      driver: 'd1',
      database: 'production',
    });

    FeatureFlags.setRawQueryEnabled(true);
    // Clear any previous calls
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    FeatureFlags.reset();
    delete (globalThis as any).env;
  });

  it('should throw error when rawQuery is disabled', async () => {
    FeatureFlags.setRawQueryEnabled(false);
    await adapter.connect();

    await expect(adapter.rawQuery('SELECT * FROM users WHERE id = ?', [1])).rejects.toThrow(
      'Raw SQL queries are disabled'
    );
  });

  it('should throw error if D1 binding not found', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    delete (globalThis as any).env;

    await adapter.connect();
    await expect(adapter.rawQuery('SELECT * FROM users', [])).rejects.toThrow(
      'D1 database binding not found'
    );
  });

  it('should execute raw query with ? placeholders', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const result = await adapter.rawQuery('SELECT * FROM users WHERE id = ?', [1]);
    expect(Array.isArray(result)).toBe(true);
    expect(mockD1Database.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?');
  });

  it('should bind parameters correctly', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const preparedStmt = {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    };

    mockD1Database.prepare.mockReturnValue(preparedStmt);

    await adapter.rawQuery('SELECT * FROM users WHERE email = ?', ['user@example.com']);
    expect(preparedStmt.bind).toHaveBeenCalledWith('user@example.com');
  });

  it('should handle multiple parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const preparedStmt = {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    };

    mockD1Database.prepare.mockReturnValue(preparedStmt);

    const params = [new Date('2024-01-01'), 'active'];
    await adapter.rawQuery('SELECT * FROM users WHERE created_at > ? AND status = ?', params);

    expect(preparedStmt.bind).toHaveBeenCalledWith(...params);
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

  it('should return results from D1 all() method', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const mockResults = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    const preparedStmt = {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockResults }),
      }),
    };

    mockD1Database.prepare.mockReturnValue(preparedStmt);

    const result = await adapter.rawQuery('SELECT * FROM users', []);
    expect(result).toEqual(mockResults);
  });

  it('should support generic typing', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    interface User {
      id: number;
      email: string;
      name: string;
    }

    const mockResults: User[] = [{ id: 1, email: 'a@test.com', name: 'Alice' }];

    const preparedStmt = {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockResults }),
      }),
    };

    mockD1Database.prepare.mockReturnValue(preparedStmt);

    const result = await adapter.rawQuery<User>('SELECT * FROM users', []);
    expect(result).toEqual(mockResults);
  });

  it('should handle query without parameters', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const preparedStmt = {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    };

    mockD1Database.prepare.mockReturnValue(preparedStmt);

    await adapter.rawQuery('SELECT COUNT(*) as total FROM users');
    expect(preparedStmt.bind).toHaveBeenCalledWith();
  });

  it('should handle Cloudflare Workers environment binding', async () => {
    FeatureFlags.setRawQueryEnabled(true);

    const customD1 = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [{ id: 1 }] }),
        }),
      }),
    };

    (globalThis as any).env = { DB: customD1 };

    const d1Adapter = D1Adapter.create({ driver: 'd1', database: 'production' });
    await d1Adapter.connect();

    const result = await d1Adapter.rawQuery('SELECT * FROM users WHERE id = ?', [1]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should log error on query failure', async () => {
    FeatureFlags.setRawQueryEnabled(true);
    await adapter.connect();

    const preparedStmt = {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockRejectedValue(new Error('Syntax error')),
      }),
    };

    mockD1Database.prepare.mockReturnValue(preparedStmt);

    try {
      await adapter.rawQuery('INVALID SQL', []);
    } catch {
      // Expected
    }
    expect(Logger.error).toHaveBeenCalled();
  });
});
