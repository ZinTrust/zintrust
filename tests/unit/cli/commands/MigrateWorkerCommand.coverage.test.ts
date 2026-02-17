import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    handle: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/utils/DatabaseCliUtils', () => ({
  confirmProductionRun: vi.fn(async () => true),
  mapConnectionToOrmConfig: vi.fn(() => ({ driver: 'd1-remote' })),
  parseRollbackSteps: vi.fn(() => 1),
}));

const dbCreateSeenModes: Array<string | undefined> = [];

vi.mock('@orm/Database', () => ({
  Database: {
    create: vi.fn(() => {
      dbCreateSeenModes.push(process.env['D1_REMOTE_MODE']);
      return {
        connect: vi.fn(async () => undefined),
        disconnect: vi.fn(async () => undefined),
      };
    }),
  },
}));

vi.mock('@migrations/Migrator', () => ({
  Migrator: {
    create: vi.fn(() => ({
      migrate: vi.fn(async () => ({ appliedNames: [] })),
      status: vi.fn(async () => []),
      fresh: vi.fn(async () => undefined),
      resetAll: vi.fn(async () => undefined),
      rollbackLastBatch: vi.fn(async () => ({ rolledBack: 0 })),
    })),
  },
}));

vi.mock('@orm/DatabaseAdapterRegistry', () => ({
  DatabaseAdapterRegistry: { has: vi.fn(() => true) },
}));

vi.mock('@config/database', () => ({
  databaseConfig: {
    migrations: { extension: 'ts' },
    connections: {
      default: {
        driver: 'd1-remote',
        host: 'x',
        port: 0,
        database: 'x',
        username: 'x',
        password: 'x',
      },
    },
    getConnection: vi.fn(() => ({
      driver: 'd1-remote',
      host: 'x',
      port: 0,
      database: 'x',
      username: 'x',
      password: 'x',
    })),
  },
}));

import { MigrateWorkerCommand } from '@cli/commands/MigrateWorkerCommand';

describe('MigrateWorkerCommand (coverage extras)', () => {
  beforeEach(() => {
    dbCreateSeenModes.length = 0;
    vi.clearAllMocks();
    delete process.env['WORKER_PERSISTENCE_DB_CONNECTION'];
  });

  it('sets D1_REMOTE_MODE=sql for d1-remote and deletes it after when previously undefined', async () => {
    delete process.env['D1_REMOTE_MODE'];

    const cmd = MigrateWorkerCommand.create();
    await cmd.execute({ args: [], interactive: false, force: true });

    expect(dbCreateSeenModes[0]).toBe('sql');
    expect(process.env['D1_REMOTE_MODE']).toBeUndefined();
  });

  it('restores D1_REMOTE_MODE after d1-remote migrations when it was previously set', async () => {
    process.env['D1_REMOTE_MODE'] = 'registry';

    const cmd = MigrateWorkerCommand.create();
    await cmd.execute({ args: [], interactive: false, force: true });

    expect(dbCreateSeenModes[0]).toBe('sql');
    expect(process.env['D1_REMOTE_MODE']).toBe('registry');
  });
});
