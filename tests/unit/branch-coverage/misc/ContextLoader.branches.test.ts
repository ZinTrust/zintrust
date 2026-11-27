import { describe, expect, it } from 'vitest';

import { ContextLoader } from '@common/ContextLoader';

describe('ContextLoader uncovered branches', () => {
  it('rejects invalid batch and load names', () => {
    const loader = ContextLoader.create();
    expect(() => loader.batch('  ', async () => ({}))).toThrow(/non-empty string/);
    expect(() => loader.batch('b', undefined as any)).toThrow(/handler must be a function/);
    expect(() => loader.load('   ', async () => 1)).toThrow(/non-empty string/);
    expect(() => loader.load('k', undefined as any)).toThrow(/resolver must be a function/);

    const plan = loader.load('k', async () => 1);
    expect(() => plan.load('  k ', async () => 2)).toThrow(/already registered/);
    expect(() => plan.load('other', undefined as any)).toThrow(/resolver must be a function/);
  });

  it('resolves steps with frozen snapshots and memoizes the plan', async () => {
    const loader = ContextLoader.create();
    const seen: unknown[] = [];
    const plan = loader
      .load(' first ', async (ctx) => {
        seen.push(ctx);
        return 1;
      })
      .load('second', async (ctx) => {
        seen.push(ctx);
        expect(Object.isFrozen(ctx)).toBe(true);
        return (ctx as any).first + 1;
      });

    expect(await plan.resolve()).toEqual({ first: 1, second: 2 });
    expect(await plan.resolve()).toEqual({ first: 1, second: 2 });
    expect(seen).toHaveLength(2);
  });

  it('plan.fromBatch forwards to the root loader', async () => {
    const loader = ContextLoader.create();
    loader.batch('B', async (keys) => new Map(keys.map((k) => [k, `v${k}`])));
    const plan = loader.load('k', async () => 1);
    await expect(plan.fromBatch(' b ', 2)).resolves.toBe('v2');
  });

  it('validates batch keys and rejects unregistered batches', async () => {
    const loader = ContextLoader.create();
    await expect(loader.fromBatch('nope', 'k')).rejects.toThrow(/not registered/);
    await expect(loader.fromBatch('nope', '  ')).rejects.toThrow(/batch key/);
    await expect(loader.fromBatch('nope', Number.NaN)).rejects.toThrow(/batch key/);
    await expect(loader.fromBatch('nope', {} as any)).rejects.toThrow(/batch key/);
  });

  it('sequential mode extracts values from Map, object, null and missing keys', async () => {
    const loader = ContextLoader.create();
    loader.batch('m', async () => new Map([['a', 1], ['b', null], ['c', undefined]]));
    await expect(loader.fromBatch('m', 'a')).resolves.toBe(1);
    await expect(loader.fromBatch('m', 'b')).resolves.toBeNull();
    await expect(loader.fromBatch('m', 'c')).resolves.toBeNull();
    await expect(loader.fromBatch('m', 'missing')).resolves.toBeNull();

    loader.batch('o', async () => ({ 1: 'one', a: null }));
    await expect(loader.fromBatch('o', 1)).resolves.toBe('one');
    await expect(loader.fromBatch('o', 'a')).resolves.toBeNull();
    await expect(loader.fromBatch('o', 'missing')).resolves.toBeNull();

    loader.batch('n', async () => null);
    await expect(loader.fromBatch('n', 'a')).resolves.toBeNull();
  });

  it('sequential mode propagates handler errors', async () => {
    const loader = ContextLoader.create();
    loader.batch('boom', async () => {
      throw new Error('bad handler');
    });
    await expect(loader.fromBatch('boom', 'a')).rejects.toThrow('bad handler');
  });

  it('batch mode dedupes keys and resolves all queued requests', async () => {
    const loader = ContextLoader.create({ mode: 'batch' });
    const handler = async (keys: any[]) => new Map(keys.map((k) => [k, `v${k}`]));
    loader.batch(' B ', handler);
    const results = await Promise.all([
      loader.fromBatch('b', 'a'),
      loader.fromBatch('b', 'a'),
      loader.fromBatch('b', 7),
      loader.fromBatch('b', 7),
    ]);
    expect(results).toEqual(['va', 'va', 'v7', 'v7']);
  });

  it('batch mode propagates errors to every queued request', async () => {
    const loader = ContextLoader.create({ mode: 'batch' });
    loader.batch('b', async () => {
      throw new Error('batch failed');
    });
    const results = await Promise.allSettled([
      loader.fromBatch('b', 'a'),
      loader.fromBatch('b', 'b'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
  });

  it('batch registry helpers normalize names and clear state', async () => {
    const loader = ContextLoader.create({ mode: 'batch' });
    loader.batch(' Zeta ', async () => ({}));
    loader.batch('alpha', async () => ({}));
    expect(loader.listBatches()).toEqual(['alpha', 'zeta']);
    expect(loader.hasBatch('ZETA')).toBe(true);
    loader.unregisterBatch(' zeta ');
    expect(loader.hasBatch('zeta')).toBe(false);
    loader.clearBatches();
    expect(loader.listBatches()).toEqual([]);
    await expect(loader.fromBatch('alpha', 'k')).rejects.toThrow(/not registered/);
  });
});
