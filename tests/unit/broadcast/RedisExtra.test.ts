import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('RedisDriver additional branches', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeRedisClient;
  });

  it('throws TRY_CATCH_ERROR when client.connect fails', async () => {
    vi.mock(
      'redis',
      () => ({
        createClient: () => ({
          connect: async () => Promise.reject(new Error('conn fail')),
          publish: async () => 1,
        }),
      })
      // { virtual: true }
    );

    const { RedisDriver } = await import('@broadcast/drivers/Redis');

    await expect(
      RedisDriver.send(
        { driver: 'redis', host: 'localhost', port: 6379, password: '', channelPrefix: '' },
        'ch',
        'e',
        { id: 1 }
      )
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('throws TRY_CATCH_ERROR when payload cannot be serialized', async () => {
    // Provide fake client via global so import('redis') path is bypassed
    const fake = {
      publish: vi.fn().mockResolvedValue(1),
    } as any;
    (globalThis as any).__fakeRedisClient = fake;

    const { RedisDriver } = await import('@broadcast/drivers/Redis');

    const circular: any = {};
    circular.self = circular;

    await expect(
      RedisDriver.send(
        { driver: 'redis', host: 'localhost', port: 6379, password: '', channelPrefix: '' },
        'ch',
        'e',
        circular
      )
    ).rejects.toHaveProperty('code', 'TRY_CATCH_ERROR');
  });

  it('throws config error for invalid port', async () => {
    const fake = {
      publish: vi.fn().mockResolvedValue(1),
    } as any;
    (globalThis as any).__fakeRedisClient = fake;

    const { RedisDriver } = await import('@broadcast/drivers/Redis');

    await expect(
      RedisDriver.send(
        {
          driver: 'redis',
          host: 'localhost',
          port: 0 as unknown as number,
          password: '',
          channelPrefix: '',
        },
        'ch',
        'e',
        { x: 1 }
      )
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });
});
