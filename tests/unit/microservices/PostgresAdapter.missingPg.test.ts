import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('Microservices PostgresAdapter missing pg', () => {
  it('throws a config error when pg is not available', async () => {
    vi.resetModules();

    vi.doMock('pg', () => {
      return {
        get Pool() {
          const err: any = new Error("Cannot find package 'pg'");
          err.code = 'ERR_MODULE_NOT_FOUND';
          throw err;
        },
      } as any;
    });

    const { PostgresAdapter } = await import('@microservices/PostgresAdapter');

    const adapter = PostgresAdapter.create({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      max: 1,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 1000,
      isolation: 'schema',
    } as any);

    await expect(adapter.connect()).rejects.toThrow(/PostgreSQL pool requires the 'pg' package/);

    vi.doUnmock('pg');
  });
});
