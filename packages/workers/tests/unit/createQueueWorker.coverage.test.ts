import { describe, expect, it, vi } from 'vitest';

const queueMock = {
  dequeue: vi.fn(),
  enqueue: vi.fn(),
  ack: vi.fn(),
};

vi.mock('@zintrust/core', () => ({
  appConfig: {
    prefix: 'zintrust-test',
  },
  workersConfig: {
    intervalMs: 5000,
  },
  Env: {
    SSE_HEARTBEAT_INTERVAL: 15000,
  },
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
  Queue: queueMock,
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
  generateUuid: vi.fn(() => 'test-uuid'),
}));

describe('createQueueWorker coverage', () => {
  it('processes one item using maxItems loop', async () => {
    vi.unmock('@zintrust/workers');
    const { Queue } = await import('@zintrust/core');
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
  });
});
