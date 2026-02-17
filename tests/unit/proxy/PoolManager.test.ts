import { describe, expect, it, vi } from 'vitest';

import { createPoolManager } from '@proxy/PoolManager';

describe('createPoolManager', () => {
  it('creates lazily and disposes only when created', async () => {
    const create = vi.fn(() => ({ id: 1 }));
    const dispose = vi.fn(async () => undefined);
    const mgr = createPoolManager(create, dispose);

    await mgr.dispose();
    expect(dispose).not.toHaveBeenCalled();

    const pool = mgr.get();
    expect(pool).toEqual({ id: 1 });
    expect(create).toHaveBeenCalledTimes(1);

    await mgr.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);

    mgr.get();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
