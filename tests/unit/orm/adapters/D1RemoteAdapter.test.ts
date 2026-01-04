import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createFetchResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as any;
}

function createFetchResponseText(status: number, text: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
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

  it('throws when query is called before connect()', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';
    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { rows: [], rowCount: 0 })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);

    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/Database not connected/i);
  });

  it('queryOne in registry mode returns row for queryOne-shaped response', async () => {
    process.env['D1_REMOTE_MODE'] = 'registry';
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { row: { a: 1 } })) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    const out = await adapter.queryOne('SELECT 1', []);
    expect(out).toEqual({ a: 1 });
  });

  it('queryOne in registry mode returns first row for query-shaped response', async () => {
    process.env['D1_REMOTE_MODE'] = 'registry';
    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { rows: [{ a: 1 }], rowCount: 1 })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    const out = await adapter.queryOne('SELECT 1', []);
    expect(out).toEqual({ a: 1 });
  });

  it('queryOne in registry mode returns null for exec-shaped response', async () => {
    process.env['D1_REMOTE_MODE'] = 'registry';
    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { ok: true, meta: { changes: 2 } })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    const out = await adapter.queryOne('UPDATE t SET a=1', []);
    expect(out).toBeNull();
  });

  it('registry mode query maps exec changes from meta', async () => {
    process.env['D1_REMOTE_MODE'] = 'registry';
    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { ok: true, meta: { changes: 3 } })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    const out = await adapter.query('UPDATE t SET a=1', []);
    expect(out.rowCount).toBe(3);
  });

  it('sql mode queryOne uses /zin/d1/queryOne', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { row: { a: 1 } })) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    const out = await adapter.queryOne('SELECT 1', []);
    expect(out).toEqual({ a: 1 });

    const [url] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    expect(String(url)).toContain('/base/zin/d1/queryOne');
  });

  it('throws a config error when D1_REMOTE_URL missing', async () => {
    process.env['D1_REMOTE_URL'] = '';
    process.env['D1_REMOTE_MODE'] = 'sql';
    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { rows: [], rowCount: 0 })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/D1 remote proxy URL is missing/i);
    expect(globalThis.fetch).toHaveBeenCalledTimes(0);
  });

  it('throws a config error when signing credentials are missing', async () => {
    process.env['D1_REMOTE_KEY_ID'] = '';
    process.env['D1_REMOTE_MODE'] = 'sql';
    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { rows: [], rowCount: 0 })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(
      /D1 remote signing credentials are missing/i
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(0);
  });

  it('registry mode query returns rows/rowCount for queryOne-shaped response', async () => {
    process.env['D1_REMOTE_MODE'] = 'registry';
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { row: { a: 1 } })) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    const out = await adapter.query('SELECT 1', []);
    expect(out.rowCount).toBe(1);
    expect(out.rows).toEqual([{ a: 1 }]);
  });

  it('disconnect() clears connected state', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);

    expect(adapter.isConnected()).toBe(false);
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('ping() uses queryOne when connected', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';
    globalThis.fetch = vi.fn(async () => createFetchResponse(200, { row: { ok: 1 } })) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);

    await adapter.connect();
    await adapter.ping();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('ping() throws when not connected', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);

    await expect(adapter.ping()).rejects.toThrow(/Database not connected/i);
  });

  it('transaction() returns callback result and wraps errors', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    const ok = await adapter.transaction(async () => 123);
    expect(ok).toBe(123);

    await expect(
      adapter.transaction(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow(/Transaction failed/i);
  });

  it('rawQuery() forwards to query()', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';
    globalThis.fetch = vi.fn(async () =>
      createFetchResponse(200, { rows: [{ a: 1 }], rowCount: 1 })
    ) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    const rows = await adapter.rawQuery<{ a: number }>('SELECT 1', []);
    expect(rows).toEqual([{ a: 1 }]);
  });

  it('getType() returns d1-remote', async () => {
    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    expect(adapter.getType()).toBe('d1-remote');
  });

  it('getPlaceholder() returns ?', async () => {
    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);

    expect(adapter.getPlaceholder(1)).toBe('?');
  });

  it('maps 401/403/429/4xx/5xx responses to typed errors', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    globalThis.fetch = vi.fn(async () => createFetchResponseText(401, 'nope')) as any;
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/unauthorized/i);

    globalThis.fetch = vi.fn(async () => createFetchResponseText(403, 'nope')) as any;
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/forbidden/i);

    globalThis.fetch = vi.fn(async () => createFetchResponseText(429, 'nope')) as any;
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/rate limited/i);

    globalThis.fetch = vi.fn(async () => createFetchResponseText(400, 'nope')) as any;
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/rejected request/i);

    globalThis.fetch = vi.fn(async () => createFetchResponseText(500, '')) as any;
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/proxy error/i);
  });

  it('maps AbortError to a timeout connection error', async () => {
    process.env['D1_REMOTE_MODE'] = 'sql';

    globalThis.fetch = vi.fn(async () => {
      const err = new Error('aborted');
      (err as any).name = 'AbortError';
      throw err;
    }) as any;

    const { D1RemoteAdapter } = await import('@/orm/adapters/D1RemoteAdapter');
    const adapter = D1RemoteAdapter.create({ driver: 'd1-remote' } as any);
    await adapter.connect();

    await expect(adapter.query('SELECT 1', [])).rejects.toThrow(/timed out/i);
  });
});
