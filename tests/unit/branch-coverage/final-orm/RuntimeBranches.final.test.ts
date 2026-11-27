/* eslint-disable @typescript-eslint/no-explicit-any, no-empty-function */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  validation: { valid: true, errors: [] as any[], warnings: [] as any[] },
  startupQueue: undefined as any,
  runtimeConfig: {} as Record<string, unknown>,
  queueModuleDefault: undefined as any,
  workers: undefined as any,
  queueMonitor: undefined as any,
  optional: {} as Record<string, unknown>,
  cloudflareEnv: null as any,
  fsExists: false as boolean,
  cwd: '' as string,
  socketEnabled: false as boolean,
  socketRuntime: undefined as any,
  socketRoutes: undefined as any,
  socketRouteRegistrar: undefined as any,
  optionalCalls: {} as Record<string, number>,
  traceFirstMiss: false as boolean,
  gateway: undefined as any,
}));

vi.mock('@common/ExternalServiceUtils', () => ({
  readEnvString: vi.fn((key: string) => s.env[key] ?? ''),
}));

vi.mock('@/config', () => ({
  get appConfig() {
    return s.runtimeConfig['appConfig'] ?? { port: 7777, dockerWorker: false, worker: false };
  },
  get queueConfig() {
    return s.runtimeConfig['queueConfig'];
  },
  get cacheConfig() {
    return s.runtimeConfig['cacheConfig'] ?? {};
  },
  get databaseConfig() {
    return s.runtimeConfig['databaseConfig'] ?? { default: 'sqlite', connections: {} };
  },
  get storageConfig() {
    return s.runtimeConfig['storageConfig'] ?? {};
  },
}));

vi.mock('@runtime-config/queue', () => ({
  get default() {
    return s.queueModuleDefault;
  },
}));

vi.mock('@/health/StartupHealthChecks', () => ({
  StartupHealthChecks: { assertHealthy: vi.fn(async () => undefined) },
}));

vi.mock('@config/StartupConfigValidator', () => ({
  StartupConfigValidator: { validate: vi.fn(() => s.validation) },
}));

vi.mock('@runtime/StartupConfigFileRegistry', () => ({
  StartupConfigFile: {
    Middleware: 'Middleware',
    Cache: 'Cache',
    Database: 'Database',
    Queue: 'Queue',
    Storage: 'Storage',
    Mail: 'Mail',
    Broadcast: 'Broadcast',
    Notification: 'Notification',
  },
  StartupConfigFileRegistry: {
    clear: vi.fn(),
    preload: vi.fn(async () => undefined),
    get: vi.fn(() => s.startupQueue),
  },
}));

vi.mock('@config/features', () => ({ FeatureFlags: { initialize: vi.fn() } }));

vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getWorkersEnv: vi.fn(() => s.cloudflareEnv),
    getWorkersVar: vi.fn(() => null),
    getD1Binding: vi.fn(() => null),
    getKVBinding: vi.fn(() => null),
    getR2Binding: vi.fn(() => null),
  },
}));

vi.mock('@config/database', () => ({
  databaseConfig: { default: 'sqlite', connections: {} },
}));

vi.mock('@registry/registerRoute', () => ({
  registerMasterRoutes: vi.fn(async () => undefined),
  tryImportOptional: vi.fn(async (path: string) => {
    s.optionalCalls[path] = (s.optionalCalls[path] ?? 0) + 1;
    if (
      path === '@runtime/plugins/trace-runtime' &&
      s.traceFirstMiss &&
      s.optionalCalls[path] === 1
    ) {
      return undefined;
    }
    return s.optional[path];
  }),
}));

vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: vi.fn(),
}));
vi.mock('@tools/queue/QueueRuntimeRegistration', () => ({
  registerQueuesFromRuntimeConfig: vi.fn(async () => undefined),
}));
vi.mock('@cache/CacheRuntimeRegistration', () => ({
  registerCachesFromRuntimeConfig: vi.fn(),
}));
vi.mock('@tools/broadcast/BroadcastRuntimeRegistration', () => ({
  registerBroadcastersFromRuntimeConfig: vi.fn(),
}));
vi.mock('@tools/notification/NotificationRuntimeRegistration', () => ({
  registerNotificationChannelsFromRuntimeRegistration: vi.fn(),
  registerNotificationChannelsFromRuntimeConfig: vi.fn(),
}));
vi.mock('@tools/storage/StorageRuntimeRegistration', () => ({
  registerDisksFromRuntimeConfig: vi.fn(),
}));

vi.mock('@/runtime/WorkersModule', () => ({
  loadWorkersModule: vi.fn(async () => s.workers),
  loadQueueMonitorModule: vi.fn(async () => s.queueMonitor),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(() => s.fsExists),
  mkdirSync: vi.fn(),
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/broadcast', () => ({ default: {}, drivers: {} }));
vi.mock('@config/notification', () => ({ default: {}, drivers: {} }));

vi.mock('@sockets/SocketRuntime', () => ({
  SocketFeature: { getSettings: () => ({ enabled: s.socketEnabled }) },
}));
vi.mock('@sockets/SocketRuntimeRegistry', () => ({
  SocketRuntimeRegistry: {
    getRuntime: vi.fn(() => s.socketRuntime),
    registerRuntime: vi.fn((runtime: unknown) => {
      s.socketRuntime = runtime;
    }),
    getRouteRegistrar: vi.fn(() => s.socketRouteRegistrar ?? s.socketRoutes),
    registerRoutes: vi.fn((registrar: unknown) => {
      s.socketRouteRegistrar = registrar;
    }),
  },
}));

vi.mock('@/scheduler/ScheduleHttpGateway', () => ({
  ScheduleHttpGateway: { create: () => ({ registerRoutes: vi.fn() }) },
}));

vi.mock('@tools/queue/QueueReliabilityOrchestrator', () => ({
  QueueReliabilityOrchestrator: { stop: vi.fn() },
}));

const loadRuntime = async () => {
  vi.resetModules();
  const mod = await import('@boot/registry/runtime');
  return mod;
};

const makeLifecycle = async (overrides: Record<string, any> = {}) => {
  const { createLifecycle } = await loadRuntime();
  let booted = false;
  const shutdownManager = { run: vi.fn(async () => undefined), add: vi.fn() } as any;
  const lifecycle = createLifecycle({
    environment: 'production',
    resolvedBasePath: '/',
    router: {} as any,
    shutdownManager,
    getBooted: () => booted,
    setBooted: (value: boolean) => {
      booted = value;
    },
    ...overrides,
  });
  return { lifecycle, shutdownManager, isBooted: () => booted };
};

describe('runtime registry uncovered branches (final-orm)', () => {
  beforeEach(() => {
    s.env = {};
    s.validation = { valid: true, errors: [], warnings: [] };
    s.startupQueue = undefined;
    s.runtimeConfig = {};
    s.queueModuleDefault = undefined;
    s.workers = undefined;
    s.queueMonitor = undefined;
    s.optional = {};
    s.cloudflareEnv = null;
    s.fsExists = false;
    s.cwd = process.cwd();
    s.socketEnabled = false;
    s.socketRuntime = undefined;
    s.socketRoutes = undefined;
    s.socketRouteRegistrar = undefined;
    s.optionalCalls = {};
    s.traceFirstMiss = false;
    s.gateway = undefined;
    vi.spyOn(process, 'cwd').mockImplementation(() => s.cwd);
  });

  afterEach(() => {
    delete (globalThis as any).__zintrust_system_trace_plugin_requested__;
    delete (globalThis as any).__zintrust_system_trace_runtime__;
    delete (globalThis as any).CF;
    delete (globalThis as any).WebSocketPair;
    delete (globalThis as any).caches;
    vi.doUnmock('../../../../src/runtime/plugins/trace-runtime');
    vi.doUnmock('@zintrust/queue-redis');
    vi.doUnmock('@cache/Cache');
    vi.restoreAllMocks();
  });

  it('warns about startup configuration warnings and skips artifact setup in worker runtimes', async () => {
    s.validation.warnings = ['beware'];
    (globalThis as any).CF = {};
    const { lifecycle, isBooted } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    expect(isBooted()).toBe(true);
    const { Logger } = await import('@config/logger');
    expect(Logger.warn).toHaveBeenCalledWith(
      'Startup configuration warnings:',
      s.validation.warnings
    );
  });

  it('skips artifact directory creation when WebSocketPair or caches globals exist', async () => {
    (globalThis as any).WebSocketPair = function noop() {};
    const first = await makeLifecycle();
    await expect(first.lifecycle.boot()).resolves.toBeUndefined();

    delete (globalThis as any).WebSocketPair;
    (globalThis as any).caches = {};
    const second = await makeLifecycle();
    await expect(second.lifecycle.boot()).resolves.toBeUndefined();
  });

  it('falls back to queueConfig when the runtime queue module has no default export', async () => {
    s.runtimeConfig['queueConfig'] = { monitor: { enabled: false } };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
  });

  it('falls back to the default runtime config value when a config key is absent', async () => {
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
  });

  it('enables redis RPC when both the flag and URL are present', async () => {
    s.env['USE_REDIS_PROXY'] = 'true';
    s.env['REDIS_RPC_URL'] = 'http://redis.local';
    s.cloudflareEnv = {};
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
  });

  it('skips worker initialization when the workers module is unavailable', async () => {
    s.env['WORKER_ENABLED'] = 'true';
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
  });

  it('rejects invalid queue monitor module shapes', async () => {
    s.runtimeConfig['queueConfig'] = { monitor: { enabled: true } };
    s.queueMonitor = { unrelated: true };
    const first = await makeLifecycle();
    await expect(first.lifecycle.boot()).resolves.toBeUndefined();

    s.queueMonitor = { QueueMonitor: { create: undefined } };
    const second = await makeLifecycle();
    await expect(second.lifecycle.boot()).resolves.toBeUndefined();

    const { Logger } = await import('@config/logger');
    expect(Logger.warn).toHaveBeenCalledWith('Queue Monitor module not available');
    expect(Logger.warn).toHaveBeenCalledWith(
      'Queue Monitor module does not expose QueueMonitor.create'
    );
  });

  it('initializes a queue monitor with default base path and no persisted records', async () => {
    const registerRoutes = vi.fn();
    s.runtimeConfig['queueConfig'] = {
      monitor: { enabled: true },
      drivers: {
        redis: { host: 'redis', port: 6380, password: 'secret', database: 3 },
      },
    };
    s.queueMonitor = { QueueMonitor: { create: vi.fn(() => ({ registerRoutes })) } };
    s.workers = { WorkerFactory: { listPersistedRecords: vi.fn(async () => null) } };

    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    expect(registerRoutes).toHaveBeenCalled();

    const created = vi.mocked(s.queueMonitor.QueueMonitor.create).mock.calls[0]?.[0] as any;
    expect(created.redis).toEqual({
      host: 'redis',
      port: 6380,
      password: 'secret',
      db: 3,
    });
    expect(await created.knownQueues()).toEqual([]);
  });

  it('resolves a local queue redis entry and treats USE_ZEDGI as a silent fallback', async () => {
    s.env['WORKER_ENABLED'] = 'true';
    s.env['USE_ZEDGI'] = 'true';
    s.fsExists = true;
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
  });

  it('handles empty cwd and malformed queue http gateway module', async () => {
    s.env['WORKER_ENABLED'] = 'true';
    s.cwd = '   ';
    const first = await makeLifecycle();
    await expect(first.lifecycle.boot()).resolves.toBeUndefined();

    s.cwd = process.cwd();
    vi.doMock('@zintrust/queue-redis', () => ({ QueueHttpGateway: { create: undefined } }));
    const second = await makeLifecycle();
    await expect(second.lifecycle.boot()).resolves.toBeUndefined();
  });

  it('uses the trace base path default and strips a missing leading slash', async () => {
    (globalThis as any).__zintrust_system_trace_plugin_requested__ = true;
    s.env['TRACE_ENABLED'] = 'true';
    s.env['TRACE_AUTO_MOUNT'] = 'true';

    const registerTraceDashboard = vi.fn();
    s.optional['@runtime/plugins/trace-runtime'] = {
      isAvailable: () => true,
      ensureSystemTraceRegistered: vi.fn(async () => undefined),
      registerTraceDashboard,
    };

    const first = await makeLifecycle();
    await expect(first.lifecycle.boot()).resolves.toBeUndefined();
    expect(registerTraceDashboard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ basePath: '/trace' })
    );

    s.env['TRACE_BASE_PATH'] = 'dashboard';
    const second = await makeLifecycle();
    await expect(second.lifecycle.boot()).resolves.toBeUndefined();
    const lastCall = registerTraceDashboard.mock.calls.at(-1);
    expect(lastCall?.[1]).toEqual(expect.objectContaining({ basePath: '/dashboard' }));
  });

  it('continues when no trace bridge can be resolved', async () => {
    (globalThis as any).__zintrust_system_trace_plugin_requested__ = true;
    s.env['TRACE_ENABLED'] = 'true';
    s.env['TRACE_AUTO_MOUNT'] = 'true';
    vi.doMock('../../../../src/runtime/plugins/trace-runtime', () => {
      throw new Error('trace runtime unavailable');
    });
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    const { Logger } = await import('@config/logger');
    expect(Logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('no trace runtime bridge could be resolved')
    );
  });

  it('warns when the trace bridge cannot auto-mount dashboards', async () => {
    (globalThis as any).__zintrust_system_trace_plugin_requested__ = true;
    s.env['TRACE_ENABLED'] = 'true';
    s.env['TRACE_AUTO_MOUNT'] = 'true';
    s.optional['@runtime/plugins/trace-runtime'] = {
      isAvailable: () => true,
      ensureSystemTraceRegistered: vi.fn(async () => undefined),
    };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    const { Logger } = await import('@config/logger');
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('does not expose registerTraceDashboard')
    );
  });

  it('registers socket runtime and route registrar from the optional socket module', async () => {
    s.socketEnabled = true;
    s.socketRuntime = {
      isEnabled: () => true,
      describe: () => ({ transport: 'ws', path: '/socket' }),
    };
    s.socketRoutes = { registerRoutes: vi.fn() };
    s.optional['@zintrust/socket'] = {
      socketRuntime: s.socketRuntime,
      socketRouteRegistrar: s.socketRoutes,
    };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    expect(s.socketRoutes.registerRoutes).toHaveBeenCalled();

    delete s.optional['@zintrust/socket'];
    s.socketRoutes = undefined;
    const second = await makeLifecycle();
    await expect(second.lifecycle.boot()).resolves.toBeUndefined();
  });

  it('wraps non-Error socket route registration failures', async () => {
    s.socketEnabled = true;
    s.socketRuntime = {
      isEnabled: () => true,
      describe: () => ({ transport: 'ws', path: '/socket' }),
    };
    s.socketRoutes = {
      registerRoutes: () => {
        throw 'plain failure';
      },
    };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).rejects.toThrow(/plain failure/i);
  });

  it('finishes shutdown even when queue monitor close and hooks fail', async () => {
    s.runtimeConfig['queueConfig'] = { monitor: { enabled: true } };
    const close = vi.fn(async () => {
      throw new Error('close failed');
    });
    s.queueMonitor = { QueueMonitor: { create: () => ({ registerRoutes: vi.fn(), close }) } };
    const shutdownManager = { run: vi.fn(async () => { throw new Error('hook failed'); }), add: vi.fn() } as any;
    const { lifecycle, isBooted } = await makeLifecycle({ shutdownManager });
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    await expect(lifecycle.shutdown()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalled();
    expect(isBooted()).toBe(false);
  });

  it('resolves the trace bridge from the runtime alias after the first probe misses', async () => {
    (globalThis as any).__zintrust_system_trace_plugin_requested__ = true;
    s.env['TRACE_ENABLED'] = 'true';
    s.traceFirstMiss = true;
    const ensureSystemTraceRegistered = vi.fn(async () => undefined);
    s.optional['@runtime/plugins/trace-runtime'] = {
      isAvailable: () => true,
      ensureSystemTraceRegistered,
    };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    expect(ensureSystemTraceRegistered).toHaveBeenCalled();
  });

  it('registers worker routes when a worker runtime is available', async () => {
    s.env['WORKER_ENABLED'] = 'true';
    const registerWorkerRoutes = vi.fn();
    s.workers = { WorkerInit: {}, registerWorkerRoutes };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    expect(registerWorkerRoutes).toHaveBeenCalled();
  });

  it('resolves and skips a local queue redis gateway entry', async () => {
    s.env['WORKER_ENABLED'] = 'true';
    vi.doMock('@zintrust/queue-redis', () => {
      throw new Error('gateway package unavailable');
    });

    s.cwd = '';
    s.fsExists = true;
    const first = await makeLifecycle();
    await expect(first.lifecycle.boot()).resolves.toBeUndefined();

    s.cwd = '/project';
    s.fsExists = false;
    s.env['USE_ZEDGI'] = 'true';
    const second = await makeLifecycle();
    await expect(second.lifecycle.boot()).resolves.toBeUndefined();

    s.env['USE_ZEDGI'] = 'false';
    const third = await makeLifecycle();
    await expect(third.lifecycle.boot()).resolves.toBeUndefined();
  });

  it('keeps a discovered local queue redis gateway entry', async () => {
    s.env['WORKER_ENABLED'] = 'true';
    s.cwd = '/project';
    s.fsExists = true;
    vi.doMock('@zintrust/queue-redis', () => {
      throw new Error('gateway package unavailable');
    });
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
  });

  it('handles runtimes where the process global is absent', async () => {
    (globalThis as any).__zintrust_system_trace_plugin_requested__ = true;
    s.env['TRACE_ENABLED'] = 'true';
    s.env['WORKER_ENABLED'] = 'true';
    vi.doMock('@zintrust/queue-redis', () => {
      throw new Error('gateway package unavailable');
    });
    vi.stubGlobal('process', undefined);
    try {
      const { lifecycle } = await makeLifecycle();
      await expect(lifecycle.boot()).resolves.toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ignores reset hooks for modules without a reset export', async () => {
    vi.doMock('@cache/Cache', () => ({ Cache: { name: 'no-reset' } }));
    const { registerFrameworkShutdownHooks } = await loadRuntime();
    const hooks: Array<() => Promise<void>> = [];
    const shutdownManager = {
      add: vi.fn((hook: () => Promise<void>) => {
        hooks.push(hook);
      }),
      run: vi.fn(async () => undefined),
    } as any;

    registerFrameworkShutdownHooks(shutdownManager);
    await Promise.all(hooks.map((hook) => hook()));
    expect(hooks.length).toBeGreaterThan(0);
  });

  it('uses a leading slash for explicit trace base paths', async () => {
    (globalThis as any).__zintrust_system_trace_plugin_requested__ = true;
    s.env['TRACE_ENABLED'] = 'true';
    s.env['TRACE_AUTO_MOUNT'] = 'true';
    s.env['TRACE_BASE_PATH'] = '/custom-trace';
    s.env['TRACE_MIDDLEWARE'] = ' auth , trace ';
    const registerTraceDashboard = vi.fn();
    s.optional['@runtime/plugins/trace-runtime'] = {
      isAvailable: () => true,
      ensureSystemTraceRegistered: vi.fn(async () => undefined),
      registerTraceDashboard,
    };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    expect(registerTraceDashboard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        basePath: '/custom-trace',
        middleware: ['auth', 'trace'],
      })
    );
  });

  it('skips trace initialization when disabled and when the bridge is unavailable', async () => {
    (globalThis as any).__zintrust_system_trace_plugin_requested__ = true;
    const first = await makeLifecycle();
    await expect(first.lifecycle.boot()).resolves.toBeUndefined();

    s.env['TRACE_ENABLED'] = 'true';
    (globalThis as any).__zintrust_system_trace_runtime__ = {
      isAvailable: () => false,
      ensureSystemTraceRegistered: vi.fn(async () => undefined),
    };
    const second = await makeLifecycle();
    await expect(second.lifecycle.boot()).resolves.toBeUndefined();

    delete (globalThis as any).__zintrust_system_trace_runtime__;
    (globalThis as any).__zintrust_system_trace_runtime__ = {
      isAvailable: () => true,
      ensureSystemTraceRegistered: vi.fn(async () => undefined),
    };
    s.env['TRACE_PROXY'] = 'true';
    s.env['TRACE_PROXY_URL'] = 'https://trace.local';
    const third = await makeLifecycle();
    await expect(third.lifecycle.boot()).resolves.toBeUndefined();
  });

  it('registers optional socket runtime and registrar when none is cached', async () => {
    s.socketEnabled = true;
    const socketRuntime = {
      isEnabled: () => true,
      describe: () => ({ transport: 'ws', path: '/socket' }),
    };
    const registerRoutes = vi.fn();
    s.optional['@zintrust/socket'] = {
      socketRuntime,
      socketRouteRegistrar: { registerRoutes },
    };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    expect(registerRoutes).toHaveBeenCalled();
  });

  it('wraps Error instances thrown by socket route registration', async () => {
    s.socketEnabled = true;
    s.socketRuntime = {
      isEnabled: () => true,
      describe: () => ({ transport: 'ws', path: '/socket' }),
    };
    s.socketRoutes = {
      registerRoutes: () => {
        throw new Error('socket route failure');
      },
    };
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).rejects.toThrow(/socket route failure/i);
  });

  it('skips core dashboards in docker worker mode and supports repeated boot calls', async () => {
    s.env['DOCKER_WORKER'] = 'true';
    const { lifecycle } = await makeLifecycle();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    await expect(lifecycle.boot()).resolves.toBeUndefined();
  });

  it('clears config registry cache in development and rejects invalid startup config', async () => {
    const dev = await makeLifecycle({ environment: 'development' });
    await expect(dev.lifecycle.boot()).resolves.toBeUndefined();

    s.validation = { valid: false, errors: ['bad config'], warnings: [] };
    const invalid = await makeLifecycle();
    await expect(invalid.lifecycle.boot()).rejects.toThrow(/invalid startup configuration/i);
  });

  it('handles non-Error failures from queue monitor close and shutdown hooks', async () => {
    s.runtimeConfig['queueConfig'] = { monitor: { enabled: true } };
    s.queueMonitor = {
      QueueMonitor: {
        create: () => ({
          registerRoutes: vi.fn(),
          close: async () => {
            throw 'plain close failure';
          },
        }),
      },
    };
    const shutdownManager = {
      run: async () => {
        throw 'plain hook failure';
      },
      add: vi.fn(),
    } as any;
    const { lifecycle } = await makeLifecycle({ shutdownManager });
    await expect(lifecycle.boot()).resolves.toBeUndefined();
    await expect(lifecycle.shutdown()).resolves.toBeUndefined();
  });
});
