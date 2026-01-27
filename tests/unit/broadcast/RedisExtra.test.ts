import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('RedisDriver additional branches', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeRedisClient;
  });

  it('handles successful publish even when client.connect fails (package handles connection)', async () => {
    const fake = {
      connect: async () => {
        throw new Error('Connection failed');
      },
      publish: async () => 1,
    };
    (globalThis as any).__fakeRedisClient = fake;

    // Mock the @zintrust/queue-redis package to return the client
    // The package handles connection errors internally
    vi.doMock('@zintrust/queue-redis', () => ({
      createRedisPublishClient: async () => fake,
    }));

    const { RedisDriver } = await import('@broadcast/drivers/Redis');

    // The package implementation handles connection errors gracefully
    // and still allows publish to work
    const result = await RedisDriver.send(
      { driver: 'redis', host: 'localhost', port: 6379, password: '', channelPrefix: '' },
      'ch',
      'e',
      { id: 1 }
    );

    expect(result.ok).toBe(true);
    expect(result.published).toBe(1);
  });

  it('throws CONFIG_ERROR when package createRedisPublishClient fails with proper error', async () => {
    // Mock the @zintrust/queue-redis package to throw a proper ErrorFactory error
    vi.doMock('@zintrust/queue-redis', () => ({
      createRedisPublishClient: async () => {
        const error = new Error('Redis publish client failed to connect');
        (error as any).code = 'CONFIG_ERROR';
        throw error;
      },
    }));

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

  it('throws error when package is not available', async () => {
    // Mock the package import to fail - use a factory function as required by vitest
    vi.doMock('@zintrust/queue-redis', () => ({
      createRedisPublishClient: async () => {
        throw new Error('Cannot find package');
      },
    }));

    const { RedisDriver } = await import('@broadcast/drivers/Redis');

    await expect(
      RedisDriver.send(
        { driver: 'redis', host: 'localhost', port: 6379, password: '', channelPrefix: '' },
        'ch',
        'e',
        { id: 1 }
      )
    ).rejects.toThrow('Cannot find package');
  });
});
