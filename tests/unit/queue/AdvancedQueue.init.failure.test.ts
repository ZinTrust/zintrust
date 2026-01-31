import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_key: string, defaultValue?: string) => defaultValue ?? ''),
    getInt: vi.fn((_key: string, defaultValue?: number) => defaultValue ?? 0),
    getBool: vi.fn((_key: string, defaultValue?: boolean) => defaultValue ?? false),
  },
}));

vi.mock('@exceptions/ZintrustError', () => ({
  createValidationError: (message: string) => new Error(message),
}));

vi.mock('@queue/LockProvider', () => ({
  createLockProvider: vi.fn(() => ({
    acquire: vi.fn(),
    release: vi.fn(),
    extend: vi.fn(),
    status: vi.fn(),
    list: vi.fn(),
  })),
  getLockProvider: vi.fn(() => undefined),
  registerLockProvider: vi.fn(),
}));

describe('AdvancedQueue initialization failures', () => {
  it('throws when lock provider cannot be initialized', async () => {
    const { createAdvancedQueue } = await import('@tools/queue/AdvancedQueue');

    expect(() => createAdvancedQueue({ name: 'init-fail-queue', lockProvider: 'missing' })).toThrow(
      'Failed to initialize lock provider: missing'
    );
  });
});
