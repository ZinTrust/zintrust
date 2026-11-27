import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  store: {
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
  getWorkersEnv: vi.fn(),
  cacheStore: vi.fn(),
  redisCreate: vi.fn(),
  mailRender: vi.fn(),
  mailSend: vi.fn(),
  resolveProcessorSpec: vi.fn(),
}));

vi.mock('@cache/Cache', () => ({
  Cache: { ...mocks.store, store: mocks.cacheStore },
}));
vi.mock('@config/cloudflare', () => ({
  Cloudflare: { getWorkersEnv: mocks.getWorkersEnv },
}));
vi.mock('@zintrust/cache-redis', () => ({
  RedisProxyAdapter: { create: mocks.redisCreate },
}));
vi.mock('@tools/mail', () => ({
  Mail: { render: mocks.mailRender, send: mocks.mailSend },
}));
vi.mock('@zintrust/workers', () => ({
  WorkerFactory: { resolveProcessorSpec: mocks.resolveProcessorSpec },
}));

import {
  testCacheClear,
  testCacheDelete,
  testCacheGet,
  testCacheHas,
  testCacheSet,
  testCacheSmoke,
  testMailSend,
  testRedisProxy,
  testWorkerProcessorUrl,
} from '@routes/DirectTestRoutes';

const makeReq = (query: Record<string, unknown> = {}): any => ({
  getQueryParam: vi.fn((key: string) => query[key]),
});

const makeRes = (): any => {
  const res: any = { statusCode: 200 };
  res.json = vi.fn(() => res);
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  return res;
};

const body = (res: any): any => res.json.mock.calls[0]?.[0];

describe('DirectTestRoutes branch coverage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getWorkersEnv.mockReturnValue(null);
    mocks.cacheStore.mockReturnValue(mocks.store);
    mocks.store.get.mockResolvedValue({ ok: true });
    mocks.store.set.mockResolvedValue(undefined);
    mocks.store.has.mockResolvedValue(false);
    mocks.store.delete.mockResolvedValue(undefined);
    mocks.store.clear.mockResolvedValue(undefined);
    mocks.redisCreate.mockReturnValue(mocks.store);
    mocks.mailRender.mockResolvedValue('<p>hi</p>');
    mocks.mailSend.mockResolvedValue({ id: 'sent' });
    mocks.resolveProcessorSpec.mockResolvedValue({ ok: true });
    for (const key of [
      'MAIL_HOST',
      'MAIL_USERNAME',
      'MAIL_PASSWORD',
      'MAIL_DRIVER',
      'MAIL_CONNECTION',
    ]) {
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cache smoke: node runtime, default store, no query params', async () => {
    const res = makeRes();
    await testCacheSmoke(makeReq(), res);
    expect(body(res).success).toBe(true);
    expect(body(res).runtime).toBe('Node');
    expect(body(res).store).toBe('default');
    expect(mocks.store.set).toHaveBeenCalled();
  });

  it('cache smoke: workers runtime, named store, array key and valid ttl', async () => {
    mocks.getWorkersEnv.mockReturnValue({});
    const res = makeRes();
    await testCacheSmoke(
      makeReq({ store: ' secondary ', key: [' k1 ', 'k2'], ttl: ['45'] }),
      res
    );
    expect(body(res).runtime).toBe('Cloudflare Workers');
    expect(body(res).store).toBe('secondary');
    expect(body(res).key).toBe('k1');
    expect(body(res).ttlSeconds).toBe(45);
    expect(mocks.cacheStore).toHaveBeenCalledWith('secondary');
  });

  it('cache smoke: invalid ttl falls back to 30', async () => {
    const res = makeRes();
    await testCacheSmoke(makeReq({ ttl: 'not-a-number' }), res);
    expect(body(res).ttlSeconds).toBe(30);
  });

  it('cache smoke: store failure returns 500', async () => {
    mocks.store.set.mockRejectedValueOnce(new Error('boom'));
    const res = makeRes();
    await testCacheSmoke(makeReq(), res);
    expect(res.statusCode).toBe(500);
    expect(body(res).error).toBe('Cache smoke test failed');
  });

  it.each([
    ['value undefined', {}, true],
    ['json object', { value: '{"a":1}' }, { a: 1 }],
    ['json array', { value: '[1,2]' }, [1, 2]],
    ['invalid json', { value: '{bad' }, '{bad'],
    ['plain text', { value: ' hello ' }, 'hello'],
  ])('cache set: %s', async (_label, query, expectedObject) => {
    const res = makeRes();
    await testCacheSet(makeReq(query as Record<string, unknown>), res);
    expect(body(res).success).toBe(true);
    const value = mocks.store.set.mock.calls[0]?.[1];
    if (expectedObject === true) {
      expect(value).toMatchObject({ ok: true });
    } else {
      expect(value).toEqual(expectedObject);
    }
  });

  it('cache set: ttl null when absent, and failure path', async () => {
    const res = makeRes();
    await testCacheSet(makeReq(), res);
    expect(body(res).ttlSeconds).toBeNull();

    mocks.store.set.mockRejectedValueOnce(new Error('nope'));
    const failed = makeRes();
    await testCacheSet(makeReq(), failed);
    expect(failed.statusCode).toBe(500);
    expect(body(failed).error).toBe('Cache set failed');
  });

  it.each([testCacheGet, testCacheHas, testCacheDelete])(
    'cache key handler: missing key and failure paths',
    async (handler) => {
      const missing = makeRes();
      await handler(makeReq({ key: '   ' }), missing);
      expect(missing.statusCode).toBe(400);
      expect(body(missing).error).toBe('Missing key');

      mocks.store.get.mockRejectedValueOnce(new Error('read fail'));
      mocks.store.has.mockRejectedValueOnce(new Error('has fail'));
      mocks.store.delete.mockRejectedValueOnce(new Error('delete fail'));
      const failed = makeRes();
      await handler(makeReq({ key: [' valid ', 'ignored'] }), failed);
      expect(failed.statusCode).toBe(500);
      expect(body(failed).success).toBe(false);
    }
  );

  it('cache get/has/delete: happy paths with trimmed keys', async () => {
    const getRes = makeRes();
    await testCacheGet(makeReq({ key: ' abc ' }), getRes);
    expect(body(getRes).key).toBe('abc');
    expect(body(getRes).value).toEqual({ ok: true });

    const hasRes = makeRes();
    await testCacheHas(makeReq({ key: [' xyz '] }), hasRes);
    expect(body(hasRes).key).toBe('xyz');
    expect(body(hasRes).exists).toBe(false);

    const delRes = makeRes();
    await testCacheDelete(makeReq({ key: ' gone ' }), delRes);
    expect(body(delRes).existsAfterDelete).toBe(false);
  });

  it('cache clear: success and error', async () => {
    const res = makeRes();
    await testCacheClear(makeReq(), res);
    expect(body(res).success).toBe(true);

    mocks.store.clear.mockRejectedValueOnce(new Error('clear fail'));
    const failed = makeRes();
    await testCacheClear(makeReq({ store: 'named' }), failed);
    expect(failed.statusCode).toBe(500);
    expect(body(failed).store).toBe('named');
  });

  it('redis proxy: success and error', async () => {
    const res = makeRes();
    await testRedisProxy(makeReq(), res);
    expect(body(res).success).toBe(true);
    expect(body(res).runtime).toBe('Node');

    mocks.store.set.mockRejectedValueOnce(new Error('redis fail'));
    const failed = makeRes();
    await testRedisProxy(makeReq(), failed);
    expect(failed.statusCode).toBe(500);
    expect(body(failed).error).toBe('Redis proxy test failed');
  });

  it('worker processor url: resolver missing, null result, throw, success', async () => {
    const missing = makeRes();
    mocks.resolveProcessorSpec.mockReturnValueOnce(undefined);
    await testWorkerProcessorUrl(makeReq(), missing);
    expect(missing.statusCode).toBe(500);

    const unresolved = makeRes();
    mocks.resolveProcessorSpec.mockResolvedValueOnce(undefined);
    await testWorkerProcessorUrl(makeReq(), unresolved);
    expect(body(unresolved).error).toBe('Processor spec resolution failed');

    const thrown = makeRes();
    mocks.resolveProcessorSpec.mockRejectedValueOnce(new Error('resolve fail'));
    await testWorkerProcessorUrl(makeReq(), thrown);
    expect(thrown.statusCode).toBe(500);

    const ok = makeRes();
    await testWorkerProcessorUrl(makeReq(), ok);
    expect(body(ok).success).toBe(true);
  });

  it('mail send: rejects incomplete smtp configuration', async () => {
    const res = makeRes();
    await testMailSend(makeReq(), res);
    expect(res.statusCode).toBe(400);
    expect(body(res).error).toBe('Mail configuration incomplete');
    expect(body(res).config.host).toBe('missing');
  });

  it('mail send: uses MAIL_CONNECTION fallback and custom recipient', async () => {
    process.env['MAIL_CONNECTION'] = 'log';
    const res = makeRes();
    await testMailSend(makeReq({ to: 'someone@example.com' }), res);
    expect(body(res).success).toBe(true);
    expect(body(res).to).toBe('someone@example.com');
    expect(body(res).config.driver).toBe('log');
  });

  it.each([
    ['SMTP proxy forbidden', 'proxy-auth'],
    ['ConnectionError: ECONNREFUSED', 'connection'],
    ['ETIMEDOUT', 'connection'],
    ['535 authentication failed', 'authentication'],
    ['530 auth', 'authentication'],
    ['Configuration missing', 'configuration'],
    ['something else', 'unknown'],
  ])('mail send: classifies %s as %s', async (message, errorType) => {
    process.env['MAIL_DRIVER'] = 'log';
    mocks.mailSend.mockRejectedValueOnce(new Error(message));
    const res = makeRes();
    await testMailSend(makeReq(), res);
    expect(res.statusCode).toBe(500);
    expect(body(res).errorType).toBe(errorType);
  });

  it('mail send: uses error details object when available', async () => {
    process.env['MAIL_DRIVER'] = 'log';
    mocks.mailSend.mockRejectedValueOnce({ details: 'raw detail' });
    const res = makeRes();
    await testMailSend(makeReq(), res);
    expect(body(res).details).toBe('raw detail');
  });

  it('mail send: workers runtime when cloudflare env present', async () => {
    mocks.getWorkersEnv.mockReturnValue({});
    process.env['MAIL_DRIVER'] = 'log';
    const res = makeRes();
    await testMailSend(makeReq(), res);
    expect(body(res).runtime).toBe('Cloudflare Workers');
  });
});
