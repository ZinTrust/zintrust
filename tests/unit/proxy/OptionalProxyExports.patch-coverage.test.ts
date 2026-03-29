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

describe('Optional proxy exports (patch coverage)', () => {
  it('ZintrustD1Proxy rejects unsupported methods', async () => {
    const response = await ZintrustD1Proxy.fetch(
      new Request('https://example.test/zin/d1/query', { method: 'GET' }),
      {}
    );

    expect(response.status).toBe(405);
  });

  it('ZintrustD1Proxy returns config error when signing credentials are missing', async () => {
    const request = new Request('https://example.test/zin/d1/query', {
      method: 'POST',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
    });

    const response = await ZintrustD1Proxy.fetch(request, {});
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(401);
    expect(payload.code).toBe('CONFIG_ERROR');
  });

  it('ZintrustD1Proxy returns not found for unknown signed paths', async () => {
    const request = await buildSignedRequest({
      url: 'https://example.test/zin/d1/unknown',
      body: JSON.stringify({}),
      keyId: 'k1',
      secret: 'super-secret',
    });

    const response = await ZintrustD1Proxy.fetch(request, { D1_REMOTE_SECRET: 'super-secret' });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(404);
    expect(payload.code).toBe('NOT_FOUND');
  });

  it('ZintrustKvProxy rejects unsupported methods', async () => {
    const response = await ZintrustKvProxy.fetch(
      new Request('https://example.test/zin/kv/get', { method: 'GET' }),
      {}
    );

    expect(response.status).toBe(405);
  });

  it('ZintrustKvProxy returns config error when signing credentials are missing', async () => {
    const request = new Request('https://example.test/zin/kv/get', {
      method: 'POST',
      body: JSON.stringify({ key: 'demo' }),
    });

    const response = await ZintrustKvProxy.fetch(request, {});
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(500);
    expect(payload.code).toBe('CONFIG_ERROR');
  });

  it('ZintrustKvProxy returns not found for unknown signed paths', async () => {
    const request = await buildSignedRequest({
      url: 'https://example.test/zin/kv/unknown',
      body: JSON.stringify({}),
      keyId: 'k1',
      secret: 'super-secret',
    });

    const response = await ZintrustKvProxy.fetch(request, { KV_REMOTE_SECRET: 'super-secret' });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(404);
    expect(payload.code).toBe('NOT_FOUND');
  });
});
