import { RedisDriver } from '@broadcast/drivers/Redis';
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
    const fake = makeFakeRedisClient();
    (globalThis as any).__fakeRedisClient = fake;

    vi.mock('redis', () => ({
      createClient: () => fake,
    }));
  });

  it('publishes JSON payload to prefixed channel', async () => {
    const fake = (globalThis as any).__fakeRedisClient;

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
    expect(fake._published[0].channel).toBe('broadcast:orders');

    const payload = JSON.parse(fake._published[0].message);
    expect(payload).toEqual({ event: 'created', data: { id: 123 } });
  });

  it('throws config error for missing host', async () => {
    await expect(
      RedisDriver.send(
        {
          driver: 'redis',
          host: '',
          port: 6379,
          password: '',
          channelPrefix: 'broadcast:',
        },
        'orders',
        'created',
        { id: 1 }
      )
    ).rejects.toThrow('requires host');
  });
});
