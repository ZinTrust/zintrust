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
