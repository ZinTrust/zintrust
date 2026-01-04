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
  signedRequest: { sha256Hex: (b: Uint8Array) => Promise<string>; canonicalString: (p: any) => string };
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

describe('cloudflare proxy workers', () => {
  it('d1 proxy /zin/d1/query returns rows for a valid signed request', async () => {
    const { ZintrustD1Proxy } = (await import(
      '../../../packages/cloudflare-d1-proxy/src/index.js'
    )) as {
      ZintrustD1Proxy: { fetch: (req: Request, env: any) => Promise<Response> };
    };

    const { SignedRequest } = (await import(
      '../../../packages/cloudflare-d1-proxy/src/SignedRequest.js'
    )) as {
      SignedRequest: { sha256Hex: (b: Uint8Array) => Promise<string>; canonicalString: (p: any) => string };
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
      ZT_KEYS_JSON: JSON.stringify({ [keyId]: { secret } }),
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
    const { ZintrustKvProxy } = (await import(
      '../../../packages/cloudflare-kv-proxy/src/index.js'
    )) as {
      ZintrustKvProxy: { fetch: (req: Request, env: any) => Promise<Response> };
    };

    const { SignedRequest } = (await import(
      '../../../packages/cloudflare-kv-proxy/src/SignedRequest.js'
    )) as {
      SignedRequest: { sha256Hex: (b: Uint8Array) => Promise<string>; canonicalString: (p: any) => string };
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
      ZT_KEYS_JSON: JSON.stringify({ [keyId]: { secret } }),
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
});
