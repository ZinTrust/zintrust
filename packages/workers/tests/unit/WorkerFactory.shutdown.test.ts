import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const infoMock = vi.fn();
const warnMock = vi.fn();
const debugMock = vi.fn();
const errorMock = vi.fn();

const workerMetricsShutdown = vi.fn(async () => undefined);
const multiQueueWorkerShutdown = vi.fn(async () => undefined);
const complianceManagerShutdown = vi.fn(async () => undefined);
const priorityQueueShutdown = vi.fn(async () => undefined);
const clusterLockShutdown = vi.fn(async () => undefined);
const pluginManagerShutdown = vi.fn(async () => undefined);
const deadLetterQueueShutdown = vi.fn(async () => undefined);

const createDeferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const waitForCondition = async (predicate: () => boolean, attempts = 20): Promise<void> => {
  if (predicate()) return;
  if (attempts <= 0) {
    throw Object.assign(new Error('Condition not met in time'), {
      code: 'TEST_TIMEOUT',
    });
  }

  await Promise.resolve();
  await waitForCondition(predicate, attempts - 1);
};

vi.mock('@zintrust/core', () => ({
  Cloudflare: {},
  createRedisConnection: vi.fn(),
  databaseConfig: {},
  DatabaseConnectionRegistry: {},
  Env: {
    get: vi.fn(() => ''),
    getBool: vi.fn(() => false),
    getInt: vi.fn(() => 0),
  },
  ErrorFactory: {
    createGeneralError: (message: string, details?: unknown) =>
      Object.assign(new Error(message), { details }),
  },
  generateUuid: vi.fn(() => 'uuid'),
  getBullMQSafeQueueName: vi.fn((value: string) => value),
  isFunction: (value: unknown): value is (...args: unknown[]) => unknown =>
    typeof value === 'function',
  isNonEmptyString: (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0,
  isObject: (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null,
  JobStateTracker: {},
  Logger: {
    info: infoMock,
    warn: warnMock,
    debug: debugMock,
    error: errorMock,
  },
  NodeSingletons: {
    path: {
      join: (...parts: string[]) => parts.join('/'),
      sep: '/',
      dirname: (value: string) => value,
    },
    fs: {
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      existsSync: vi.fn(() => false),
    },
    url: {
      pathToFileURL: (value: string) => ({ href: `file://${value}` }),
    },
    module: {},
  },
  queueConfig: {},
  registerDatabasesFromRuntimeConfig: vi.fn(),
  useEnsureDbConnected: vi.fn(),
  workersConfig: {},
  ZintrustLang: {},
}));

vi.mock('bullmq', () => ({
  Worker: class {},
}));

vi.mock('../../src/AutoScaler', () => ({ AutoScaler: { stop: vi.fn() } }));
vi.mock('../../src/CanaryController', () => ({ CanaryController: { shutdown: vi.fn() } }));
vi.mock('../../src/CircuitBreaker', () => ({ CircuitBreaker: { shutdown: vi.fn() } }));
vi.mock('../../src/ClusterLock', () => ({ ClusterLock: { shutdown: clusterLockShutdown } }));
vi.mock('../../src/ComplianceManager', () => ({
  ComplianceManager: { shutdown: complianceManagerShutdown },
}));
vi.mock('../../src/DatacenterOrchestrator', () => ({
  DatacenterOrchestrator: { shutdown: vi.fn() },
}));
vi.mock('../../src/DeadLetterQueue', () => ({
  DeadLetterQueue: { shutdown: deadLetterQueueShutdown },
}));
vi.mock('../../src/HealthMonitor', () => ({ HealthMonitor: { shutdown: vi.fn() } }));
vi.mock('../../src/MultiQueueWorker', () => ({
  MultiQueueWorker: { shutdown: multiQueueWorkerShutdown },
}));
vi.mock('../../src/Observability', () => ({ Observability: { shutdown: vi.fn() } }));
vi.mock('../../src/PluginManager', () => ({ PluginManager: { shutdown: pluginManagerShutdown } }));
vi.mock('../../src/PriorityQueue', () => ({ PriorityQueue: { shutdown: priorityQueueShutdown } }));
vi.mock('../../src/ResourceMonitor', () => ({ ResourceMonitor: { stop: vi.fn() } }));
vi.mock('../../src/WorkerMetrics', () => ({ WorkerMetrics: { shutdown: workerMetricsShutdown } }));
vi.mock('../../src/WorkerRegistry', () => ({ WorkerRegistry: {} }));
vi.mock('../../src/WorkerVersioning', () => ({ WorkerVersioning: { shutdown: vi.fn() } }));
vi.mock('../../src/config/workerConfig', () => ({
  resolveWorkerKeyPrefix: vi.fn(() => 'workers:'),
}));
vi.mock('../../src/queueMonitorHistory', () => ({ recordQueueMonitorJob: vi.fn() }));
vi.mock('../../src/storage/WorkerStore', () => {
  const createStore = () => ({
    updateMany: vi.fn(async () => undefined),
  });

  return {
    DbWorkerStore: { create: vi.fn(createStore) },
    InMemoryWorkerStore: { create: vi.fn(createStore) },
    RedisWorkerStore: { create: vi.fn(createStore) },
  };
});

describe('WorkerFactory.shutdown', () => {
  beforeEach(() => {
    vi.resetModules();
    infoMock.mockClear();
    warnMock.mockClear();
    debugMock.mockClear();
    errorMock.mockClear();
    workerMetricsShutdown.mockClear().mockResolvedValue(undefined);
    multiQueueWorkerShutdown.mockClear().mockResolvedValue(undefined);
    complianceManagerShutdown.mockClear().mockResolvedValue(undefined);
    priorityQueueShutdown.mockClear().mockResolvedValue(undefined);
    clusterLockShutdown.mockClear().mockResolvedValue(undefined);
    pluginManagerShutdown.mockClear().mockResolvedValue(undefined);
    deadLetterQueueShutdown.mockClear().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for async tail shutdown steps before reporting completion', async () => {
    const clusterLockDeferred = createDeferred();
    const pluginManagerDeferred = createDeferred();

    clusterLockShutdown.mockReturnValueOnce(clusterLockDeferred.promise);
    pluginManagerShutdown.mockReturnValueOnce(pluginManagerDeferred.promise);

    const { WorkerFactory } = await import('../../src/WorkerFactory');

    const shutdownPromise = WorkerFactory.shutdown();
    await waitForCondition(
      () =>
        clusterLockShutdown.mock.calls.length === 1 && pluginManagerShutdown.mock.calls.length === 1
    );

    expect(infoMock).not.toHaveBeenCalledWith('WorkerFactory shutdown complete');

    clusterLockDeferred.resolve();
    expect(pluginManagerShutdown).toHaveBeenCalledTimes(1);
    expect(infoMock).not.toHaveBeenCalledWith('WorkerFactory shutdown complete');

    pluginManagerDeferred.resolve();
    await shutdownPromise;

    expect(deadLetterQueueShutdown).toHaveBeenCalledTimes(1);
    expect(infoMock).toHaveBeenCalledWith('WorkerFactory shutdown complete');
  });
});
