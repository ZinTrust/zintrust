import { GenerationCache } from '@performance/Optimizer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const STATE_SYMBOL = Symbol.for('zintrust:GenerationCacheState');

describe('GenerationCache shutdown/timer cleanup', () => {
  let tmp: string | undefined;
  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gen-cache-'));
  });

  afterAll(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('clear() stops the cleanup interval', () => {
    if (!tmp) throw new Error('tmp missing');

    const cache = GenerationCache.create(tmp, 1000, 10);

    // Access internal state via well-known symbol
    const internal = (cache as any)[STATE_SYMBOL] as any;
    expect(internal.cleanupInterval).toBeDefined();

    cache.clear();

    expect(internal.cleanupInterval).toBeUndefined();
  });
});
