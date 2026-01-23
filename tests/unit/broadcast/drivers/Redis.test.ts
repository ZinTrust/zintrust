import { beforeEach, describe, expect, it, vi } from 'vitest';

const makeFakeRedisClient = () => {
  const published: Array<{ channel: string; message: string }> = [];
  return {
    connect: async () => undefined,
    publish: async (channel: string, message: string) => {
      published.push({ channel, message });
      return 1;
    },
    _published: published,
  };
};

describe('RedisDriver (Broadcast)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeRedisClient;
  });

  it('publishes JSON payload to prefixed channel', async () => {
    const fake = makeFakeRedisClient();
    (globalThis as any).__fakeRedisClient = fake;

    // Mock the @zintrust/queue-redis package to return the fake client
    vi.doMock('@zintrust/queue-redis', () => ({
      createRedisPublishClient: async () => fake,
    }));

    const { RedisDriver } = await import('@broadcast/drivers/Redis');

    const res = await RedisDriver.send(
      {
        driver: 'redis',
        host: 'localhost',
        port: 6379,
        password: '',
        channelPrefix: 'broadcast:',
      },
      'orders',
      'created',
      { id: 123 }
    );

    expect(res.ok).toBe(true);
    expect(res.published).toBe(1);
    expect(fake._published.length).toBe(1);
    expect(fake._published[0].channel).toBe('zintrust_zintrust_test_broadcast:broadcast:orders');

    const payload = JSON.parse(fake._published[0].message);
    expect(payload).toEqual({ event: 'created', data: { id: 123 } });
  });

  it('throws TRY_CATCH_ERROR when payload cannot be serialized', async () => {
    const fake = makeFakeRedisClient();
    (globalThis as any).__fakeRedisClient = fake;

    // Mock the @zintrust/queue-redis package to return the fake client
    vi.doMock('@zintrust/queue-redis', () => ({
      createRedisPublishClient: async () => fake,
    }));

    const { RedisDriver } = await import('@broadcast/drivers/Redis');

    const circular: any = {};
    circular.self = circular;

    await expect(
      RedisDriver.send(
        {
          driver: 'redis',
          host: 'localhost',
          port: 6379,
          password: '',
          channelPrefix: 'broadcast:',
        },
        'orders',
        'created',
        circular
      )
    ).rejects.toHaveProperty('code', 'TRY_CATCH_ERROR');
  });

  it('throws error when package is not available', async () => {
    // Mock the package to throw an error
    vi.doMock('@zintrust/queue-redis', () => ({
      createRedisPublishClient: async () => {
        throw new Error('Package not available');
      },
    }));

    const { RedisDriver } = await import('@broadcast/drivers/Redis');

    await expect(
      RedisDriver.send(
        {
          driver: 'redis',
          host: 'localhost',
          port: 6379,
          password: '',
          channelPrefix: 'broadcast:',
        },
        'orders',
        'created',
        { id: 1 }
      )
    ).rejects.toThrow('Package not available');
  });
});
