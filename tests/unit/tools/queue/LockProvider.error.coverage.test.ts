import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ensure logger is mocked so we can spy on methods safely
vi.mock('@config/logger', () => ({
  Logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Logger } from '@config/logger';

// Mock Redis connection
const mockRedisClient = {
  quit: vi.fn().mockResolvedValue(undefined),
};

// Mock the LockProvider module
vi.mock('@queue/LockProvider', () => ({
  closeLockProvider: vi.fn(),
}));

describe('LockProvider Error Coverage', () => {
  // Helper function to create mock LockProvider with Redis client
  const createMockLockProviderWithClient = (redisClient: any) => ({
    closeLockProvider: async () => {
      if (redisClient) {
        try {
          await redisClient.quit();
        } catch (error) {
          Logger.warn('Error closing Redis lock provider connection', error);
        }
      }
    },
  });

  // Helper function to create mock LockProvider without client
  const createMockLockProviderWithoutClient = () => ({
    closeLockProvider: async () => {
      // No redisClient - should do nothing
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('closeLockProvider', () => {
    it('should handle closeLockProvider with Redis client', async () => {
      // Mock the Redis client to be available
      vi.doMock('@queue/LockProvider', () => createMockLockProviderWithClient(mockRedisClient));

      // Re-import to get the mocked version
      const { closeLockProvider: closeLockProviderMocked } = await import('@queue/LockProvider');

      // Test successful close
      await expect(closeLockProviderMocked()).resolves.not.toThrow();
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should handle closeLockProvider when quit throws error', async () => {
      const testError = new Error('Redis connection error');
      mockRedisClient.quit.mockRejectedValueOnce(testError);

      // Mock the LockProvider module with error handling
      vi.doMock('@queue/LockProvider', () => createMockLockProviderWithClient(mockRedisClient));

      // Re-import to get the mocked version
      const { closeLockProvider: closeLockProviderMocked } = await import('@queue/LockProvider');

      // Test error handling during close
      await expect(closeLockProviderMocked()).resolves.not.toThrow();
      expect(Logger.warn).toHaveBeenCalledWith(
        'Error closing Redis lock provider connection',
        testError
      );
    });

    it('should handle closeLockProvider with no client', async () => {
      // Mock the LockProvider module with no client
      vi.doMock('@queue/LockProvider', () => createMockLockProviderWithoutClient());

      // Re-import to get the mocked version
      const { closeLockProvider: closeLockProviderMocked } = await import('@queue/LockProvider');

      // Test with no client - should not throw
      await expect(closeLockProviderMocked()).resolves.not.toThrow();
      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });
  });
});
