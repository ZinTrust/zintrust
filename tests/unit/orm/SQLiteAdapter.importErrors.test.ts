import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('SQLiteAdapter import error handling', () => {
  it('detects a missing package via the error message even when no code is present', async () => {
    vi.resetModules();

    vi.doMock('better-sqlite3', () => {
      return {
        get default() {
          throw new Error("Cannot find package 'better-sqlite3'");
        },
      } as any;
    });

    const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');
    const adapter = SQLiteAdapter.create({ driver: 'sqlite', database: ':memory:' } as any);

    await expect(adapter.connect()).rejects.toThrow(
      /SQLite adapter requires the 'better-sqlite3' package/
    );

    vi.doUnmock('better-sqlite3');
  });

  it('wraps non-missing import errors in a try/catch error', async () => {
    vi.resetModules();

    vi.doMock('better-sqlite3', () => {
      return {
        get default() {
          const err: any = new Error('boom');
          err.code = 'EACCES';
          throw err;
        },
      } as any;
    });

    const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');
    const adapter = SQLiteAdapter.create({ driver: 'sqlite', database: ':memory:' } as any);

    await expect(adapter.connect()).rejects.toThrow(/Failed to load SQLite driver/);

    vi.doUnmock('better-sqlite3');
  });
});
