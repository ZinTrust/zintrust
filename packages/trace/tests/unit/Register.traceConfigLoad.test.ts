import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createConfigError: vi.fn((message: string, details?: unknown) => {
    return Object.assign(new Error(message), {
      code: 'CONFIG_ERROR',
      details,
      name: 'ConfigError',
      statusCode: 500,
    });
  }),
  httpRegister: vi.fn(),
  noopRegister: vi.fn(),
  startupConfigHas: vi.fn(() => true),
  startupConfigPreload: vi.fn(async () => undefined),
  resolveStorage: vi.fn((db: unknown) => ({ db })),
  startupConfigGet: vi.fn(() => undefined),
  useDatabase: vi.fn((_: unknown, connection?: string) => ({
    name: connection ?? 'default',
    execute: vi.fn(async () => ({ affectedRows: 0 })),
    getType: () => 'sqlite',
    onAfterQuery: vi.fn(),
    offAfterQuery: vi.fn(),
    query: vi.fn(async () => []),
    queryOne: vi.fn(async () => ({ ok: 1 })),
  })),
  wrapDiagnostics: vi.fn((storage: unknown) => storage),
  wrapFiltering: vi.fn((storage: unknown) => storage),
  wrapBudget: vi.fn((storage: unknown) => storage),
  wrapRedaction: vi.fn((storage: unknown) => storage),
}));

vi.mock('@zintrust/core', async () => {
  return {
    Env: {
      getBool: (key: string, fallback: boolean) => (key === 'TRACE_ENABLED' ? true : fallback),
      get: (key: string, fallback: string) => {
        if (key === 'TRACE_DB_CONNECTION') return 'trace';
        if (key === 'TRACE_QUERY_CONNECTION') return '';
        if (key === 'DB_CONNECTION') return 'primary';
        return fallback;
      },
      getInt: (_key: string, fallback: number) => fallback,
    },
    ErrorFactory: {
      createConfigError: state.createConfigError,
    },
    Logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    RequestContext: undefined,
    StartupConfigFile: {
      Trace: 'config/trace.ts',
    },
    StartupConfigFileRegistry: {
      has: (file: string) => state.startupConfigHas(file),
      preload: (files: readonly string[]) => state.startupConfigPreload(files),
      get: (file: string) => state.startupConfigGet(file),
    },
    useDatabase: (config?: unknown, connection?: string) => state.useDatabase(config, connection),
  };
});

vi.mock('../../src/storage', () => ({
  ProxyTraceStorage: {
    create: vi.fn((settings: unknown) => ({ settings })),
  },
  TraceServiceTag: {
    wrapStorage: vi.fn((storage: unknown) => storage),
  },
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
  HttpWatcher: { register: state.httpRegister },
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

describe('trace register startup config loading', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).__zintrust_system_trace_register_initialized__;
    delete (globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__;
    const traceConfigModule = await import('../../../../config/trace.ts');
    state.startupConfigHas.mockReturnValue(true);
    state.startupConfigGet.mockReturnValue(traceConfigModule.default);
  });

  it('uses ignorePaths from startup overrides when register initializes trace', async () => {
    expect(state.startupConfigGet('config/trace.ts')).toEqual(
      expect.objectContaining({ ignorePaths: ['/workers/events', '/queue-monitor', '.js', '.css'] })
    );

    await import('../../src/register');

    expect(state.httpRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          ignorePaths: ['/workers/events', '/queue-monitor', '.js', '.css'],
        }),
      })
    );
  });

  it('preloads trace startup overrides when the registry was not preloaded yet', async () => {
    state.startupConfigHas.mockReturnValue(false);

    await import('../../src/register');

    expect(state.startupConfigPreload).toHaveBeenCalledWith(['config/trace.ts']);
    expect(state.httpRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          ignorePaths: ['/workers/events', '/queue-monitor', '.js', '.css'],
        }),
      })
    );
  });
});
