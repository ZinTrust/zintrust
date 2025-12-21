import { ConnectionManager } from '@/orm/ConnectionManager';
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
    await expect(ConnectionManager.getConnection()).rejects.toThrow(
      'ConnectionManager not initialized'
    );
  });

  it('should initialize correctly', () => {
    const instance = ConnectionManager.getInstance(config);
    expect(instance).toBeDefined();
  });

  it('should return the same instance', () => {
    const instance1 = ConnectionManager.getInstance(config);
    const instance2 = ConnectionManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should get connection', async () => {
    const instance = ConnectionManager.getInstance();
    const conn = await instance.getConnection();
    expect(conn).toBeDefined();
    expect((conn as any).adapter).toBe('postgresql');
  });

  it('should get pool stats', () => {
    const stats = ConnectionManager.getPoolStats();
    expect(stats).toBeDefined();
    expect(stats.total).toBeGreaterThanOrEqual(0);
  });
});
