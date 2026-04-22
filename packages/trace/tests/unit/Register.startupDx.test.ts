import { beforeEach, describe, expect, it, vi } from 'vitest';

const supportedDrivers = ['sqlite', 'postgresql', 'mysql', 'sqlserver', 'd1', 'd1-remote'] as const;

const state = vi.hoisted(() => ({
  createConfigError: vi.fn((message: string, details?: unknown) => {
    return Object.assign(new Error(message), {
      code: 'CONFIG_ERROR',
      details,
      name: 'ConfigError',
      statusCode: 500,
    });
  }),
  driver: 'sqlite',
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  noopRegister: vi.fn(),
  resolveStorage: vi.fn((db: unknown) => ({ db })),
  useDatabase: vi.fn(),
  wrapDiagnostics: vi.fn((storage: unknown) => storage),
  wrapFiltering: vi.fn((storage: unknown) => storage),
  wrapBudget: vi.fn((storage: unknown) => storage),
  wrapRedaction: vi.fn((storage: unknown) => storage),
}));

vi.mock('@zintrust/core', () => ({
  Env: {
    getBool: (key: string, fallback: boolean) => (key === 'TRACE_ENABLED' ? true : fallback),
    get: (key: string, fallback: string) => {
      if (key === 'TRACE_DB_CONNECTION') return state.driver;
      if (key === 'TRACE_QUERY_CONNECTION') return '';
      if (key === 'DB_CONNECTION') return state.driver;
      return fallback;
    },
    getInt: (_key: string, fallback: number) => fallback,
  },
  ErrorFactory: {
    createConfigError: state.createConfigError,
  },
  Logger: state.logger,
  RequestContext: undefined,
  StartupConfigFile: {},
  StartupConfigFileRegistry: {
    get: vi.fn(() => undefined),
  },
  useDatabase: (config?: unknown, connection?: string) => state.useDatabase(config, connection),
}));

vi.mock('../../src/storage', () => ({
  TraceStorage: {
    resolveStorage: state.resolveStorage,
  },
}));

vi.mock('../../src/storage/TraceEntryFiltering', () => ({
  TraceEntryFiltering: {
    wrapStorage: state.wrapFiltering,
  },
}));

vi.mock('../../src/storage/TraceContentRedaction', () => ({
  TraceContentRedaction: {
    wrapStorage: state.wrapRedaction,
  },
}));

vi.mock('../../src/storage/TraceContentBudget', () => ({
  TraceContentBudget: {
    wrapStorage: state.wrapBudget,
  },
}));

vi.mock('../../src/storage/TraceWriteDiagnostics', () => ({
  TraceWriteDiagnostics: {
    wrapStorage: state.wrapDiagnostics,
  },
}));

vi.mock('../../src/watchers/HttpWatcher', () => ({
  HttpWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/QueryWatcher', () => ({
  QueryWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/LogWatcher', () => ({ LogWatcher: { register: state.noopRegister } }));
vi.mock('../../src/watchers/ExceptionWatcher', () => ({
  ExceptionWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/JobWatcher', () => ({ JobWatcher: { register: state.noopRegister } }));
vi.mock('../../src/watchers/CacheWatcher', () => ({
  CacheWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/ScheduleWatcher', () => ({
  ScheduleWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/MailWatcher', () => ({
  MailWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/AuthWatcher', () => ({
  AuthWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/EventWatcher', () => ({
  EventWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/ModelWatcher', () => ({
  ModelWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/NotificationWatcher', () => ({
  NotificationWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/RedisWatcher', () => ({
  RedisWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/GateWatcher', () => ({
  GateWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/MiddlewareWatcher', () => ({
  MiddlewareWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/CommandWatcher', () => ({
  CommandWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/BatchWatcher', () => ({
  BatchWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/DumpWatcher', () => ({
  DumpWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/ViewWatcher', () => ({
  ViewWatcher: { register: state.noopRegister },
}));
vi.mock('../../src/watchers/HttpClientWatcher', () => ({
  HttpClientWatcher: { register: state.noopRegister },
}));

const clearRegisterGlobals = (): void => {
  delete (globalThis as Record<string, unknown>).__zintrust_system_trace_register_initialized__;
  delete (globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__;
};

const importRegister = async (): Promise<void> => {
  clearRegisterGlobals();
  vi.resetModules();
  await import('../../src/register');
};

const createDb = (driver: (typeof supportedDrivers)[number], error?: Error) => ({
  execute: vi.fn(async () => ({ affectedRows: 0 })),
  getType: () => driver,
  onAfterQuery: vi.fn(),
  offAfterQuery: vi.fn(),
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => {
    if (error !== undefined) throw error;
    return { ok: 1 };
  }),
});

describe('trace register startup DX', () => {
  beforeEach(() => {
    clearRegisterGlobals();
    vi.clearAllMocks();
  });

  it.each(supportedDrivers)(
    'fails fast for unresolved TRACE_DB_CONNECTION on %s',
    async (driver) => {
      state.driver = driver;
      state.useDatabase.mockReturnValue(undefined);

      await expect(importRegister()).rejects.toMatchObject({
        code: 'CONFIG_ERROR',
        name: 'ConfigError',
      });

      expect(state.createConfigError).toHaveBeenCalledWith(
        `Trace connection "${driver}" could not be resolved.`,
        expect.objectContaining({
          connectionName: driver,
          envKey: 'TRACE_DB_CONNECTION',
        })
      );
    }
  );

  it('tells eager startup imports to switch to @zintrust/trace/plugin when TRACE_DB_CONNECTION cannot resolve', async () => {
    state.driver = 'sqlite';
    state.useDatabase.mockReturnValue(undefined);

    await expect(importRegister()).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
      name: 'ConfigError',
    });

    expect(state.createConfigError).toHaveBeenCalledWith(
      'Trace connection "sqlite" could not be resolved.',
      expect.objectContaining({
        hint: expect.stringContaining('@zintrust/trace/plugin'),
      })
    );
  });

  it.each(supportedDrivers)('fails fast for missing trace migrations on %s', async (driver) => {
    state.driver = driver;
    const readinessError = new Error(`missing trace tables for ${driver}`);
    const db = createDb(driver, readinessError);
    state.useDatabase.mockReturnValue(db);

    await expect(importRegister()).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
      name: 'ConfigError',
    });

    expect(state.createConfigError).toHaveBeenCalledWith(
      `Trace storage connection "${driver}" is not ready. Create the database if needed and run \`zin migrate:trace\` before enabling TRACE_ENABLED.`,
      expect.objectContaining({
        connectionName: driver,
        error: readinessError,
        requiredTables: ['zin_trace_entries', 'zin_trace_entries_tags', 'zin_trace_monitoring'],
      })
    );
  });
});
