import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Redis Config Coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('buildRedisUrl', () => {
    it('builds URL with all components', async () => {
      const { buildRedisUrl } = await import('@config/redis');

      const config = {
        driver: 'redis' as const,
        host: 'test-host',
        port: 6380,
        password: 'test-pass',
        channelPrefix: 'test:',
        database: 2,
      };

      const url = buildRedisUrl(config);
      expect(url).toBe('redis://:test-pass@test-host:6380/2');
    });

    it('builds URL without password', async () => {
      const { buildRedisUrl } = await import('@config/redis');

      const config = {
        driver: 'redis' as const,
        host: 'test-host',
        port: 6380,
        password: '',
        channelPrefix: 'test:',
        database: 2,
      };

      const url = buildRedisUrl(config);
      expect(url).toBe('redis://test-host:6380/2');
    });

    it('builds URL without database', async () => {
      const { buildRedisUrl } = await import('@config/redis');

      const config = {
        driver: 'redis' as const,
        host: 'test-host',
        port: 6380,
        password: 'test-pass',
        channelPrefix: 'test:',
        database: 0,
      };

      const url = buildRedisUrl(config);
      expect(url).toBe('redis://:test-pass@test-host:6380');
    });

    it('uses defaults when config is undefined', async () => {
      const { buildRedisUrl } = await import('@config/redis');

      const url = buildRedisUrl();
      expect(url).toBe('redis://localhost:6379/1');
    });
  });

  describe('getRedisUrl', () => {
    it('returns REDIS_URL from environment when available', async () => {
      // Mock process.env
      const originalEnv = process.env;
      process.env = { ...originalEnv, REDIS_URL: 'redis://from-env:6379/0' };

      const { getRedisUrl } = await import('@config/redis');
      const url = getRedisUrl();
      expect(url).toBe('redis://from-env:6379/0');

      // Restore process.env
      process.env = originalEnv;
    });

    it('falls back to buildRedisUrl when REDIS_URL is empty', async () => {
      const { getRedisUrl, buildRedisUrl } = await import('@config/redis');

      const config = {
        driver: 'redis' as const,
        host: 'fallback-host',
        port: 6380,
        password: '',
        channelPrefix: 'test:',
        database: 0,
      };

      const url = getRedisUrl(config);
      expect(url).toBe('redis://fallback-host:6380');
    });

    it('handles process.env fallback', async () => {
      // Mock process.env
      const originalEnv = process.env;
      process.env = { ...originalEnv, REDIS_URL: 'redis://process-env:6379/0' };

      const { getRedisUrl } = await import('@config/redis');
      const url = getRedisUrl();
      expect(url).toBe('redis://process-env:6379/0');

      // Restore process.env
      process.env = originalEnv;
    });
  });

  describe('ensureDriver', () => {
    it('returns publish client when type is publish', async () => {
      const fakeClient = {
        publish: vi.fn().mockResolvedValue(1),
      };

      vi.doMock('@zintrust/queue-redis', () => ({
        createRedisPublishClient: async () => fakeClient,
      }));

      const { ensureDriver } = await import('@config/redis');
      const client = await ensureDriver('publish');
      expect(client).toBe(fakeClient);
    });

    it('throws error when publish client is not available', async () => {
      vi.doMock('@zintrust/queue-redis', () => ({}));

      const { ensureDriver } = await import('@config/redis');
      await expect(ensureDriver('publish')).rejects.toThrow(
        'Redis publish client is not available in queue-redis package'
      );
    });

    it('returns existing queue driver when available', async () => {
      const fakeDriver = {
        enqueue: vi.fn(),
        dequeue: vi.fn(),
        ack: vi.fn(),
        length: vi.fn(),
        drain: vi.fn(),
      };

      vi.doMock('@tools/queue/Queue', () => ({
        Queue: {
          get: vi.fn().mockResolvedValue(fakeDriver as any),
        },
      }));

      const { ensureDriver } = await import('@config/redis');
      const driver = await ensureDriver('queue');
      expect(driver).toBe(fakeDriver);
    });

    it('registers and returns queue driver when not available', async () => {
      const fakeDriver = {
        enqueue: vi.fn(),
        dequeue: vi.fn(),
        ack: vi.fn(),
        length: vi.fn(),
        drain: vi.fn(),
      };

      vi.doMock('@tools/queue/Queue', () => ({
        Queue: {
          get: vi
            .fn()
            .mockRejectedValueOnce(new Error('Driver not found'))
            .mockResolvedValueOnce(fakeDriver as any),
          register: vi.fn(),
        },
      }));

      vi.doMock('@zintrust/queue-redis', () => ({
        RedisQueue: fakeDriver,
      }));

      const { ensureDriver } = await import('@config/redis');
      const driver = await ensureDriver('queue');
      expect(driver).toBe(fakeDriver);
    });

    it('throws error when queue driver registration fails', async () => {
      vi.doMock('@tools/queue/Queue', () => ({
        Queue: {
          get: vi.fn().mockRejectedValue(new Error('Driver not found')),
        },
      }));

      vi.doMock('@zintrust/queue-redis', () => {
        throw new Error('Package import failed');
      });

      const { ensureDriver } = await import('@config/redis');
      await expect(ensureDriver('queue')).rejects.toThrow(
        'Redis queue driver is not registered. Install queue:redis via zin plugin install.'
      );
    });

    it('defaults to queue driver when no type specified', async () => {
      const fakeDriver = {
        enqueue: vi.fn(),
        dequeue: vi.fn(),
        ack: vi.fn(),
        length: vi.fn(),
        drain: vi.fn(),
      };

      vi.doMock('@tools/queue/Queue', () => ({
        Queue: {
          get: vi.fn().mockResolvedValue(fakeDriver as any),
        },
      }));

      const { ensureDriver } = await import('@config/redis');
      const driver = await ensureDriver();
      expect(driver).toBe(fakeDriver);
    });
  });
});
