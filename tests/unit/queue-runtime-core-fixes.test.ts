import { beforeEach, describe, expect, it, vi } from 'vitest';

const zedgiMocks = vi.hoisted(() => ({
  createZedgiClient: vi.fn(),
  call: vi.fn(),
}));

vi.mock('@zedgi/zedgi-client', () => ({
  createZedgiClient: zedgiMocks.createZedgiClient,
}));

describe('queue runtime core fixes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.QUEUE_CONNECTION;
    delete process.env.QUEUE_DRIVER;
    delete process.env.REDIS_RPC_URL;
    delete process.env.ZEDGI_URL;
    delete process.env.ZEDGI_KEY;
    delete process.env.ZEDGI_QUEUE_PROFILE;
    delete process.env.REDIS_QUEUE_DB;
    delete process.env.REDIS_PASSWORD;

    zedgiMocks.createZedgiClient.mockReturnValue({ call: zedgiMocks.call });
  });

  it('routes queue-zedgi worker pulls through direct Zedgi Redis BullMQ calls', async () => {
    process.env.QUEUE_CONNECTION = 'queue-zedgi';
    process.env.ZEDGI_URL = 'https://zedgi.example';
    process.env.ZEDGI_KEY = 'zk_test';
    process.env.ZEDGI_QUEUE_PROFILE = 'queue-db-4';
    zedgiMocks.call.mockResolvedValueOnce({
      id: 'job-1',
      name: 'send',
      data: { ok: true },
      attemptsMade: 1,
    });

    const { pullJob } = await import('@/worker-runtime/rpc-client');

    await expect(pullJob('emails', 30_000)).resolves.toEqual({
      id: 'job-1',
      name: 'send',
      payload: { ok: true },
      attempts: 1,
    });
    expect(zedgiMocks.call).toHaveBeenCalledWith(
      'redis',
      'bull:dequeue',
      { target: 'emails', visibilityTimeoutMs: 30_000 },
      { credential: 'queue-db-4' }
    );
  });

  it('does not call Redis RPC worker registry when queue-zedgi is active', async () => {
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

  it('keeps Redis RPC queue pulls unchanged when redis is active', async () => {
    process.env.QUEUE_CONNECTION = 'redis';
    process.env.REDIS_RPC_URL = 'https://rpc.example';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        result: { id: 'job-1', name: 'send', payload: { ok: true }, attempts: 0 },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { pullJob } = await import('@/worker-runtime/rpc-client');

    await expect(pullJob('emails', 30_000)).resolves.toEqual({
      id: 'job-1',
      name: 'send',
      payload: { ok: true },
      attempts: 0,
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      service: 'queue',
      method: 'dequeue',
      payload: { queueName: 'emails', visibilityTimeoutMs: 30_000 },
    });
  });
});
