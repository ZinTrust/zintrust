import { afterEach, describe, expect, it, vi } from 'vitest';

describe('RedisPublishClient', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('routes publish calls through shared redis transport in proxy mode', async () => {
    const publish = vi.fn(async () => 1);

    vi.doMock('@zintrust/core', async () => {
      const actual = await vi.importActual<typeof import('@zintrust/core')>('@zintrust/core');
      return {
        ...actual,
        Env: {
          ...actual.Env,
          REDIS_PROXY_URL: 'http://127.0.0.1:8791/redis',
          USE_REDIS_PROXY: true,
        },
        createRedisConnection: vi.fn(() => ({
          connect: async () => undefined,
          publish,
        })),
      };
    });

    const { createRedisPublishClient } =
      await import('../../../../packages/queue-redis/src/RedisPublishClient');
    const client = await createRedisPublishClient();

    await expect(client.publish('events', '{"ok":true}')).resolves.toBe(1);
    expect(publish).toHaveBeenCalledWith('events', '{"ok":true}');
  });
});
