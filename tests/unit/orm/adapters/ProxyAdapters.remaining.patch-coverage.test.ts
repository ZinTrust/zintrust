import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Proxy adapters remaining patch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env['MONGODB_PROXY_URL'];
    delete process.env['MONGODB_PROXY_HOST'];
    delete process.env['MONGODB_PROXY_PORT'];
    delete process.env['MONGODB_PROXY_KEY_ID'];
    delete process.env['MONGODB_PROXY_SECRET'];
  });

  it('covers ProxyCache ttl expiry and clear branches', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000).mockReturnValueOnce(7002);

    const { ProxyCache } = await import('@orm/adapters/ProxyCache');
    const cache = ProxyCache.create();
    cache.set('k', { rows: [{ id: 1 }], rowCount: 1 });

    expect(cache.get('k')).toBeNull();
    cache.clear();
    expect(cache.get('k')).toBeNull();

    now.mockRestore();
  });

  it('covers ProxyCache cache-hit branch', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);

    const { ProxyCache } = await import('@orm/adapters/ProxyCache');
    const cache = ProxyCache.create();
    const data = { rows: [{ ok: 1 }], rowCount: 1 };
    cache.set('hit', data);

    expect(cache.get('hit')).toEqual(data);
    now.mockRestore();
  });

  it('covers MongoDB proxy url fallback and invalid mongo query format', async () => {
    process.env['MONGODB_PROXY_HOST'] = '127.0.0.9';
    process.env['MONGODB_PROXY_PORT'] = '9999';
    process.env['MONGODB_PROXY_KEY_ID'] = 'kid';
    process.env['MONGODB_PROXY_SECRET'] = 'sec';

    const info = vi.fn();
    vi.doMock('@config/logger', () => ({ Logger: { info, warn: vi.fn(), error: vi.fn() } }));

    const { createMongoDBProxyAdapter } = await import('@orm/adapters/MongoDBProxyAdapter');
    const adapter = createMongoDBProxyAdapter();
    await adapter.connect();

    await expect(adapter.query('invalid-format', [])).rejects.toThrow(
      'Invalid MongoDB query format'
    );
    expect(info).toHaveBeenCalledWith('Connecting to MongoDB via proxy: http://127.0.0.9:9999');
  });

  it('covers MySQL and PostgreSQL buildSignedProxyConfig request/ensure branches', async () => {
    vi.doMock('@orm/adapters/SqlProxyAdapterUtils', () => ({
      ensureSignedSettings: vi.fn(() => ({ ok: true })),
      isRecord: (value: unknown) => typeof value === 'object' && value !== null,
      requestSignedProxy: vi.fn(async (_cfg: unknown, path: string) => {
        if (path.includes('queryOne')) return { row: { id: 1 } };
        if (path.includes('query')) return { rows: [{ id: 1 }], rowCount: 1 };
        return { ok: true, meta: { changes: 1, lastRowId: 12 } };
      }),
    }));

    const { MySQLProxyAdapter } = await import('@orm/adapters/MySQLProxyAdapter');
    const my = MySQLProxyAdapter.create({} as never);
    await my.connect();
    await expect(my.query('select 1', [])).resolves.toMatchObject({ rowCount: 1 });

    const { PostgreSQLProxyAdapter } = await import('@orm/adapters/PostgreSQLProxyAdapter');
    const pg = PostgreSQLProxyAdapter.create({} as never);
    await pg.connect();
    await expect(pg.query('select 1', [])).resolves.toMatchObject({ rowCount: 1 });
  });

  it('covers SqlProxyAdapterUtils config validation error paths', async () => {
    vi.doUnmock('@orm/adapters/SqlProxyAdapterUtils');
    vi.doMock('@proxy/SigningService', () => ({
      normalizeSigningCredentials: vi.fn(
        ({ keyId, secret }: { keyId: string; secret: string }) => ({
          keyId,
          secret,
        })
      ),
    }));

    const { ensureSignedSettings } = await import('@orm/adapters/SqlProxyAdapterUtils');

    expect(() =>
      ensureSignedSettings({
        settings: { baseUrl: ' ', keyId: 'a', secret: 'b', timeoutMs: 1000 },
        missingUrlMessage: 'missing-url',
        missingCredentialsMessage: 'missing-creds',
        messages: {
          unauthorized: 'u',
          forbidden: 'f',
          rateLimited: 'r',
          rejected: 'x',
          error: 'e',
          timedOut: 't',
        },
      })
    ).toThrow('missing-url');

    expect(() =>
      ensureSignedSettings({
        settings: { baseUrl: 'http://proxy', keyId: ' ', secret: ' ', timeoutMs: 1000 },
        missingUrlMessage: 'missing-url',
        missingCredentialsMessage: 'missing-creds',
        messages: {
          unauthorized: 'u',
          forbidden: 'f',
          rateLimited: 'r',
          rejected: 'x',
          error: 'e',
          timedOut: 't',
        },
      })
    ).toThrow('missing-creds');
  });
});
