import { MiddlewareKeys, isKnownMiddlewareName, middlewareConfig } from '@config/middleware';
import { describe, expect, it } from 'vitest';

describe('MiddlewareKeys', () => {
  it('matches middlewareConfig.route keys', () => {
    const configured = Object.keys(middlewareConfig.route).sort();
    const typed = Object.keys(MiddlewareKeys).sort();
    expect(configured).toEqual(typed);
  });

  it('accepts parameterized route rate limit keys', () => {
    expect(isKnownMiddlewareName('rateLimit:6:1')).toBe(true);
    expect(isKnownMiddlewareName('rateLimit:100:0.4')).toBe(true);
  });

  it('rejects malformed parameterized route rate limit keys', () => {
    expect(isKnownMiddlewareName('rateLimit:100')).toBe(false);
    expect(isKnownMiddlewareName('rateLimit:abc:1')).toBe(false);
    expect(isKnownMiddlewareName('rateLimit:100:0')).toBe(false);
    expect(isKnownMiddlewareName('rateLimit:0:1')).toBe(false);
    expect(isKnownMiddlewareName('rateLimit:10:-1')).toBe(false);
  });
});
