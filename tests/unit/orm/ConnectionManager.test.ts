import { describe, expect, it, vi } from 'vitest';

// Mock Logger
vi.mock('@/config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ConnectionManager', () => {
  const loadConnectionManager = async (): Promise<
    typeof import('@/orm/ConnectionManager').ConnectionManager
  > => {
    vi.resetModules();
    const mod = await import('@/orm/ConnectionManager');
    return mod.ConnectionManager;
  };

  const config = {
    adapter: 'postgresql' as const,
    database: 'test_db',
    host: 'localhost',
    username: 'user',
    password: 'password', // NOSONAR
  };

  it('should throw if accessed before initialization', async () => {
    // We need to ensure instance is undefined.
    // Since we can't reset the module-level variable easily without reloading module,
    // we rely on this being the first test running in this file.
    // However, if other tests ran before, it might be initialized.
    // But vitest runs files in isolation usually.

    // Actually, let's just try to initialize it first to be safe for subsequent tests,
    // and maybe skip the "throw if not initialized" check if it's hard to guarantee state.
    // Or we can try to access it.

    // If I want to test the throw, I must ensure it's not initialized.
    // I'll assume it's fresh.
    const ConnectionManager = await loadConnectionManager();
    await expect(ConnectionManager.getConnection()).rejects.toThrow(
      'ConnectionManager not initialized'
    );
  });

  it('should initialize correctly', () => {
    // No async here; safe to use a fresh module instance each time.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    return (async () => {
      const ConnectionManager = await loadConnectionManager();
      const instance = ConnectionManager.getInstance(config);
      expect(instance).toBeDefined();
    })();
  });

  it('should return the same instance', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    return (async () => {
      const ConnectionManager = await loadConnectionManager();
      const instance1 = ConnectionManager.getInstance(config);
      const instance2 = ConnectionManager.getInstance();
      expect(instance1).toBe(instance2);
    })();
  });

  it('should get connection', async () => {
    const ConnectionManager = await loadConnectionManager();
    const instance = ConnectionManager.getInstance(config);
    const conn = await instance.getConnection();
    expect(conn).toBeDefined();
    expect((conn as any).adapter).toBe('postgresql');
  });

  it('should get pool stats', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    return (async () => {
      const ConnectionManager = await loadConnectionManager();
      ConnectionManager.getInstance(config);
      const stats = ConnectionManager.getPoolStats();
      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThanOrEqual(0);
    })();
  });

  it('should clear wait timeout when an idle connection becomes available', async () => {
    vi.useFakeTimers();

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const ConnectionManager = await loadConnectionManager();
    const instance = ConnectionManager.getInstance({ ...config, maxConnections: 1 });

    const conn1 = await instance.getConnection('c1');
    expect(conn1).toBeDefined();

    let rejected: unknown;
    const pending = instance.getConnection('c2').catch((err: unknown) => {
      rejected = err;
      throw err;
    });

    // Allow the wait loop to start
    await vi.advanceTimersByTimeAsync(150);
    expect(rejected).toBeUndefined();

    // Release first connection so it becomes idle and can be reused
    await instance.releaseConnection('c1');
    await vi.advanceTimersByTimeAsync(150);

    const conn2 = await pending;
    expect(conn2).toBeDefined();

    // If the timeout wasn't cleared, this would later trigger and reject.
    await vi.advanceTimersByTimeAsync(30000);
    expect(rejected).toBeUndefined();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
