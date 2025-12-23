import { Env } from '@/config/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Env Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Env.get', () => {
    it('should return environment variable value', () => {
      process.env['TEST_VAR'] = 'value';
      expect(Env.get('TEST_VAR')).toBe('value');
    });

    it('should return default value if not set', () => {
      expect(Env.get('NON_EXISTENT', 'default')).toBe('default');
    });

    it('should return empty string if not set and no default', () => {
      expect(Env.get('NON_EXISTENT')).toBe('');
    });
  });

  describe('Env.getInt', () => {
    it('should return parsed integer', () => {
      process.env['TEST_INT'] = '123';
      expect(Env.getInt('TEST_INT')).toBe(123);
    });

    it('should return default value if not set', () => {
      expect(Env.getInt('NON_EXISTENT', 456)).toBe(456);
    });

    it('should return 0 if not set and no default', () => {
      expect(Env.getInt('NON_EXISTENT')).toBe(0);
    });

    it('should handle invalid numbers', () => {
      process.env['TEST_INT'] = 'invalid';
      expect(Env.getInt('TEST_INT')).toBe(Number.NaN);
    });
  });

  describe('Env.getBool', () => {
    it('should return true for "true"', () => {
      process.env['TEST_BOOL'] = 'true';
      expect(Env.getBool('TEST_BOOL')).toBe(true);
    });

    it('should return true for "1"', () => {
      process.env['TEST_BOOL'] = '1';
      expect(Env.getBool('TEST_BOOL')).toBe(true);
    });

    it('should return false for "false"', () => {
      process.env['TEST_BOOL'] = 'false';
      expect(Env.getBool('TEST_BOOL')).toBe(false);
    });

    it('should return false for "0"', () => {
      process.env['TEST_BOOL'] = '0';
      expect(Env.getBool('TEST_BOOL')).toBe(false);
    });

    it('should return default value if not set', () => {
      expect(Env.getBool('NON_EXISTENT', true)).toBe(true);
    });

    it('should return false if not set and no default', () => {
      expect(Env.getBool('NON_EXISTENT')).toBe(false);
    });
  });

  describe('Env object', () => {
    it('should export helper functions', () => {
      expect(Env.get).toBeDefined();
      expect(Env.getInt).toBeDefined();
      expect(Env.getBool).toBeDefined();
    });

    it('should export common variables', () => {
      // These values depend on the process.env at module load time.
      // Since we can't easily reload the module with different env vars in this test setup without dynamic import,
      // we just check they exist.
      expect(Env.NODE_ENV).toBeDefined();
      expect(Env.PORT).toBeDefined();
    });

    it('should be frozen and prevent modifications', () => {
      const originalValue = Env.PORT;
      // Object.freeze prevents modifications - this should not throw in non-strict mode
      // but the value should remain unchanged
      try {
        // @ts-expect-error - Testing that Object.freeze prevents assignment
        Env.PORT = 9999;
      } catch {
        // In strict mode, this would throw TypeError
      }
      expect(Env.PORT).toBe(originalValue);
    });
  });
});
