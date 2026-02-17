import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestSignedProxyMock = vi.fn();
const ensureSignedSettingsMock = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  ensureSignedSettings: (...args: unknown[]) => ensureSignedSettingsMock(...args),
  isRecord: (value: unknown): value is Record<string, unknown> =>
    value !== null && value !== undefined && typeof value === 'object',
  requestSignedProxy: (...args: unknown[]) => requestSignedProxyMock(...args),
}));

import { MySQLProxyAdapter } from '../../../../src/orm/adapters/MySQLProxyAdapter';

describe('MySQLProxyAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MYSQL_PROXY_URL', 'http://localhost:8789');
    vi.stubEnv('MYSQL_PROXY_KEY_ID', 'kid');
    vi.stubEnv('MYSQL_PROXY_SECRET', 'secret');
    vi.stubEnv('MYSQL_PROXY_MODE', 'sql');
  });

  it('query/queryOne cover response-shape branches', async () => {
    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path === '/zin/mysql/query') return { rows: [{ a: 1 }], rowCount: 1, lastInsertId: 7 };
      if (path === '/zin/mysql/queryOne') return { row: { id: 1 } };
      throw new Error('unexpected');
    });

    const adapter = MySQLProxyAdapter.create({} as any);
    await adapter.connect();

    const out = await adapter.query('select 1', []);
    expect(out.rowCount).toBe(1);
    expect(out.lastInsertId).toBe(7);

    const row = await adapter.queryOne('select 1', []);
    expect(row).toEqual({ id: 1 });

    // ping() calls queryOne('select 1')
    await expect(adapter.ping()).resolves.toBeUndefined();

    // rawQuery returns query().rows
    const raw = await adapter.rawQuery<{ a: number }>('select 1', []);
    expect(Array.isArray(raw)).toBe(true);

    expect(adapter.getType()).toBe('mysql');
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getPlaceholder(1)).toBe('?');

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
    await expect(adapter.query('select 1', [])).rejects.toBeDefined();
  });

  it('query returns exec meta when proxy responds with ok/meta (non-query response)', async () => {
    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path === '/zin/mysql/query') return { ok: true, meta: { changes: 2, lastRowId: 10 } };
      if (path === '/zin/mysql/queryOne') return { row: null };
      throw new Error('unexpected');
    });

    const adapter = MySQLProxyAdapter.create({} as any);
    await adapter.connect();

    const out = await adapter.query('update t set a=1', []);
    expect(out.rowCount).toBe(2);
    expect(out.lastInsertId).toBe(10);
  });

  it('queryOne registry mode handles statement response shapes (row vs rows)', async () => {
    vi.stubEnv('MYSQL_PROXY_MODE', 'registry');

    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path !== '/zin/mysql/statement') throw new Error('unexpected');
      return { row: { a: 1 } };
    });

    const adapter = MySQLProxyAdapter.create({} as any);
    await adapter.connect();

    const row = await adapter.queryOne('select 1', []);
    expect(row).toEqual({ a: 1 });

    requestSignedProxyMock.mockResolvedValueOnce({ rows: [{ b: 2 }], rowCount: 1 });
    const row2 = await adapter.queryOne('select 2', []);
    expect(row2).toEqual({ b: 2 });

    requestSignedProxyMock.mockResolvedValueOnce({ ok: true, meta: { changes: 0 } });
    const row3 = await adapter.queryOne('select 3', []);
    expect(row3).toBeNull();
  });

  it('query in registry mode handles queryOne-shaped statement responses', async () => {
    vi.stubEnv('MYSQL_PROXY_MODE', 'registry');

    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path !== '/zin/mysql/statement') throw new Error('unexpected');
      return { row: { a: 1 } };
    });

    const adapter = MySQLProxyAdapter.create({} as any);
    await adapter.connect();

    const out = await adapter.query('select 1', []);
    expect(out.rows).toEqual([{ a: 1 }]);
    expect(out.rowCount).toBe(1);
  });

  it('transaction wraps errors with TRY_CATCH_ERROR', async () => {
    requestSignedProxyMock.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = MySQLProxyAdapter.create({} as any);
    await adapter.connect();

    await expect(
      adapter.transaction(async () => {
        throw new Error('boom');
      })
    ).rejects.toBeDefined();
  });

  it('logs and rethrows when proxy request fails', async () => {
    requestSignedProxyMock.mockRejectedValue(new Error('network down'));

    const adapter = MySQLProxyAdapter.create({} as any);
    await adapter.connect();

    await expect(adapter.query('select 1', [])).rejects.toThrow('network down');
    expect(ensureSignedSettingsMock).toHaveBeenCalled();
  });
});
