import { afterEach, describe, expect, it } from 'vitest';

import { RuntimeServices } from '@/runtime/RuntimeServices';

describe('RuntimeServices', () => {
  const originalEnv = (globalThis as { env?: unknown }).env;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete (globalThis as { env?: unknown }).env;
    } else {
      (globalThis as { env?: unknown }).env = originalEnv;
    }
  });

  it('creates node runtime services with fs support', () => {
    const services = RuntimeServices.create('nodejs');
    expect(services.platform).toBe('nodejs');
    expect(services.fs.supported).toBe(true);
    expect(typeof services.env.get).toBe('function');
  });

  it('creates cloudflare runtime services with env bindings', () => {
    (globalThis as { env?: Record<string, unknown> }).env = {
      SAMPLE_VALUE: 'ok',
      SAMPLE_INT: '42',
    };

    const services = RuntimeServices.create('cloudflare');
    expect(services.platform).toBe('cloudflare');
    expect(services.fs.supported).toBe(false);
    expect(services.env.get('SAMPLE_VALUE')).toBe('ok');
    expect(services.env.getInt('SAMPLE_INT', 0)).toBe(42);
  });

  it('creates cloudflare runtime services with packed env bindings', () => {
    (globalThis as { env?: Record<string, unknown> }).env = {
      USE_PACK: 'true',
      PACK_KEYS: 'K1',
      K1: JSON.stringify({ SAMPLE_VALUE: 'packed', SAMPLE_INT: '7' }),
      SAMPLE_VALUE: 'direct',
    };

    const services = RuntimeServices.create('cloudflare');
    expect(services.env.get('SAMPLE_VALUE')).toBe('direct');
    expect(services.env.getInt('SAMPLE_INT', 0)).toBe(7);
  });
});
