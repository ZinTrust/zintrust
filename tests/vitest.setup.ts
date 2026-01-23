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
      ...(Object(actual).NodeSingletons ?? {}),
      path: (nodePath as { default?: unknown }).default ?? nodePath,
    },
  } as unknown;
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
