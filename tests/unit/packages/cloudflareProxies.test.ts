import { describe, expect, it } from 'vitest';

const toHex = (bytes: ArrayBuffer): string => {
  const view = new Uint8Array(bytes);
  let out = '';
  for (const b of view) out += b.toString(16).padStart(2, '0');
  return out;
};

const sign = async (params: {
  secret: string;
  method: string;
  url: string;
  bodyBytes: Uint8Array;
  keyId: string;
  nonce: string;
  timestampMs: number;
  signedRequest: {
    sha256Hex: (b: Uint8Array) => Promise<string>;
    canonicalString: (p: any) => string;
  };
}): Promise<Record<string, string>> => {
  const bodySha256 = await params.signedRequest.sha256Hex(params.bodyBytes);
  const canonical = params.signedRequest.canonicalString({
    method: params.method,
    url: params.url,
    timestampMs: params.timestampMs,
    nonce: params.nonce,
    bodySha256Hex: bodySha256,
  });

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(params.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));

  return {
    'x-zt-key-id': params.keyId,
    'x-zt-timestamp': String(params.timestampMs),
    'x-zt-nonce': params.nonce,
    'x-zt-body-sha256': bodySha256,
    'x-zt-signature': toHex(sig),
  };
};

const buildSignedRequest = async (params: {
  url: string;
  body: string;
  keyId: string;
  secret: string;
  signedRequest: {
    sha256Hex: (b: Uint8Array) => Promise<string>;
    canonicalString: (p: any) => string;
  };
}): Promise<Request> => {
  const bodyBytes = new TextEncoder().encode(params.body);
  const headers = await sign({
    secret: params.secret,
    method: 'POST',
    url: params.url,
    bodyBytes,
    keyId: params.keyId,
    nonce: 'n1',
    timestampMs: Date.now(),
    signedRequest: params.signedRequest,
  });

  return new Request(params.url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: params.body,
  });
};

describe('cloudflare proxy workers', () => {
  it('d1 proxy /zin/d1/query returns rows for a valid signed request', async () => {
    const { ZintrustD1Proxy } =
      (await import('../../../packages/cloudflare-d1-proxy/src/index.js')) as {
        ZintrustD1Proxy: { fetch: (req: Request, env: any) => Promise<Response> };
      };

    const { SignedRequest } =
      (await import('../../../packages/cloudflare-d1-proxy/src/SignedRequest.js')) as {
        SignedRequest: {
          sha256Hex: (b: Uint8Array) => Promise<string>;
          canonicalString: (p: any) => string;
        };
      };

    const body = JSON.stringify({ sql: 'select 1', params: [] });
    const bodyBytes = new TextEncoder().encode(body);
    const keyId = 'k1';
    const secret = 'super-secret';
    const headers = await sign({
      secret,
      method: 'POST',
      url: 'https://example.test/zin/d1/query',
      bodyBytes,
      keyId,
      nonce: 'n1',
      timestampMs: Date.now(),
      signedRequest: SignedRequest,
    });

    const db = {
      prepare: (_sql: string) => {
        const stmt = {
          bind: (..._values: unknown[]) => stmt,
          all: async () => ({ results: [{ ok: true }] }),
          first: async () => ({ ok: true }),
          run: async () => ({ meta: { ok: true } }),
        };
        return stmt;
      },
    };

    const env = {
      DB: db,
      D1_REMOTE_SECRET: secret,
    };

    const req = new Request('https://example.test/zin/d1/query', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body,
    });

    const res = await ZintrustD1Proxy.fetch(req, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rowCount: number };
    expect(json.rowCount).toBe(1);
  });

  it('d1 proxy resolves custom binding name from D1_BINDING', async () => {
    const { ZintrustD1Proxy } =
      (await import('../../../packages/cloudflare-d1-proxy/src/index.js')) as {
        ZintrustD1Proxy: { fetch: (req: Request, env: any) => Promise<Response> };
      };

    const { SignedRequest } =
      (await import('../../../packages/cloudflare-d1-proxy/src/SignedRequest.js')) as {
        SignedRequest: {
          sha256Hex: (b: Uint8Array) => Promise<string>;
          canonicalString: (p: any) => string;
        };
      };

    const body = JSON.stringify({ sql: 'select 1', params: [] });
    const bodyBytes = new TextEncoder().encode(body);
    const keyId = 'k1';
    const secret = 'super-secret';
    const headers = await sign({
      secret,
      method: 'POST',
      url: 'https://example.test/zin/d1/query',
      bodyBytes,
      keyId,
      nonce: 'n1',
      timestampMs: Date.now(),
      signedRequest: SignedRequest,
    });

    const db = {
      prepare: (_sql: string) => {
        const stmt = {
          bind: (..._values: unknown[]) => stmt,
          all: async () => ({ results: [{ ok: true }] }),
          first: async () => ({ ok: true }),
          run: async () => ({ meta: { ok: true } }),
        };
        return stmt;
      },
    };

    const env = {
      CUSTOM_DB: db,
      D1_BINDING: 'CUSTOM_DB',
      D1_REMOTE_SECRET: secret,
    };

    const req = new Request('https://example.test/zin/d1/query', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body,
    });

    const res = await ZintrustD1Proxy.fetch(req, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rowCount: number };
    expect(json.rowCount).toBe(1);
  });

  it('kv proxy /zin/kv/put stores under prefixed namespaced key for valid signed request', async () => {
    const { ZintrustKvProxy } =
      (await import('../../../packages/cloudflare-kv-proxy/src/index.js')) as {
        ZintrustKvProxy: { fetch: (req: Request, env: any) => Promise<Response> };
      };

    const { SignedRequest } =
      (await import('../../../packages/cloudflare-kv-proxy/src/SignedRequest.js')) as {
        SignedRequest: {
          sha256Hex: (b: Uint8Array) => Promise<string>;
          canonicalString: (p: any) => string;
        };
      };

    let lastPut: { key?: string; value?: string; ttl?: number } = {};
    const cache = {
      get: async (_key: string) => null,
      put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
        lastPut = { key, value, ttl: options?.expirationTtl };
      },
      delete: async (_key: string) => {},
      list: async (_opts: any) => ({ keys: [], cursor: '', list_complete: true }),
    };

    const body = JSON.stringify({ namespace: 'ns', key: 'a', value: { x: 1 }, ttlSeconds: 12 });
    const bodyBytes = new TextEncoder().encode(body);
    const keyId = 'k1';
    const secret = 'super-secret';
    const headers = await sign({
      secret,
      method: 'POST',
      url: 'https://example.test/zin/kv/put',
      bodyBytes,
      keyId,
      nonce: 'n1',
      timestampMs: Date.now(),
      signedRequest: SignedRequest,
    });

    const env = {
      CACHE: cache,
      KV_REMOTE_SECRET: secret,
      ZT_KV_PREFIX: 'pfx',
    };

    const req = new Request('https://example.test/zin/kv/put', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body,
    });

    const res = await ZintrustKvProxy.fetch(req, env);
    expect(res.status).toBe(200);
    expect(lastPut.key).toBe('pfx:ns:a');
    expect(lastPut.value).toBe(JSON.stringify({ x: 1 }));
    expect(lastPut.ttl).toBe(12);
  });

  it('kv proxy handles validation and list paths', async () => {
    const { ZintrustKvProxy } =
      (await import('../../../packages/cloudflare-kv-proxy/src/index.js')) as {
        ZintrustKvProxy: { fetch: (req: Request, env: any) => Promise<Response> };
      };

    const { SignedRequest } =
      (await import('../../../packages/cloudflare-kv-proxy/src/SignedRequest.js')) as {
        SignedRequest: {
          sha256Hex: (b: Uint8Array) => Promise<string>;
          canonicalString: (p: any) => string;
        };
      };

    const keyId = 'k1';
    const secret = 'super-secret';

    const reqBad = await buildSignedRequest({
      url: 'https://example.test/zin/kv/get',
      body: JSON.stringify({ type: 'json' }),
      keyId,
      secret,
      signedRequest: SignedRequest,
    });

    const env = {
      CACHE: {
        get: async (key: string, type?: string) => (type ? { key } : key),
        put: async () => {},
        delete: async () => {},
        list: async (_opts: any) => ({
          keys: [{ name: 'pfx:ns:alpha' }],
          cursor: 'c1',
          list_complete: false,
        }),
      },
      KV_REMOTE_SECRET: secret,
      ZT_KV_PREFIX: 'pfx',
      ZT_KV_LIST_LIMIT: '2',
    };

    const resBad = await ZintrustKvProxy.fetch(reqBad, env);
    expect(resBad.status).toBe(400);

    const listReq = await buildSignedRequest({
      url: 'https://example.test/zin/kv/list',
      body: '',
      keyId,
      secret,
      signedRequest: SignedRequest,
    });

    const listRes = await ZintrustKvProxy.fetch(listReq, env);
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as {
      keys: string[];
      cursor: string;
      listComplete: boolean;
    };
    expect(listJson.keys).toEqual(['pfx:ns:alpha']);
    expect(listJson.cursor).toBe('c1');
    expect(listJson.listComplete).toBe(false);
  });

  it('kv proxy returns errors for invalid method, config, and JSON', async () => {
    const { ZintrustKvProxy } =
      (await import('../../../packages/cloudflare-kv-proxy/src/index.js')) as {
        ZintrustKvProxy: { fetch: (req: Request, env: any) => Promise<Response> };
      };

    const resMethod = await ZintrustKvProxy.fetch(
      new Request('https://example.test/zin/kv/get', { method: 'GET' }),
      {}
    );
    expect(resMethod.status).toBe(405);

    const { SignedRequest } =
      (await import('../../../packages/cloudflare-kv-proxy/src/SignedRequest.js')) as {
        SignedRequest: {
          sha256Hex: (b: Uint8Array) => Promise<string>;
          canonicalString: (p: any) => string;
        };
      };

    const reqMissingKeys = await buildSignedRequest({
      url: 'https://example.test/zin/kv/get',
      body: JSON.stringify({ key: 'a' }),
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });

    const resMissingKeys = await ZintrustKvProxy.fetch(reqMissingKeys, {});
    expect(resMissingKeys.status).toBe(500);

    const reqBadJson = await buildSignedRequest({
      url: 'https://example.test/zin/kv/get',
      body: '{bad',
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });

    const resBadJson = await ZintrustKvProxy.fetch(reqBadJson, {
      KV_REMOTE_SECRET: 'secret',
    });
    expect(resBadJson.status).toBe(400);
  });

  it('d1 proxy handles statement and limits', async () => {
    const { ZintrustD1Proxy } =
      (await import('../../../packages/cloudflare-d1-proxy/src/index.js')) as {
        ZintrustD1Proxy: { fetch: (req: Request, env: any) => Promise<Response> };
      };

    const { SignedRequest } =
      (await import('../../../packages/cloudflare-d1-proxy/src/SignedRequest.js')) as {
        SignedRequest: {
          sha256Hex: (b: Uint8Array) => Promise<string>;
          canonicalString: (p: any) => string;
        };
      };

    const db = {
      prepare: (_sql: string) => {
        const stmt = {
          bind: (..._values: unknown[]) => stmt,
          all: async () => ({ results: [{ ok: true }] }),
          first: async () => null,
          run: async () => ({ meta: { ok: true } }),
        };
        return stmt;
      },
    };

    const env = {
      DB: db,
      D1_REMOTE_SECRET: 'secret',
      ZT_D1_STATEMENTS_JSON: JSON.stringify({
        getUsers: 'select 1',
        deleteUser: 'delete from users',
      }),
      ZT_MAX_SQL_BYTES: '8',
      ZT_MAX_PARAMS: '1',
    };

    const reqTooLarge = await buildSignedRequest({
      url: 'https://example.test/zin/d1/query',
      body: JSON.stringify({ sql: 'select too long', params: [] }),
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });
    const resTooLarge = await ZintrustD1Proxy.fetch(reqTooLarge, env);
    expect(resTooLarge.status).toBe(413);

    const reqTooMany = await buildSignedRequest({
      url: 'https://example.test/zin/d1/query',
      body: JSON.stringify({ sql: 'select 1', params: [1, 2] }),
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });
    const resTooMany = await ZintrustD1Proxy.fetch(reqTooMany, env);
    expect(resTooMany.status).toBe(400);

    const reqStatement = await buildSignedRequest({
      url: 'https://example.test/zin/d1/statement',
      body: JSON.stringify({ statementId: 'getUsers', params: [] }),
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });
    const resStatement = await ZintrustD1Proxy.fetch(reqStatement, env);
    expect(resStatement.status).toBe(200);

    const reqMutating = await buildSignedRequest({
      url: 'https://example.test/zin/d1/statement',
      body: JSON.stringify({ statementId: 'deleteUser', params: [] }),
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });
    const resMutating = await ZintrustD1Proxy.fetch(reqMutating, env);
    expect(resMutating.status).toBe(200);
  });

  it('d1 proxy returns config and validation errors', async () => {
    const { ZintrustD1Proxy } =
      (await import('../../../packages/cloudflare-d1-proxy/src/index.js')) as {
        ZintrustD1Proxy: { fetch: (req: Request, env: any) => Promise<Response> };
      };

    const resMethod = await ZintrustD1Proxy.fetch(
      new Request('https://example.test/zin/d1/query', { method: 'GET' }),
      {}
    );
    expect(resMethod.status).toBe(405);

    const { SignedRequest } =
      (await import('../../../packages/cloudflare-d1-proxy/src/SignedRequest.js')) as {
        SignedRequest: {
          sha256Hex: (b: Uint8Array) => Promise<string>;
          canonicalString: (p: any) => string;
        };
      };

    const reqMissingKeys = await buildSignedRequest({
      url: 'https://example.test/zin/d1/queryOne',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });

    const resMissingKeys = await ZintrustD1Proxy.fetch(reqMissingKeys, {});
    expect(resMissingKeys.status).toBe(401);

    const reqInvalidJson = await buildSignedRequest({
      url: 'https://example.test/zin/d1/query',
      body: '{bad',
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });

    const resInvalidJson = await ZintrustD1Proxy.fetch(reqInvalidJson, {
      D1_REMOTE_SECRET: 'secret',
    });
    expect(resInvalidJson.status).toBe(400);

    const reqMissingDb = await buildSignedRequest({
      url: 'https://example.test/zin/d1/query',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
      keyId: 'k1',
      secret: 'secret',
      signedRequest: SignedRequest,
    });
    const resMissingDb = await ZintrustD1Proxy.fetch(reqMissingDb, {
      D1_REMOTE_SECRET: 'secret',
    });
    expect(resMissingDb.status).toBe(400);
  });

  it('kv proxy resolves custom KV binding name from KV_NAMESPACE', async () => {
    const { ZintrustKvProxy } =
      (await import('../../../packages/cloudflare-kv-proxy/src/index.js')) as {
        ZintrustKvProxy: { fetch: (req: Request, env: any) => Promise<Response> };
      };

    const { SignedRequest } =
      (await import('../../../packages/cloudflare-kv-proxy/src/SignedRequest.js')) as {
        SignedRequest: {
          sha256Hex: (b: Uint8Array) => Promise<string>;
          canonicalString: (p: any) => string;
        };
      };

    let lastPut: { key?: string; value?: string; ttl?: number } = {};
    const cache = {
      get: async (_key: string) => null,
      put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
        lastPut = { key, value, ttl: options?.expirationTtl };
      },
      delete: async (_key: string) => {},
      list: async (_opts: any) => ({ keys: [], cursor: '', list_complete: true }),
    };

    const body = JSON.stringify({ namespace: 'ns', key: 'k', value: 'v', ttlSeconds: 10 });
    const req = await buildSignedRequest({
      url: 'https://example.test/zin/kv/put',
      body,
      keyId: 'k1',
      secret: 'super-secret',
      signedRequest: SignedRequest,
    });

    const env = {
      MY_CACHE: cache,
      KV_NAMESPACE: 'MY_CACHE',
      KV_REMOTE_SECRET: 'super-secret',
      ZT_KV_PREFIX: 'pfx',
    };

    const res = await ZintrustKvProxy.fetch(req, env);
    expect(res.status).toBe(200);
    expect(lastPut.key).toBe('pfx:ns:k');
    expect(lastPut.value).toBe(JSON.stringify('v'));
    expect(lastPut.ttl).toBe(10);
  });
});
