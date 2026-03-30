import { afterEach, describe, expect, it, vi } from 'vitest';

const createMockedCoreModule = async (publish: ReturnType<typeof vi.fn>) => {
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
};

const installCoreMock = (publish: ReturnType<typeof vi.fn>): void => {
  vi.doMock('@zintrust/core', () => createMockedCoreModule(publish));
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
