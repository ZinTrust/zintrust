import { createMemoized } from '@performance/Optimizer';
import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: Optimizer createMemoized primitives', () => {
  it('treats booleans and "undefined" string as primitives for cache key', () => {
    const fn = vi.fn((flag: boolean, value: string) => `${flag}:${value}`);
    const memoized = createMemoized(fn);

    expect(memoized(true, 'undefined')).toBe('true:undefined');
    expect(memoized(true, 'undefined')).toBe('true:undefined');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('patch coverage: Optimizer parameter sorting', () => {
  it('covers parameter sorting in cache key generation', async () => {
    vi.resetModules();

    const { GenerationCache } = await import('@performance/Optimizer');
    const cache = GenerationCache.create('/tmp/test-cache', 600000, 10);

    // Test with unsorted parameters to trigger the sorting logic
    const params1 = { z: 1, a: 2, m: 3 };
    const params2 = { a: 2, m: 3, z: 1 }; // Same content, different order

    // Use cache.set to trigger the key generation logic internally
    await cache.set('test-type', params1, 'result1');
    await cache.set('test-type', params2, 'result2');

    // The cache should treat these as the same key due to sorting
    const result1 = await cache.get('test-type', params1);
    const result2 = await cache.get('test-type', params2);

    expect(result1).toBe('result2'); // Second set should overwrite first due to same key
    expect(result2).toBe('result2');
    await cache.save();
  });
});
