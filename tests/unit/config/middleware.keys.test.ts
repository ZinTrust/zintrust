import { MiddlewareKeys, middlewareConfig } from '@config/middleware';
import { describe, expect, it } from 'vitest';

describe('MiddlewareKeys', () => {
  it('matches middlewareConfig.route keys', () => {
    const configured = Object.keys(middlewareConfig.route).sort();
    const typed = Object.keys(MiddlewareKeys).sort();
    expect(configured).toEqual(typed);
  });
});
