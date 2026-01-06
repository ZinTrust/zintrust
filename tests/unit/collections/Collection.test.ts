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
});
