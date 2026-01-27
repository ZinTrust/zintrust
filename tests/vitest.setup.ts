// Global Vitest setup

import { vi } from 'vitest';

vi.mock('@zintrust/workers', () => ({
  createQueueWorker: () => ({
    processOne: async () => true,
    processAll: async () => true,
    startWorker: async () => true,
  }),
  BroadcastWorker: {
    processOne: async () => true,
  },
  NotificationWorker: {
    processOne: async () => true,
  },
  WorkerFactory: {
    list: () => [],
    listPersisted: async () => [],
    getHealth: async () => ({}),
    getMetrics: async () => ({}),
    stop: async () => undefined,
    restart: async () => undefined,
    start: async () => undefined,
  },
  WorkerRegistry: {
    status: () => null,
    start: async () => undefined,
  },
  HealthMonitor: {
    getSummary: () => [],
  },
  ResourceMonitor: {
    getCurrentUsage: () => ({
      cpu: 0,
      memory: { percent: 0, used: 0 },
      cost: { hourly: 0, daily: 0 },
    }),
  },
  registerWorkerRoutes: () => undefined,
  WorkerInit: {
    start: async () => undefined,
  },
  WorkerShutdown: {
    shutdownAll: async () => undefined,
  },
}));

// Ensure any import of '@zintrust/core' used in tests has a NodeSingletons.path
// so modules that access NodeSingletons.path at import-time don't throw.
vi.mock('@zintrust/core', async () => {
  const [actual, nodePath] = await Promise.all([
    vi.importActual('@zintrust/core'),
    import('node:path'),
  ]);
  return {
    ...(actual as Record<string, unknown>),
    NodeSingletons: {
      ...Object(actual).NodeSingletons, //NOSONAR
      path: (nodePath as { default?: unknown }).default ?? nodePath,
    },
  } as unknown;
});

// Global Redis/ioredis mocks to avoid real network calls in tests.
if (!(globalThis as any).__zintrustRedisMockState) {
  (globalThis as any).__zintrustRedisMockState = {
    mode: 'client' as 'client' | 'throw-create' | 'connect-fail' | 'no-connect',
    makeFakeRedisClient: () => {
      const store = new Map<string, string[]>();
      return {
        connect: async () => {},
        disconnect: async () => {},
        ping: async () => 'PONG',
        get: async (key: string) => store.get(key)?.[0] ?? null,
        set: async (key: string, value: string) => {
          store.set(key, [value]);
          return 'OK';
        },
        del: async (key: string) => {
          const existed = store.has(key);
          store.delete(key);
          return existed ? 1 : 0;
        },
        exists: async (key: string) => (store.has(key) ? 1 : 0),
        flushdb: async () => {
          store.clear();
          return 'OK';
        },
        on: () => {},
        off: () => {},
        once: () => {},
        emit: () => {},
        isOpen: true,
        isReady: true,
        status: 'ready',
      };
    },
  };
}
const redisMockState = (globalThis as any).__zintrustRedisMockState;

// Initialize ioredis mock state
if (!(globalThis as any).__zintrustIoredisMockState) {
  (globalThis as any).__zintrustIoredisMockState = {
    mode: 'client' as 'throw' | 'client',
  };
}
const ioredisMockState = (globalThis as any).__zintrustIoredisMockState;

vi.mock('redis', () => ({
  createClient: () => {
    if (redisMockState.mode === 'throw-create') {
      throw new Error('force import failure');
    }
    const client = redisMockState.makeFakeRedisClient();
    if (redisMockState.mode === 'connect-fail') {
      client.connect = async () => {
        throw new Error('connect failed');
      };
    }
    if (redisMockState.mode === 'no-connect') {
      delete (client as { connect?: () => Promise<void> }).connect;
    }
    return client;
  },
}));

vi.mock('ioredis', () => {
  const createClient = () => ({
    on: () => undefined,
    rpush: async () => 1,
    lpop: async () => null,
    llen: async () => 0,
    del: async () => 0,
    quit: async () => undefined,
    disconnect: async () => undefined,
  });

  const IORedisMock = function IORedisMock(this: unknown) {
    if (ioredisMockState.mode === 'throw') {
      throw new Error('force import failure');
    }
    const client = createClient();
    if (this && typeof this === 'object') {
      Object.assign(this as Record<string, unknown>, client);
      return this;
    }
    return client;
  } as unknown as new () => unknown;

  return {
    default: IORedisMock,
  };
});

// Provide a lightweight virtual `config/queue` module for tests that import
// app workers or controllers which may reference it.
vi.mock('config/queue', () => ({
  default: {
    drivers: {
      redis: { host: '127.0.0.1', port: 6379, db: 0, password: '', database: 0 },
    },
    monitor: {
      enabled: false,
      basePath: '/queue-monitor',
      middleware: [],
      autoRefresh: true,
      refreshIntervalMs: 5000,
    },
    queues: {},
  },
}));

vi.mock('packages/queue-monitor/src', () => ({
  createBullMQDriver: () => ({
    enqueue: async () => 'mock-job-id',
    close: async () => undefined,
  }),
}));

vi.mock('packages/queue-monitor/src/', () => ({
  default: {
    create: () => ({
      registerRoutes: () => undefined,
    }),
  },
}));

vi.mock('packages/telemetry-dashboard/src', () => ({
  TelemetryDashboard: {
    create: () => ({
      registerRoutes: () => undefined,
    }),
  },
}));

vi.mock('packages/queue-monitor/src/driver', () => ({}));
vi.mock('packages/db-mysql/src/register', () => ({}));
vi.mock('packages/db-postgres/src/register', () => ({}));
vi.mock('packages/queue-redis/src/register', () => ({}));

// Mock database adapter registry to match actual global structure
vi.mock('src/orm/DatabaseAdapterRegistry', () => {
  // Initialize the global registry property if it doesn't exist
  if (!(globalThis as any).__zintrust_db_adapter_registry__) {
    (globalThis as any).__zintrust_db_adapter_registry__ = new Map();
  }

  const registry = {
    adapters: (globalThis as any).__zintrust_db_adapter_registry__,
    register: (driver: string, factory: any) => {
      (globalThis as any).__zintrust_db_adapter_registry__.set(driver, factory);
    },
    get: (driver: string) => (globalThis as any).__zintrust_db_adapter_registry__.get(driver),
    has: (driver: string) => (globalThis as any).__zintrust_db_adapter_registry__.has(driver),
    clear: () => (globalThis as any).__zintrust_db_adapter_registry__.clear(),
    list: () => Array.from((globalThis as any).__zintrust_db_adapter_registry__.keys()),
  };

  return { DatabaseAdapterRegistry: registry };
});
