/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  request: vi.fn(),
  warn: vi.fn(),
  schemaWriter: vi.fn(async () => undefined),
  createStatementId: vi.fn(async () => 'statement-1'),
  parseCustomHeaders: vi.fn(() => undefined),
  isMutatingSql: vi.fn((sql: string) => /^(insert|update|delete)/i.test(sql.trim())),
}));

vi.mock('@config/env', () => ({
  Env: {
    get: (key: string, fallback = '') => m.env[key] ?? fallback,
    getInt: (key: string, fallback = 0) => m.env[key] ?? fallback,
    REQUEST_TIMEOUT: 30_000,
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    warn: (...args: unknown[]) => m.warn(...args),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@common/RemoteSignedJson', () => ({
  RemoteSignedJson: { request: (...args: unknown[]) => m.request(...args) },
}));

vi.mock('@orm/SchemaStatemenWriter', () => ({
  SchemaWriter: (...args: unknown[]) => (m.schemaWriter as (...a: any[]) => any)(...args),
}));

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  isRecord: (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value),
  parseCustomHeadersFromEnv: (...args: unknown[]) => (m.parseCustomHeaders as (...a: any[]) => any)(...args),
}));

vi.mock('@orm/adapters/SqlProxyRegistryMode', () => ({
  createStatementId: (...args: unknown[]) => (m.createStatementId as (...a: any[]) => any)(...args),
}));

vi.mock('@proxy/isMutatingSql', () => ({
  isMutatingSql: (sql: string) => m.isMutatingSql(sql),
}));

import { D1RemoteAdapter } from '@/orm/adapters/D1RemoteAdapter';

const setup = (overrides: Record<string, unknown> = {}) => {
  for (const key of Object.keys(m.env)) Reflect.deleteProperty(m.env, key);
  Object.assign(m.env, {
    D1_REMOTE_URL: 'https://example.com/proxy',
    D1_REMOTE_KEY_ID: 'kid',
    D1_REMOTE_SECRET: 'secret',
    NODE_ENV: 'production',
    D1_REMOTE_MODE: 'registry',
    ...overrides,
  });
};

const connected = async (overrides: Record<string, unknown> = {}) => {
  setup(overrides);
  const adapter = D1RemoteAdapter.create({} as never);
  await adapter.connect();
  return adapter;
};

describe('D1RemoteAdapter remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.request.mockReset();
    setup();
  });

  it('derives the signing path prefix from the configured URL', async () => {
    const withPrefix = await connected({ D1_REMOTE_URL: 'https://example.com/nested/proxy/' });
    m.request.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await withPrefix.query('SELECT 1', []);
    expect((m.request.mock.calls[0]?.[0] as { signaturePathPrefixToStrip?: string })
      .signaturePathPrefixToStrip).toBe('/nested/proxy');

    const rootUrl = await connected({ D1_REMOTE_URL: 'https://example.com/' });
    m.request.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await rootUrl.query('SELECT 1', []);
    expect((m.request.mock.calls.at(-1)?.[0] as { signaturePathPrefixToStrip?: string })
      .signaturePathPrefixToStrip).toBeUndefined();

    const invalidUrl = await connected({ D1_REMOTE_URL: 'not-a-url' });
    m.request.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await invalidUrl.query('SELECT 1', []);
    expect((m.request.mock.calls.at(-1)?.[0] as { signaturePathPrefixToStrip?: string })
      .signaturePathPrefixToStrip).toBeUndefined();
  });

  it('chooses registry by default in production and sql by default otherwise', async () => {
    const production = await connected({
      NODE_ENV: 'production',
      D1_REMOTE_MODE: null,
    });
    m.request.mockResolvedValueOnce({ ok: true, meta: { changes: 1 } });
    await production.query('UPDATE t SET a = 1', []);
    expect(m.request.mock.calls[0]?.[1]).toBe('/zin/d1/statement');

    const development = await connected({
      NODE_ENV: 'development',
      D1_REMOTE_MODE: null,
    });
    m.request.mockResolvedValueOnce({ ok: true, meta: { changes: 1 } });
    await development.query('UPDATE t SET a = 1', []);
    expect(m.request.mock.calls.at(-1)?.[1]).toBe('/zin/d1/exec');

    const emptyEnv = await connected({ NODE_ENV: null, D1_REMOTE_MODE: null });
    m.request.mockResolvedValueOnce({ ok: true, meta: { changes: 1 } });
    await emptyEnv.query('UPDATE t SET a = 1', []);
    expect(m.request.mock.calls.at(-1)?.[1]).toBe('/zin/d1/exec');
  });

  it('warns once when signing credentials are missing', async () => {
    await connected({ D1_REMOTE_KEY_ID: '  ', D1_REMOTE_SECRET: '' });
    expect(m.warn).toHaveBeenCalledWith(expect.stringContaining('fallback signing credentials'));
    const warningCount = m.warn.mock.calls.length;
    await connected({ D1_REMOTE_KEY_ID: '', D1_REMOTE_SECRET: '' });
    expect(m.warn).toHaveBeenCalledTimes(warningCount);
  });

  it('falls back to exec metadata for malformed statement responses', async () => {
    const adapter = await connected();

    for (const out of [
      { ok: true, meta: { changes: 5, last_row_id: 3 } },
      { ok: true, meta: { changes: '5', lastRowId: 9 } },
      { ok: true, meta: 'bad' },
      { ok: 'true', meta: { changes: 5 } },
      'not-an-object',
    ]) {
      m.request.mockResolvedValueOnce(out);
      await expect(adapter.query('UPDATE t SET a = 1', [])).resolves.toMatchObject({
        rows: [],
      });
    }

    m.request.mockResolvedValueOnce({ ok: true, meta: { changes: 'nope' } });
    await expect(adapter.query('UPDATE t SET a = 1', [])).resolves.toMatchObject({ rowCount: 0 });

    m.request.mockResolvedValueOnce({ ok: true, meta: { lastInsertRowid: BigInt(4) } });
    await expect(adapter.query('UPDATE t SET a = 1', [])).resolves.toMatchObject({
      lastInsertId: BigInt(4),
    });

    m.request.mockResolvedValueOnce({ ok: true, meta: { lastInsertRowid: { bad: true } } });
    await expect(adapter.query('UPDATE t SET a = 1', [])).resolves.toMatchObject({
      lastInsertId: undefined,
    });
  });

  it('returns returning rows from registry responses', async () => {
    const adapter = await connected();
    m.request.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    await expect(adapter.query('INSERT INTO t VALUES (1) RETURNING id', [])).resolves.toEqual({
      rows: [{ id: 1 }],
      rowCount: 1,
    });

    m.request.mockResolvedValueOnce({ rows: ['not-a-record'], rowCount: 1 });
    await expect(adapter.query('SELECT 1', [])).resolves.toMatchObject({ rows: [], rowCount: 0 });
  });

  it('handles registry queryOne rows, null rows and empty row arrays', async () => {
    const adapter = await connected();

    m.request.mockResolvedValueOnce({ row: null });
    await expect(adapter.queryOne('SELECT 1', [])).resolves.toBeNull();

    m.request.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(adapter.queryOne('SELECT 1', [])).resolves.toBeNull();

    m.request.mockResolvedValueOnce({ rows: [{ a: 1 }], rowCount: 1 });
    await expect(adapter.queryOne('SELECT 1', [])).resolves.toEqual({ a: 1 });

    m.request.mockResolvedValueOnce({ ok: true });
    await expect(adapter.queryOne('SELECT 1', [])).resolves.toBeNull();
  });

  it('uses the SQL-mode exec and query endpoints and guards connection state', async () => {
    setup();
    const adapter = D1RemoteAdapter.create({} as never);
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/not connected/i);
    await expect(adapter.queryOne('SELECT 1', [])).rejects.toThrow(/not connected/i);
    await expect(adapter.ping()).rejects.toThrow(/not connected/i);
    await expect(adapter.transaction(async () => 1)).rejects.toThrow(/not connected/i);
    await expect(adapter.ensureMigrationsTable!()).rejects.toThrow(/not connected/i);
    await adapter.connect();

    expect(adapter.getType()).toBe('d1-remote');
    expect(adapter.getPlaceholder(1)).toBe('?');
    await expect(adapter.transaction(async () => 1)).rejects.toThrow(/atomic callback/i);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);

    const sqlAdapter = await connected({ D1_REMOTE_MODE: 'sql' });
    m.request.mockResolvedValueOnce({ ok: true, meta: { changes: 2 } });
    await expect(sqlAdapter.query('UPDATE t SET a = 1', [])).resolves.toMatchObject({ rowCount: 2 });
    expect(m.request.mock.calls.at(-1)?.[1]).toBe('/zin/d1/exec');

    m.request.mockResolvedValueOnce({ rows: [{ a: 1 }], rowCount: 1 });
    await expect(sqlAdapter.query('SELECT 1 RETURNING a', [])).resolves.toMatchObject({ rowCount: 1 });
    expect(m.request.mock.calls.at(-1)?.[1]).toBe('/zin/d1/query');

    m.request.mockResolvedValueOnce({ row: { x: 1 } });
    await expect(sqlAdapter.queryOne('SELECT 1', [])).resolves.toEqual({ x: 1 });

    m.request.mockResolvedValueOnce({ ok: true, meta: { changes: 0 } });
    await expect(sqlAdapter.ensureMigrationsTable!()).resolves.toBeUndefined();
    expect(m.request.mock.calls.at(-1)?.[2]).toMatchObject({
      sql: expect.stringContaining('CREATE TABLE'),
    });
  });

  it('returns raw query rows from the query result', async () => {
    const adapter = await connected({ D1_REMOTE_MODE: 'sql' });
    m.request.mockResolvedValueOnce({ rows: [{ a: 1 }], rowCount: 1 });
    await expect(adapter.rawQuery('SELECT 1')).resolves.toEqual([{ a: 1 }]);
    expect(m.schemaWriter).toHaveBeenCalled();
  });
});
