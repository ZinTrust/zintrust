import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorHandler } from '@cli/ErrorHandler';

const envStrings: Record<string, string> = {
  DEBUGGER_ENABLED: 'true',
  DEBUGGER_DB_CONNECTION: 'default',
  DEBUGGER_BASE_PATH: '/debugger',
  HOST: '127.0.0.1',
  PORT: '7777',
};

const resolvedStorage = {
  prune: vi.fn(),
  clear: vi.fn(),
  stats: vi.fn(),
};

vi.mock('@cli/d1/WranglerConfig', () => ({
  WranglerConfig: {
    resolveD1Database: vi.fn(() => ({ status: 'missing' })),
    getDefaultD1DatabaseName: vi.fn(() => undefined),
    getD1MigrationsDir: vi.fn(() => '.wrangler/d1/migrations'),
  },
}));

vi.mock('@cli/d1/WranglerD1', () => ({
  WranglerD1: {
    executeSql: vi.fn(),
    applyMigrations: vi.fn(() => ''),
  },
}));

vi.mock('@cli/d1/D1SqlMigrations', () => ({
  D1SqlMigrations: {
    compileAndWrite: vi.fn(),
  },
}));

vi.mock('@common/ExternalServiceUtils', () => ({
  readEnvString: vi.fn((key: string) => envStrings[key] ?? ''),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/utils/DatabaseCliUtils', () => ({
  confirmProductionRun: vi.fn().mockResolvedValue(true),
  mapConnectionToOrmConfig: vi.fn((config: unknown) => config),
  parseRollbackSteps: vi.fn(() => 1),
}));

vi.mock('@config/database', () => ({
  databaseConfig: {
    default: 'analytics',
    connections: {
      analytics: {
        driver: 'sqlite',
        database: 'analytics.sqlite',
      },
      d1debug: {
        driver: 'd1',
        database: 'debugger.sqlite',
      },
    },
    migrations: { extension: 'ts' },
    getConnection: vi.fn(() => ({
      driver: 'sqlite',
      database: 'analytics.sqlite',
    })),
  },
}));

vi.mock('@orm/Database', () => ({
  Database: {
    create: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock('@orm/DatabaseAdapterRegistry', () => ({
  DatabaseAdapterRegistry: {
    has: vi.fn(() => true),
  },
}));

vi.mock('@migrations/Migrator', () => ({
  Migrator: {
    create: vi.fn(),
  },
}));

vi.mock('@node-singletons/module', () => ({
  createRequire: vi.fn(() => ({
    resolve: vi.fn(() => '/tmp/node_modules/@zintrust/system-debugger/migrations/index.js'),
  })),
}));

vi.mock('@zintrust/core', () => ({
  useDatabase: vi.fn(() => ({})),
}));

vi.mock('@zintrust/system-debugger', () => ({
  DebuggerConfig: {
    merge: vi.fn(() => ({ pruneAfterHours: 24, connection: 'default' })),
  },
  DebuggerStorage: {
    resolveStorage: vi.fn(() => resolvedStorage),
  },
}));

describe('DebuggerCommands', () => {
  afterEach(() => {
    envStrings.DEBUGGER_DB_CONNECTION = 'default';
    resolvedStorage.prune.mockReset();
    resolvedStorage.clear.mockReset();
    resolvedStorage.stats.mockReset();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prints debugger status with dashboard URL and entry counts', async () => {
    resolvedStorage.stats.mockResolvedValue({ query: 2, request: 5 });

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');
    const cmd = DebuggerCommands.createDebuggerStatusCommand();

    await cmd.execute({});

    expect(ErrorHandler.info).toHaveBeenCalledWith('Connection: analytics');
    expect(ErrorHandler.info).toHaveBeenCalledWith('Dashboard: http://127.0.0.1:7777/debugger');
    expect(ErrorHandler.info).toHaveBeenCalledWith('query: 2');
    expect(ErrorHandler.info).toHaveBeenCalledWith('request: 5');
  });

  it('uses DEBUGGER_DB_CONNECTION for debugger migrations when no explicit connection is provided', async () => {
    envStrings.DEBUGGER_DB_CONNECTION = 'd1debug';

    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');

    await DebuggerCommands.createDebuggerMigrateCommand().execute({
      local: true,
      database: 'debugger',
    });

    expect(WranglerD1.applyMigrations).toHaveBeenCalledWith({
      cmd: expect.any(Object),
      dbName: 'debugger',
      isLocal: true,
    });
    expect(ErrorHandler.success).toHaveBeenCalledWith('Debugger D1 migrations applied.');
  });

  it('runs debugger migration status against an explicit connection', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: vi.fn().mockResolvedValue([
        {
          name: '001_debugger_init',
          status: 'applied',
          applied: true,
          batch: 1,
          appliedAt: 'now',
        },
      ]),
      migrate: vi.fn(),
      fresh: vi.fn(),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn(),
    });

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');
    const cmd = DebuggerCommands.createDebuggerMigrateCommand();

    await cmd.execute({ status: true, connection: 'analytics' });

    expect(ErrorHandler.info).toHaveBeenCalledWith(expect.stringContaining('Adapter: sqlite'));
    expect(ErrorHandler.info).toHaveBeenCalledWith(
      expect.stringContaining('applied: 001_debugger_init')
    );
  });

  it('reads debugger status from Wrangler D1 JSON output', async () => {
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const { DebuggerConfig } = await import('@zintrust/system-debugger');
    vi.mocked(DebuggerConfig.merge).mockReturnValue({ pruneAfterHours: 24, connection: 'd1debug' });
    vi.mocked(WranglerD1.executeSql).mockReturnValue(
      `\u001b[32m[\n  {\n    "results": [\n      { "type": "query", "cnt": 4 },\n      { "type": "request", "cnt": 2 }\n    ]\n  }\n]\u001b[0m`
    );

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');
    const cmd = DebuggerCommands.createDebuggerStatusCommand();

    await cmd.execute({ connection: 'd1debug', local: true, database: 'debugger' });

    expect(WranglerD1.executeSql).toHaveBeenCalledWith({
      dbName: 'debugger',
      isLocal: true,
      sql: 'SELECT type, COUNT(*) as cnt FROM zin_debugger_entries GROUP BY type ORDER BY type',
    });
    expect(ErrorHandler.info).toHaveBeenCalledWith('query: 4');
    expect(ErrorHandler.info).toHaveBeenCalledWith('request: 2');
  });

  it('falls back to Wrangler table parsing and clears entries through D1', async () => {
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const { DebuggerConfig } = await import('@zintrust/system-debugger');
    vi.mocked(DebuggerConfig.merge).mockReturnValue({ pruneAfterHours: 24, connection: 'd1debug' });
    vi
      .mocked(WranglerD1.executeSql)
      .mockReturnValueOnce(['│ type │ cnt │', '│ query │ 3 │', '│ request │ 1 │'].join('\n'))
      .mockReturnValueOnce(`[
  {
    "results": [
      { "cnt": 7 }
    ]
  }
]`);

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');
    const statusCmd = DebuggerCommands.createDebuggerStatusCommand();
    await statusCmd.execute({ connection: 'd1debug', remote: true });

    const clearCmd = DebuggerCommands.createDebuggerClearCommand();
    await clearCmd.execute({ connection: 'd1debug', remote: true });

    expect(ErrorHandler.info).toHaveBeenCalledWith('query: 3');
    expect(ErrorHandler.info).toHaveBeenCalledWith('request: 1');
    expect(WranglerD1.executeSql).toHaveBeenLastCalledWith({
      dbName: 'zintrust_db',
      isLocal: false,
      sql: 'DELETE FROM zin_debugger_entries; SELECT changes() as cnt',
    });
    expect((await import('@config/logger')).Logger.info).toHaveBeenCalledWith(
      'Done - all entries cleared.'
    );
  });

  it('prunes entries through D1 and keeps exceptions when requested', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_800_000);
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const { DebuggerConfig } = await import('@zintrust/system-debugger');
    vi.mocked(DebuggerConfig.merge).mockReturnValue({ pruneAfterHours: 24, connection: 'd1debug' });
    vi.mocked(WranglerD1.executeSql).mockReturnValue(`[
  {
    "results": [
      { "cnt": 5 }
    ]
  }
]`);

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');
    const pruneCmd = DebuggerCommands.createDebuggerPruneCommand();

    await pruneCmd.execute({
      connection: 'd1debug',
      local: true,
      database: 'debugger',
      hours: '1',
      keepExceptions: true,
    });

    expect(WranglerD1.executeSql).toHaveBeenCalledWith({
      dbName: 'debugger',
      isLocal: true,
      sql: "DELETE FROM zin_debugger_entries WHERE created_at < -1800000 AND type != 'exception'; SELECT changes() as cnt",
    });
    expect((await import('@config/logger')).Logger.info).toHaveBeenCalledWith(
      'Done - removed 5 entries.'
    );

    nowSpy.mockRestore();
  });

  it('runs debugger migrations through Wrangler D1 apply flow', async () => {
    const { createRequire } = await import('@node-singletons/module');
    const { D1SqlMigrations } = await import('@cli/d1/D1SqlMigrations');
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');

    vi.mocked(createRequire).mockReturnValue({
      resolve: vi.fn(() => {
        throw new Error('package not installed locally');
      }),
    } as never);
    vi.mocked(WranglerD1.applyMigrations).mockReturnValue('applied debugger migrations');

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');
    const cmd = DebuggerCommands.createDebuggerMigrateCommand();

    await cmd.execute({ connection: 'd1debug', local: true, database: 'debugger' });

    expect(D1SqlMigrations.compileAndWrite).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      globalDir: `${process.cwd()}/packages/system-debugger/migrations`,
      extension: 'ts',
      includeGlobal: true,
      outputDir: `${process.cwd()}/.wrangler/d1/migrations`,
    });
    expect(WranglerD1.applyMigrations).toHaveBeenCalledWith({
      cmd: expect.any(Object),
      dbName: 'debugger',
      isLocal: true,
    });
    expect(ErrorHandler.info).toHaveBeenCalledWith('applied debugger migrations');
    expect(ErrorHandler.success).toHaveBeenCalledWith('Debugger D1 migrations applied.');
  });

  it('runs fresh, reset, rollback, and migrate branches for SQL-backed debugger migrations', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    const fresh = vi.fn().mockResolvedValue(undefined);
    const resetAll = vi.fn().mockResolvedValue(undefined);
    const rollbackLastBatch = vi.fn().mockResolvedValue({ rolledBack: 2 });
    const migrate = vi.fn().mockResolvedValue({ appliedNames: ['001_debugger_init'] });

    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: vi.fn().mockResolvedValue([]),
      migrate,
      fresh,
      resetAll,
      rollbackLastBatch,
    });

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');

    await DebuggerCommands.createDebuggerMigrateCommand().execute({ fresh: true });
    await DebuggerCommands.createDebuggerMigrateCommand().execute({ reset: true });
    await DebuggerCommands.createDebuggerMigrateCommand().execute({ rollback: true, step: '2' });
    await DebuggerCommands.createDebuggerMigrateCommand().execute({});

    expect(fresh).toHaveBeenCalled();
    expect(resetAll).toHaveBeenCalled();
    expect(rollbackLastBatch).toHaveBeenCalledWith(1);
    expect(migrate).toHaveBeenCalled();
    expect(ErrorHandler.success).toHaveBeenCalledWith('Debugger migrations applied (fresh).');
    expect(ErrorHandler.success).toHaveBeenCalledWith('Debugger migrations reset.');
    expect(ErrorHandler.success).toHaveBeenCalledWith('Debugger migrations rolled back (2).');
    expect(ErrorHandler.success).toHaveBeenCalledWith('Debugger migrations applied.');
  });

  it('throws a CLI error when the optional debugger package is unavailable', async () => {
    vi.resetModules();
    vi.doMock('@zintrust/system-debugger', () => {
      throw new Error('missing package');
    });

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');

    await expect(DebuggerCommands.createDebuggerStatusCommand().execute({})).rejects.toThrow(
      'Package "@zintrust/system-debugger" is not installed. Add it to your project first.'
    );
  });

  it('prints stored entries as zero when debugger storage is empty', async () => {
    resolvedStorage.stats.mockResolvedValue({});
    envStrings.DEBUGGER_BASE_PATH = 'debugger';
    vi.doMock('@zintrust/system-debugger', () => ({
      DebuggerConfig: {
        merge: vi.fn(() => ({ pruneAfterHours: 24, connection: 'default' })),
      },
      DebuggerStorage: {
        resolveStorage: vi.fn(() => resolvedStorage),
      },
    }));

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');

    await DebuggerCommands.createDebuggerStatusCommand().execute({});

    expect(ErrorHandler.info).toHaveBeenCalledWith('Dashboard: http://127.0.0.1:7777/debugger');
    expect(ErrorHandler.info).toHaveBeenCalledWith('Stored entries: 0');
  });

  it('prunes and clears entries through SQL storage for non-D1 connections', async () => {
    resolvedStorage.prune.mockResolvedValue(4);
    resolvedStorage.clear.mockResolvedValue(undefined);
    vi.doMock('@zintrust/system-debugger', () => ({
      DebuggerConfig: {
        merge: vi.fn(() => ({ pruneAfterHours: 24, connection: 'default' })),
      },
      DebuggerStorage: {
        resolveStorage: vi.fn(() => resolvedStorage),
      },
    }));

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');

    await DebuggerCommands.createDebuggerPruneCommand().execute({
      connection: 'analytics',
      hours: '2',
    });
    await DebuggerCommands.createDebuggerClearCommand().execute({ connection: 'analytics' });

    expect(resolvedStorage.prune).toHaveBeenCalledWith(7_200_000, false);
    expect(resolvedStorage.clear).toHaveBeenCalled();
    expect((await import('@config/logger')).Logger.info).toHaveBeenCalledWith(
      'Done - removed 4 entries.'
    );
    expect((await import('@config/logger')).Logger.info).toHaveBeenCalledWith(
      'Done - all entries cleared.'
    );
  });

  it('uses resolved Wrangler D1 database names and rejects ambiguous targets', async () => {
    const { WranglerConfig } = await import('@cli/d1/WranglerConfig');
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    vi.doMock('@zintrust/system-debugger', () => ({
      DebuggerConfig: {
        merge: vi.fn(() => ({ pruneAfterHours: 24, connection: 'd1debug' })),
      },
      DebuggerStorage: {
        resolveStorage: vi.fn(() => resolvedStorage),
      },
    }));
    vi.mocked(WranglerConfig.resolveD1Database).mockReturnValue({ status: 'resolved' } as never);
    vi.mocked(WranglerConfig.getDefaultD1DatabaseName).mockReturnValue('bound_db');
    vi.mocked(WranglerD1.executeSql).mockReturnValue('[]');

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');

    await DebuggerCommands.createDebuggerStatusCommand().execute({
      connection: 'd1debug',
      local: true,
    });

    expect(WranglerD1.executeSql).toHaveBeenCalledWith({
      dbName: 'bound_db',
      isLocal: true,
      sql: 'SELECT type, COUNT(*) as cnt FROM zin_debugger_entries GROUP BY type ORDER BY type',
    });

    vi.mocked(WranglerConfig.resolveD1Database).mockReturnValue({ status: 'ambiguous' } as never);

    await expect(
      DebuggerCommands.createDebuggerStatusCommand().execute({
        connection: 'd1debug',
        local: true,
      })
    ).rejects.toThrow('Multiple D1 targets are configured.');
  });

  it('prints no debugger migrations found when migration status is empty', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: vi.fn().mockResolvedValue([]),
      migrate: vi.fn(),
      fresh: vi.fn(),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn(),
    });

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');

    await DebuggerCommands.createDebuggerMigrateCommand().execute({
      status: true,
      connection: 'analytics',
    });

    expect(ErrorHandler.info).toHaveBeenCalledWith('No debugger migrations found.');
  });
});
