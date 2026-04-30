import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createConfigError,
  envGet,
  envGetBool,
  proxyCreate,
  useDatabase,
  queryWatcherRegister,
  noopRegister,
  resolveStorage,
  throwOnTraceStorageDb,
  wrapFiltering,
  wrapBudget,
  wrapRedaction,
  wrapDiagnostics,
} = vi.hoisted(() => ({
  envGetBool: vi.fn((key: string, fallback: boolean) =>
    key === 'TRACE_ENABLED' ? true : fallback
  ),
  envGet: vi.fn((key: string, fallback: string) => {
    if (key === 'TRACE_DB_CONNECTION') return 'trace';
    if (key === 'TRACE_QUERY_CONNECTION') return '';
    if (key === 'DB_CONNECTION') return 'primary';
    return fallback;
  }),
  throwOnTraceStorageDb: { value: false },
  useDatabase: vi.fn((_: unknown, connection?: string) => {
    if (connection === 'trace' && throwOnTraceStorageDb.value) {
      throw createConfigError('trace storage DB should not be resolved in proxy mode');
    }

    return {
      name: connection ?? 'default',
      onAfterQuery: vi.fn(),
      offAfterQuery: vi.fn(),
      queryOne: vi.fn(async () => ({ ok: 1 })),
    };
  }),
  createConfigError: vi.fn((message: string, details?: unknown) =>
    Object.assign(new Error(message), {
      code: 'CONFIG_ERROR',
      details,
      name: 'ConfigError',
      statusCode: 500,
    })
  ),
  queryWatcherRegister: vi.fn(),
  noopRegister: vi.fn(),
  proxyCreate: vi.fn((settings: unknown) => ({ settings })),
  resolveStorage: vi.fn((db: unknown) => ({ db })),
  wrapFiltering: vi.fn((storage: unknown) => storage),
  wrapBudget: vi.fn((storage: unknown) => storage),
  wrapRedaction: vi.fn((storage: unknown) => storage),
  wrapDiagnostics: vi.fn((storage: unknown) => storage),
}));

vi.mock('@zintrust/core', () => ({
  Env: {
    getBool: (key: string, fallback: boolean) => envGetBool(key, fallback),
    get: (key: string, fallback: string) => envGet(key, fallback),
    getInt: (_key: string, fallback: number) => fallback,
  },
  useDatabase,
  ErrorFactory: {
    createConfigError,
  },
  Logger: {
    warn: vi.fn(),
  },
  RequestContext: undefined,
  StartupConfigFile: {},
  StartupConfigFileRegistry: {
    get: vi.fn(() => undefined),
  },
}));

vi.mock('../../src/storage', () => ({
  ProxyTraceStorage: {
    create: proxyCreate,
  },
  TraceServiceTag: {
    wrapStorage: vi.fn((storage: unknown) => storage),
  },
  TraceStorage: {
    resolveStorage,
  },
}));

vi.mock('../../src/storage/TraceEntryFiltering', () => ({
  TraceEntryFiltering: {
    wrapStorage: wrapFiltering,
  },
}));

vi.mock('../../src/storage/TraceContentRedaction', () => ({
  TraceContentRedaction: {
    wrapStorage: wrapRedaction,
  },
}));

vi.mock('../../src/storage/TraceContentBudget', () => ({
  TraceContentBudget: {
    wrapStorage: wrapBudget,
  },
}));

vi.mock('../../src/storage/TraceWriteDiagnostics', () => ({
  TraceWriteDiagnostics: {
    wrapStorage: wrapDiagnostics,
  },
}));

vi.mock('../../src/watchers/HttpWatcher', () => ({ HttpWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/QueryWatcher', () => ({
  QueryWatcher: { register: queryWatcherRegister },
}));
vi.mock('../../src/watchers/LogWatcher', () => ({ LogWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/ExceptionWatcher', () => ({
  ExceptionWatcher: { register: noopRegister },
}));
vi.mock('../../src/watchers/JobWatcher', () => ({ JobWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/CacheWatcher', () => ({ CacheWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/ScheduleWatcher', () => ({
  ScheduleWatcher: { register: noopRegister },
}));
vi.mock('../../src/watchers/MailWatcher', () => ({ MailWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/AuthWatcher', () => ({ AuthWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/EventWatcher', () => ({ EventWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/ModelWatcher', () => ({ ModelWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/NotificationWatcher', () => ({
  NotificationWatcher: { register: noopRegister },
}));
vi.mock('../../src/watchers/RedisWatcher', () => ({ RedisWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/GateWatcher', () => ({ GateWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/MiddlewareWatcher', () => ({
  MiddlewareWatcher: { register: noopRegister },
}));
vi.mock('../../src/watchers/CommandWatcher', () => ({
  CommandWatcher: { register: noopRegister },
}));
vi.mock('../../src/watchers/BatchWatcher', () => ({ BatchWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/DumpWatcher', () => ({ DumpWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/ViewWatcher', () => ({ ViewWatcher: { register: noopRegister } }));
vi.mock('../../src/watchers/HttpClientWatcher', () => ({
  HttpClientWatcher: { register: noopRegister },
}));

describe('trace register connection wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    throwOnTraceStorageDb.value = false;
    envGetBool.mockImplementation((key: string, fallback: boolean) =>
      key === 'TRACE_ENABLED' ? true : fallback
    );
    envGet.mockImplementation((key: string, fallback: string) => {
      if (key === 'TRACE_DB_CONNECTION') return 'trace';
      if (key === 'TRACE_QUERY_CONNECTION') return '';
      if (key === 'DB_CONNECTION') return 'primary';
      return fallback;
    });
    delete (globalThis as Record<string, unknown>).__zintrust_system_trace_register_initialized__;
    delete (globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__;
  });

  it('uses the trace connection for storage and the app connection for SQL observation', async () => {
    const registerModule = await import('../../src/register');
    await registerModule.registerTraceReady;

    expect(useDatabase).toHaveBeenNthCalledWith(1, undefined, 'trace');
    expect(useDatabase).toHaveBeenNthCalledWith(2, undefined, 'primary');
    expect(resolveStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'trace',
      })
    );
    expect(wrapDiagnostics).toHaveBeenCalledWith(expect.anything(), {
      connectionName: 'trace',
      logger: expect.any(Object),
    });
    expect(queryWatcherRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        db: expect.objectContaining({
          name: 'primary',
        }),
      })
    );
  });

  it('skips sender-local trace DB resolution when proxy mode is enabled', async () => {
    throwOnTraceStorageDb.value = true;
    envGetBool.mockImplementation((key: string, fallback: boolean) => {
      if (key === 'TRACE_ENABLED') return true;
      if (key === 'TRACE_PROXY') return true;
      return fallback;
    });
    envGet.mockImplementation((key: string, fallback: string) => {
      if (key === 'TRACE_PROXY') return 'true';
      if (key === 'TRACE_DB_CONNECTION') return 'trace';
      if (key === 'TRACE_QUERY_CONNECTION') return '';
      if (key === 'DB_CONNECTION') return 'primary';
      if (key === 'TRACE_PROXY_URL') return 'https://trace.example.test';
      if (key === 'TRACE_PROXY_PATH') return '/zin/trace/write';
      if (key === 'TRACE_PROXY_KEY_ID') return 'trace-key';
      if (key === 'TRACE_PROXY_SECRET') return 'trace-secret';
      return fallback;
    });

    const registerModule = await import('../../src/register');
    await registerModule.registerTraceReady;

    expect(useDatabase).toHaveBeenCalledTimes(1);
    expect(useDatabase).toHaveBeenCalledWith(undefined, 'primary');
    expect(proxyCreate).toHaveBeenCalledWith({
      baseUrl: 'https://trace.example.test',
      path: '/zin/trace/write',
      keyId: 'trace-key',
      secret: 'trace-secret',
      timeoutMs: 30000,
    });
    expect(resolveStorage).not.toHaveBeenCalled();
  });
});
