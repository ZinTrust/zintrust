import { describe, expect, it, vi } from 'vitest';

vi.doMock('@node-singletons/path', () => ({
  dirname: (p: string) => p,
}));

vi.doMock('@node-singletons/fs', () => {
  const api = {
    mkdirSync: vi.fn(),
    openSync: vi.fn(() => {
      const err = Object.assign(new Error('exists'), { code: 'EEXIST' });
      throw err;
    }),
    writeFileSync: vi.fn(),
    closeSync: vi.fn(),
    unlinkSync: vi.fn(),
  };

  return {
    ...api,
    default: api,
  };
});

describe('MigrationLock coverage', () => {
  it('throws when lock already exists', async () => {
    const { MigrationLock } = await import('@/migrations/MigrationLock');

    expect(() => MigrationLock.acquire('/tmp/lock')).toThrow('Migration lock already exists');
  });
});
