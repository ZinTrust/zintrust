/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  envStrings: {} as Record<string, string>,
  traceConfig: { pruneAfterHours: 24, connection: '' as string | undefined },
  resolvedMigrationPath: '/pkg/trace/migrations/index.js' as string | (() => string),
  migrationFiles: [] as string[],
  databaseDefault: 'analytics' as string,
  connections: {
    analytics: { driver: 'sqlite', database: 'analytics.sqlite' },
    d1debug: { driver: 'd1', database: 'trace.sqlite' },
    other: { driver: 'custom-driver', database: 'custom.db' },
  } as Record<string, unknown>,
  wranglerStatus: 'missing' as string,
  wranglerDefaultName: undefined as string | undefined,
  d1Output: '[]' as string,
  applyOutput: '' as string,
  confirmProceed: true,
  adapterHas: false,
  migrator: {
    status: vi.fn(),
    migrate: vi.fn(),
    fresh: vi.fn(),
    resetAll: vi.fn(),
    rollbackLastBatch: vi.fn(),
  },
  storage: { prune: vi.fn(), clear: vi.fn(), stats: vi.fn() },
}));

vi.mock('@cli/d1/WranglerConfig', () => ({
  WranglerConfig: {
    resolveD1Database: () => ({ status: mocks.wranglerStatus }),
    getDefaultD1DatabaseName: () => mocks.wranglerDefaultName,
    getD1MigrationsDir: () => '.wrangler/d1/migrations',
  },
}));

vi.mock('@cli/d1/WranglerD1', () => ({
  WranglerD1: {
    executeSql: vi.fn(() => mocks.d1Output),
    applyMigrations: vi.fn(() => mocks.applyOutput),
  },
}));

vi.mock('@cli/d1/D1SqlMigrations', () => ({
  D1SqlMigrations: { compileAndWrite: vi.fn(async () => undefined) },
}));

vi.mock('@common/ExternalServiceUtils', () => ({
  readEnvString: (key: string) => mocks.envStrings[key] ?? '',
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    visible: { info: vi.fn(), warn: vi.fn(), success: vi.fn() },
  },
}));

vi.mock('@cli/utils/DatabaseCliUtils', () => ({
  confirmProductionRun: async () => mocks.confirmProceed,
  mapConnectionToOrmConfig: (config: unknown) => config,
  parseRollbackSteps: () => 1,
}));

vi.mock('@config/database', () => ({
  get databaseConfig() {
    return {
      default: mocks.databaseDefault,
      connections: mocks.connections,
      migrations: { extension: 'sql' },
      getConnection: () => ({ driver: 'sqlite', database: 'fallback.sqlite' }),
    };
  },
}));

vi.mock('@orm/Database', () => ({
  Database: {
    create: () => ({
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock('@orm/DatabaseAdapterRegistry', () => ({
  DatabaseAdapterRegistry: { has: () => mocks.adapterHas },
}));

vi.mock('@migrations/Migrator', () => ({
  Migrator: { create: () => mocks.migrator },
}));

vi.mock('@node-singletons/module', () => ({
  createRequire: () => ({
    resolve: (_id: string) =>
      typeof mocks.resolvedMigrationPath === 'function'
        ? mocks.resolvedMigrationPath()
        : mocks.resolvedMigrationPath,
  }),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (candidate: string) => mocks.migrationFiles.includes(candidate),
}));

vi.mock('@zintrust/trace', () => ({
  get TraceConfig() {
    return { merge: () => mocks.traceConfig };
  },
  TraceStorage: { resolveStorage: () => mocks.storage },
}));

const resetMigrator = (): void => {
  mocks.migrator.status.mockReset().mockResolvedValue([]);
  mocks.migrator.migrate.mockReset().mockResolvedValue({ appliedNames: [] });
  mocks.migrator.fresh.mockReset().mockResolvedValue(undefined);
  mocks.migrator.resetAll.mockReset().mockResolvedValue(undefined);
  mocks.migrator.rollbackLastBatch.mockReset().mockResolvedValue({ rolledBack: 1 });
};

describe('TraceCommands uncovered branch coverage', () => {
  const originalD1RemoteMode = process.env['D1_REMOTE_MODE'];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.envStrings = {
      TRACE_ENABLED: 'true',
      TRACE_DB_CONNECTION: 'analytics',
      TRACE_BASE_PATH: '/trace',
      HOST: '127.0.0.1',
      PORT: '7777',
      APP_PORT: '',
    };
    mocks.traceConfig = { pruneAfterHours: 24, connection: undefined };
    mocks.resolvedMigrationPath = '/pkg/trace/migrations/index.js';
    mocks.migrationFiles = [];
    mocks.databaseDefault = 'analytics';
    mocks.connections = {
      analytics: { driver: 'sqlite', database: 'analytics.sqlite' },
      d1debug: { driver: 'd1', database: 'trace.sqlite' },
      other: { driver: 'custom-driver', database: 'custom.db' },
    };
    mocks.wranglerStatus = 'missing';
    mocks.wranglerDefaultName = undefined;
    mocks.d1Output = '[]';
    mocks.applyOutput = '';
    mocks.confirmProceed = true;
    mocks.adapterHas = false;
    mocks.storage.prune.mockReset().mockResolvedValue(1);
    mocks.storage.clear.mockReset().mockResolvedValue(undefined);
    mocks.storage.stats.mockReset().mockResolvedValue({});
    resetMigrator();
    delete process.env['D1_REMOTE_MODE'];
  });

  afterEach(() => {
    if (originalD1RemoteMode === undefined) delete process.env['D1_REMOTE_MODE'];
    else process.env['D1_REMOTE_MODE'] = originalD1RemoteMode;
  });

  const load = async () => (await import('@cli/commands/TraceCommands')).TraceCommands;
  const visibleLines = async (): Promise<string[]> => {
    const { ErrorHandler } = await import('@cli/ErrorHandler');
    return [
      ...vi.mocked(ErrorHandler.info).mock.calls,
      ...vi.mocked(ErrorHandler.visible.info).mock.calls,
      ...vi.mocked(ErrorHandler.visible.success).mock.calls,
      ...vi.mocked(ErrorHandler.visible.warn).mock.calls,
    ]
      .flat()
      .map(String);
  };

  it('resolves dashboard defaults and empty trace-enabled values', async () => {
    mocks.envStrings['TRACE_BASE_PATH'] = '';
    mocks.envStrings['HOST'] = '';
    mocks.envStrings['PORT'] = '';
    mocks.envStrings['APP_PORT'] = '';
    mocks.envStrings['TRACE_ENABLED'] = '';

    const TraceCommands = await load();
    await TraceCommands.createTraceStatusCommand().execute({});

    const lines = await visibleLines();
    expect(lines).toContain('Trace enabled via env: false');
    expect(lines).toContain(
      'Expected dashboard URL (if mounted): http://127.0.0.1:7777/trace'
    );
  });

  it('resolves migration targets from compiled JS candidates and config extension', async () => {
    const TraceCommands = await load();

    const resolveFor = async (
      resolvedPath: string,
      files: string[],
      options: Record<string, unknown> = { connection: 'd1debug', local: true }
    ) => {
      mocks.resolvedMigrationPath = resolvedPath;
      mocks.migrationFiles = files;
      await TraceCommands.createTraceMigrateCommand().execute(options);
      const { D1SqlMigrations } = await import('@cli/d1/D1SqlMigrations');
      return vi.mocked(D1SqlMigrations.compileAndWrite).mock.calls.at(-1)?.[0];
    };

    expect(await resolveFor('/pkg/trace/migrations/index.ts', ['/pkg/trace/migrations/index.mjs']))
      .toMatchObject({ extension: 'mjs' });

    expect(await resolveFor('/pkg/trace/migrations/index.ts', ['/pkg/trace/migrations/index.cjs']))
      .toMatchObject({ extension: 'cjs' });

    expect(await resolveFor('/pkg/trace/migrations/index.json', [])).toMatchObject({
      extension: 'sql',
    });

    expect(
      await resolveFor('/pkg/trace/migrations/index.ts', ['/pkg/trace/migrations/index.js'])
    ).toMatchObject({ extension: 'js' });
  });

  it('uses D1 name fallbacks and falls back to the default connection', async () => {
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const TraceCommands = await load();

    mocks.wranglerStatus = 'resolved';
    mocks.wranglerDefaultName = undefined;
    await TraceCommands.createTraceStatusCommand().execute({
      connection: 'd1debug',
      local: true,
    });
    expect(vi.mocked(WranglerD1.executeSql)).toHaveBeenCalledWith(
      expect.objectContaining({ dbName: 'zintrust_db' })
    );

    mocks.wranglerStatus = 'missing';
    await TraceCommands.createTraceStatusCommand().execute({
      connection: 'unknown-connection',
      local: true,
    });
    expect((await visibleLines())).toContain('Connection: unknown-connection');
  });

  it('normalizes connection names using an empty runtime default', async () => {
    mocks.databaseDefault = '';
    mocks.envStrings['TRACE_DB_CONNECTION'] = '';

    const TraceCommands = await load();
    await TraceCommands.createTraceStatusCommand().execute({});
    await TraceCommands.createTraceStatusCommand().execute({ connection: 'default' });

    const lines = await visibleLines();
    expect(lines.filter((line) => line === 'Connection: default')).toHaveLength(2);
  });

  it('parses Wrangler outputs with ANSI escapes, short rows, and missing payloads', async () => {
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const TraceCommands = await load();

    mocks.d1Output = [
      '\u001bXignored',
      '│ type │ cnt │ extra │',
      '│ query │ 4 │',
      '\u001b[32m│ request │ nope │\u001b[0m',
    ].join('\n');
    await TraceCommands.createTraceStatusCommand().execute({
      connection: 'd1debug',
      local: true,
    });

    let lines = await visibleLines();
    expect(lines).toContain('query: 4');
    expect(lines).toContain('request: 0');

    mocks.d1Output = '[\n  {"results":[{"type":1,"cnt":7},{"type":"ok"}]}\n]';
    await TraceCommands.createTraceStatusCommand().execute({
      connection: 'd1debug',
      local: true,
    });
    lines = await visibleLines();
    expect(lines).toContain('ok: 0');

    mocks.d1Output = 'not json or a table';
    await TraceCommands.createTraceStatusCommand().execute({
      connection: 'd1debug',
      local: true,
    });
    expect(vi.mocked(WranglerD1.executeSql)).toHaveBeenCalledTimes(3);
  });

  it('falls back to zero for delete counts from tables and non-numeric JSON', async () => {
    const { Logger } = await import('@config/logger');
    const TraceCommands = await load();

    mocks.d1Output = '│ cnt │\n│ nope │';
    await TraceCommands.createTraceClearCommand().execute({
      connection: 'd1debug',
      local: true,
    });
    expect(Logger.info).toHaveBeenCalledWith('Done - all entries cleared.');

    mocks.d1Output = '[\n  {"results":[{"cnt":"5"}]}\n]';
    await TraceCommands.createTracePruneCommand().execute({
      connection: 'd1debug',
      local: true,
      hours: '1',
    });
    expect(Logger.info).toHaveBeenCalledWith('Done - removed 0 entries.');
  });

  it('warns about missing adapters and honours declined confirmation', async () => {
    const TraceCommands = await load();

    await TraceCommands.createTraceMigrateCommand().execute({ connection: 'other' });
    const lines = await visibleLines();
    expect(lines.some((line) => line.includes('Missing adapter for driver: custom-driver'))).toBe(
      true
    );

    mocks.confirmProceed = false;
    resetMigrator();
    await TraceCommands.createTraceMigrateCommand().execute({ connection: 'analytics' });
    expect(mocks.migrator.migrate).not.toHaveBeenCalled();
  });

  it('renders migration rows and empty results with fallback metadata', async () => {
    mocks.migrator.status.mockResolvedValueOnce([
      { name: '001_init', applied: true },
      { name: '002_next', status: 'pending', applied: false },
    ]);
    mocks.migrator.migrate.mockResolvedValueOnce({ appliedNames: [] });

    const TraceCommands = await load();
    await TraceCommands.createTraceMigrateCommand().execute({
      status: true,
      connection: 'analytics',
    });
    await TraceCommands.createTraceMigrateCommand().execute({ connection: 'analytics' });

    const lines = await visibleLines();
    expect(lines).toContain('applied: 001_init (batch=?, at=?)');
    expect(lines).toContain('pending: 002_next');
    expect(lines).toContain('No pending trace migrations.');
  });

  it('rejects destructive actions for D1 and restores D1_REMOTE_MODE', async () => {
    process.env['D1_REMOTE_MODE'] = 'remote';
    const TraceCommands = await load();

    for (const flag of ['fresh', 'reset', 'rollback']) {
      await expect(
        TraceCommands.createTraceMigrateCommand().execute({
          connection: 'd1debug',
          local: true,
          [flag]: true,
        })
      ).rejects.toThrow(/D1-backed trace migrations currently support apply only/);
      expect(process.env['D1_REMOTE_MODE']).toBe('remote');
    }

    await TraceCommands.createTraceMigrateCommand().execute({
      connection: 'analytics',
      remote: true,
    });
    expect(process.env['D1_REMOTE_MODE']).toBe('remote');
  });

  it('covers configured connections, empty payloads, and empty table cells', async () => {
    const { WranglerD1 } = await import('@cli/d1/WranglerD1');
    const TraceCommands = await load();

    mocks.databaseDefault = undefined as never;
    mocks.envStrings['TRACE_DB_CONNECTION'] = '';
    mocks.traceConfig = { pruneAfterHours: 24, connection: 'analytics' };
    await TraceCommands.createTraceStatusCommand().execute({});
    expect(await visibleLines()).toContain('Connection: analytics');

    mocks.traceConfig = { pruneAfterHours: 24, connection: undefined };
    await TraceCommands.createTraceStatusCommand().execute({});
    expect(await visibleLines()).toContain('Connection: default');

    mocks.d1Output = '[]';
    await TraceCommands.createTraceStatusCommand().execute({
      connection: 'd1debug',
      local: true,
    });
    expect(vi.mocked(WranglerD1.executeSql)).toHaveBeenCalled();

    mocks.d1Output = '│ type │ cnt │\n│  │ nope │';
    await TraceCommands.createTraceStatusCommand().execute({
      connection: 'd1debug',
      local: true,
    });

    mocks.d1Output = '[]';
    await TraceCommands.createTraceClearCommand().execute({
      connection: 'd1debug',
      local: true,
    });

    mocks.d1Output = '│ cnt │';
    await TraceCommands.createTracePruneCommand().execute({
      connection: 'd1debug',
      local: true,
    });

    mocks.migrator.status.mockResolvedValueOnce([{ name: '003_next', applied: false }]);
    await TraceCommands.createTraceMigrateCommand().execute({
      status: true,
      connection: 'analytics',
    });
    expect((await visibleLines())).toContain('pending: 003_next');
  });

  it('runs all configured connections and prints per-connection headers', async () => {
    mocks.envStrings['TRACE_DB_CONNECTION'] = '';
    mocks.migrator.migrate.mockResolvedValue({ appliedNames: ['001_init'] });

    const TraceCommands = await load();
    await TraceCommands.createTraceMigrateCommand().execute({ all: true, force: true });

    const lines = await visibleLines();
    expect(lines.some((line) => line.includes('--- Connection: analytics (sqlite) ---'))).toBe(true);
    expect(lines.some((line) => line.includes('--- Connection: d1debug (d1) ---'))).toBe(true);
    expect(lines.some((line) => line.includes('--- Connection: other (custom-driver) ---'))).toBe(
      true
    );
  });
});
