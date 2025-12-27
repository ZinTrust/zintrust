import { GenerationCache } from '@performance/Optimizer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('GenerationCache eviction', () => {
  let tmp: string | undefined;
  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gen-cache-'));
  });

  afterAll(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('evicts oldest entries when maxEntries exceeded', () => {
    if (!tmp) throw new Error('tmp missing');

    const cache = GenerationCache.create(tmp, 60 * 60 * 1000, 3);

    cache.set('t', { a: 1 }, 'one');
    cache.set('t', { a: 2 }, 'two');
    cache.set('t', { a: 3 }, 'three');

    // At capacity
    expect(cache.getStats().entries).toBe(3);

    // Insert more to force eviction
    cache.set('t', { a: 4 }, 'four');
    cache.set('t', { a: 5 }, 'five');

    const stats = cache.getStats();
    expect(stats.entries).toBe(3);

    // Ensure oldest entries were evicted and newest entries present
    expect(cache.get('t', { a: 1 })).toBeNull();
    expect(cache.get('t', { a: 2 })).toBeNull();
    expect(cache.get('t', { a: 3 })).not.toBeNull();
    expect(cache.get('t', { a: 4 })).not.toBeNull();
    expect(cache.get('t', { a: 5 })).not.toBeNull();
  });
});
