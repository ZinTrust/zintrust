import { describe, expect, it } from 'vitest';

describe('patch coverage: EnvFileLoader cacheEnabled override', () => {
  it('writes CACHE_ENABLED when applyCliOverrides includes cacheEnabled', async () => {
    const prev = process.env['CACHE_ENABLED'];
    delete process.env['CACHE_ENABLED'];

    try {
      const { EnvFileLoader } = await import('@/cli/utils/EnvFileLoader');
      EnvFileLoader.applyCliOverrides({
        nodeEnv: 'development',
        port: 3000,
        runtime: 'nodejs',
        cacheEnabled: true,
      });
      expect(process.env['CACHE_ENABLED']).toBe('true');

      EnvFileLoader.applyCliOverrides({
        nodeEnv: 'development',
        port: 3000,
        runtime: 'nodejs',
        cacheEnabled: false,
      });
      expect(process.env['CACHE_ENABLED']).toBe('false');
    } finally {
      if (prev === undefined) delete process.env['CACHE_ENABLED'];
      else process.env['CACHE_ENABLED'] = prev;
    }
  });
});
