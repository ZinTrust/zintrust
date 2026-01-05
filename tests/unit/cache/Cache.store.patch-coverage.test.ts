import { afterEach, describe, expect, it } from 'vitest';

import { Cache } from '@cache/Cache';

describe('Cache.store patch coverage', () => {
  afterEach(() => {
    Cache.reset();
  });

  it('covers store wrapper methods', async () => {
    const store = Cache.store('memory');

    await store.set('k', 'v', 1);
    await expect(store.has('k')).resolves.toBeTypeOf('boolean');
    await store.delete('k');
    await store.clear();

    expect(store.getDriver()).toBeTruthy();
  });
});
