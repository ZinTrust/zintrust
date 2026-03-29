import { ZintrustD1Proxy } from '@proxy/d1/ZintrustD1Proxy';
import { ZintrustKvProxy } from '@proxy/kv/ZintrustKvProxy';
import { SignedRequest } from '@security/SignedRequest';
import { describe, expect, it } from 'vitest';

const APP_KEY = 'super-secret';
const APP_NAME = 'k1';

const toHex = (bytes: ArrayBuffer): string => {
  const view = new Uint8Array(bytes);
  let out = '';
  for (const byte of view) out += byte.toString(16).padStart(2, '0');
  return out;
};

const buildSignedRequest = async (params: {
  url: string;
  body: string;
  keyId?: string;
  secret?: string;
  nonce?: string;
  timestampMs?: number;
}): Promise<Request> => {
  const bodyBytes = new TextEncoder().encode(params.body);
  const bodySha256 = await SignedRequest.sha256Hex(bodyBytes);
  const timestampMs = params.timestampMs ?? Date.now();
  const nonce = params.nonce ?? 'n1';
  const canonical = SignedRequest.canonicalString({
    method: 'POST',
    url: params.url,
    timestampMs,
    nonce,
    bodySha256Hex: bodySha256,
  });

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(params.secret ?? APP_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));

  return new Request(params.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zt-key-id': params.keyId ?? APP_NAME,
      'x-zt-timestamp': String(timestampMs),
      'x-zt-nonce': nonce,
      'x-zt-body-sha256': bodySha256,
      'x-zt-signature': toHex(signature),
    },
    body: params.body,
  });
};

const createDb = (input?: {
  allResult?: Array<Record<string, unknown>>;
  firstResult?: Record<string, unknown> | null;
  runMeta?: Record<string, unknown>;
  throwOn?: 'all' | 'first' | 'run';
}) => ({
  prepare: (_sql: string) => {
    const statement = {
      bind: (..._values: unknown[]) => statement,
      all: async () => {
        if (input?.throwOn === 'all') throw new Error('all failed');
        return { results: input?.allResult ?? [{ ok: true }] };
      },
      first: async () => {
        if (input?.throwOn === 'first') throw new Error('first failed');
        return input?.firstResult ?? { ok: true };
      },
      run: async () => {
        if (input?.throwOn === 'run') throw new Error('run failed');
        return { meta: input?.runMeta ?? { ok: true } };
      },
    };

    return statement;
  },
});

describe('core cloudflare proxy source coverage', () => {
  it('covers D1 query, queryOne, exec, custom binding, limits, and statement flows', async () => {
    const db = createDb({ firstResult: { id: 1 }, runMeta: { changes: 1 } });
    const bindingEnv = { CUSTOM_DB: db, D1_BINDING: 'CUSTOM_DB', APP_KEY };

    const queryResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/query',
        body: JSON.stringify({ sql: 'select 1', params: [] }),
      }),
      bindingEnv
    );
    expect(queryResponse.status).toBe(200);
    expect((await queryResponse.json()) as { rowCount: number }).toEqual(
      expect.objectContaining({ rowCount: 1 })
    );

    const queryOneResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/queryOne',
        body: JSON.stringify({ sql: 'select 1', params: [] }),
      }),
      bindingEnv
    );
    expect(queryOneResponse.status).toBe(200);
    expect((await queryOneResponse.json()) as { row: { id: number } }).toEqual(
      expect.objectContaining({ row: { id: 1 } })
    );

    const execResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/exec',
        body: JSON.stringify({ sql: 'update users set ok=1', params: [] }),
      }),
      bindingEnv
    );
    expect(execResponse.status).toBe(200);
    expect((await execResponse.json()) as { ok: boolean }).toEqual(
      expect.objectContaining({ ok: true })
    );

    const statementEnv = {
      DB: db,
      APP_KEY,
      ZT_D1_STATEMENTS_JSON: JSON.stringify({ getUsers: 'select 1', deleteUser: 'delete from x' }),
    };

    const statementResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/statement',
        body: JSON.stringify({ statementId: 'getUsers', params: [] }),
      }),
      statementEnv
    );
    expect(statementResponse.status).toBe(200);

    const mutatingStatementResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/statement',
        body: JSON.stringify({ statementId: 'deleteUser', params: [] }),
      }),
      statementEnv
    );
    expect(mutatingStatementResponse.status).toBe(200);

    const largeSqlResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/queryOne',
        body: JSON.stringify({ sql: 'select too long', params: [] }),
      }),
      { DB: db, APP_KEY, ZT_MAX_SQL_BYTES: '8' }
    );
    expect(largeSqlResponse.status).toBe(413);

    const tooManyParamsResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/exec',
        body: JSON.stringify({ sql: 'update 1', params: [1, 2] }),
      }),
      { DB: db, APP_KEY, ZT_MAX_PARAMS: '1' }
    );
    expect(tooManyParamsResponse.status).toBe(400);
  });

  it('covers D1 body size, nonce replay, config, validation, and exception paths', async () => {
    const db = createDb({ throwOn: 'all' });
    const noncesSeen = new Set<string>();
    const nonces = {
      get: async (key: string) => (noncesSeen.has(key) ? '1' : null),
      put: async (key: string) => {
        noncesSeen.add(key);
      },
    };

    const bodyTooLargeResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/query',
        body: JSON.stringify({ sql: 'select 1', params: [], pad: 'x'.repeat(200) }),
      }),
      { DB: createDb(), APP_KEY, ZT_MAX_BODY_BYTES: '50' }
    );
    expect(bodyTooLargeResponse.status).toBe(413);

    const replayRequestOne = await buildSignedRequest({
      url: 'https://example.test/zin/d1/query',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
      nonce: 'same',
    });
    const replayRequestTwo = await buildSignedRequest({
      url: 'https://example.test/zin/d1/query',
      body: JSON.stringify({ sql: 'select 1', params: [] }),
      nonce: 'same',
    });

    expect(
      (
        await ZintrustD1Proxy.fetch(replayRequestOne, {
          DB: createDb(),
          APP_KEY,
          ZT_NONCES: nonces,
        })
      ).status
    ).toBe(200);
    expect(
      (
        await ZintrustD1Proxy.fetch(replayRequestTwo, {
          DB: createDb(),
          APP_KEY,
          ZT_NONCES: nonces,
        })
      ).status
    ).toBeGreaterThanOrEqual(400);

    expect(
      (
        await ZintrustD1Proxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/d1/query',
            body: JSON.stringify({ sql: 'select 1', params: [] }),
          }),
          { APP_KEY }
        )
      ).status
    ).toBe(400);

    expect(
      (
        await ZintrustD1Proxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/d1/query',
            body: JSON.stringify({ params: [] }),
          }),
          { DB: createDb(), APP_KEY }
        )
      ).status
    ).toBe(400);

    expect(
      (
        await ZintrustD1Proxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/d1/statement',
            body: JSON.stringify({ statementId: 'missing', params: [] }),
          }),
          { DB: createDb(), APP_KEY, ZT_D1_STATEMENTS_JSON: JSON.stringify({ good: 'select 1' }) }
        )
      ).status
    ).toBe(404);

    expect(
      (
        await ZintrustD1Proxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/d1/statement',
            body: JSON.stringify({ statementId: 'anything', params: [] }),
          }),
          { DB: createDb(), APP_KEY, ZT_D1_STATEMENTS_JSON: '[]' }
        )
      ).status
    ).toBe(400);

    const exceptionResponse = await ZintrustD1Proxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/d1/query',
        body: JSON.stringify({ sql: 'select 1', params: [] }),
      }),
      { DB: db, APP_KEY, ZT_PROXY_DEBUG: 'true' }
    );
    expect(exceptionResponse.status).toBe(500);
  });

  it('covers KV get/put/delete/list, custom binding, prefixes, and list limit logic', async () => {
    let lastPut: { key?: string; value?: string; ttl?: number } = {};
    let lastDeleteKey = '';
    let lastList: { prefix?: string; limit?: number; cursor?: string } = {};
    const cache = {
      get: async (key: string, type?: 'json' | 'arrayBuffer') => {
        if (type === 'json') return { key };
        if (type === 'arrayBuffer') return new TextEncoder().encode(key).buffer;
        return `value:${key}`;
      },
      put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
        lastPut = { key, value, ttl: options?.expirationTtl };
      },
      delete: async (key: string) => {
        lastDeleteKey = key;
      },
      list: async (options: { prefix?: string; limit?: number; cursor?: string }) => {
        lastList = options;
        return { keys: [{ name: 'pfx:ns:alpha' }], cursor: 'c1', list_complete: false };
      },
    };

    const env = {
      MY_CACHE: cache,
      KV_NAMESPACE: 'MY_CACHE',
      APP_KEY,
      ZT_KV_PREFIX: 'pfx',
      ZT_KV_LIST_LIMIT: '2',
    };

    const getResponse = await ZintrustKvProxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/kv/get',
        body: JSON.stringify({ namespace: 'ns', key: 'a', type: 'json' }),
      }),
      env
    );
    expect(getResponse.status).toBe(200);

    const arrayBufferResponse = await ZintrustKvProxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/kv/get',
        body: JSON.stringify({ namespace: 'ns', key: 'a', type: 'arrayBuffer' }),
      }),
      env
    );
    expect(arrayBufferResponse.status).toBe(200);

    const putResponse = await ZintrustKvProxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/kv/put',
        body: JSON.stringify({ namespace: 'ns', key: 'a', value: { x: 1 }, ttlSeconds: 12 }),
      }),
      env
    );
    expect(putResponse.status).toBe(200);
    expect(lastPut).toEqual({ key: 'pfx:ns:a', value: JSON.stringify({ x: 1 }), ttl: 12 });

    const deleteResponse = await ZintrustKvProxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/kv/delete',
        body: JSON.stringify({ namespace: 'ns', key: 'a' }),
      }),
      env
    );
    expect(deleteResponse.status).toBe(200);
    expect(lastDeleteKey).toBe('pfx:ns:a');

    const listResponse = await ZintrustKvProxy.fetch(
      await buildSignedRequest({
        url: 'https://example.test/zin/kv/list',
        body: JSON.stringify({ namespace: 'ns', prefix: 'a', limit: 20, cursor: 'c0' }),
      }),
      env
    );
    expect(listResponse.status).toBe(200);
    expect(lastList).toEqual({ prefix: 'pfx:ns:a', limit: 2, cursor: 'c0' });
  });

  it('covers KV validation, config, payload size, and auth edge cases', async () => {
    const cache = {
      get: async (_key: string) => null,
      put: async (_key: string, _value: string) => {},
      delete: async (_key: string) => {},
      list: async () => ({ keys: [], cursor: '', list_complete: true }),
    };

    expect(
      (
        await ZintrustKvProxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/kv/get',
            body: JSON.stringify({ type: 'json' }),
          }),
          { CACHE: cache, APP_KEY }
        )
      ).status
    ).toBe(400);

    expect(
      (
        await ZintrustKvProxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/kv/put',
            body: JSON.stringify({ key: '', value: 'x' }),
          }),
          { CACHE: cache, APP_KEY }
        )
      ).status
    ).toBe(400);

    expect(
      (
        await ZintrustKvProxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/kv/delete',
            body: JSON.stringify({}),
          }),
          { CACHE: cache, APP_KEY }
        )
      ).status
    ).toBe(400);

    expect(
      (
        await ZintrustKvProxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/kv/list',
            body: JSON.stringify([]),
          }),
          { CACHE: cache, APP_KEY }
        )
      ).status
    ).toBe(400);

    expect(
      (
        await ZintrustKvProxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/kv/get',
            body: JSON.stringify({ key: 'a', pad: 'x'.repeat(200) }),
          }),
          { CACHE: cache, APP_KEY, ZT_MAX_BODY_BYTES: '50' }
        )
      ).status
    ).toBe(413);

    expect(
      (
        await ZintrustKvProxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/kv/get',
            body: JSON.stringify({ key: 'a' }),
          }),
          { APP_KEY }
        )
      ).status
    ).toBe(500);

    expect(
      (
        await ZintrustKvProxy.fetch(
          await buildSignedRequest({
            url: 'https://example.test/zin/kv/get',
            body: JSON.stringify({ key: 'a' }),
            timestampMs: Date.now() - 10_000,
          }),
          { CACHE: cache, APP_KEY, ZT_PROXY_SIGNING_WINDOW_MS: '1000' }
        )
      ).status
    ).toBeGreaterThanOrEqual(400);
  });
});
