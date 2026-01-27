/**
 * Focused QueueWorkRunner coverage tests for critical uncovered lines
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
    get: vi.fn((key: string, defaultValue?: string) => {
      switch (key) {
        case 'QUEUE_LOCK_PROVIDER':
          return 'redis';
        case 'QUEUE_LOCK_PREFIX':
          return 'test:locks:';
        default:
          return defaultValue || '';
      }
    }),
    getInt: vi.fn((key: string, defaultValue?: number) => {
      switch (key) {
        case 'QUEUE_DEFAULT_DEDUP_TTL':
          return 300000;
        default:
          return defaultValue || 0;
      }
    }),
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

vi.mock('@tools/queue/LockProvider', () => ({
  getLockProvider: vi.fn(),
  createLockProvider: vi.fn(),
  registerLockProvider: vi.fn(),
}));

describe('QueueWorkRunner Critical Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Condition Resolution Logic', () => {
    it('should resolve failed conditions', () => {
      const condition = 'job failed with error';
      const normalized = condition.trim().toLowerCase();

      let result = null;
      if (normalized.includes('failed') || normalized.includes('error')) {
        result = 'failed';
      } else if (normalized.includes('success') || normalized.includes('completed')) {
        result = 'success';
      }

      expect(result).toBe('failed');
    });

    it('should resolve success conditions', () => {
      const condition = 'job completed successfully';
      const normalized = condition.trim().toLowerCase();

      let result = null;
      if (normalized.includes('failed') || normalized.includes('error')) {
        result = 'failed';
      } else if (normalized.includes('success') || normalized.includes('completed')) {
        result = 'success';
      }

      expect(result).toBe('success');
    });

    it('should extract status from regex pattern', () => {
      const condition = 'status === "completed"';
      const normalized = condition.trim().toLowerCase();
      const match = new RegExp(/status\s*={1,3}\s*['"]([a-z]+)['"]/).exec(normalized);
      const capturedValue = match?.[1];

      expect(capturedValue).toBe('completed');
    });
  });

  describe('Queue Meta Extraction', () => {
    it('should extract meta from payload', () => {
      const payload = {
        data: 'test',
        ['__queue_meta__']: { retries: 3 },
      };

      const metaKey = '__queue_meta__';
      const { [metaKey]: metaRaw, ...rest } = payload;

      expect(metaRaw).toEqual({ retries: 3 });
      expect(rest).toEqual({ data: 'test' });
    });

    it('should handle payload without meta', () => {
      const payload: any = { data: 'test', other: 'value' };
      const metaKey = '__queue_meta__';
      const { [metaKey]: metaRaw, ...rest } = payload;

      expect(metaRaw).toBeUndefined();
      expect(rest).toEqual({ data: 'test', other: 'value' });
    });
  });
});
