import { beforeEach, describe, expect, it, vi } from 'vitest';

const zedgiMocks = vi.hoisted(() => ({
  createZedgiClient: vi.fn(),
  call: vi.fn(),
}));

vi.mock('@zedgi/zedgi-client', () => ({
  createZedgiClient: zedgiMocks.createZedgiClient,
}));

describe('worker-runtime/rpc-client (coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.REDIS_RPC_URL;
    delete process.env.REDIS_RPC_SECRET;
    delete process.env.QUEUE_CONNECTION;
    delete process.env.QUEUE_DRIVER;
    delete process.env.ZEDGI_URL;
    delete process.env.ZEDGI_KEY;
    delete process.env.ZEDGI_QUEUE_HEADER;
    delete process.env.ZEDGI_QUEUE_PROFILE;
    delete process.env.ZEDGI_REDIS_PROFILE;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_QUEUE_DB;
    delete process.env.WORKERS_REDIS_QUEUE_DB;

    zedgiMocks.createZedgiClient.mockReturnValue({ call: zedgiMocks.call });
  });

  it('isRedisRpcConfigured and call error when not configured', async () => {
    const { isRedisRpcConfigured, isWorkerQueueRuntimeConfigured, pullJob } = await import(
      '@/worker-runtime/rpc-client'
    );
    expect(isRedisRpcConfigured()).toBe(false);
    expect(isWorkerQueueRuntimeConfigured()).toBe(false);

    await expect(pullJob('q', 30000)).rejects.toThrow(/REDIS_RPC_URL is not configured/);
  });

  it('pullJob etc exercise RPC paths when configured (module load + isConfigured for coverage)', async () => {
    process.env.REDIS_RPC_URL = 'https://rpc.example';
    process.env.REDIS_RPC_SECRET = 's';

    const { isRedisRpcConfigured, isWorkerQueueRuntimeConfigured } = await import(
      '@/worker-runtime/rpc-client'
    );
    expect(isRedisRpcConfigured()).toBe(true);
    expect(isWorkerQueueRuntimeConfigured()).toBe(true);

    // Full calls covered in integration + transport tests; this ensures module + guard load for new code.
  });

  it('routes queue-zedgi pull/ack/fail through Zedgi BullMQ hooks', async () => {
    process.env.QUEUE_CONNECTION = 'queue-zedgi';
    process.env.QUEUE_DRIVER = 'redis';
    process.env.ZEDGI_URL = 'https://zedgi.example';
    process.env.ZEDGI_KEY = 'zk_test';
    process.env.REDIS_PASSWORD = 'secret';
    process.env.REDIS_QUEUE_DB = '2';
    process.env.ZEDGI_QUEUE_HEADER = '{"tenant":"app"}';
    process.env.ZEDGI_QUEUE_PROFILE = 'queue-db-2';
    zedgiMocks.call.mockResolvedValueOnce({
      id: 'job-1',
      name: 'send',
      data: { ok: true },
      attemptsMade: 2,
    });
    zedgiMocks.call.mockResolvedValueOnce(true);
    zedgiMocks.call.mockResolvedValueOnce(true);

    const { isWorkerQueueRuntimeConfigured, pullJob, ackJob, failJob } = await import(
      '@/worker-runtime/rpc-client'
    );

    expect(isWorkerQueueRuntimeConfigured()).toBe(true);
    await expect(pullJob('emails', 45000)).resolves.toEqual({
      id: 'job-1',
      name: 'send',
      payload: { ok: true },
      attempts: 2,
    });
    await ackJob('emails', 'job-1', { sent: true });
    await failJob('emails', 'job-2', 'boom');

    expect(zedgiMocks.createZedgiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: {
          redis: {
            'queue-db-2': {
              password: 'secret',
              db: 2,
              header: { tenant: 'app' },
            },
          },
        },
      })
    );
    expect(zedgiMocks.call).toHaveBeenCalledWith(
      'redis',
      'bull:dequeue',
      {
        target: 'emails',
        visibilityTimeoutMs: 45000,
      },
      { credential: 'queue-db-2' }
    );
    expect(zedgiMocks.call).toHaveBeenCalledWith(
      'redis',
      'bull:ack',
      {
        target: 'emails',
        args: ['job-1', { sent: true }],
      },
      { credential: 'queue-db-2' }
    );
    expect(zedgiMocks.call).toHaveBeenCalledWith(
      'redis',
      'bull:fail',
      {
        target: 'emails',
        args: ['job-2', 'boom'],
      },
      { credential: 'queue-db-2' }
    );
  });

  it('normalizes Redis RPC queue results and keeps the existing Redis RPC path', async () => {
    process.env.QUEUE_CONNECTION = 'redis';
    process.env.REDIS_RPC_URL = 'https://rpc.example';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        result: { id: 'job-1', name: 'send', payload: { ok: true }, attempts: 1 },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { pullJob } = await import('@/worker-runtime/rpc-client');

    await expect(pullJob('emails', 30000)).resolves.toEqual({
      id: 'job-1',
      name: 'send',
      payload: { ok: true },
      attempts: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      service: 'queue',
      method: 'dequeue',
      payload: { queueName: 'emails', visibilityTimeoutMs: 30000 },
    });
  });

  it('surfaces missing Zedgi consumer hooks as backend availability errors', async () => {
    process.env.QUEUE_CONNECTION = 'queue-zedgi';
    process.env.ZEDGI_URL = 'https://zedgi.example';
    process.env.ZEDGI_KEY = 'zk_test';
    const error = Object.assign(new Error('hook not found'), {
      code: 'ZEDGI_HOOK_NOT_FOUND',
      statusCode: 404,
    });
    zedgiMocks.call.mockRejectedValueOnce(error);

    const { pullJob } = await import('@/worker-runtime/rpc-client');

    await expect(pullJob('emails', 30000)).rejects.toThrow(
      /does not expose required queue consumer hook bull:dequeue/
    );
  });

  it('does not list Redis RPC worker registry records when queue-zedgi is active', async () => {
    process.env.QUEUE_CONNECTION = 'queue-zedgi';
    process.env.REDIS_RPC_URL = 'https://rpc.example';
    process.env.ZEDGI_URL = 'https://zedgi.example';
    process.env.ZEDGI_KEY = 'zk_test';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { listWorkers } = await import('@/worker-runtime/rpc-client');

    await expect(listWorkers()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
