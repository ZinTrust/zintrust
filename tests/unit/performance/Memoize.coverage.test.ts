import { createMemoized } from '@performance/Optimizer';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('createMemoized (coverage)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts LRU when maxSize reached and respects TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const fn = vi.fn((n: number) => n * 2);

    const memo = createMemoized(fn, { maxSize: 1, ttl: 1000 });

    expect(memo(1)).toBe(2);
    expect(memo(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);

    // Adding a second distinct key triggers eviction
    expect(memo(2)).toBe(4);

    // First key should be evicted due to maxSize=1
    expect(memo(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(3);

    // TTL expiry forces recompute (even if cached)
    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    expect(memo(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
