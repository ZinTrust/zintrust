import { describe, expect, it } from 'vitest';

import { cacheConfig } from '@config/cache';

describe('src/config/cache patch coverage (extra)', () => {
  it('throws when no cache stores are configured', () => {
    const fakeConfig = {
      default: 'default',
      drivers: {},
    };

    expect(() => (cacheConfig.getDriver as any).call(fakeConfig, undefined)).toThrow(
      /No cache stores are configured/i
    );
  });

  it('exposes proxy metadata via ownKeys/getOwnPropertyDescriptor', () => {
    const keys = Reflect.ownKeys(cacheConfig as unknown as object);
    expect(keys).toContain('default');

    const desc = Object.getOwnPropertyDescriptor(cacheConfig as unknown as object, 'keyPrefix');
    expect(desc).not.toBeUndefined();
  });
});
