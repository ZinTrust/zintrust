import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestSignedProxyMock = vi.fn();
const ensureSignedSettingsMock = vi.fn();

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  ensureSignedSettings: (...args: unknown[]) => ensureSignedSettingsMock(...args),
  isRecord: (value: unknown): value is Record<string, unknown> =>
    value !== null && value !== undefined && typeof value === 'object',
  requestSignedProxy: (...args: unknown[]) => requestSignedProxyMock(...args),
}));

import { createSqlServerProxyAdapter } from '../../../../src/orm/adapters/SqlServerProxyAdapter';

describe('SqlServerProxyAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SQLSERVER_PROXY_URL', 'http://localhost:9999');
    vi.stubEnv('SQLSERVER_PROXY_KEY_ID', 'kid');
    vi.stubEnv('SQLSERVER_PROXY_SECRET', 'secret');
    vi.stubEnv('SQLSERVER_PROXY_MODE', 'sql');
  });

  it('connect/query/queryOne/ping cover sql-mode branches', async () => {
    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string, payload: any) => {
      if (path === '/zin/sqlserver/query') {
        if (payload.sql === 'SELECT 1') return { rows: [{ one: 1 }], rowCount: 1 };
        return { ok: true, meta: { changes: 2, lastRowId: 9 } };
      }
      if (path === '/zin/sqlserver/queryOne') return { row: { id: 123 } };
      throw new Error(`unexpected ${path}`);
    });

    const adapter = createSqlServerProxyAdapter();
    await adapter.connect();

    const q = await adapter.query('UPDATE t SET a=1', []);
    expect(q.rowCount).toBe(2);
    expect(q.lastInsertId).toBe(9);

    const one = await adapter.queryOne('SELECT * FROM t WHERE id=1', []);
    expect(one).toEqual({ id: 123 });

    await expect(adapter.ping()).resolves.toBeUndefined();
    expect(ensureSignedSettingsMock).toHaveBeenCalled();

    expect(adapter.getType()).toBe('sqlserver');
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getPlaceholder(2)).toBe('@param2');

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
    await expect(adapter.query('select 1', [])).rejects.toBeDefined();
  });

  it('queryOne in registry mode handles statement responses for queryOne and query', async () => {
    vi.stubEnv('SQLSERVER_PROXY_MODE', 'registry');

    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path !== '/zin/sqlserver/statement') throw new Error('unexpected path');
      return { rows: [{ a: 1 }], rowCount: 1 };
    });

    const adapter = createSqlServerProxyAdapter();
    await adapter.connect();

    const row = await adapter.queryOne('select 1', []);
    expect(row).toEqual({ a: 1 });

    // queryOne response shape
    requestSignedProxyMock.mockResolvedValueOnce({ row: null });
    const row2 = await adapter.queryOne('select 2', []);
    expect(row2).toBeNull();

    // exec-shaped response => null
    requestSignedProxyMock.mockResolvedValueOnce({ ok: true, meta: { changes: 0 } });
    const row3 = await adapter.queryOne('select 3', []);
    expect(row3).toBeNull();
  });

  it('transaction commits on success and rawQuery returns typed rows', async () => {
    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string, payload: any) => {
      if (path !== '/zin/sqlserver/query') throw new Error('unexpected path');
      const sql = String(payload.sql);
      if (sql.includes('BEGIN')) return { ok: true, meta: { changes: 0 } };
      if (sql.includes('COMMIT')) return { ok: true, meta: { changes: 0 } };
      return { rows: [{ x: 1 }], rowCount: 1 };
    });

    const adapter = createSqlServerProxyAdapter();
    await adapter.connect();

    const result = await adapter.transaction(async (tx) => {
      const rows = await tx.rawQuery<{ x: number }>('select 1', []);
      return rows[0]?.x ?? 0;
    });

    expect(result).toBe(1);
  });

  it('transaction rolls back on error and blocks nested transactions', async () => {
    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string, payload: any) => {
      if (path !== '/zin/sqlserver/query') throw new Error('unexpected path');
      const sql = String(payload.sql);
      if (sql.includes('BEGIN')) return { ok: true, meta: { changes: 0 } };
      if (sql.includes('ROLLBACK')) return { ok: true, meta: { changes: 0 } };
      if (sql.includes('COMMIT')) return { ok: true, meta: { changes: 0 } };
      return { rows: [], rowCount: 0 };
    });

    const adapter = createSqlServerProxyAdapter();
    await adapter.connect();

    await expect(
      adapter.transaction(async (tx) => {
        await tx.query('SELECT 1', []);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const nested = async (): Promise<void> => {
      await adapter.transaction(async () => undefined);
    };

    await expect(adapter.transaction(nested)).rejects.toBeDefined();
  });

  it('query in registry mode uses /statement and handles queryOne-shaped statement responses', async () => {
    vi.stubEnv('SQLSERVER_PROXY_MODE', 'registry');

    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path !== '/zin/sqlserver/statement') throw new Error('unexpected path');
      return { row: { a: 1 } };
    });

    const adapter = createSqlServerProxyAdapter();
    await adapter.connect();

    const out = await adapter.query('select 1', []);
    expect(out.rows).toEqual([{ a: 1 }]);
    expect(out.rowCount).toBe(1);
  });
});
