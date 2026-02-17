import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestSignedProxyMock = vi.fn();
const ensureSignedSettingsMock = vi.fn();

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  ensureSignedSettings: (...args: unknown[]) => ensureSignedSettingsMock(...args),
  isRecord: (value: unknown): value is Record<string, unknown> =>
    value !== null && value !== undefined && typeof value === 'object',
  requestSignedProxy: (...args: unknown[]) => requestSignedProxyMock(...args),
}));

import { PostgreSQLProxyAdapter } from '../../../../src/orm/adapters/PostgreSQLProxyAdapter';

describe('PostgreSQLProxyAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('POSTGRES_PROXY_URL', 'http://localhost:8790');
    vi.stubEnv('POSTGRES_PROXY_KEY_ID', 'kid');
    vi.stubEnv('POSTGRES_PROXY_SECRET', 'secret');
    vi.stubEnv('POSTGRES_PROXY_MODE', 'registry');
  });

  it('queryOne in registry mode returns first row when proxy replies with rows', async () => {
    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path !== '/zin/postgres/statement') throw new Error('unexpected');
      return { rows: [{ x: 1 }], rowCount: 1 };
    });

    const adapter = PostgreSQLProxyAdapter.create({} as any);
    await adapter.connect();

    const out = await adapter.queryOne('select 1', []);
    expect(out).toEqual({ x: 1 });
  });

  it('transaction wraps errors', async () => {
    requestSignedProxyMock.mockResolvedValue({ rows: [], rowCount: 0 });

    const adapter = PostgreSQLProxyAdapter.create({} as any);
    await adapter.connect();

    await expect(
      adapter.transaction(async () => {
        throw new Error('boom');
      })
    ).rejects.toBeDefined();

    expect(ensureSignedSettingsMock).toHaveBeenCalled();
  });

  it('queryOne in sql mode calls /queryOne and returns row/null', async () => {
    vi.stubEnv('POSTGRES_PROXY_MODE', 'sql');

    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path !== '/zin/postgres/queryOne') throw new Error('unexpected');
      return { row: { x: 1 } };
    });

    const adapter = PostgreSQLProxyAdapter.create({} as any);
    await adapter.connect();

    expect(await adapter.queryOne('select 1', [])).toEqual({ x: 1 });

    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path !== '/zin/postgres/queryOne') throw new Error('unexpected');
      return { row: null };
    });
    expect(await adapter.queryOne('select 1', [])).toBeNull();
  });

  it('queryOne in registry mode returns null when proxy response shape is not query/queryOne', async () => {
    vi.stubEnv('POSTGRES_PROXY_MODE', 'registry');
    requestSignedProxyMock.mockImplementation(async (_cfg: unknown, path: string) => {
      if (path !== '/zin/postgres/statement') throw new Error('unexpected');
      return { ok: true };
    });

    const adapter = PostgreSQLProxyAdapter.create({} as any);
    await adapter.connect();

    await expect(adapter.queryOne('select 1', [])).resolves.toBeNull();
  });
});
