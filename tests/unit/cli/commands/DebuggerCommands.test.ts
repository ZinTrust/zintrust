import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorHandler } from '@cli/ErrorHandler';
import { existsSync } from '@node-singletons/fs';
import { createRequire } from '@node-singletons/module';

const envStrings: Record<string, string> = {
  TRACE_ENABLED: 'true',
  TRACE_DB_CONNECTION: 'default',
  TRACE_BASE_PATH: '/trace',
  HOST: '127.0.0.1',
  PORT: '7777',
  APP_PORT: '',
};

const resolvedStorage = {
  prune: vi.fn(),
  clear: vi.fn(),
  stats: vi.fn(),
};

const mockTraceModule = (connection = 'default'): void => {
  vi.doMock('@zintrust/trace', () => ({
    TraceConfig: {
      merge: vi.fn(() => ({ pruneAfterHours: 24, connection })),
    },
    TraceStorage: {
      resolveStorage: vi.fn(() => resolvedStorage),
    },
  }));
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
        database: 'trace.sqlite',
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
    resolve: vi.fn(() => '/tmp/node_modules/@zintrust/trace/migrations/index.js'),
  })),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('@zintrust/core', () => ({
  useDatabase: vi.fn(() => ({})),
}));

vi.mock('@zintrust/trace', () => ({
  TraceConfig: {
    merge: vi.fn(() => ({ pruneAfterHours: 24, connection: 'default' })),
  },
  TraceStorage: {
    resolveStorage: vi.fn(() => resolvedStorage),
  },
}));

describe('TraceCommands', () => {
  afterEach(() => {
    envStrings['TRACE_DB_CONNECTION'] = 'default';
    envStrings['TRACE_BASE_PATH'] = '/trace';
    envStrings['APP_PORT'] = '';
    envStrings['PORT'] = '7777';
    resolvedStorage.prune.mockReset();
    resolvedStorage.clear.mockReset();
    resolvedStorage.stats.mockReset();
    vi.mocked(ErrorHandler.info).mockReset();
    vi.mocked(ErrorHandler.warn).mockReset();
    vi.mocked(ErrorHandler.success).mockReset();
    vi.mocked(ErrorHandler.debug).mockReset();
    vi.mocked(createRequire).mockReturnValue({
      resolve: vi.fn(() => '/tmp/node_modules/@zintrust/trace/migrations/index.js'),
    } as never);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prints trace status with dashboard URL and entry counts', async () => {
    resolvedStorage.stats.mockResolvedValue({ query: 2, request: 5 });

    const { TraceCommands } = await import('@cli/commands/TraceCommands');
    const cmd = TraceCommands.createTraceStatusCommand();

    await cmd.execute({});

    expect(ErrorHandler.info).toHaveBeenCalledWith('Connection: analytics');
    expect(ErrorHandler.info).toHaveBeenCalledWith(
      'Expected dashboard URL (if mounted): http://127.0.0.1:7777/trace'
    );
    expect(ErrorHandler.info).toHaveBeenCalledWith('query: 2');
    expect(ErrorHandler.info).toHaveBeenCalledWith('request: 5');
  });

  it('uses TRACE_DB_CONNECTION for trace migrations when no explicit connection is provided', async () => {
    envStrings['TRACE_DB_CONNECTION'] = 'd1debug';

    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await TraceCommands.createTraceMigrateCommand().execute({
      local: true,
      database: 'trace',
    });

    expect(WranglerD1.applyMigrations).toHaveBeenCalledWith({
      cmd: expect.any(Object),
      dbName: 'trace',
      isLocal: true,
    });
    expect(ErrorHandler.success).toHaveBeenCalledWith('Trace D1 migrations applied.');
  });

  it('runs trace migration status against an explicit connection', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: vi.fn().mockResolvedValue([
        {
          name: '001_trace_init',
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

    const { TraceCommands } = await import('@cli/commands/TraceCommands');
    const cmd = TraceCommands.createTraceMigrateCommand();

    await cmd.execute({ status: true, connection: 'analytics' });

    expect(ErrorHandler.info).toHaveBeenCalledWith(expect.stringContaining('Adapter: sqlite'));
    expect(ErrorHandler.info).toHaveBeenCalledWith(
      expect.stringContaining('applied: 001_trace_init')
    );
  });

  it('reads trace status from Wrangler D1 JSON output', async () => {
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const { TraceConfig } = await import('packages/trace/src');
    vi.mocked(TraceConfig.merge).mockReturnValue({
      pruneAfterHours: 24,
      connection: 'd1debug',
      enabled: false,
      ignoreRoutes: [],
      slowQueryThreshold: 0,
      logMinLevel: 'info',
      watchers: {
        request: undefined,
        query: undefined,
        exception: undefined,
        log: undefined,
        job: undefined,
        cache: undefined,
        schedule: undefined,
        mail: undefined,
        auth: undefined,
        event: undefined,
        model: undefined,
        notification: undefined,
        redis: undefined,
        gate: undefined,
        middleware: undefined,
        command: undefined,
        batch: undefined,
        dump: undefined,
        view: undefined,
        clientRequest: undefined,
      },
      redaction: {
        headers: [],
        body: [],
        query: [],
      },
    });
    vi.mocked(WranglerD1.executeSql).mockReturnValue(
      `\u001b[32m[\n  {\n    "results": [\n      { "type": "query", "cnt": 4 },\n      { "type": "request", "cnt": 2 }\n    ]\n  }\n]\u001b[0m`
    );

    const { TraceCommands } = await import('@cli/commands/TraceCommands');
    const cmd = TraceCommands.createTraceStatusCommand();

    await cmd.execute({ connection: 'd1debug', local: true, database: 'trace' });

    expect(WranglerD1.executeSql).toHaveBeenCalledWith({
      dbName: 'trace',
      isLocal: true,
      sql: 'SELECT type, COUNT(*) as cnt FROM zin_trace_entries GROUP BY type ORDER BY type',
    });
    expect(ErrorHandler.info).toHaveBeenCalledWith('query: 4');
    expect(ErrorHandler.info).toHaveBeenCalledWith('request: 2');
  });

  it('falls back to Wrangler table parsing and clears entries through D1', async () => {
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const { TraceConfig } = await import('packages/trace/src');
    vi.mocked(TraceConfig.merge).mockReturnValue({
      pruneAfterHours: 24,
      connection: 'd1debug',
      enabled: false,
      ignoreRoutes: [],
      slowQueryThreshold: 0,
      logMinLevel: 'info',
      watchers: {
        request: undefined,
        query: undefined,
        exception: undefined,
        log: undefined,
        job: undefined,
        cache: undefined,
        schedule: undefined,
        mail: undefined,
        auth: undefined,
        event: undefined,
        model: undefined,
        notification: undefined,
        redis: undefined,
        gate: undefined,
        middleware: undefined,
        command: undefined,
        batch: undefined,
        dump: undefined,
        view: undefined,
        clientRequest: undefined,
      },
      redaction: {
        headers: [],
        body: [],
        query: [],
      },
    });
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

    const { TraceCommands } = await import('@cli/commands/TraceCommands');
    const statusCmd = TraceCommands.createTraceStatusCommand();
    await statusCmd.execute({ connection: 'd1debug', remote: true });

    const clearCmd = TraceCommands.createTraceClearCommand();
    await clearCmd.execute({ connection: 'd1debug', remote: true });

    expect(ErrorHandler.info).toHaveBeenCalledWith('query: 3');
    expect(ErrorHandler.info).toHaveBeenCalledWith('request: 1');
    expect(WranglerD1.executeSql).toHaveBeenLastCalledWith({
      dbName: 'zintrust_db',
      isLocal: false,
      sql: 'DELETE FROM zin_trace_entries; SELECT changes() as cnt',
    });
    expect((await import('@config/logger')).Logger.info).toHaveBeenCalledWith(
      'Done - all entries cleared.'
    );
  });

  it('prunes entries through D1 and keeps exceptions when requested', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_800_000);
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const { TraceConfig } = await import('packages/trace/src');
    vi.mocked(TraceConfig.merge).mockReturnValue({
      pruneAfterHours: 24,
      connection: 'd1debug',
      enabled: false,
      ignoreRoutes: [],
      slowQueryThreshold: 0,
      logMinLevel: 'info',
      watchers: {
        request: undefined,
        query: undefined,
        exception: undefined,
        log: undefined,
        job: undefined,
        cache: undefined,
        schedule: undefined,
        mail: undefined,
        auth: undefined,
        event: undefined,
        model: undefined,
        notification: undefined,
        redis: undefined,
        gate: undefined,
        middleware: undefined,
        command: undefined,
        batch: undefined,
        dump: undefined,
        view: undefined,
        clientRequest: undefined,
      },
      redaction: {
        headers: [],
        body: [],
        query: [],
      },
    });
    vi.mocked(WranglerD1.executeSql).mockReturnValue(`[
  {
    "results": [
      { "cnt": 5 }
    ]
  }
]`);

    const { TraceCommands } = await import('@cli/commands/TraceCommands');
    const pruneCmd = TraceCommands.createTracePruneCommand();

    await pruneCmd.execute({
      connection: 'd1debug',
      local: true,
      database: 'trace',
      hours: '1',
      keepExceptions: true,
    });

    expect(WranglerD1.executeSql).toHaveBeenCalledWith({
      dbName: 'trace',
      isLocal: true,
      sql: "DELETE FROM zin_trace_entries WHERE created_at < -1800000 AND type != 'exception'; SELECT changes() as cnt",
    });
    expect((await import('@config/logger')).Logger.info).toHaveBeenCalledWith(
      'Done - removed 5 entries.'
    );

    nowSpy.mockRestore();
  });

  it('runs trace migrations through Wrangler D1 apply flow', async () => {
    const { D1SqlMigrations } = await import('@cli/d1/D1SqlMigrations');
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');

    vi.mocked(createRequire).mockReturnValue({
      resolve: vi.fn(() => {
        throw new Error('package not installed locally');
      }),
    } as never);
    vi.mocked(WranglerD1.applyMigrations).mockReturnValue('applied trace migrations');

    const { TraceCommands } = await import('@cli/commands/TraceCommands');
    const cmd = TraceCommands.createTraceMigrateCommand();

    await cmd.execute({ connection: 'd1debug', local: true, database: 'trace' });

    expect(D1SqlMigrations.compileAndWrite).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      globalDir: `${process.cwd()}/packages/trace/migrations`,
      extension: 'ts',
      includeGlobal: true,
      outputDir: `${process.cwd()}/.wrangler/d1/migrations`,
    });
    expect(WranglerD1.applyMigrations).toHaveBeenCalledWith({
      cmd: expect.any(Object),
      dbName: 'trace',
      isLocal: true,
    });
    expect(ErrorHandler.info).toHaveBeenCalledWith('applied trace migrations');
    expect(ErrorHandler.success).toHaveBeenCalledWith('Trace D1 migrations applied.');
  });

  it('runs fresh, reset, rollback, and migrate branches for SQL-backed trace migrations', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    const fresh = vi.fn().mockResolvedValue(undefined);
    const resetAll = vi.fn().mockResolvedValue(undefined);
    const rollbackLastBatch = vi.fn().mockResolvedValue({ rolledBack: 2 });
    const migrate = vi.fn().mockResolvedValue({ appliedNames: ['001_trace_init'] });

    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: vi.fn().mockResolvedValue([]),
      migrate,
      fresh,
      resetAll,
      rollbackLastBatch,
    });

    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await TraceCommands.createTraceMigrateCommand().execute({ fresh: true });
    await TraceCommands.createTraceMigrateCommand().execute({ reset: true });
    await TraceCommands.createTraceMigrateCommand().execute({ rollback: true, step: '2' });
    await TraceCommands.createTraceMigrateCommand().execute({});

    expect(fresh).toHaveBeenCalled();
    expect(resetAll).toHaveBeenCalled();
    expect(rollbackLastBatch).toHaveBeenCalledWith(1);
    expect(migrate).toHaveBeenCalled();
    expect(ErrorHandler.success).toHaveBeenCalledWith('Trace migrations applied (fresh).');
    expect(ErrorHandler.success).toHaveBeenCalledWith('Trace migrations reset.');
    expect(ErrorHandler.success).toHaveBeenCalledWith('Trace migrations rolled back (2).');
    expect(ErrorHandler.success).toHaveBeenCalledWith('Trace migrations applied.');
  });

  it('throws a CLI error when the optional trace package is unavailable', async () => {
    vi.resetModules();
    vi.doMock('@zintrust/trace', () => {
      throw new Error('missing package');
    });

    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await expect(TraceCommands.createTraceStatusCommand().execute({})).rejects.toThrow(
      'Package "@zintrust/trace" is not installed. Add it to your project first.'
    );
  });

  it('prints stored entries as zero when trace storage is empty', async () => {
    resolvedStorage.stats.mockResolvedValue({});
    envStrings['TRACE_BASE_PATH'] = 'trace';
    mockTraceModule();

    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await TraceCommands.createTraceStatusCommand().execute({});

    expect(ErrorHandler.info).toHaveBeenCalledWith(
      'Expected dashboard URL (if mounted): http://127.0.0.1:7777/trace'
    );
    expect(ErrorHandler.info).toHaveBeenCalledWith('Stored entries: 0');
  });

  it('falls back to APP_PORT and exposes provider command wiring', async () => {
    resolvedStorage.stats.mockResolvedValue({});
    envStrings['TRACE_BASE_PATH'] = 'internal-tools';
    envStrings['PORT'] = '';
    envStrings['APP_PORT'] = '8787';

    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await TraceCommands.createTraceStatusCommand().execute({});

    expect(ErrorHandler.info).toHaveBeenCalledWith(
      'Expected dashboard URL (if mounted): http://127.0.0.1:8787/internal-tools'
    );

    const statusCommand = TraceCommands.createTraceStatusCommand().getCommand();
    expect(statusCommand.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(['--local', '--remote', '--database'])
    );

    const providers = [
      TraceCommands.createTracePruneProvider(),
      TraceCommands.createTraceClearProvider(),
      TraceCommands.createTraceStatusProvider(),
      TraceCommands.createTraceMigrateProvider(),
    ];

    expect(providers.map((provider) => provider.name)).toEqual([
      'trace:prune',
      'trace:clear',
      'trace:status',
      'migrate:trace',
    ]);
    expect(providers.map((provider) => provider.getCommand().name())).toEqual([
      'trace:prune',
      'trace:clear',
      'trace:status',
      'migrate:trace',
    ]);
  });

  it('throws a packaging error when an installed trace package exposes TS-only migrations', async () => {
    vi.mocked(createRequire).mockReturnValue({
      resolve: vi.fn(() => '/tmp/node_modules/@zintrust/trace/migrations/index.ts'),
    } as never);
    vi.mocked(existsSync).mockReturnValue(false);

    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await expect(
      TraceCommands.createTraceMigrateCommand().execute({
        connection: 'analytics',
        status: true,
      })
    ).rejects.toThrow('Installed package "@zintrust/trace" exposes TypeScript-only migrations.');
  });

  it('prunes and clears entries through SQL storage for non-D1 connections', async () => {
    resolvedStorage.prune.mockResolvedValue(4);
    resolvedStorage.clear.mockResolvedValue(undefined);
    mockTraceModule();

    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await TraceCommands.createTracePruneCommand().execute({
      connection: 'analytics',
      hours: '2',
    });
    await TraceCommands.createTraceClearCommand().execute({ connection: 'analytics' });

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
    mockTraceModule('d1debug');
    vi.mocked(WranglerConfig.resolveD1Database).mockReturnValue({ status: 'resolved' } as never);
    vi.mocked(WranglerConfig.getDefaultD1DatabaseName).mockReturnValue('bound_db');
    vi.mocked(WranglerD1.executeSql).mockReturnValue('[]');

    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await TraceCommands.createTraceStatusCommand().execute({
      connection: 'd1debug',
      local: true,
    });

    expect(WranglerD1.executeSql).toHaveBeenCalledWith({
      dbName: 'bound_db',
      isLocal: true,
      sql: 'SELECT type, COUNT(*) as cnt FROM zin_trace_entries GROUP BY type ORDER BY type',
    });

    vi.mocked(WranglerConfig.resolveD1Database).mockReturnValue({ status: 'ambiguous' } as never);

    await expect(
      TraceCommands.createTraceStatusCommand().execute({
        connection: 'd1debug',
        local: true,
      })
    ).rejects.toThrow('Multiple D1 targets are configured.');
  });

  it('prints no trace migrations found when migration status is empty', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: vi.fn().mockResolvedValue([]),
      migrate: vi.fn(),
      fresh: vi.fn(),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn(),
    });

    const { TraceCommands } = await import('@cli/commands/TraceCommands');

    await TraceCommands.createTraceMigrateCommand().execute({
      status: true,
      connection: 'analytics',
    });

    expect(ErrorHandler.info).toHaveBeenCalledWith('No trace migrations found.');
  });
});
