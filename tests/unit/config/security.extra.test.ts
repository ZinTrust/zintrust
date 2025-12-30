import { securityConfig } from '@config/security';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('securityConfig jwt secret caching', () => {
  afterEach(() => {
    // reset env
    delete process.env.JWT_SECRET;
    vi.restoreAllMocks();
  });

  it('caches jwt secret after first access and returns cached value on subsequent access', () => {
    process.env.JWT_SECRET = 'first-secret';

    // First access should read from env
    const first = securityConfig.jwt.secret;
    expect(first).toBe('first-secret');

    // Change env and confirm getter still returns cached value
    process.env.JWT_SECRET = 'second-secret';
    const second = securityConfig.jwt.secret;
    expect(second).toBe('first-secret');
  });
});
