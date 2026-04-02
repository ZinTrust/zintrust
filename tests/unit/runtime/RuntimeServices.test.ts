import { afterEach, describe, expect, it } from 'vitest';

import { RuntimeServices } from '@/runtime/RuntimeServices';

describe('RuntimeServices', () => {
  const originalEnv = (globalThis as { env?: unknown }).env;
  const originalNodeValue = process.env['SAMPLE_NODE_VALUE'];
  const originalNodeInt = process.env['SAMPLE_NODE_INT'];
  const originalNodeFloat = process.env['SAMPLE_NODE_FLOAT'];
  const originalNodeBool = process.env['SAMPLE_NODE_BOOL'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete (globalThis as { env?: unknown }).env;
    } else {
      (globalThis as { env?: unknown }).env = originalEnv;
    }

    if (originalNodeValue === undefined) delete process.env['SAMPLE_NODE_VALUE'];
    else process.env['SAMPLE_NODE_VALUE'] = originalNodeValue;

    if (originalNodeInt === undefined) delete process.env['SAMPLE_NODE_INT'];
    else process.env['SAMPLE_NODE_INT'] = originalNodeInt;

    if (originalNodeFloat === undefined) delete process.env['SAMPLE_NODE_FLOAT'];
    else process.env['SAMPLE_NODE_FLOAT'] = originalNodeFloat;

    if (originalNodeBool === undefined) delete process.env['SAMPLE_NODE_BOOL'];
    else process.env['SAMPLE_NODE_BOOL'] = originalNodeBool;
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

  it('reads node env values through all runtime env helpers', () => {
    process.env['SAMPLE_NODE_VALUE'] = 'node-value';
    process.env['SAMPLE_NODE_INT'] = '17';
    process.env['SAMPLE_NODE_FLOAT'] = '3.5';
    process.env['SAMPLE_NODE_BOOL'] = 'true';

    const services = RuntimeServices.create('nodejs');

    expect(services.env.get('SAMPLE_NODE_VALUE', 'fallback')).toBe('node-value');
    expect(services.env.getInt('SAMPLE_NODE_INT', 0)).toBe(17);
    expect(services.env.getFloat('SAMPLE_NODE_FLOAT', 0)).toBe(3.5);
    expect(services.env.getBool('SAMPLE_NODE_BOOL', false)).toBe(true);
  });
});
