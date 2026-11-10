import { D1Adapter } from '@/orm/adapters/D1Adapter';
import type { DatabaseConfig, IDatabaseAdapter } from '@/orm/DatabaseAdapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('D1Adapter', () => {
  let adapter: IDatabaseAdapter;
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
    adapter = D1Adapter.create(mockConfig);
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
    await adapter.connect();
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
    await adapter.connect();
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
    await adapter.connect();
    mockD1.prepare.mockImplementation(() => {
      throw new Error('D1 Error');
    });

    await expect(adapter.query('SELECT * FROM users', [])).rejects.toThrow(
      'D1 query failed: SELECT * FROM users'
    );
  });

  it('should warn if DB binding is missing', async () => {
    delete (globalThis as any).env.DB;
    const noDbAdapter = D1Adapter.create(mockConfig);

    // It logs a warning but doesn't throw on connect
    await noDbAdapter.connect();
    expect(noDbAdapter.isConnected()).toBe(true);

    // But throws on query
    await expect(noDbAdapter.query('SELECT 1', [])).rejects.toThrow(
      'D1 database binding not found'
    );
  });

  it('should throw if queryOne called without DB binding', async () => {
    delete (globalThis as any).env.DB;
    const noDbAdapter = D1Adapter.create(mockConfig);
    await noDbAdapter.connect();

    await expect(noDbAdapter.queryOne('SELECT * FROM users LIMIT 1', [])).rejects.toThrow(
      'D1 database binding not found'
    );
  });

  it('should handle queryOne errors', async () => {
    await adapter.connect();
    mockD1.prepare.mockImplementation(() => {
      throw new Error('QueryOne failed');
    });

    await expect(adapter.queryOne('SELECT * FROM users LIMIT 1', [])).rejects.toThrow(
      'D1 queryOne failed: SELECT * FROM users LIMIT 1'
    );
  });

  it('rejects callback transactions because D1 requires atomic batches', async () => {
    await adapter.connect();
    const callback = vi.fn();
    await expect(adapter.transaction(callback)).rejects.toThrow(/Use db\.batch/i);
    expect(callback).not.toHaveBeenCalled();
  });

  it('executes a prepared statement list as one D1 batch and reports affected rows', async () => {
    await adapter.connect();
    const bind = vi.fn(() => ({}));
    const batch = vi.fn().mockResolvedValue([
      { success: true, meta: { changes: 1, last_row_id: 11 } },
      { success: true, meta: { changes: 0 } },
    ]);
    mockD1.prepare.mockImplementation((sql: string) => {
      expect(sql).toMatch(/^(INSERT|UPDATE)/);
      return { bind };
    });
    Object.assign(mockD1, { batch });

    const result = await adapter.batch?.([
      { sql: 'INSERT INTO claims (reference, token) VALUES (?, ?)', parameters: ['ref-1', 't-1'] },
      { sql: 'UPDATE accounts SET balance = balance + ? WHERE id = ?', parameters: [50, 1] },
    ]);

    expect(batch).toHaveBeenCalledTimes(1);
    expect(mockD1.prepare).toHaveBeenCalledTimes(2);
    expect(bind).toHaveBeenNthCalledWith(1, 'ref-1', 't-1');
    expect(bind).toHaveBeenNthCalledWith(2, '50', '1');
    expect(result?.map((row) => row.rowCount)).toEqual([1, 0]);
    expect(result?.[0]?.lastInsertId).toBe(11);
  });

  it('keeps concurrent settlement claims in separate atomic D1 batches', async () => {
    await adapter.connect();
    mockD1.prepare.mockImplementation((sql: string) => ({
      bind: (...parameters: unknown[]) => ({ sql, parameters }),
    }));
    let batchIndex = 0;
    const batch = vi.fn(async (statements: Array<{ sql: string; parameters: unknown[] }>) => {
      batchIndex += 1;
      expect(statements).toHaveLength(3);
      expect(statements[1]?.sql).toContain('claim_token = ?');
      expect(statements[2]?.sql).toContain('claim_token = ?');
      return batchIndex === 1
        ? [
            { success: true, meta: { changes: 1 } },
            { success: true, meta: { changes: 1 } },
            { success: true, meta: { changes: 1 } },
          ]
        : [
            { success: true, meta: { changes: 0 } },
            { success: true, meta: { changes: 0 } },
            { success: true, meta: { changes: 0 } },
          ];
    });
    Object.assign(mockD1, { batch });

    const build = (token: string) => [
      {
        sql: 'INSERT INTO claims (reference, claim_token) VALUES (?, ?) ON CONFLICT(reference) DO NOTHING',
        parameters: ['ref-1', token],
      },
      {
        sql: 'UPDATE accounts SET balance = balance + ? WHERE id = ? AND EXISTS (SELECT 1 FROM claims WHERE reference = ? AND claim_token = ?)',
        parameters: [50, 1, 'ref-1', token],
      },
      {
        sql: 'INSERT INTO ledger (reference, amount) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM claims WHERE reference = ? AND claim_token = ?)',
        parameters: ['ref-1', 50, 'ref-1', token],
      },
    ];

    const [first, second] = await Promise.all([
      adapter.batch?.(build('token-a')),
      adapter.batch?.(build('token-b')),
    ]);

    expect(batch).toHaveBeenCalledTimes(2);
    expect(first?.map((result) => result.affectedRows)).toEqual([1, 1, 1]);
    expect(second?.map((result) => result.affectedRows)).toEqual([0, 0, 0]);
  });

  it('surfaces a D1 batch failure instead of continuing with later statements', async () => {
    await adapter.connect();
    const batch = vi.fn().mockRejectedValue(new Error('injected batch failure'));
    Object.assign(mockD1, { batch });

    await expect(
      adapter.batch?.([
        { sql: 'INSERT INTO claims (reference) VALUES (?)', parameters: ['ref-1'] },
        { sql: 'INSERT INTO ledger (reference) VALUES (?)', parameters: ['ref-1'] },
      ])
    ).rejects.toThrow(/D1 atomic batch failed/i);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(mockD1.prepare).toHaveBeenCalledTimes(2);
  });

  it('surfaces D1 run, query, binding, and per-statement batch errors', async () => {
    await adapter.connect();
    mockD1.prepare.mockReturnValue({
      bind: () => ({
        run: async () => ({ success: false, error: 'write rejected' }),
        all: async () => ({ success: false, error: 'query rejected' }),
      }),
    });
    await expect(adapter.query('UPDATE users SET name = ?', ['A'])).rejects.toThrow(
      /D1 query failed/
    );
    await expect(adapter.query('SELECT * FROM users', [])).rejects.toThrow(/D1 query failed/);

    delete (globalThis as any).env.DB;
    const missingBinding = D1Adapter.create(mockConfig);
    await missingBinding.connect();
    await expect(
      missingBinding.batch?.([{ sql: 'UPDATE users SET name = ?', parameters: ['A'] }])
    ).rejects.toThrow(/D1 database binding not found/i);
    (globalThis as any).env.DB = mockD1;

    Reflect.deleteProperty(mockD1, 'batch');
    await expect(
      adapter.batch?.([{ sql: 'UPDATE users SET name = ?', parameters: ['A'] }])
    ).rejects.toThrow(/does not support atomic batches/i);

    Object.assign(mockD1, {
      batch: vi.fn().mockResolvedValue([{ success: false, error: 'statement rejected' }]),
    });
    await expect(
      adapter.batch?.([{ sql: 'UPDATE users SET name = ?', parameters: ['A'] }])
    ).rejects.toThrow(/D1 atomic batch failed/i);
  });

  it('should return correct parameter placeholder', () => {
    const placeholder = adapter.getPlaceholder(0);
    expect(placeholder).toBe('?');
  });

  it('should disconnect successfully', async () => {
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });
});
