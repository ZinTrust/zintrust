/**
 * Unit Tests for LockProvider
 */

import type { LockProviderConfig } from '@/types/Queue';
import {
  clearLockProviders,
  createLockProvider,
  createMemoryLockProvider,
  createRedisLockProvider,
  getLockProvider,
  registerLockProvider,
} from '@tools/queue/LockProvider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Logger
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

// Mock Redis connection
vi.mock('@config/workers', () => ({
  createRedisConnection: () => ({
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    pttl: vi.fn().mockResolvedValue(300000),
    pexpire: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(true),
  }),
}));

// Mock queue config
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

describe('MemoryLockProvider', () => {
  let provider: ReturnType<typeof createMemoryLockProvider>;
  const config: LockProviderConfig = {
    type: 'memory',
    prefix: 'test:locks:',
    defaultTtl: 60000,
  };

  beforeEach(() => {
    provider = createMemoryLockProvider(config);
  });

  describe('Lock Acquisition', () => {
    it('should acquire a new lock', async () => {
      const lock = await provider.acquire('test-key', { ttl: 30000 });

      expect(lock.key).toBe('test:locks:test-key');
      expect(lock.ttl).toBe(30000);
      expect(lock.acquired).toBe(true);
      expect(lock.expires).toBeInstanceOf(Date);
    });

    it('should use default TTL when not specified', async () => {
      const lock = await provider.acquire('test-key', {}); // Empty options object

      expect(lock.ttl).toBe(60000); // defaultTtl from config
    });

    it('should reject duplicate lock acquisition', async () => {
      const lock1 = await provider.acquire('test-key', { ttl: 30000 });
      const lock2 = await provider.acquire('test-key', { ttl: 30000 });

      expect(lock1.acquired).toBe(true);
      expect(lock2.acquired).toBe(false);
    });

    it('should allow acquisition of expired locks', async () => {
      // Acquire first lock
      await provider.acquire('test-key', { ttl: 1 }); // 1ms TTL

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should be able to acquire again
      const lock2 = await provider.acquire('test-key', { ttl: 30000 });
      expect(lock2.acquired).toBe(true);
    });
  });

  describe('Lock Release', () => {
    it('should release an existing lock', async () => {
      const lock = await provider.acquire('test-key', {}); // Add empty options
      expect(lock.acquired).toBe(true);

      await provider.release(lock);

      // Should be able to acquire again
      const newLock = await provider.acquire('test-key', {}); // Add empty options
      expect(newLock.acquired).toBe(true);
    });

    it('should handle release of non-existent lock', async () => {
      const fakeLock = {
        key: 'test:locks:non-existent',
        ttl: 30000,
        acquired: true,
        expires: new Date(Date.now() + 30000),
      };

      // Should not throw
      await expect(provider.release(fakeLock)).resolves.toBeUndefined();
    });
  });

  describe('Lock Extension', () => {
    it('should extend an existing lock', async () => {
      const lock = await provider.acquire('test-key', { ttl: 30000 });
      const originalExpires = lock.expires;

      const extended = await provider.extend(lock, 60000);
      expect(extended).toBe(true);
      expect(lock.ttl).toBe(60000);
      expect(lock.expires.getTime()).toBeGreaterThan(originalExpires.getTime());
    });

    it('should fail to extend non-existent lock', async () => {
      const fakeLock = {
        key: 'test:locks:non-existent',
        ttl: 30000,
        acquired: true,
        expires: new Date(Date.now() + 30000),
      };

      const extended = await provider.extend(fakeLock, 60000);
      expect(extended).toBe(false);
    });
  });

  describe('Lock Status', () => {
    it('should return status for existing lock', async () => {
      await provider.acquire('test-key', { ttl: 30000 });

      const status = await provider.status('test-key');
      expect(status.exists).toBe(true);
      expect(status.ttl).toBe(30000);
      expect(status.expires).toBeInstanceOf(Date);
    });

    it('should return status for non-existent lock', async () => {
      const status = await provider.status('non-existent');
      expect(status.exists).toBe(false);
      expect(status.ttl).toBeUndefined();
      expect(status.expires).toBeUndefined();
    });

    it('should clean up expired locks on status check', async () => {
      await provider.acquire('test-key', { ttl: 1 }); // 1ms TTL

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = await provider.status('test-key');
      expect(status.exists).toBe(false);
    });
  });
});

describe('RedisLockProvider', () => {
  let provider: ReturnType<typeof createRedisLockProvider>;
  const config: LockProviderConfig = {
    type: 'redis',
    prefix: 'test:locks:',
    defaultTtl: 60000,
  };

  beforeEach(() => {
    provider = createRedisLockProvider(config);
  });

  describe('Mock Implementation', () => {
    it('should create lock with acquisition success', async () => {
      const lock = await provider.acquire('test-key', { ttl: 30000 });

      expect(lock.key).toBe('test:locks:test-key');
      expect(lock.ttl).toBe(30000);
      expect(lock.acquired).toBe(true);
      expect(lock.expires).toBeInstanceOf(Date);
    });

    it('should handle lock release without errors', async () => {
      const lock = {
        key: 'test:locks:test-key',
        ttl: 30000,
        acquired: true,
        expires: new Date(Date.now() + 30000),
      };

      await expect(provider.release(lock)).resolves.toBeUndefined();
    });

    it('should handle lock extension', async () => {
      const lock = {
        key: 'test:locks:test-key',
        ttl: 30000,
        acquired: true,
        expires: new Date(Date.now() + 30000),
      };

      const extended = await provider.extend(lock, 60000);
      expect(extended).toBe(true);
    });

    it('should return lock status', async () => {
      const status = await provider.status('test-key');
      expect(status.exists).toBe(true);
      expect(status.ttl).toBe(300000);
      expect(status.expires).toBeInstanceOf(Date);
    });
  });
});

describe('LockProvider Registry', () => {
  beforeEach(() => {
    // Clear registry
    clearLockProviders();
  });

  it('should register and retrieve lock providers', () => {
    const provider = createMemoryLockProvider({ type: 'memory' });

    registerLockProvider('test-provider', provider);
    const retrieved = getLockProvider('test-provider');

    expect(retrieved).toBe(provider);
  });

  it('should return undefined for non-existent provider', () => {
    const retrieved = getLockProvider('non-existent');
    expect(retrieved).toBeUndefined();
  });
});

describe('LockProvider Factory', () => {
  it('should create memory lock provider', () => {
    const config: LockProviderConfig = { type: 'memory' };
    const provider = createLockProvider(config);

    expect(provider).toBeDefined();
    expect(typeof provider.acquire).toBe('function');
    expect(typeof provider.release).toBe('function');
    expect(typeof provider.extend).toBe('function');
    expect(typeof provider.status).toBe('function');
  });

  it('should create redis lock provider', () => {
    const config: LockProviderConfig = { type: 'redis' };
    const provider = createLockProvider(config);

    expect(provider).toBeDefined();
    expect(typeof provider.acquire).toBe('function');
    expect(typeof provider.release).toBe('function');
    expect(typeof provider.extend).toBe('function');
    expect(typeof provider.status).toBe('function');
  });

  it('should throw error for unsupported provider type', () => {
    const config = { type: 'unsupported' as any };

    expect(() => createLockProvider(config)).toThrow('Unsupported lock provider type: unsupported');
  });
});
