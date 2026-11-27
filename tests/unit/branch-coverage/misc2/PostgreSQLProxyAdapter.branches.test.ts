/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  requestProxy: vi.fn(),
  resolveMode: vi.fn(() => 'sql' as 'sql' | 'registry'),
  ensureSigned: vi.fn(),
  notReachable: vi.fn((_label: string, baseUrl: string, error: unknown) => {
    return new Error(`not reachable at ${baseUrl}: ${String(error)}`);
  }),
  settings: vi.fn(() => ({ baseUrl: 'http://proxy.example' })),
  signed: vi.fn((settings: unknown) => settings),
  createStatementPayload: vi.fn(async () => ({ statementId: 'stmt-1' })),
}));

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  isRecord: (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value),
  parseCustomHeadersFromEnv: () => undefined,
  ensureSignedSettings: (...args: unknown[]) => m.ensureSigned(...args),
}));

vi.mock('@orm/adapters/SqlProxyHttpAdapterShared', () => ({
  SqlProxyHttpAdapterShared: {
    buildProxySettingsFromEnv: () => m.settings(),
    buildStandardSignedProxyConfig: (input: { settings: unknown }) => m.signed(input.settings),
    ensureSignedProxyConfig: (...args: unknown[]) => m.ensureSigned(...args),
    requestProxy: (...args: unknown[]) => m.requestProxy(...args),
    resolveProxyModeFromEnv: () => m.resolveMode(),
    createProxyNotReachableCliError: (...args: unknown[]) => (m.notReachable as (...a: any[]) => any)(...args),
  },
}));

vi.mock('@orm/adapters/SqlProxyRegistryMode', () => ({
  createStatementPayload: (...args: unknown[]) => (m.createStatementPayload as (...a: any[]) => any)(...args),
}));

import { PostgreSQLProxyAdapter } from '@/orm/adapters/PostgreSQLProxyAdapter';

const connectedAdapter = async (mode: 'sql' | 'registry' = 'sql') => {
  m.resolveMode.mockReturnValue(mode);
  const adapter = PostgreSQLProxyAdapter.create({} as never);
  await adapter.connect();
  return adapter;
};

describe('PostgreSQLProxyAdapter remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resolveMode.mockReturnValue('sql');
    m.settings.mockReturnValue({ baseUrl: 'http://proxy.example' });
    m.signed.mockImplementation((settings: unknown) => settings);
    m.createStatementPayload.mockResolvedValue({ statementId: 'stmt-1' });
  });

  it('extracts lastInsertId from all supported row id types', async () => {
    const adapter = await connectedAdapter();
    for (const [id, expected] of [
      [7, 7],
      ['abc', 'abc'],
      [BigInt(9), BigInt(9)],
      [null, undefined],
      [{}, undefined],
    ] as const) {
      m.requestProxy.mockResolvedValueOnce({ rows: [{ id }], rowCount: 1 });
      await expect(adapter.query('select 1', [])).resolves.toMatchObject({
        rowCount: 1,
        lastInsertId: expected,
      });
    }

    m.requestProxy.mockResolvedValueOnce({ rows: [42], rowCount: 1 });
    await expect(adapter.query('select 1', [])).resolves.toMatchObject({
      lastInsertId: undefined,
    });
  });

  it('converts queryOne-shaped responses with and without a row', async () => {
    const adapter = await connectedAdapter();

    m.requestProxy.mockResolvedValueOnce({ row: { id: 'x' } });
    await expect(adapter.query('select 1', [])).resolves.toEqual({
      rows: [{ id: 'x' }],
      rowCount: 1,
      lastInsertId: 'x',
    });

    m.requestProxy.mockResolvedValueOnce({ row: null });
    await expect(adapter.query('select 1', [])).resolves.toEqual({
      rows: [],
      rowCount: 0,
      lastInsertId: undefined,
    });
  });

  it('falls back to exec metadata for unrecognized responses', async () => {
    const adapter = await connectedAdapter();

    m.requestProxy.mockResolvedValueOnce({ ok: true, meta: { changes: 4 } });
    await expect(adapter.query('update t', [])).resolves.toEqual({ rows: [], rowCount: 4 });

    for (const out of [
      { ok: 'yes', meta: { changes: 4 } },
      { ok: true, meta: 'bad' },
      { ok: true, meta: { changes: '4' } },
      { ok: true },
      {},
    ]) {
      m.requestProxy.mockResolvedValueOnce(out);
      await expect(adapter.query('update t', [])).resolves.toEqual({ rows: [], rowCount: 0 });
    }
  });

  it('handles registry queryOne response shapes', async () => {
    const adapter = await connectedAdapter('registry');

    m.requestProxy.mockResolvedValueOnce({ row: { a: 1 } });
    await expect(adapter.queryOne('select 1', [])).resolves.toEqual({ a: 1 });

    m.requestProxy.mockResolvedValueOnce({ row: null });
    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();

    m.requestProxy.mockResolvedValueOnce({ rows: [{ b: 2 }], rowCount: 1 });
    await expect(adapter.queryOne('select 1', [])).resolves.toEqual({ b: 2 });

    m.requestProxy.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();

    m.requestProxy.mockResolvedValueOnce({ ok: true });
    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();

    expect(m.createStatementPayload).toHaveBeenCalled();
  });

  it('uses the /queryOne endpoint in sql mode and tolerates a null row', async () => {
    const adapter = await connectedAdapter('sql');

    m.requestProxy.mockResolvedValueOnce({ row: null });
    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();
    expect(m.requestProxy.mock.calls[0]?.[1]).toBe('/zin/postgres/queryOne');
  });

  it('requires an active connection for every operation and wraps transaction errors', async () => {
    const adapter = PostgreSQLProxyAdapter.create({} as never);
    expect(adapter.isConnected()).toBe(false);

    await expect(adapter.query('select 1', [])).rejects.toThrow(/not connected/i);
    await expect(adapter.queryOne('select 1', [])).rejects.toThrow(/not connected/i);
    await expect(adapter.ping()).rejects.toThrow(/not connected/i);
    await expect(adapter.rawQuery('select 1')).rejects.toThrow(/not connected/i);
    await expect(adapter.ensureMigrationsTable!()).rejects.toThrow(/not connected/i);
    await expect(adapter.transaction(async () => 1)).rejects.toThrow(/not connected/i);

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getType()).toBe('postgresql');
    expect(adapter.getPlaceholder(2)).toBe('$2');

    await expect(
      adapter.transaction(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow(/transaction failed/i);
    await expect(adapter.transaction(async () => 42)).resolves.toBe(42);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('reports proxy errors from ensureMigrationsTable and defaults rawQuery parameters', async () => {
    const adapter = await connectedAdapter();
    m.requestProxy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(adapter.ensureMigrationsTable!()).rejects.toThrow(/not reachable/i);
    expect(m.notReachable).toHaveBeenCalledWith(
      'PostgreSQL proxy',
      'http://proxy.example',
      expect.any(Error)
    );

    m.requestProxy.mockResolvedValueOnce({ rows: [{ x: 1 }], rowCount: 1 });
    await expect(adapter.rawQuery('select 1')).resolves.toEqual([{ x: 1 }]);
    expect(m.requestProxy.mock.calls.at(-1)?.[2]).toEqual({ sql: 'select 1', params: [] });
  });

  it('uses the statement endpoint for registry-mode queries', async () => {
    const adapter = await connectedAdapter('registry');
    m.requestProxy.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await adapter.query('select 1', ['a']);
    expect(m.requestProxy.mock.calls[0]?.[1]).toBe('/zin/postgres/statement');
    expect(m.createStatementPayload).toHaveBeenCalledWith('select 1', ['a']);
  });
});
