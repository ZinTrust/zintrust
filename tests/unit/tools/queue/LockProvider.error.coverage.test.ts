/**
 * Simple LockProvider error handling coverage test
 */

import { clearLockProviders } from '@tools/queue/LockProvider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules
vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getInstance: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock Redis connection to throw errors during operations
let mockRedisClient: any;

vi.mock('@config/workers', () => ({
  createRedisConnection: () => mockRedisClient,
}));

vi.mock('@config/queue', () => ({
  createBaseDrivers: () => ({
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined,
      database: 0,
    },
  }),
}));

describe('LockProvider Error Coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearLockProviders();

    // Reset mock client
    mockRedisClient = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      pttl: vi.fn().mockResolvedValue(300000),
      pexpire: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockResolvedValue(['0', []]),
      incr: vi.fn().mockResolvedValue(1),
    };
  });

  it('should handle Redis acquisition errors', async () => {
    const { createRedisLockProvider } = await import('@tools/queue/LockProvider');

    mockRedisClient.set.mockRejectedValue(new Error('Redis set failed'));

    const provider = createRedisLockProvider({
      type: 'redis',
      prefix: 'test:locks:',
      defaultTtl: 60000,
    });

    await expect(provider.acquire('test-key', { ttl: 30000 })).rejects.toThrow('Redis set failed');
  });

  it('should handle Redis release errors', async () => {
    const { createRedisLockProvider } = await import('@tools/queue/LockProvider');
    const { Logger } = await import('@config/logger');

    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.del.mockRejectedValue(new Error('Redis del failed'));

    const provider = createRedisLockProvider({
      type: 'redis',
      prefix: 'test:locks:',
      defaultTtl: 60000,
    });

    const lock = { key: 'test:locks:test-key', ttl: 30000, acquired: true, expires: new Date() };
    await expect(provider.release(lock)).rejects.toThrow('Redis del failed');
    expect(Logger.error).toHaveBeenCalledWith('Failed to release lock', {
      key: lock.key,
      error: expect.any(Error),
    });
  });

  it('should handle Redis extension errors', async () => {
    const { createRedisLockProvider } = await import('@tools/queue/LockProvider');
    const { Logger } = await import('@config/logger');

    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.pexpire.mockRejectedValue(new Error('Redis pexpire failed'));

    const provider = createRedisLockProvider({
      type: 'redis',
      prefix: 'test:locks:',
      defaultTtl: 60000,
    });

    const lock = { key: 'test:locks:test-key', ttl: 30000, acquired: true, expires: new Date() };
    const result = await provider.extend(lock, 60000);
    expect(result).toBe(false);
    expect(Logger.error).toHaveBeenCalledWith('Failed to extend lock', {
      key: lock.key,
      error: expect.any(Error),
    });
  });

  it('should handle Redis status check errors', async () => {
    const { createRedisLockProvider } = await import('@tools/queue/LockProvider');
    const { Logger } = await import('@config/logger');

    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.pttl.mockRejectedValue(new Error('Redis pttl failed'));

    const provider = createRedisLockProvider({
      type: 'redis',
      prefix: 'test:locks:',
      defaultTtl: 60000,
    });

    const result = await provider.status('test-key');
    expect(result.exists).toBe(false);
    expect(Logger.error).toHaveBeenCalledWith('Failed to check lock status', {
      key: 'test:locks:test-key',
      error: expect.any(Error),
    });
  });

  it('should handle Redis list errors', async () => {
    const { createRedisLockProvider } = await import('@tools/queue/LockProvider');
    const { Logger } = await import('@config/logger');

    mockRedisClient.scan.mockRejectedValue(new Error('Redis scan failed'));

    const provider = createRedisLockProvider({
      type: 'redis',
      prefix: 'test:locks:',
      defaultTtl: 60000,
    });

    const result = await provider.list('job-*');
    expect(result).toEqual([]);
    expect(Logger.error).toHaveBeenCalledWith('Failed to list locks', {
      pattern: 'job-*',
      error: expect.any(Error),
    });
  });

  it('should handle memory lock provider', async () => {
    const { createMemoryLockProvider } = await import('@tools/queue/LockProvider');

    const provider = createMemoryLockProvider({
      type: 'memory',
      prefix: 'test:locks:',
      defaultTtl: 60000,
    });

    // Test that we can create a memory lock provider
    expect(provider).toBeDefined();
  });
});
