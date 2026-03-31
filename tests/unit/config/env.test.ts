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

    it('should include common executable directories in SAFE_PATH', () => {
      if (process.platform === 'win32') {
        expect(Env.SAFE_PATH).toContain(String.raw`C:\Windows\System32`);
        return;
      }

      expect(Env.SAFE_PATH).toContain('/usr/local/bin');
      expect(Env.SAFE_PATH).toContain('/opt/homebrew/bin');
      expect(Env.SAFE_PATH).toContain('/usr/bin');
    });

    it('uses worker global env when process env is empty', async () => {
      const originalGlobalEnv = (globalThis as { env?: unknown }).env;
      process.env = {};
      (globalThis as { env?: unknown }).env = {
        APP_NAME: 'worker-app',
        WORKER_ONLY: 'yes',
      };

      vi.resetModules();
      const { Env: WorkerEnv } = await import('../../../src/config/env');

      expect(WorkerEnv.APP_NAME).toBe('worker-app');
      expect(WorkerEnv.get('WORKER_ONLY')).toBe('yes');

      (globalThis as { env?: unknown }).env = originalGlobalEnv;
    });

    it('resolves packed env values and tracks their source', async () => {
      delete (process.env as Record<string, string | undefined>)['APP_NAME'];
      process.env['USE_PACK'] = 'true';
      process.env['PACK_KEYS'] = 'K1,K2,K1';
      process.env['K1'] = JSON.stringify({ APP_NAME: 'Packed App', JWT_SECRET: 'first-secret' });
      process.env['K2'] = JSON.stringify({ JWT_SECRET: 'second-secret', USE_PACK: 'ignored' });

      vi.resetModules();
      const { Env: PackedEnv } = await import('../../../src/config/env');

      expect(PackedEnv.get('APP_NAME')).toBe('Packed App');
      expect(PackedEnv.get('JWT_SECRET')).toBe('second-secret');
      expect(PackedEnv.getSourceOf('APP_NAME')).toBe('K1');
      expect(PackedEnv.getSourceOf('JWT_SECRET')).toBe('K2');
      expect(PackedEnv.snapshotSources()['USE_PACK']).toBe('direct-env');
    });

    it('keeps direct env values above packed values', async () => {
      process.env['USE_PACK'] = 'true';
      process.env['PACK_KEYS'] = 'K1';
      process.env['K1'] = JSON.stringify({ APP_NAME: 'Packed App', JWT_SECRET: 'packed-secret' });
      process.env['APP_NAME'] = 'Direct App';

      vi.resetModules();
      const { Env: PackedEnv } = await import('../../../src/config/env');

      expect(PackedEnv.get('APP_NAME')).toBe('Direct App');
      expect(PackedEnv.get('JWT_SECRET')).toBe('packed-secret');
      expect(PackedEnv.getSourceOf('APP_NAME')).toBe('direct-env');
      expect(PackedEnv.has('JWT_SECRET')).toBe(true);
      expect(PackedEnv.getOptional('MISSING_PACKED_KEY')).toBeUndefined();
    });

    it('rejects invalid packed env payloads', async () => {
      process.env['USE_PACK'] = 'true';
      process.env['PACK_KEYS'] = 'K1';
      process.env['K1'] = JSON.stringify({ APP_NAME: { nested: 'nope' } });

      vi.resetModules();

      await expect(import('../../../src/config/env')).rejects.toThrow(
        /K1 contains unsupported value for APP_NAME/i
      );
    });
  });
});
