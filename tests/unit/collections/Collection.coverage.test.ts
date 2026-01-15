import { Collection } from '@/collections/Collection';
import { describe, expect, it } from 'vitest';

describe('Collection coverage', () => {
  it('detects collections and non-collections', () => {
    expect(Collection.isCollection(null)).toBe(false);
    expect(Collection.isCollection({})).toBe(false);

    const col = Collection.from([1, 2, 3]);
    expect(Collection.isCollection(col)).toBe(true);
  });
});
