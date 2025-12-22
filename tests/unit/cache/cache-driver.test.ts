import { describe, expect, it } from 'vitest';

describe('CacheDriver', () => {
  it('exports a runtime marker for coverage', async () => {
    const mod = await import('@cache/CacheDriver');
    expect(mod.CACHE_DRIVER_INTERFACE).toBe('CacheDriver');
  });
});
