import { describe, expect, it } from 'vitest';

import { RequestFilter } from '../../src/utils/requestFilter';

describe('RequestFilter', () => {
  it('keeps ignoreRoutes as exact or nested-route matching', () => {
    expect(RequestFilter.matchesIgnoredPath('/trace', ['/trace'])).toBe(true);
    expect(RequestFilter.matchesIgnoredPath('/trace/entries', ['/trace'])).toBe(true);
    expect(RequestFilter.matchesIgnoredPath('/queue-monitor/api/events', ['/queue-monitor'])).toBe(
      true
    );
    expect(RequestFilter.matchesIgnoredPath('/api/workers/events', ['/workers/events'])).toBe(
      false
    );
  });

  it('supports contains-based ignorePath matching', () => {
    expect(
      RequestFilter.matchesIgnoredPath('/queue-monitor/api/events', {
        ignoreRoutes: ['/trace'],
        ignorePath: ['queue-monitor'],
      })
    ).toBe(true);

    expect(
      RequestFilter.matchesIgnoredPath('/workers/main.js?v=1', {
        ignoreRoutes: [],
        ignorePath: ['.js'],
      })
    ).toBe(true);

    expect(
      RequestFilter.matchesIgnoredPath('/api/users', {
        ignoreRoutes: ['/trace'],
        ignorePath: ['queue-monitor'],
      })
    ).toBe(false);
  });
});
