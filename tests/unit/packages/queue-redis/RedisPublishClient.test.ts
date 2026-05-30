import { afterEach, describe, expect, it, vi } from 'vitest';

const installCoreMock = (publish: ReturnType<typeof vi.fn>): void => {
  vi.doMock('@zintrust/core/config', () => ({
    Env: {
      REDIS_PROXY_URL: 'http://127.0.0.1:8791/redis',
      USE_REDIS_PROXY: true,
      get: (key: string, fallback?: string) => fallback ?? '',
      getInt: (key: string, fallback?: number) => fallback ?? 0,
    },
  }));
  vi.doMock('@zintrust/core/redis', () => ({
    createRedisConnection: vi.fn(() => ({
      connect: async () => undefined,
      publish,
    })),
  }));
};

describe('RedisPublishClient', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('routes publish calls through shared redis transport in proxy mode', async () => {
    const publish = vi.fn(async () => 1);

    installCoreMock(publish);

    const { createRedisPublishClient } =
      await import('../../../../packages/queue-redis/src/RedisPublishClient');
    const client = await createRedisPublishClient();

    await expect(client.publish('events', '{"ok":true}')).resolves.toBe(1);
    expect(publish).toHaveBeenCalledWith('events', '{"ok":true}');
  });
});
