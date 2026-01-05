import { describe, expect, it } from 'vitest';

import { databaseConfig } from '@config/database';

describe('src/config/database patch coverage', () => {
  it('falls back to sqlite when default is missing', () => {
    const fakeConfig = {
      default: 'missing',
      connections: {
        sqlite: { driver: 'sqlite', database: ':memory:' },
      },
    };

    const resolved = (databaseConfig.getConnection as any).call(fakeConfig);
    expect(resolved).toMatchObject({ driver: 'sqlite' });
  });

  it('falls back to first configured connection when sqlite is missing', () => {
    const fakeConfig = {
      default: 'missing',
      connections: {
        postgresql: { driver: 'postgresql', host: 'h', port: 5432, database: 'd' },
      },
    };

    const resolved = (databaseConfig.getConnection as any).call(fakeConfig);
    expect(resolved).toMatchObject({ driver: 'postgresql' });
  });

  it('throws when no connections are configured', () => {
    const fakeConfig = {
      default: 'missing',
      connections: {},
    };

    expect(() => (databaseConfig.getConnection as any).call(fakeConfig)).toThrow(
      /No database connections are configured/i
    );
  });
});
