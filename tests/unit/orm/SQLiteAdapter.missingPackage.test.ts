import { describe, expect, it, vi } from 'vitest';

describe('SQLiteAdapter better-sqlite3 missing', () => {
  it('throws a config error when better-sqlite3 is not available', async () => {
    vi.resetModules();

    vi.doMock('better-sqlite3', () => {
      return {
        get default() {
          const err: any = new Error("Cannot find package 'better-sqlite3'");
          err.code = 'ERR_MODULE_NOT_FOUND';
          throw err;
        },
      } as any;
    });

    const { SQLiteAdapter } = await import('@orm/adapters/SQLiteAdapter');

    const adapter = SQLiteAdapter.create({ driver: 'sqlite', database: ':memory:' } as any);

    await expect(adapter.connect()).rejects.toThrow(
      /SQLite adapter requires the 'better-sqlite3' package/
    );
  });
});
