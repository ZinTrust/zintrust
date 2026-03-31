import { describe, expect, it, vi } from 'vitest';

describe('SystemDebuggerBridge', () => {
  it('returns false from preload when the optional package is unavailable', async () => {
    vi.resetModules();

    const { SystemDebuggerBridge } = await import('@/debugger/SystemDebuggerBridge');

    await expect(SystemDebuggerBridge.preload()).resolves.toBe(false);
    expect(() => SystemDebuggerBridge.emitCache('get', 'zt:key', 5, true)).not.toThrow();
  });

  it('loads the optional debugger package once and forwards watcher calls', async () => {
    vi.resetModules();

    let loadCount = 0;
    const cacheEmit = vi.fn();
    const eventEmit = vi.fn();

    vi.doMock('@zintrust/system-debugger', () => {
      loadCount += 1;

      return {
        CacheWatcher: { emit: cacheEmit },
        EventWatcher: { emit: eventEmit },
      };
    });

    const { SystemDebuggerBridge } = await import('@/debugger/SystemDebuggerBridge');

    await expect(SystemDebuggerBridge.preload()).resolves.toBe(true);

    SystemDebuggerBridge.emitCache('has', 'zt:users:1', 7, true);
    SystemDebuggerBridge.emitEvent('user.created', 2, { id: 1 });

    expect(loadCount).toBe(1);
    expect(cacheEmit).toHaveBeenCalledWith('has', 'zt:users:1', 7, true);
    expect(eventEmit).toHaveBeenCalledWith('user.created', 2, { id: 1 });
  });

  it('swallows watcher errors so core paths stay unaffected', async () => {
    vi.resetModules();
    const throwingEmit = vi.fn(() => {
      throw new Error('watcher failed');
    });

    vi.doMock('@zintrust/system-debugger', () => ({
      CacheWatcher: {
        emit: throwingEmit,
      },
    }));

    const { SystemDebuggerBridge } = await import('@/debugger/SystemDebuggerBridge');

    await expect(SystemDebuggerBridge.preload()).resolves.toBe(true);
    expect(() => SystemDebuggerBridge.emitCache('set', 'zt:key', 3)).not.toThrow();
  });
});
