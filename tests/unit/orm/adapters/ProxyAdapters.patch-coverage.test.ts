import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    createHeaders: vi.fn(async ({ keyId }: { keyId: string }) => ({
      'x-zt-key-id': keyId,
      'x-zt-timestamp': '123',
      'x-zt-nonce': 'nonce',
      'x-zt-body-sha256': 'sha',
      'x-zt-signature': 'sig',
    })),
  },
}));

describe('Proxy adapters patch coverage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: [{ ok: 1 }], rows: [{ ok: 1 }], rowCount: 1 }),
      text: async () => '',
    })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;

    delete process.env['MONGODB_PROXY_URL'];
    delete process.env['MONGODB_PROXY_HOST'];
    delete process.env['MONGODB_PROXY_PORT'];
    delete process.env['MONGODB_PROXY_KEY_ID'];
    delete process.env['MONGODB_PROXY_SECRET'];

    delete process.env['SQLSERVER_PROXY_URL'];
    delete process.env['SQLSERVER_PROXY_HOST'];
    delete process.env['SQLSERVER_PROXY_PORT'];
    delete process.env['SQLSERVER_PROXY_KEY_ID'];
    delete process.env['SQLSERVER_PROXY_SECRET'];
  });

  it('MongoDB proxy uses explicit URL and keeps request URL when prefix is empty', async () => {
    process.env['MONGODB_PROXY_URL'] = 'http://proxy.example';
    process.env['MONGODB_PROXY_KEY_ID'] = 'k1';
    process.env['MONGODB_PROXY_SECRET'] = 's1';

    const { SignedRequest } = await import('@security/SignedRequest');
    const { createMongoDBProxyAdapter } = await import('@/orm/adapters/MongoDBProxyAdapter');

    const adapter = createMongoDBProxyAdapter();
    await adapter.connect();
    await adapter.query('users.find({"id":1}$', []);

    expect(SignedRequest.createHeaders).toHaveBeenCalled();

    const signInput = (
      SignedRequest.createHeaders as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.at(-1)?.[0] as { url: URL };
    expect(signInput.url.toString()).toBe('http://proxy.example/');
  });

  it('SQL Server proxy uses explicit URL and keeps request URL when prefix is empty', async () => {
    process.env['SQLSERVER_PROXY_URL'] = 'http://sqlproxy.example';
    process.env['SQLSERVER_PROXY_KEY_ID'] = 'k2';
    process.env['SQLSERVER_PROXY_SECRET'] = 's2';

    const { SignedRequest } = await import('@security/SignedRequest');
    const { createSqlServerProxyAdapter } = await import('@/orm/adapters/SqlServerProxyAdapter');

    const adapter = createSqlServerProxyAdapter();
    await adapter.connect();
    await adapter.query('SELECT 1', []);

    expect(SignedRequest.createHeaders).toHaveBeenCalled();

    const signInput = (
      SignedRequest.createHeaders as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.at(-1)?.[0] as { url: URL };
    expect(signInput.url.toString()).toBe('http://sqlproxy.example/');
  });
});
