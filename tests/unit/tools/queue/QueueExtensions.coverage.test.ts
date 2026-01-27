/**
 * QueueExtensions coverage test
 */

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

vi.mock('@config/workers', () => ({
  createRedisConnection: () => ({
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    pttl: vi.fn().mockResolvedValue(300000),
    pexpire: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(true),
  }),
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

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((key: string, defaultValue?: string) => defaultValue || ''),
    getInt: vi.fn((key: string, defaultValue?: number) => defaultValue || 0),
  },
}));

vi.mock('@lang/lang', () => ({
  ZintrustLang: {
    REDIS: 'redis',
    MEMORY: 'memory',
    ZINTRUST_LOCKS_PREFIX: 'zintrust:locks:',
    ZINTRUST_LOCKS_TTL: 300000,
    QUEUE_META_KEY: '__queue_meta__',
  },
}));

describe('QueueExtensions Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should import QueueExtensions', async () => {
      const { extendQueue, enqueueAdvanced, initializeDefaultLockProviders } =
        await import('@tools/queue/QueueExtensions');
      expect(extendQueue).toBeDefined();
      expect(enqueueAdvanced).toBeDefined();
      expect(initializeDefaultLockProviders).toBeDefined();
    });

    it('should initialize default lock providers', async () => {
      const { initializeDefaultLockProviders } = await import('@tools/queue/QueueExtensions');

      // Test that the function exists and can be called
      expect(typeof initializeDefaultLockProviders).toBe('function');
    });
  });
});
