import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createFetchResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as any;
}

describe('D1RemoteAdapter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env['D1_REMOTE_URL'] = 'https://proxy.example/base';
    process.env['D1_REMOTE_KEY_ID'] = 'k1';
    process.env['D1_REMOTE_SECRET'] = 'secret';
    process.env['ZT_PROXY_TIMEOUT_MS'] = '30000';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env['D1_REMOTE_URL'];
    delete process.env['D1_REMOTE_KEY_ID'];
    delete process.env['D1_REMOTE_SECRET'];
    delete process.env['D1_REMOTE_MODE'];
    delete process.env['ZT_PROXY_TIMEOUT_MS'];
  });

  it('uses /zin/d1/query for SELECT in sql mode', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';

    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { rows: [{ ok: 1 }], rowCount: 1 })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');

    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();
    const out = await adapter.query('SELECT 1', []);

    expect(out.rowCount).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    expect(String(url)).toContain('/base/zin/d1/query');
    expect(init.headers['x-zt-key-id']).toBe('k1');
  });

  it('uses /zin/d1/exec for mutating SQL in sql mode', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';

    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { ok: true, meta: { changes: 2 } })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');

    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();
    const out = await adapter.query('INSERT INTO t (a) VALUES (?)', [1]);

    expect(out.rowCount).toBe(2);
    const [url] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    expect(String(url)).toContain('/base/zin/d1/exec');
  });

  it('uses /zin/d1/statement in registry mode and does not send sql', async () => {
    process.env['D1_REMOTE_MODE'] = 'registry';

    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { rows: [{ ok: 1 }], rowCount: 1 })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');

    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();
    await adapter.query('SELECT 1', []);

    const [url, init] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    expect(String(url)).toContain('/base/zin/d1/statement');
    const payload = JSON.parse(String(init.body)) as any;
    expect(payload.sql).toBeUndefined();
    expect(payload.statementId).toMatch(/^[a-f0-9]{64}$/);
  });
});
