import { describe, expect, it } from 'vitest';

import { createPaginator, getNextPageUrl, getPrevPageUrl } from '@database/Paginator';

describe('Paginator', () => {
  it('creates pagination metadata with links', () => {
    const paginator = createPaginator({
      items: [{ id: 1 }, { id: 2 }],
      total: 25,
      perPage: 10,
      currentPage: 2,
      baseUrl: 'https://example.com/users',
      query: { q: 'active', filter: 'new' },
    });

    expect(paginator.lastPage).toBe(3);
    expect(paginator.from).toBe(11);
    expect(paginator.to).toBe(12);
    expect(paginator.links.first).toContain('page=1');
    expect(paginator.links.last).toContain('page=3');
    expect(paginator.links.prev).toContain('page=1');
    expect(paginator.links.next).toContain('page=3');
    expect(paginator.links.next).toContain('q=active');
  });

  it('builds relative links for relative baseUrl', () => {
    const paginator = createPaginator({
      items: [],
      total: 0,
      perPage: 10,
      currentPage: 1,
      baseUrl: '/users',
    });

    expect(paginator.links.first).toBe('/users?page=1&perPage=10');
  });

  it('getNextPageUrl and getPrevPageUrl respect bounds', () => {
    const paginator = createPaginator({
      items: [{ id: 1 }],
      total: 1,
      perPage: 10,
      currentPage: 1,
      baseUrl: '/users',
    });

    expect(getPrevPageUrl(paginator, '/users')).toBeUndefined();
    expect(getNextPageUrl(paginator, '/users')).toBeUndefined();
  });

  it('returns next/prev urls within bounds', () => {
    const paginator = createPaginator({
      items: [{ id: 1 }, { id: 2 }],
      total: 25,
      perPage: 10,
      currentPage: 2,
      baseUrl: '/users',
    });

    expect(getPrevPageUrl(paginator, '/users')).toContain('page=1');
    expect(getNextPageUrl(paginator, '/users')).toContain('page=3');
  });

  it('throws when perPage is not positive', () => {
    expect(() =>
      createPaginator({
        items: [],
        total: 1,
        perPage: 0,
        currentPage: 1,
        baseUrl: '/users',
      })
    ).toThrow('perPage must be a positive integer');
  });
});
