import { describe, expect, it, vi, type Mock } from 'vitest';

import { aliasDatabaseConnection, useDatabase } from '@orm/Database';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';

vi.mock('@orm/Database');

describe('DatabaseRuntimeRegistration patch coverage (extra)', () => {
  it('covers default branch for unknown driver type (runtime safety)', () => {
    (useDatabase as Mock).mockReturnValue({});

    registerDatabasesFromRuntimeConfig({
      default: 'weird',
      connections: {
        weird: { driver: 'weird' } as any,
      },
      getConnection: () => ({ driver: 'weird' }) as any,
      logging: { enabled: false, level: 'debug' },
      migrations: { directory: '', extension: '.ts' },
      seeders: { directory: '' },
    } as any);

    expect((useDatabase as unknown as Mock).mock.calls).toEqual([
      [expect.objectContaining({ driver: 'weird' }), 'weird'],
    ]);
    expect(aliasDatabaseConnection).toHaveBeenCalledWith('default', 'weird');
  });

  it('throws when default connection is not configured', () => {
    (useDatabase as Mock).mockReturnValue({});

    expect(() =>
      registerDatabasesFromRuntimeConfig({
        default: 'missing',
        connections: {
          sqlite: { driver: 'sqlite', database: ':memory:' } as any,
        },
      } as any)
    ).toThrow(/Database default connection not configured/i);
  });
});
