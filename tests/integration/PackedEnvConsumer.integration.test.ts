import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const restoreProcessEnv = (): void => {
  process.env = { ...ORIGINAL_ENV };
};

describe.sequential('Packed env consumer integration', () => {
  afterEach(() => {
    restoreProcessEnv();
    (globalThis as { env?: Record<string, unknown> }).env = undefined;
    vi.resetModules();
  });

  it('resolves packed env values through the public Env export', async () => {
    process.env['USE_PACK'] = 'true';
    process.env['PACK_KEYS'] = 'PACK_PRIMARY,PACK_SECONDARY';
    process.env['PACK_PRIMARY'] = JSON.stringify({ APP_NAME: 'Packed App', JWT_SECRET: 'first' });
    process.env['PACK_SECONDARY'] = JSON.stringify({ JWT_SECRET: 'second', FEATURE_FLAG: true });
    process.env['APP_NAME'] = 'Direct App';

    const { Env } = await import('../../src/index');

    expect(Env.get('APP_NAME')).toBe('Direct App');
    expect(Env.get('JWT_SECRET')).toBe('second');
    expect(Env.get('FEATURE_FLAG')).toBe('true');
    expect(Env.getSourceOf('APP_NAME')).toBe('direct-env');
    expect(Env.getSourceOf('JWT_SECRET')).toBe('PACK_SECONDARY');
  });

  it('applies packed worker bindings through public runtime services', async () => {
    (globalThis as { env?: Record<string, unknown> }).env = {
      USE_PACK: 'true',
      PACK_KEYS: 'WORKER_PACK',
      WORKER_PACK: JSON.stringify({ SAMPLE_VALUE: 'packed', SAMPLE_INT: 9 }),
      SAMPLE_VALUE: 'direct',
    };

    const { RuntimeServices } = await import('../../src/index');
    const services = RuntimeServices.create('cloudflare');

    expect(services.env.get('SAMPLE_VALUE')).toBe('direct');
    expect(services.env.getInt('SAMPLE_INT', 0)).toBe(9);
  });
});
