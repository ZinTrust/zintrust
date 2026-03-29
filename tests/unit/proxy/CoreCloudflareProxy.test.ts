import { ZintrustD1Proxy } from '@proxy/d1/ZintrustD1Proxy';
import { ZintrustKvProxy } from '@proxy/kv/ZintrustKvProxy';
import { SignedRequest } from '@security/SignedRequest';
import { describe, expect, it } from 'vitest';

const toHex = (bytes: ArrayBuffer): string => {
  const view = new Uint8Array(bytes);
  let out = '';
  for (const byte of view) out += byte.toString(16).padStart(2, '0');
  return out;
};

const buildSignedRequest = async (params: {
  url: string;
  body: string;
  keyId: string;
  secret: string;
}): Promise<Request> => {
  const bodyBytes = new TextEncoder().encode(params.body);
  const bodySha256 = await SignedRequest.sha256Hex(bodyBytes);
  const timestampMs = Date.now();
  const canonical = SignedRequest.canonicalString({
    method: 'POST',
    url: params.url,
    timestampMs,
    nonce: 'n1',
    bodySha256Hex: bodySha256,
  });

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(params.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));

  return new Request(params.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zt-key-id': params.keyId,
      'x-zt-timestamp': String(timestampMs),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': bodySha256,
      'x-zt-signature': toHex(signature),
    },
    body: params.body,
  });
};

describe('core cloudflare proxy exports', () => {
  it('returns a Response from ZintrustD1Proxy.fetch', async () => {
    const db = {
      prepare: (_sql: string) => {
        const statement = {
          bind: (..._values: unknown[]) => statement,
          all: async () => ({ results: [{ ok: true }] }),
          first: async () => ({ ok: true }),
          run: async () => ({ meta: { ok: true } }),
        };
        return statement;
      },
    };

    const request = await buildSignedRequest({
      url: 'https://example.test/zin/d1/query',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
      keyId: 'k1',
      secret: 'super-secret',
    });

    const response = await ZintrustD1Proxy.fetch(request, {
      DB: db,
      D1_REMOTE_SECRET: 'super-secret',
    });

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
  });

  it('returns a Response from ZintrustKvProxy.fetch', async () => {
    const cache = {
      get: async (_key: string, _type?: 'json' | 'arrayBuffer') => 'stored-value',
      put: async (_key: string, _value: string) => {},
      delete: async (_key: string) => {},
      list: async () => ({ keys: [], cursor: '', list_complete: true }),
    };

    const request = await buildSignedRequest({
      url: 'https://example.test/zin/kv/get',
      body: JSON.stringify({ key: 'demo' }),
      keyId: 'k1',
      secret: 'super-secret',
    });

    const response = await ZintrustKvProxy.fetch(request, {
      CACHE: cache,
      KV_REMOTE_SECRET: 'super-secret',
    });

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
  });
});
