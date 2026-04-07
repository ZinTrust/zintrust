import { describe, expect, it, vi } from 'vitest';

describe('SystemTraceBridge', () => {
  it('returns false from preload when the optional package is unavailable', async () => {
    vi.resetModules();
    vi.doMock('@zintrust/trace', () => {
      throw new Error('module unavailable');
    });

    const { SystemTraceBridge } = await import('@/trace/SystemTraceBridge');

    await expect(SystemTraceBridge.preload()).resolves.toBe(false);
    expect(() => SystemTraceBridge.emitCache('get', 'zt:key', 5, true)).not.toThrow();
  });

  it('loads the optional trace package once and forwards watcher calls', async () => {
    vi.resetModules();

    let loadCount = 0;
    const cacheEmit = vi.fn();
    const eventEmit = vi.fn();

    vi.doMock('@zintrust/trace', () => {
      loadCount += 1;

      return {
        CacheWatcher: { emit: cacheEmit },
        EventWatcher: { emit: eventEmit },
      };
    });

    const { SystemTraceBridge } = await import('@/trace/SystemTraceBridge');

    await expect(SystemTraceBridge.preload()).resolves.toBe(true);

    SystemTraceBridge.emitCache('has', 'zt:users:1', 7, true);
    SystemTraceBridge.emitEvent('user.created', 2, { id: 1 });

    expect(loadCount).toBe(1);
    expect(cacheEmit).toHaveBeenCalledWith('has', 'zt:users:1', 7, true);
    expect(eventEmit).toHaveBeenCalledWith('user.created', 2, { id: 1 });
  });

  it('swallows watcher errors so core paths stay unaffected', async () => {
    vi.resetModules();
    const throwingEmit = vi.fn(() => {
      throw new Error('watcher failed');
    });

    vi.doMock('@zintrust/trace', () => ({
      CacheWatcher: {
        emit: throwingEmit,
      },
    }));

    const { SystemTraceBridge } = await import('@/trace/SystemTraceBridge');

    await expect(SystemTraceBridge.preload()).resolves.toBe(true);
    expect(() => SystemTraceBridge.emitCache('set', 'zt:key', 3)).not.toThrow();
  });
});
