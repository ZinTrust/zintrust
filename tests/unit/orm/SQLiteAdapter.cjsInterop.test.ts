import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('SQLiteAdapter ESM/CJS interop branches', () => {
  it('falls back to using the module namespace as a constructor when default export is not a function', async () => {
    vi.resetModules();

    vi.doMock('better-sqlite3', () => {
      return { default: 123 } as any;
    });

    const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');
    const adapter = SQLiteAdapter.create({ driver: 'sqlite', database: ':memory:' } as any);

    await expect(adapter.connect()).rejects.toThrow(/constructor/i);

    vi.doUnmock('better-sqlite3');
  });
});
