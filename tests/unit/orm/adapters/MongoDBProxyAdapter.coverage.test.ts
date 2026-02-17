import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestSignedProxyMock = vi.fn();
const ensureSignedSettingsMock = vi.fn();

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  ensureSignedSettings: (...args: unknown[]) => ensureSignedSettingsMock(...args),
  isRecord: (value: unknown): value is Record<string, unknown> =>
    value !== null && value !== undefined && typeof value === 'object',
  requestSignedProxy: (...args: unknown[]) => requestSignedProxyMock(...args),
}));

import { createMongoDBProxyAdapter } from '../../../../src/orm/adapters/MongoDBProxyAdapter';

describe('MongoDBProxyAdapter (coverage extras)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    requestSignedProxyMock.mockReset();
    ensureSignedSettingsMock.mockReset();

    vi.stubEnv('MONGODB_PROXY_URL', 'http://localhost:8792');
    vi.stubEnv('MONGODB_PROXY_KEY_ID', 'kid');
    vi.stubEnv('MONGODB_PROXY_SECRET', 'secret');
  });

  it('extracts response.result and wraps object rows', async () => {
    requestSignedProxyMock.mockResolvedValueOnce({ result: { a: 1 } });

    const adapter = createMongoDBProxyAdapter();
    await adapter.connect();

    const out = await adapter.query('users.find({"a":1}$', []);
    expect(out.rows).toEqual([{ a: 1 }]);
    expect(out.rowCount).toBe(1);
  });

  it('extracts response.rows array and supports null result', async () => {
    requestSignedProxyMock.mockResolvedValueOnce({ rows: [{ a: 1 }, { a: 2 }] });

    const adapter = createMongoDBProxyAdapter();
    await adapter.connect();
    const out1 = await adapter.query('users.find({"a":1}$', []);
    expect(out1.rowCount).toBe(2);

    requestSignedProxyMock.mockResolvedValueOnce({ result: null });
    const out2 = await adapter.query('users.find({"a":2}$', []);
    expect(out2.rows).toEqual([]);
    expect(out2.rowCount).toBe(0);
  });

  it('falls back to full response payload when no result/rows field exists', async () => {
    requestSignedProxyMock.mockResolvedValueOnce({ foo: 1 });

    const adapter = createMongoDBProxyAdapter();
    await adapter.connect();

    const out = await adapter.query('users.find({"a":3}$', []);
    expect(out.rows).toEqual([{ foo: 1 }]);
    expect(out.rowCount).toBe(1);
  });
});
