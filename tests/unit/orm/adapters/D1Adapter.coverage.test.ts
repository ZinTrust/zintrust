import { beforeEach, describe, expect, it, vi } from 'vitest';

const getD1BindingMock = vi.fn();
vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getD1Binding: (...args: unknown[]) => getD1BindingMock(...args),
  },
}));

const rawQueryEnabledMock = vi.fn();
vi.mock('@config/features', () => ({
  FeatureFlags: {
    isRawQueryEnabled: () => rawQueryEnabledMock(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { D1Adapter } from '@orm/adapters/D1Adapter';

describe('D1Adapter (coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getD1BindingMock.mockReset();
    rawQueryEnabledMock.mockReset();
    rawQueryEnabledMock.mockReturnValue(true);
  });

  it('throws when not connected and when binding missing', async () => {
    const adapter = D1Adapter.create({} as any);
    await expect(adapter.query('select 1', [])).rejects.toBeDefined();

    await adapter.connect();
    getD1BindingMock.mockReturnValue(null);
    await expect(adapter.query('select 1', [])).rejects.toBeDefined();
  });

  it('handles mutating and non-mutating queries and extracts meta from multiple fields', async () => {
    const runMock = vi.fn(async () => ({ meta: { rows_written: 3, last_insert_rowid: 9 } }));
    const allMock = vi.fn(async () => ({ results: [{ a: 1 }], meta: { rows_read: 1 } }));
    const firstMock = vi.fn(async () => ({ a: 1 }));

    const bindMock = vi.fn(() => ({ run: runMock, all: allMock, first: firstMock }));
    const prepare = vi.fn(() => ({ bind: bindMock }));

    getD1BindingMock.mockReturnValue({ prepare });

    const adapter = D1Adapter.create({} as any);
    await adapter.connect();

    const mut = await adapter.query('insert into t values (1)', []);
    expect(mut.rowCount).toBe(3);
    expect(mut.lastInsertId).toBe(9);

    const q = await adapter.query('select * from t', []);
    expect(q.rows).toEqual([{ a: 1 }]);
    expect(q.rowCount).toBe(1);

    const one = await adapter.queryOne('select 1', []);
    expect(one).toEqual({ a: 1 });

    await expect(adapter.ping()).resolves.toBeUndefined();
  });

  it('extractMeta falls back to changes=0 when meta has no recognized fields', async () => {
    const runMock = vi.fn(async () => ({ meta: {} }));
    const bindMock = vi.fn(() => ({ run: runMock }));
    const prepare = vi.fn(() => ({ bind: bindMock }));
    getD1BindingMock.mockReturnValue({ prepare });

    const adapter = D1Adapter.create({} as any);
    await adapter.connect();

    const out = await adapter.query('update t set a=1', []);
    expect(out.rowCount).toBe(0);
  });

  it('rawQuery enforces feature flag and returns results array', async () => {
    const allMock = vi.fn(async () => ({ results: [{ x: 1 }] }));
    const bindMock = vi.fn(() => ({ all: allMock }));
    const prepare = vi.fn(() => ({ bind: bindMock }));
    getD1BindingMock.mockReturnValue({ prepare });

    const adapter = D1Adapter.create({} as any);
    await adapter.connect();

    rawQueryEnabledMock.mockReturnValue(false);
    await expect(adapter.rawQuery('select 1', [])).rejects.toBeDefined();

    rawQueryEnabledMock.mockReturnValue(true);
    const out = await adapter.rawQuery<{ x: number }>('select 1', []);
    expect(out).toEqual([{ x: 1 }]);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });
});
