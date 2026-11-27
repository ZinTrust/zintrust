/* eslint-disable @typescript-eslint/no-explicit-any */
import { Cache, cache } from '@cache/Cache';
import { Env } from '@config/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  factory: vi.fn() as any,
  driver: {
    get: vi.fn(async (_key: string) => null as unknown),
    many: vi.fn(async (_keys: string[]) => [] as unknown[]) as any,
    set: vi.fn(async (_key: string, _value: unknown, _ttl?: number) => undefined),
    delete: vi.fn(async (_key: string) => undefined),
    clear: vi.fn(async () => undefined),
    has: vi.fn(async (_key: string) => false),
    increment: vi.fn(async (_key: string, _amount: number) => 1) as any,
    decrement: vi.fn(async (_key: string, _amount: number) => 1) as any,
    getRedisClient: vi.fn(() => ({ marker: 'redis' })) as any,
  },
}));

vi.mock('@cache/CacheDriverRegistry', () => ({
  CacheDriverRegistry: {
    get: () => state.factory,
  },
}));

const resetDriver = (): void => {
  state.factory.mockReset();
  state.factory.mockReturnValue(state.driver);
  for (const fn of Object.values(state.driver)) {
    if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset();
  }
  state.driver.get.mockResolvedValue(null);
  state.driver.many = vi.fn(async () => []);
  state.driver.set.mockResolvedValue(undefined);
  state.driver.delete.mockResolvedValue(undefined);
  state.driver.clear.mockResolvedValue(undefined);
  state.driver.has.mockResolvedValue(false);
  state.driver.increment = vi.fn(async () => 1);
  state.driver.decrement = vi.fn(async () => 1);
  state.driver.getRedisClient = vi.fn(() => ({ marker: 'redis' }));
  Cache.reset();
};

describe('Cache uncovered branches', () => {
  beforeEach(() => {
    Env.setSource(null);
    resetDriver();
  });

  afterEach(() => {
    Env.setSource(null);
    Cache.reset();
  });

  it('auto-prefixes only unprefixed keys', async () => {
    await Cache.get('plain');
    await Cache.get('zt:already');

    expect(state.driver.get).toHaveBeenNthCalledWith(1, 'zt:plain');
    expect(state.driver.get).toHaveBeenNthCalledWith(2, 'zt:already');
  });

  it('returns early from many() when no keys are provided', async () => {
    await expect(Cache.many([])).resolves.toEqual([]);
    expect(state.driver.many).not.toHaveBeenCalled();
    expect(state.driver.get).not.toHaveBeenCalled();
  });

  it('uses driver.many() when available and normalizes missing values', async () => {
    state.driver.many.mockResolvedValue([7, undefined, null]);

    await expect(Cache.many(['a', 'b', 'c'])).resolves.toEqual([7, null, null]);
    expect(state.driver.many).toHaveBeenCalledWith(['zt:a', 'zt:b', 'zt:c']);
    expect(state.driver.get).not.toHaveBeenCalled();
  });

  it('falls back to individual gets and treats falsy values as hits', async () => {
    state.driver.many = undefined;
    state.driver.get.mockResolvedValueOnce(0).mockResolvedValueOnce(false).mockResolvedValueOnce('');

    await expect(Cache.many(['a', 'b', 'c'])).resolves.toEqual([0, false, '']);
    expect(state.driver.get).toHaveBeenCalledTimes(3);
  });

  it('uses native increment/decrement when the driver provides them', async () => {
    state.driver.increment.mockResolvedValue(5);
    state.driver.decrement.mockResolvedValue(3);

    await expect(Cache.increment('n', 2)).resolves.toBe(5);
    await expect(Cache.decrement('n', 2)).resolves.toBe(3);
    expect(state.driver.increment).toHaveBeenCalledWith('zt:n', 2);
    expect(state.driver.decrement).toHaveBeenCalledWith('zt:n', 2);
    expect(state.driver.get).not.toHaveBeenCalled();
  });

  it('falls back to get/set for increment/decrement when absent or nullish', async () => {
    state.driver.increment = undefined;
    state.driver.decrement = undefined;
    state.driver.get.mockResolvedValue(null);

    await expect(Cache.increment('n')).resolves.toBe(1);
    await expect(Cache.decrement('n', 3)).resolves.toBe(-3);
    expect(state.driver.set).toHaveBeenNthCalledWith(1, 'zt:n', 1);
    expect(state.driver.set).toHaveBeenNthCalledWith(2, 'zt:n', -3);
  });

  it('covers every named-store wrapper and its name fallbacks', async () => {
    const store = Cache.store('default');
    await store.get('k');
    await store.many(['k']);
    await store.set('k', 'v', 5);
    await store.delete('k');
    await store.clear();
    await store.has('k');

    state.driver.increment = undefined;
    state.driver.decrement = undefined;
    state.driver.get.mockResolvedValue(null);
    await expect(store.increment('c')).resolves.toBe(1);
    await expect(store.decrement('c')).resolves.toBe(-1);

    state.driver.increment = vi.fn(async () => 9);
    state.driver.decrement = vi.fn(async () => 8);
    await expect(store.increment('c', 2)).resolves.toBe(9);
    await expect(store.decrement('c', 2)).resolves.toBe(8);

    expect(store.getDriver()).toBe(state.driver);
    expect(state.factory).toHaveBeenCalledTimes(1);
  });

  it('covers the unnamed store wrapper fallback and empty many', async () => {
    const store = Cache.store();
    await expect(store.many([])).resolves.toEqual([]);
    await store.get('k');
    await store.set('k', 'v');
    await store.delete('k');
    await store.clear();
    await store.has('k');
    await expect(store.increment('c')).resolves.toBe(1);
    await expect(store.decrement('c')).resolves.toBe(1);
    expect(store.getDriver()).toBe(state.driver);
  });

  it('exposes the cache alias and redis client helpers', () => {
    expect(cache).toBe(Cache);
    expect(Cache.getRedisClient()).toEqual({ marker: 'redis' });

    state.driver.getRedisClient = undefined;
    expect(() => Cache.getRedisClient()).toThrow(/only supported by Redis cache driver/i);
  });

  it('uses the no-op driver when caching is disabled', async () => {
    Env.setSource({ CACHE_ENABLED: 'false' });
    Cache.reset();

    await expect(Cache.get('k')).resolves.toBeNull();
    await expect(Cache.has('k')).resolves.toBe(false);
    await expect(Cache.many(['k'])).resolves.toEqual([null]);
    await expect(Cache.set('k', 'v')).resolves.toBeUndefined();
    await expect(Cache.delete('k')).resolves.toBeUndefined();
    await expect(Cache.clear()).resolves.toBeUndefined();
    await expect(Cache.increment('k', 2)).resolves.toBe(2);
    await expect(Cache.decrement('k', 3)).resolves.toBe(-3);
    expect(() => Cache.getRedisClient()).toThrow(/not supported with no-op cache driver/i);
    expect(state.driver.get).not.toHaveBeenCalled();
  });
});
