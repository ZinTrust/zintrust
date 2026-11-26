import { beforeEach, describe, expect, it, vi } from 'vitest';

const remoteRequestMock = vi.fn();

vi.mock('@common/RemoteSignedJson', () => ({
  RemoteSignedJson: {
    request: (...args: unknown[]) => remoteRequestMock(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@orm/SchemaStatemenWriter', () => ({
  SchemaWriter: vi.fn(async () => undefined),
}));

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  isRecord: (value: unknown): value is Record<string, unknown> =>
    value !== null && value !== undefined && typeof value === 'object',
  parseCustomHeadersFromEnv: () => undefined,
}));

vi.mock('@orm/adapters/SqlProxyRegistryMode', () => ({
  createStatementId: vi.fn(async (sql: string) => `sid:${sql}`),
}));

vi.mock('@proxy/isMutatingSql', () => ({
  isMutatingSql: (sql: string) => sql.toLowerCase().includes('update'),
}));

import { D1RemoteAdapter } from '../../../../src/orm/adapters/D1RemoteAdapter';

describe('D1RemoteAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remoteRequestMock.mockReset();

    vi.stubEnv('D1_REMOTE_URL', 'https://example.com/proxy');
    vi.stubEnv('D1_REMOTE_KEY_ID', '');
    vi.stubEnv('D1_REMOTE_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('D1_REMOTE_MODE', 'registry');
  });

  it('requires connect before query and returns exec meta from multiple key shapes', async () => {
    const adapter = D1RemoteAdapter.create({} as any);

    await expect(adapter.query('select 1', [])).rejects.toBeDefined();

    await adapter.connect();

    remoteRequestMock.mockResolvedValueOnce({
      ok: true,
      meta: { changes: 3, last_insert_rowid: 99 },
    });

    const out = await adapter.query('update t set a=1', []);
    expect(out.rowCount).toBe(3);
    expect(out.lastInsertId).toBe(99);
  });

  it('registry queryOne returns first row when response is query-shaped', async () => {
    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    remoteRequestMock.mockResolvedValueOnce({ rows: [{ a: 1 }], rowCount: 1 });

    const row = await adapter.queryOne('select 1', []);
    expect(row).toEqual({ a: 1 });
  });

  it('sql mode uses /queryOne and returns null when row is null', async () => {
    vi.stubEnv('D1_REMOTE_MODE', 'sql');

    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    remoteRequestMock.mockResolvedValueOnce({ row: null });

    const row = await adapter.queryOne('select 1', []);
    expect(row).toBeNull();
  });

  it('covers ping requireConnected, ensureMigrationsTable, and exec meta lastRowId string/bigint', async () => {
    const adapter = D1RemoteAdapter.create({} as any);

    await expect(adapter.ping()).rejects.toBeDefined();

    await adapter.connect();

    remoteRequestMock.mockResolvedValueOnce({
      ok: true,
      meta: { changes: 0, lastRowId: 'abc' },
    });
    await adapter.ensureMigrationsTable();

    remoteRequestMock.mockResolvedValueOnce({
      ok: true,
      meta: { changes: 1, lastInsertRowid: BigInt(123) },
    });

    const out = await adapter.query('update t set a=1', []);
    expect(out.lastInsertId).toBe(BigInt(123));
  });

  it('exec meta ignores unsupported lastRowId types', async () => {
    vi.stubEnv('D1_REMOTE_MODE', 'sql');
    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    remoteRequestMock.mockResolvedValueOnce({
      ok: true,
      meta: { changes: 1, lastRowId: { bad: 1 } },
    });
    const out = await adapter.query('update t set a=1', []);
    expect(out.lastInsertId).toBeUndefined();
  });

  it('covers isExecReturningResponse path in queryRegistry', async () => {
    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    // This response shape triggers isExecReturningResponse (has rows/rowCount but no ok boolean)
    remoteRequestMock.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }],
      rowCount: 2,
    });

    const out = await adapter.query('SELECT * FROM t', []);
    expect(out.rowCount).toBe(2);
    expect(out.rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('covers querySqlMode query endpoint for SELECT statements', async () => {
    vi.stubEnv('D1_REMOTE_MODE', 'sql');
    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    // This goes through the query endpoint (not exec) for SELECT
    remoteRequestMock.mockResolvedValueOnce({
      rows: [{ a: 1 }],
      rowCount: 1,
    });

    const out = await adapter.query('SELECT 1', []);
    expect(out.rowCount).toBe(1);
  });

  it('covers querySqlMode query endpoint for mutating with RETURNING', async () => {
    vi.stubEnv('D1_REMOTE_MODE', 'sql');
    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    // Mutating statement with RETURNING uses query endpoint
    remoteRequestMock.mockResolvedValueOnce({
      rows: [{ id: 5, name: 'test' }],
      rowCount: 1,
    });

    const out = await adapter.query('INSERT INTO t (name) VALUES (?) RETURNING id, name', ['test']);
    expect(out.rowCount).toBe(1);
    expect(out.rows).toEqual([{ id: 5, name: 'test' }]);
  });

  it('covers ping method when connected', async () => {
    vi.stubEnv('D1_REMOTE_MODE', 'sql');
    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    remoteRequestMock.mockResolvedValueOnce({ row: { ok: 1 } });

    await adapter.ping();
    expect(remoteRequestMock).toHaveBeenCalled();
  });

  it('covers transaction method rejection', async () => {
    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    const callback = vi.fn(async () => 42);
    await expect(adapter.transaction(callback)).rejects.toThrow(/atomic callback transactions/);
    expect(callback).not.toHaveBeenCalled();
  });

  it('covers rawQuery method', async () => {
    vi.stubEnv('D1_REMOTE_MODE', 'sql');
    const adapter = D1RemoteAdapter.create({} as any);
    await adapter.connect();

    remoteRequestMock.mockResolvedValueOnce({
      rows: [{ a: 1 }],
      rowCount: 1,
    });

    const rows = await adapter.rawQuery<{ a: number }>('SELECT 1', []);
    expect(rows).toEqual([{ a: 1 }]);
  });
});
