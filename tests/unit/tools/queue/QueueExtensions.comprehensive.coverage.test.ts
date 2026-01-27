/**
 * Comprehensive QueueExtensions coverage tests
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
    get: vi.fn((_key: string, defaultValue?: string) => defaultValue || ''),
    getInt: vi.fn((_key: string, defaultValue?: number) => defaultValue || 0),
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

vi.mock('@queue/AdvancedQueue', () => ({
  createAdvancedQueue: vi.fn(),
  AdvancedQueue: class MockAdvancedQueue {
    enqueue = vi.fn();
    releaseLock = vi.fn();
    extendLock = vi.fn();
  },
}));

vi.mock('@queue/DeduplicationBuilder', () => ({
  createDeduplicationBuilder: vi.fn(() => ({
    id: vi.fn().mockReturnThis(),
    expireAfter: vi.fn().mockReturnThis(),
    build: vi.fn(() => ({ id: 'test', ttl: 300000 })),
  })),
}));

vi.mock('@queue/Queue', () => ({
  Queue: {
    enqueue: vi.fn(),
  },
}));

vi.mock('@exceptions/ZintrustError', () => ({
  createValidationError: vi.fn((message: string) => new Error(message)),
}));

vi.mock('@/tools/queue/LockProvider', () => ({
  createLockProvider: vi.fn(),
  registerLockProvider: vi.fn(),
  getLockProvider: vi.fn(),
  clearLockProviders: vi.fn(),
}));

describe('QueueExtensions Comprehensive Coverage', () => {
  beforeEach(() => {
    // Reset module registry so internal module state (like advancedQueueRef)
    // does not leak between tests, and clear mocks.
    vi.resetModules();
    vi.clearAllMocks();
  });

  // Extract mock implementations to reduce nesting
  const createThrowingAdvancedQueueMock = (error: Error) => () => {
    throw error;
  };

  describe('extendQueue function', () => {
    it('should extend queue successfully', async () => {
      const { createAdvancedQueue } = await import('@queue/AdvancedQueue');
      const { extendQueue } = await import('@tools/queue/QueueExtensions');
      const { Logger } = await import('@config/logger');

      const mockAdvancedQueue = {
        enqueue: vi.fn(),
        releaseLock: vi.fn(),
        extendLock: vi.fn(),
        deduplicate: vi.fn(),
      };
      vi.mocked(createAdvancedQueue).mockReturnValue(mockAdvancedQueue);

      const config = { name: 'test-queue', driver: 'memory' };

      extendQueue(config);

      expect(createAdvancedQueue).toHaveBeenCalledWith(config);
      expect(Logger.info).toHaveBeenCalledWith('Queue extended with advanced capabilities', {
        queueName: 'test-queue',
      });
    });

    it('should handle extension errors', async () => {
      const { createAdvancedQueue } = await import('@queue/AdvancedQueue');
      const { extendQueue } = await import('@tools/queue/QueueExtensions');
      const { Logger } = await import('@config/logger');

      const error = new Error('Extension failed');
      vi.mocked(createAdvancedQueue).mockImplementation(createThrowingAdvancedQueueMock(error));

      const config = { name: 'test-queue', driver: 'memory' };

      expect(() => extendQueue(config)).toThrow('Extension failed');
      expect(Logger.error).toHaveBeenCalledWith(
        'Failed to extend queue with advanced capabilities',
        { error }
      );
    });
  });

  describe('enqueueAdvanced function', () => {
    it('should fallback to standard enqueue when advanced queue not initialized', async () => {
      const { Queue } = await import('@queue/Queue');
      const { enqueueAdvanced } = await import('@tools/queue/QueueExtensions');
      const { Logger } = await import('@config/logger');

      vi.mocked(Queue.enqueue).mockResolvedValue('job-id');

      const result = await enqueueAdvanced('test-job', { data: 'test' });

      expect(Logger.warn).toHaveBeenCalledWith(
        'Advanced queue not initialized, falling back to standard enqueue'
      );
      expect(Queue.enqueue).toHaveBeenCalledWith('test-job', { data: 'test' });
      expect(result).toBe('job-id');
    });

    it('should use advanced queue when initialized', async () => {
      const { createAdvancedQueue } = await import('@queue/AdvancedQueue');
      const { extendQueue, enqueueAdvanced } = await import('@tools/queue/QueueExtensions');

      const mockAdvancedQueue = {
        enqueue: vi.fn().mockResolvedValue('advanced-job-id'),
        releaseLock: vi.fn(),
        extendLock: vi.fn(),
        deduplicate: vi.fn(),
      };
      vi.mocked(createAdvancedQueue).mockReturnValue(mockAdvancedQueue);

      extendQueue({ name: 'test-queue' });

      const result = await enqueueAdvanced('test-job', { data: 'test' });

      expect(mockAdvancedQueue.enqueue).toHaveBeenCalledWith('test-job', { data: 'test' }, {});
      expect(result).toBe('advanced-job-id');
    });
  });

  describe('initializeDefaultLockProviders function', () => {
    it('should register memory and Redis lock providers', async () => {
      const { createLockProvider, registerLockProvider } =
        await import('@/tools/queue/LockProvider');
      const { initializeDefaultLockProviders } = await import('@tools/queue/QueueExtensions');
      const { Logger } = await import('@config/logger');

      const mockMemoryProvider = {
        acquire: vi.fn(),
        release: vi.fn(),
        extend: vi.fn(),
        status: vi.fn(),
        list: vi.fn(),
      };
      const mockRedisProvider = {
        acquire: vi.fn(),
        release: vi.fn(),
        extend: vi.fn(),
        status: vi.fn(),
        list: vi.fn(),
      };

      vi.mocked(createLockProvider)
        .mockReturnValueOnce(mockMemoryProvider)
        .mockReturnValueOnce(mockRedisProvider);

      initializeDefaultLockProviders();

      expect(registerLockProvider).toHaveBeenCalledWith('memory', mockMemoryProvider);
      expect(registerLockProvider).toHaveBeenCalledWith('redis', mockRedisProvider);
      expect(Logger.info).toHaveBeenCalledWith('Redis lock provider registered');
    });

    it('should handle Redis provider registration failure', async () => {
      const { createLockProvider, registerLockProvider } =
        await import('@/tools/queue/LockProvider');
      const { initializeDefaultLockProviders } = await import('@tools/queue/QueueExtensions');
      const { Logger } = await import('@config/logger');

      const mockMemoryProvider = {
        acquire: vi.fn(),
        release: vi.fn(),
        extend: vi.fn(),
        status: vi.fn(),
        list: vi.fn(),
      };
      const redisError = new Error('Redis connection failed');

      vi.mocked(createLockProvider)
        .mockReturnValueOnce(mockMemoryProvider)
        .mockImplementationOnce(() => {
          throw redisError;
        });

      initializeDefaultLockProviders();

      expect(registerLockProvider).toHaveBeenCalledWith('memory', mockMemoryProvider);
      expect(Logger.warn).toHaveBeenCalledWith(
        'Redis lock provider registration failed, using memory provider',
        { error: redisError }
      );
    });
  });

  describe('QueueLocks utilities', () => {
    it('should release lock when advanced queue is initialized', async () => {
      const { createAdvancedQueue } = await import('@queue/AdvancedQueue');
      const { extendQueue, QueueLocks } = await import('@tools/queue/QueueExtensions');

      const mockAdvancedQueue = {
        enqueue: vi.fn(),
        releaseLock: vi.fn().mockResolvedValue(undefined),
        extendLock: vi.fn(),
        deduplicate: vi.fn(),
      };
      vi.mocked(createAdvancedQueue).mockReturnValue(mockAdvancedQueue);

      extendQueue({ name: 'test-queue' });

      await QueueLocks.release('test-lock-key');

      expect(mockAdvancedQueue.releaseLock).toHaveBeenCalledWith('test-lock-key');
    });

    it('should throw error when releasing lock without advanced queue', async () => {
      const { QueueLocks } = await import('@tools/queue/QueueExtensions');

      await expect(QueueLocks.release('test-lock-key')).rejects.toThrow(
        'Advanced queue not initialized. Call extendQueue() first.'
      );
    });

    it('should extend lock when advanced queue is initialized', async () => {
      const { createAdvancedQueue } = await import('@queue/AdvancedQueue');
      const { extendQueue, QueueLocks } = await import('@tools/queue/QueueExtensions');

      const mockAdvancedQueue = {
        enqueue: vi.fn(),
        releaseLock: vi.fn(),
        extendLock: vi.fn().mockResolvedValue(true),
        deduplicate: vi.fn(),
      };
      vi.mocked(createAdvancedQueue).mockReturnValue(mockAdvancedQueue);

      extendQueue({ name: 'test-queue' });

      const result = await QueueLocks.extend('test-lock-key', 60000);

      expect(mockAdvancedQueue.extendLock).toHaveBeenCalledWith('test-lock-key', 60000);
      expect(result).toBe(true);
    });

    it('should throw error when extending lock without advanced queue', async () => {
      const { QueueLocks } = await import('@tools/queue/QueueExtensions');

      await expect(QueueLocks.extend('test-lock-key', 60000)).rejects.toThrow(
        'Advanced queue not initialized. Call extendQueue() first.'
      );
    });

    it('should check lock status using memory provider', async () => {
      const { getLockProvider } = await import('@/tools/queue/LockProvider');
      const { QueueLocks } = await import('@tools/queue/QueueExtensions');

      const mockProvider = {
        acquire: vi.fn(),
        release: vi.fn(),
        extend: vi.fn(),
        status: vi.fn().mockResolvedValue({ exists: true, ttl: 30000, expires: new Date() }),
        list: vi.fn(),
      };
      vi.mocked(getLockProvider).mockReturnValue(mockProvider);

      const result = await QueueLocks.status('test-lock-key');

      expect(getLockProvider).toHaveBeenCalledWith('memory');
      expect(mockProvider.status).toHaveBeenCalledWith('test-lock-key');
      expect(result).toBe(true);
    });

    it('should return false when no lock provider is available', async () => {
      const { getLockProvider } = await import('@/tools/queue/LockProvider');
      const { QueueLocks } = await import('@tools/queue/QueueExtensions');

      vi.mocked(getLockProvider).mockReturnValue(undefined);

      const result = await QueueLocks.status('test-lock-key');

      expect(result).toBe(false);
    });
  });

  describe('MigrationHelpers', () => {
    it('should convert existing options to advanced options', async () => {
      const { MigrationHelpers } = await import('@tools/queue/QueueExtensions');

      const existingOptions = { priority: 'high', delay: 1000 };
      const result = MigrationHelpers.toAdvancedOptions(existingOptions, 'unique-123');

      expect(result).toEqual({
        priority: 'high',
        delay: 1000,
        uniqueId: 'unique-123',
      });
    });

    it('should not add uniqueId when null or undefined', async () => {
      const { MigrationHelpers } = await import('@tools/queue/QueueExtensions');

      const existingOptions = { priority: 'high' };

      const result1 = MigrationHelpers.toAdvancedOptions(existingOptions);
      expect(result1).toEqual({ priority: 'high' });

      const result2 = MigrationHelpers.toAdvancedOptions(existingOptions);
      expect(result2).toEqual({ priority: 'high' });

      const result3 = MigrationHelpers.toAdvancedOptions(existingOptions, '');
      expect(result3).toEqual({ priority: 'high' });
    });

    it('should add deduplication to existing options', async () => {
      const { createDeduplicationBuilder } = await import('@queue/DeduplicationBuilder');
      const { MigrationHelpers } = await import('@tools/queue/QueueExtensions');

      const mockBuilder = {
        id: vi.fn().mockReturnThis(),
        expireAfter: vi.fn().mockReturnThis(),
        dontRelease: vi.fn().mockReturnThis(),
        replace: vi.fn().mockReturnThis(),
        releaseAfter: vi.fn().mockReturnThis(),
        build: vi.fn(() => ({ id: 'dedup-123', ttl: 60000 })),
      };
      vi.mocked(createDeduplicationBuilder).mockReturnValue(mockBuilder);

      const existingOptions = { priority: 'high' };
      const result = MigrationHelpers.withDeduplication(existingOptions, 'dedup-123', 60000);

      expect(mockBuilder.id).toHaveBeenCalledWith('dedup-123');
      expect(mockBuilder.expireAfter).toHaveBeenCalledWith(60000);
      expect(result).toEqual({
        priority: 'high',
        deduplication: { id: 'dedup-123', ttl: 60000 },
      });
    });

    it('should use default TTL when not provided', async () => {
      const { createDeduplicationBuilder } = await import('@queue/DeduplicationBuilder');
      const { MigrationHelpers } = await import('@tools/queue/QueueExtensions');
      const { ZintrustLang } = await import('@lang/lang');

      const mockBuilder = {
        id: vi.fn().mockReturnThis(),
        expireAfter: vi.fn().mockReturnThis(),
        dontRelease: vi.fn().mockReturnThis(),
        replace: vi.fn().mockReturnThis(),
        releaseAfter: vi.fn().mockReturnThis(),
        build: vi.fn(() => ({ id: 'dedup-123', ttl: ZintrustLang.ZINTRUST_LOCKS_TTL })),
      };
      vi.mocked(createDeduplicationBuilder).mockReturnValue(mockBuilder);

      const existingOptions = { priority: 'high' };
      MigrationHelpers.withDeduplication(existingOptions, 'dedup-123');

      expect(mockBuilder.expireAfter).toHaveBeenCalledWith(ZintrustLang.ZINTRUST_LOCKS_TTL);
    });
  });

  describe('getDeduplicationBuilder', () => {
    it('should return deduplication builder instance', async () => {
      const { createDeduplicationBuilder } = await import('@queue/DeduplicationBuilder');
      const { getDeduplicationBuilder } = await import('@tools/queue/QueueExtensions');

      const mockBuilder = {
        id: vi.fn(),
        expireAfter: vi.fn(),
        dontRelease: vi.fn(),
        replace: vi.fn(),
        releaseAfter: vi.fn(),
        build: vi.fn(),
      };
      vi.mocked(createDeduplicationBuilder).mockReturnValue(mockBuilder);

      const result = getDeduplicationBuilder();

      expect(createDeduplicationBuilder).toHaveBeenCalled();
      expect(result).toBe(mockBuilder);
    });
  });
});
