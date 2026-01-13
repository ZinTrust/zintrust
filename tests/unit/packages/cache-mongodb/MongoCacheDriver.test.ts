import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarn } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

vi.mock('@zintrust/core', () => {
  return {
    Logger: {
      warn: loggerWarn,
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  };
});

describe('MongoCacheDriver (package)', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    loggerWarn.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  // Restore once at the end of the file run.
  // (Vitest runs tests in a single process here.)
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns null and warns when uri is missing', async () => {
    const { MongoCacheDriver } = await import('../../../../packages/cache-mongodb/src/index');

    const driver = MongoCacheDriver.create({
      driver: 'mongodb',
      uri: '',
      db: 'testdb',
      ttl: 60,
    });

    await expect(driver.get('k')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith('MongoDB cache driver missing uri. Request ignored.');
  });

  it('calls fetch with correct action and payload on set()', async () => {
    const { MongoCacheDriver } = await import('../../../../packages/cache-mongodb/src/index');

    fetchMock.mockResolvedValue({
      json: async () => ({ ok: 1 }),
    });

    const driver = MongoCacheDriver.create({
      driver: 'mongodb',
      uri: 'https://mongo-proxy.example.com',
      db: 'mydb',
      ttl: 60,
    });

    await driver.set('hello', { a: 1 }, 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toContain('/action/updateOne');
    expect(init.method).toBe('POST');

    const body = JSON.parse(String(init.body));
    expect(body.database).toBe('mydb');
    expect(body.collection).toBe('cache');
    expect(body.filter).toEqual({ _id: 'hello' });
    expect(body.update?.$set?.value).toEqual({ a: 1 });
    expect(body.upsert).toBe(true);
  });

  it('deletes expired documents when reading via get()', async () => {
    const { MongoCacheDriver } = await import('../../../../packages/cache-mongodb/src/index');

    const expired = Date.now() - 1000;
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ document: { value: 'v', expires: expired } }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ ok: 1 }),
      });

    const driver = MongoCacheDriver.create({
      driver: 'mongodb',
      uri: 'https://mongo-proxy.example.com',
      db: 'mydb',
      ttl: 60,
    });

    await expect(driver.get('k')).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/action/findOne');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/action/deleteOne');
  });

  it('has() returns true when a document exists', async () => {
    const { MongoCacheDriver } = await import('../../../../packages/cache-mongodb/src/index');

    fetchMock.mockResolvedValue({
      json: async () => ({ document: { _id: 'k' } }),
    });

    const driver = MongoCacheDriver.create({
      driver: 'mongodb',
      uri: 'https://mongo-proxy.example.com',
      db: 'mydb',
      ttl: 60,
    });

    await expect(driver.has('k')).resolves.toBe(true);
  });
});
