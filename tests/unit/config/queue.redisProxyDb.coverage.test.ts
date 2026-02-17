import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getWorkersEnv: () => ({ SOME: 'ENV' }),
    getWorkersVar: () => null,
  },
}));

describe('queue config (coverage extras)', () => {
  it('parses REDIS_PROXY_URL with non-numeric db path without throwing', async () => {
    const original = process.env['REDIS_PROXY_URL'];
    process.env['REDIS_PROXY_URL'] = 'redis://:p%40ss@localhost:6379/notanum';

    vi.resetModules();
    const mod = await import('../../../src/config/queue');
    const qc = (mod as any).queueConfig;

    expect(qc.drivers.redis.host).toBe('localhost');
    expect(qc.drivers.redis.password).toBe('p@ss');

    if (original === undefined) delete process.env['REDIS_PROXY_URL'];
    else process.env['REDIS_PROXY_URL'] = original;
  });
});
