import { describe, expect, it, vi } from 'vitest';

describe('Database config - strict env selection', () => {
  it('throws when DB_CONNECTION explicitly selects an unknown connection', async () => {
    vi.resetModules();

    vi.doMock('@config/env', () => {
      const Env = Object.freeze({
        get: (key: string, fallback = ''): string => {
          if (key === 'DB_CONNECTION') return 'unknown';
          return fallback;
        },
        getBool: (_key: string, fallback = false): boolean => fallback,
        getInt: (_key: string, fallback = 0): number => fallback,
        DB_DATABASE: ':memory:',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_USERNAME: 'u',
        DB_PASSWORD: 'p',
        DEBUG: false,
      });

      return { Env };
    });

    await expect(import('@config/database')).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'CONFIG_ERROR',
    });
  });
});
