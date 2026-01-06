import { describe, expect, it } from 'vitest';

import { Collection, collect } from '../../../src/collections/index';

describe('Collection', () => {
  it('collect() normalizes null to empty', () => {
    const c = collect<number>(null);
    expect(c.count()).toBe(0);
    expect(c.isEmpty()).toBe(true);
    expect(c.all()).toEqual([]);
  });

  it('map/filter are immutable and chainable', () => {
    const c1 = collect([1, 2, 3]);
    const c2 = c1.map((n) => n * 2).filter((n) => n > 2);

    expect(c1.all()).toEqual([1, 2, 3]);
    expect(c2.all()).toEqual([4, 6]);
  });

  it('first/last optionally accept predicates', () => {
    const c = collect([1, 2, 3, 4]);

    expect(c.first()).toBe(1);
    expect(c.last()).toBe(4);

    expect(c.first((n) => n % 2 === 0)).toBe(2);
    expect(c.last((n) => n % 2 === 0)).toBe(4);
  });

  it('pluck/where work for object collections', () => {
    const users = collect([
      { id: 1, role: 'admin' as const },
      { id: 2, role: 'user' as const },
      { id: 3, role: 'user' as const },
    ]);

    expect(users.where('role', 'user').pluck('id').all()).toEqual([2, 3]);
  });

  it('unique() de-dupes by keySelector and preserves order', () => {
    const c = collect([
      { id: 1, name: 'a' },
      { id: 1, name: 'b' },
      { id: 2, name: 'c' },
    ]).unique((u) => u.id);

    expect(c.pluck('name').all()).toEqual(['a', 'c']);
  });

  it('groupBy() returns map of Collections', () => {
    const grouped = collect([
      { id: 1, role: 'admin' },
      { id: 2, role: 'user' },
      { id: 3, role: 'user' },
    ]).groupBy((u) => u.role);

    expect(grouped.get('admin')?.pluck('id').all()).toEqual([1]);
    expect(grouped.get('user')?.pluck('id').all()).toEqual([2, 3]);
  });

  it('Collection.isCollection detects collection instances', () => {
    expect(Collection.isCollection(collect([1]))).toBe(true);
    expect(Collection.isCollection([1, 2, 3])).toBe(false);
  });

  it('Collection.from() supports ArrayLike sources', () => {
    const arrayLike: ArrayLike<string> = { 0: 'a', 1: 'b', length: 2 };
    expect(Collection.from(arrayLike).all()).toEqual(['a', 'b']);
  });

  it('first/last return undefined when predicate does not match', () => {
    const c = collect([1, 3, 5]);
    expect(c.first((n) => n % 2 === 0)).toBeUndefined();
    expect(c.last((n) => n % 2 === 0)).toBeUndefined();
  });

  it('sortBy() sorts numbers ascending and pushes null/undefined to the end', () => {
    const c = collect([
      { k: 2, v: 'b' },
      { k: null as any, v: 'n' },
      { k: 1, v: 'a' },
      { k: undefined as any, v: 'u' },
    ]).sortBy((x) => x.k);

    expect(c.pluck('v').all()).toEqual(['a', 'b', 'n', 'u']);
  });

  it('sortBy() uses localeCompare for non-number keys', () => {
    const c = collect([
      { k: 'b', v: 2 },
      { k: 'a', v: 1 },
    ]).sortBy((x) => x.k);

    expect(c.pluck('v').all()).toEqual([1, 2]);
  });

  it('Collection.of(), toArray(), reduce(), and keyBy() work', () => {
    const c = Collection.of({ id: 'a', n: 1 }, { id: 'b', n: 2 });

    expect(c.toArray()).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);

    expect(c.reduce((acc, item) => acc + item.n, 0)).toBe(3);

    const byId = c.keyBy((x) => x.id);
    expect(byId.get('a')).toEqual({ id: 'a', n: 1 });
    expect(byId.get('b')).toEqual({ id: 'b', n: 2 });
  });

  it('chunk() returns [] for invalid sizes and chunks items for valid sizes', () => {
    const c = collect([1, 2, 3, 4, 5]);
    expect(c.chunk(0).all()).toEqual([]);
    expect(c.chunk(Number.NaN).all()).toEqual([]);
    expect(c.chunk(2).all()).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('take/skip floor and clamp negative values', () => {
    const c = collect([1, 2, 3, 4]);
    expect(c.take(2.9).all()).toEqual([1, 2]);
    expect(c.skip(1.1).all()).toEqual([2, 3, 4]);
    expect(c.take(-1).all()).toEqual([]);
    expect(c.skip(-1).all()).toEqual([1, 2, 3, 4]);
  });

  it('tap passes a copy and returns an equivalent collection', () => {
    const c = collect([1, 2, 3]);
    const seen: number[][] = [];

    const out = c.tap((items) => {
      items.push(999);
      seen.push(items);
    });

    expect(seen[0]).toEqual([1, 2, 3, 999]);
    expect(c.all()).toEqual([1, 2, 3]);
    expect(out.all()).toEqual([1, 2, 3]);
  });

  it('Collection instances are iterable', () => {
    const c = collect([1, 2, 3]);
    expect([...c]).toEqual([1, 2, 3]);
  });
});
