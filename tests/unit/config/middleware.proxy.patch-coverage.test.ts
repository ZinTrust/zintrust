import { describe, expect, it } from 'vitest';

import middlewareConfig from '@/config/middleware';

describe('middlewareConfig proxy traps (patch coverage)', () => {
  it('supports ownKeys and getOwnPropertyDescriptor', () => {
    const keys = Reflect.ownKeys(middlewareConfig);
    expect(keys.length).toBeGreaterThan(0);

    const desc = Object.getOwnPropertyDescriptor(middlewareConfig, 'global');
    expect(desc).toBeDefined();
  });
});
