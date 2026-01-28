/* eslint-disable max-nested-callbacks */
import { Collection } from '@/collections/Collection';
import { describe, expect, it } from 'vitest';

describe('Collection coverage', () => {
  it('detects collections and non-collections', () => {
    expect(Collection.isCollection(null)).toBe(false);
    expect(Collection.isCollection({})).toBe(false);

    const col = Collection.from([1, 2, 3]);
    expect(Collection.isCollection(col)).toBe(true);
  });

  describe('function validation', () => {
    const collection = Collection.from([1, 2, 3]);

    it('throws TypeError for invalid map callback', () => {
      expect(() => collection.map(null as any)).toThrow('Map callback must be a function'); // NOSONAR
      expect(() => collection.map(undefined as any)).toThrow('Map callback must be a function'); // NOSONAR
      expect(() => collection.map('string' as any)).toThrow('Map callback must be a function'); // NOSONAR
      expect(() => collection.map(123 as any)).toThrow('Map callback must be a function'); // NOSONAR
      expect(() => collection.map({} as any)).toThrow('Map callback must be a function'); // NOSONAR
    });

    it('throws TypeError for invalid filter callback', () => {
      expect(() => collection.filter(null as any)).toThrow('Filter callback must be a function'); // NOSONAR
      expect(() => collection.filter(undefined as any)).toThrow(
        'Filter callback must be a function'
      ); // NOSONAR
      expect(() => collection.filter('string' as any)).toThrow(
        'Filter callback must be a function'
      ); // NOSONAR
    });

    it('throws TypeError for invalid reduce callback', () => {
      expect(() => collection.reduce(null as any, 0)).toThrow('Reduce callback must be a function'); // NOSONAR
      expect(() => collection.reduce('string' as any, 0)).toThrow(
        'Reduce callback must be a function'
      ); // NOSONAR
    });

    it('throws TypeError for invalid first callback', () => {
      expect(() => collection.first('string' as any)).toThrow('First callback must be a function');
      expect(() => collection.first(123 as any)).toThrow('First callback must be a function');
      expect(() => collection.first({} as any)).toThrow('First callback must be a function');
    });

    it('throws TypeError for invalid last callback', () => {
      expect(() => collection.last('string' as any)).toThrow('Last callback must be a function');
      expect(() => collection.last(123 as any)).toThrow('Last callback must be a function');
      expect(() => collection.last({} as any)).toThrow('Last callback must be a function');
    });

    it('throws TypeError for invalid unique key selector', () => {
      expect(() => collection.unique('string' as any)).toThrow(
        'Unique key selector must be a function'
      );
      expect(() => collection.unique(123 as any)).toThrow('Unique key selector must be a function');
      expect(() => collection.unique({} as any)).toThrow('Unique key selector must be a function');
    });

    it('throws TypeError for invalid sort key selector', () => {
      expect(() => collection.sortBy(null as any)).toThrow('Sort key selector must be a function');
      expect(() => collection.sortBy(undefined as any)).toThrow(
        'Sort key selector must be a function'
      );
      expect(() => collection.sortBy('string' as any)).toThrow(
        'Sort key selector must be a function'
      );
      expect(() => collection.sortBy(123 as any)).toThrow('Sort key selector must be a function');
      expect(() => collection.sortBy({} as any)).toThrow('Sort key selector must be a function');
    });

    it('allows valid functions to work correctly', () => {
      // Test that valid functions still work
      const mapped = collection.map((x) => x * 2);
      expect(mapped.toArray()).toEqual([2, 4, 6]);

      const filtered = collection.filter((x) => x > 1);
      expect(filtered.toArray()).toEqual([2, 3]);

      const reduced = collection.reduce((acc, x, _index) => acc + x, 0);
      expect(reduced).toBe(6);

      const first = collection.first((x) => x > 1);
      expect(first).toBe(2);

      const last = collection.last((x) => x > 1);
      expect(last).toBe(3);

      const unique = collection.unique((x) => x % 2);
      expect(unique.toArray()).toEqual([1, 2]);

      const sorted = collection.sortBy((x) => -x);
      expect(sorted.toArray()).toEqual([3, 2, 1]);
    });
  });
});
