import { describe, expect, it, vi } from 'vitest';

const queueMock = {
  dequeue: vi.fn(),
  enqueue: vi.fn(),
  ack: vi.fn(),
};

const queueMonitorMetricsMock = {
  recordJob: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@zintrust/queue-monitor', () => ({
  createMetrics: vi.fn(() => queueMonitorMetricsMock),
}));

vi.mock('@zintrust/core/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zintrust/core/config')>();
  return {
    ...actual,
    appConfig: {
      prefix: 'zintrust-test',
    },
    workersConfig: {
      intervalMs: 5000,
    },
    queueConfig: {
      drivers: {},
      monitor: {
        enabled: false,
      },
    },
    Env: {
      SSE_HEARTBEAT_INTERVAL: 15000,
    },
  };
});

vi.mock('@zintrust/core/logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@zintrust/core/queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zintrust/core/queue')>();
  return {
    ...actual,
    JobStateTracker: {
      started: vi.fn().mockResolvedValue(undefined),
      completed: vi.fn().mockResolvedValue(undefined),
      failed: vi.fn().mockResolvedValue(undefined),
    },
    Queue: queueMock,
    TimeoutManager: undefined,
  };
});

vi.mock('@zintrust/core/workers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zintrust/core/workers')>();
  return {
    ...actual,
    workersConfig: {
      intervalMs: 5000,
    },
    NodeSingletons: {
      os: {
        cpus: () => [{ model: 'test', speed: 2400 }],
        totalmem: () => 8 * 1024 * 1024 * 1024,
        freemem: () => 4 * 1024 * 1024 * 1024,
        loadavg: () => [1, 1.5, 2],
      },
      path: {
        resolve: (...parts: string[]) => parts.join('/'),
      },
      module: {
        createRequire: vi.fn(() => ({
          resolve: vi.fn(() => '/mocked/path'),
        })),
      },
      createCipheriv: vi.fn(),
      createDecipheriv: vi.fn(),
      pbkdf2Sync: vi.fn(),
      randomBytes: vi.fn(() => Buffer.from('test')),
    },
  };
});

vi.mock('@zintrust/core/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zintrust/core/utils')>();
  return {
    ...actual,
    generateUuid: vi.fn(() => 'test-uuid'),
  };
});

vi.unmock('@zintrust/workers');

describe('createQueueWorker coverage', () => {
  it('processes one item using maxItems loop', async () => {
    const { Queue } = await import('@zintrust/core/queue');
    const queueDequeueMock = Queue.dequeue as any;
    queueDequeueMock
      .mockResolvedValueOnce({ id: '1', payload: { ok: true }, attempts: 0 })
      .mockResolvedValueOnce(undefined);

    const { createQueueWorker } = await import('@zintrust/workers');

    const worker = createQueueWorker({
      kindLabel: 'job',
      defaultQueueName: 'default',
      maxAttempts: 1,
      getLogFields: () => ({}),
      handle: async () => undefined,
    });

    const processed = await worker.runOnce({ maxItems: 1 });
    expect(processed).toBe(1);
  }, 30000);
});
