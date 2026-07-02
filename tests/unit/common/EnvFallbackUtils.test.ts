import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import {
  readWorkersEnvString,
  readWorkersFallbackString,
  readWorkersFallbackInt,
  readWorkersFallbackBool,
  parseJsonObjectEnv,
} from '@/common/EnvFallbackUtils';

vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getWorkersVar: vi.fn(),
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn(),
    getBool: vi.fn(),
  },
}));

describe('EnvFallbackUtils', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('readWorkersEnvString', () => {
    it('returns worker value if present and non-empty', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue('some-val');
      expect(readWorkersEnvString('KEY')).toBe('some-val');
    });

    it('returns empty string if worker value is empty or null', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue(null);
      expect(readWorkersEnvString('KEY')).toBe('');

      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue('   ');
      expect(readWorkersEnvString('KEY')).toBe('');
    });
  });

  describe('readWorkersFallbackString', () => {
    it('returns worker value if present', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockImplementation((key) => {
        if (key === 'WORKER_KEY') return 'worker-val';
        return null;
      });
      expect(readWorkersFallbackString('WORKER_KEY', 'FALLBACK_KEY', 'default')).toBe('worker-val');
    });

    it('returns fallback worker value if includeFallbackWorkerBinding is true', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockImplementation((key) => {
        if (key === 'FALLBACK_KEY') return 'fallback-worker-val';
        return null;
      });
      expect(
        readWorkersFallbackString('WORKER_KEY', 'FALLBACK_KEY', 'default', true)
      ).toBe('fallback-worker-val');
    });

    it('falls back to Env value if worker bindings are empty', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue(null);
      vi.mocked(Env.get).mockReturnValue('env-val');
      expect(
        readWorkersFallbackString('WORKER_KEY', 'FALLBACK_KEY', 'default', true)
      ).toBe('env-val');
    });

    it('falls back to default fallback if all sources are empty', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue(null);
      vi.mocked(Env.get).mockReturnValue(null);
      expect(
        readWorkersFallbackString('WORKER_KEY', 'FALLBACK_KEY', 'default', true)
      ).toBe('default');
    });
  });

  describe('readWorkersFallbackInt', () => {
    it('returns parsed integer if worker value is present', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue('123');
      expect(readWorkersFallbackInt('WORKER_KEY', 'FALLBACK_KEY', 456)).toBe(123);
    });

    it('returns default fallback if parsed integer is invalid', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue('abc');
      expect(readWorkersFallbackInt('WORKER_KEY', 'FALLBACK_KEY', 456)).toBe(456);
    });

    it('falls back to Env integer value if worker value is empty', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue(null);
      vi.mocked(Env.get).mockReturnValue('789');
      expect(readWorkersFallbackInt('WORKER_KEY', 'FALLBACK_KEY', 456)).toBe(789);
    });

    it('returns default fallback if all sources are empty', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue(null);
      vi.mocked(Env.get).mockReturnValue('');
      expect(readWorkersFallbackInt('WORKER_KEY', 'FALLBACK_KEY', 456)).toBe(456);
    });
  });

  describe('readWorkersFallbackBool', () => {
    it('returns true/false based on worker string value', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue('true');
      expect(readWorkersFallbackBool('WORKER_KEY', 'FALLBACK_KEY', false)).toBe(true);

      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue('1');
      expect(readWorkersFallbackBool('WORKER_KEY', 'FALLBACK_KEY', false)).toBe(true);

      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue('false');
      expect(readWorkersFallbackBool('WORKER_KEY', 'FALLBACK_KEY', true)).toBe(false);
    });

    it('falls back to Env.getBool if worker value is empty', () => {
      vi.mocked(Cloudflare.getWorkersVar).mockReturnValue(null);
      vi.mocked(Env.getBool).mockReturnValue(true);
      expect(readWorkersFallbackBool('WORKER_KEY', 'FALLBACK_KEY', false)).toBe(true);
    });
  });

  describe('parseJsonObjectEnv', () => {
    it('returns undefined if env value is empty', () => {
      vi.mocked(Env.get).mockReturnValue('');
      expect(parseJsonObjectEnv('KEY')).toBeUndefined();
    });

    it('returns parsed object for valid JSON object', () => {
      vi.mocked(Env.get).mockReturnValue('{"foo": "bar"}');
      expect(parseJsonObjectEnv('KEY')).toEqual({ foo: 'bar' });
    });

    it('returns undefined for JSON arrays, null, or primitives', () => {
      vi.mocked(Env.get).mockReturnValue('[1, 2, 3]');
      expect(parseJsonObjectEnv('KEY')).toBeUndefined();

      vi.mocked(Env.get).mockReturnValue('null');
      expect(parseJsonObjectEnv('KEY')).toBeUndefined();

      vi.mocked(Env.get).mockReturnValue('"string"');
      expect(parseJsonObjectEnv('KEY')).toBeUndefined();
    });

    it('returns wrapped object for invalid JSON', () => {
      vi.mocked(Env.get).mockReturnValue('invalid-json');
      expect(parseJsonObjectEnv('KEY')).toEqual({ value: 'invalid-json' });
    });
  });
});
