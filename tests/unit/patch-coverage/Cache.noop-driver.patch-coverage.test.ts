import { describe, expect, it } from 'vitest';

describe('patch coverage: Cache no-op driver', () => {
  it('returns null/false when CACHE_ENABLED is disabled', async () => {
    const prev = process.env['CACHE_ENABLED'];
    process.env['CACHE_ENABLED'] = 'false';

    try {
      const { Cache } = await import('../../../src/cache/Cache');
      Cache.reset();

      await expect(Cache.get('k')).resolves.toBeNull();
      await expect(Cache.has('k')).resolves.toBe(false);
      await expect(Cache.set('k', 'v')).resolves.toBeUndefined();
      await expect(Cache.delete('k')).resolves.toBeUndefined();
      await expect(Cache.clear()).resolves.toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env['CACHE_ENABLED'];
      else process.env['CACHE_ENABLED'] = prev;
    }
  });
});
