import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

let mongoUri = 'https://example.com';
let mongoDb = 'db1';

const loggerWarn = vi.fn();
const loggerError = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    warn: loggerWarn,
    error: loggerError,
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    get MONGO_URI() {
      return mongoUri;
    },
    get MONGO_DB() {
      return mongoDb;
    },
  },
}));

function createFetchResponse(jsonValue: unknown): any {
  return {
    json: async () => jsonValue,
  } as unknown as any;
}

describe('MongoDriver', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mongoUri = 'https://example.com';
    mongoDb = 'db1';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('skips requests when MONGO_URI is empty', async () => {
    mongoUri = '';

    const fetchMock = vi.fn(async () => createFetchResponse({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { MongoDriver } = await import('@cache/drivers/MongoDriver');
    const driver = MongoDriver.create();

    await expect(driver.get('k')).resolves.toBeNull();
    await expect(driver.has('k')).resolves.toBe(false);
    await expect(driver.set('k', 'v')).resolves.toBeUndefined();

    expect(loggerWarn).toHaveBeenCalledWith(
      'MONGO_URI not configured. MongoDB Cache request ignored.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and returns a cached value when not expired', async () => {
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      expect(url).toBe('https://example.com/action/findOne');
      expect(init?.method).toBe('POST');
      return createFetchResponse({ document: { value: 'v', expires: null } });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { MongoDriver } = await import('@cache/drivers/MongoDriver');
    const driver = MongoDriver.create();

    await expect(driver.get<string>('k')).resolves.toBe('v');

    const init = (fetchMock as unknown as Mock).mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));

    expect(body).toMatchObject({
      dataSource: 'Cluster0',
      database: 'db1',
      collection: 'cache',
      filter: { _id: 'k' },
    });
  });

  it('deletes and returns null when value is expired', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/action/findOne')) {
        return createFetchResponse({ document: { value: 'v', expires: 999 } });
      }
      if (url.endsWith('/action/deleteOne')) {
        return createFetchResponse({ deletedCount: 1 });
      }
      return createFetchResponse({});
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { MongoDriver } = await import('@cache/drivers/MongoDriver');
    const driver = MongoDriver.create();

    await expect(driver.get<string>('k')).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/action/deleteOne',
      expect.any(Object)
    );

    nowSpy.mockRestore();
  });

  it('logs and returns null when fetch throws', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('boom');
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { MongoDriver } = await import('@cache/drivers/MongoDriver');
    const driver = MongoDriver.create();

    await expect(driver.has('k')).resolves.toBe(false);

    expect(loggerError).toHaveBeenCalledWith('MongoDB Cache Error: boom', undefined);
  });

  it('handles non-Error thrown values in request()', async () => {
    const fetchMock = vi.fn(async () => {
      throw 'boom'; // nosonar: Testing non-Error throw handling
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { MongoDriver } = await import('@cache/drivers/MongoDriver');
    const driver = MongoDriver.create();

    await expect(driver.get('k')).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalledWith('MongoDB Cache Error: boom', undefined);
  });

  it('sends correct actions for set/delete/clear and has()', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

    const fetchMock = vi.fn(async () => createFetchResponse({ ok: 1 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { MongoDriver } = await import('@cache/drivers/MongoDriver');
    const driver = MongoDriver.create();

    await driver.set('k', { a: 1 });
    await driver.set('k2', { b: 2 }, 2);
    await driver.delete('k');
    await driver.clear();
    await driver.has('k');

    const urls = ((fetchMock as unknown as Mock).mock.calls as unknown as Array<[string]>).map(
      (call) => call[0]
    );
    expect(urls).toEqual([
      'https://example.com/action/updateOne',
      'https://example.com/action/updateOne',
      'https://example.com/action/deleteOne',
      'https://example.com/action/deleteMany',
      'https://example.com/action/findOne',
    ]);

    const update1 = JSON.parse(
      String(((fetchMock as unknown as Mock).mock.calls[0]?.[1] as RequestInit | undefined)?.body)
    );
    expect(update1.update.$set.expires).toBeNull();

    const update2 = JSON.parse(
      String(((fetchMock as unknown as Mock).mock.calls[1]?.[1] as RequestInit | undefined)?.body)
    );
    expect(update2.update.$set.expires).toBe(3000);

    nowSpy.mockRestore();
  });

  it('has() returns false for undefined/null documents and true when present', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/action/findOne')) {
        return createFetchResponse({});
      }
      return createFetchResponse({ ok: 1 });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { MongoDriver } = await import('@cache/drivers/MongoDriver');
    const driver = MongoDriver.create();

    await expect(driver.has('missing')).resolves.toBe(false);

    (fetchMock as unknown as Mock).mockImplementationOnce(async () =>
      createFetchResponse({ document: null })
    );
    await expect(driver.has('nullDoc')).resolves.toBe(false);

    (fetchMock as unknown as Mock).mockImplementationOnce(async () =>
      createFetchResponse({ document: { ok: true } })
    );
    await expect(driver.has('present')).resolves.toBe(true);
  });
});
