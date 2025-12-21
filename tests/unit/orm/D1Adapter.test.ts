import { D1Adapter } from '@/orm/adapters/D1Adapter';
import { DatabaseConfig } from '@/orm/DatabaseAdapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('D1Adapter', () => {
  let adapter: D1Adapter;
  const mockConfig: DatabaseConfig = {
    driver: 'd1',
    host: 'localhost',
    database: 'test',
    username: 'user',
    password: 'password', // NOSONAR
  };

  const mockD1 = {
    prepare: vi.fn(),
  };

  beforeEach(() => {
    // Mock global environment
    (globalThis as any).env = {
      DB: mockD1,
    };
    adapter = new D1Adapter(mockConfig);
  });

  afterEach(() => {
    delete (globalThis as any).env;
    vi.clearAllMocks();
  });

  it('should initialize correctly', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
  });

  it('should execute query', async () => {
    const mockBind = vi.fn().mockReturnThis();
    const mockAll = vi.fn().mockResolvedValue({ results: [{ id: 1 }] });

    mockD1.prepare.mockReturnValue({
      bind: mockBind,
      all: mockAll,
    });

    const result = await adapter.query('SELECT * FROM users', []);

    expect(mockD1.prepare).toHaveBeenCalledWith('SELECT * FROM users');
    expect(mockBind).toHaveBeenCalledWith();
    expect(result.rows).toEqual([{ id: 1 }]);
  });

  it('should execute queryOne', async () => {
    const mockBind = vi.fn().mockReturnThis();
    const mockFirst = vi.fn().mockResolvedValue({ id: 1 });

    mockD1.prepare.mockReturnValue({
      bind: mockBind,
      first: mockFirst,
    });

    const result = await adapter.queryOne('SELECT * FROM users LIMIT 1', []);

    expect(result).toEqual({ id: 1 });
  });

  it('should handle query errors', async () => {
    mockD1.prepare.mockImplementation(() => {
      throw new Error('D1 Error');
    });

    await expect(adapter.query('SELECT * FROM users', [])).rejects.toThrow('D1 Error');
  });

  it('should warn if DB binding is missing', async () => {
    delete (globalThis as any).env.DB;
    const noDbAdapter = new D1Adapter(mockConfig);

    // It logs a warning but doesn't throw on connect
    await noDbAdapter.connect();
    expect(noDbAdapter.isConnected()).toBe(true);

    // But throws on query
    await expect(noDbAdapter.query('SELECT 1', [])).rejects.toThrow(
      'D1 database binding not found'
    );
  });
});
