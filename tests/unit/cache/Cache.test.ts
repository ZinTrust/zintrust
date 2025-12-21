import { Cache } from '@/cache/Cache';
import { MemoryDriver } from '@/cache/drivers/MemoryDriver';
import { describe, expect, it, vi } from 'vitest';

// Mock Env to control driver selection
vi.mock('@/config/env', () => ({
  Env: {
    CACHE_DRIVER: 'memory',
  },
}));

describe('Cache', () => {
  it('should use memory driver by default', () => {
    expect(Cache.getDriver()).toBeInstanceOf(MemoryDriver);
  });

  it('should set and get value', async () => {
    await Cache.set('key', 'value');
    expect(await Cache.get('key')).toBe('value');
  });

  it('should return null for missing value', async () => {
    expect(await Cache.get('missing')).toBeNull();
  });

  it('should check existence', async () => {
    await Cache.set('exists', true);
    expect(await Cache.has('exists')).toBe(true);
    expect(await Cache.has('missing')).toBe(false);
  });

  it('should delete value', async () => {
    await Cache.set('delete', 'me');
    await Cache.delete('delete');
    expect(await Cache.get('delete')).toBeNull();
  });

  it('should clear cache', async () => {
    await Cache.set('a', 1);
    await Cache.set('b', 2);
    await Cache.clear();
    expect(await Cache.get('a')).toBeNull();
    expect(await Cache.get('b')).toBeNull();
  });
});
