import { Env, get, getBool, getInt } from '@/config/env';
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

  describe('get', () => {
    it('should return environment variable value', () => {
      process.env['TEST_VAR'] = 'value';
      expect(get('TEST_VAR')).toBe('value');
    });

    it('should return default value if not set', () => {
      expect(get('NON_EXISTENT', 'default')).toBe('default');
    });

    it('should return empty string if not set and no default', () => {
      expect(get('NON_EXISTENT')).toBe('');
    });
  });

  describe('getInt', () => {
    it('should return parsed integer', () => {
      process.env['TEST_INT'] = '123';
      expect(getInt('TEST_INT')).toBe(123);
    });

    it('should return default value if not set', () => {
      expect(getInt('NON_EXISTENT', 456)).toBe(456);
    });

    it('should return 0 if not set and no default', () => {
      expect(getInt('NON_EXISTENT')).toBe(0);
    });

    it('should handle invalid numbers', () => {
      process.env['TEST_INT'] = 'invalid';
      expect(getInt('TEST_INT')).toBe(NaN);
    });
  });

  describe('getBool', () => {
    it('should return true for "true"', () => {
      process.env['TEST_BOOL'] = 'true';
      expect(getBool('TEST_BOOL')).toBe(true);
    });

    it('should return true for "1"', () => {
      process.env['TEST_BOOL'] = '1';
      expect(getBool('TEST_BOOL')).toBe(true);
    });

    it('should return false for "false"', () => {
      process.env['TEST_BOOL'] = 'false';
      expect(getBool('TEST_BOOL')).toBe(false);
    });

    it('should return false for "0"', () => {
      process.env['TEST_BOOL'] = '0';
      expect(getBool('TEST_BOOL')).toBe(false);
    });

    it('should return default value if not set', () => {
      expect(getBool('NON_EXISTENT', true)).toBe(true);
    });

    it('should return false if not set and no default', () => {
      expect(getBool('NON_EXISTENT')).toBe(false);
    });
  });

  describe('Env object', () => {
    it('should export helper functions', () => {
      expect(Env.get).toBe(get);
      expect(Env.getInt).toBe(getInt);
      expect(Env.getBool).toBe(getBool);
    });

    it('should export common variables', () => {
      // These values depend on the process.env at module load time.
      // Since we can't easily reload the module with different env vars in this test setup without dynamic import,
      // we just check they exist.
      expect(Env.NODE_ENV).toBeDefined();
      expect(Env.PORT).toBeDefined();
    });
  });
});
