import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | number>,
  createZedgiClient: vi.fn(),
  zedgiCall: vi.fn(),
  warn: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@config/env', () => ({
  Env: {
    get: (key: string, fallback: unknown = '') => {
      const value = mocks.env[key];
      return value === undefined ? fallback : String(value);
    },
    getInt: (key: string, fallback: number) => {
      const value = mocks.env[key];
      if (value === undefined) return fallback;
      const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    warn: mocks.warn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@zedgi/zedgi-client', () => ({
  createZedgiClient: mocks.createZedgiClient,
}));

type RpcClient = typeof import('@/worker-runtime/rpc-client');

const response = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});

const load = async (): Promise<RpcClient> => {
  vi.resetModules();
  mocks.createZedgiClient.mockReturnValue({ call: mocks.zedgiCall });
  return import('@/worker-runtime/rpc-client');
};

describe('worker-runtime/rpc-client uncovered branches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env = {};
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses WORKERS_REDIS_QUEUE_DB before the other queue db fallbacks', async () => {
    mocks.env = {
      REDIS_RPC_URL: 'https://rpc.example',
      WORKERS_REDIS_QUEUE_DB: '5',
      REDIS_QUEUE_DB: '4',
      REDIS_DB: '3',
    };
    mocks.fetch.mockResolvedValue(response({ ok: true, result: { id: 'j1', payload: 1 } }));

    const { pullJob } = await load();
    await pullJob('q', 1000);

    const body = JSON.parse(mocks.fetch.mock.calls[0]?.[1]?.body as string);
    expect(body.payload.db).toBe(5);
  });

  it('falls back to REDIS_DB when the worker and queue db keys are absent', async () => {
    mocks.env = { REDIS_RPC_URL: 'https://rpc.example', REDIS_DB: '7' };
    mocks.fetch.mockResolvedValue(response({ ok: true, result: { id: 'j1', payload: 1 } }));

    const { failJob } = await load();
    await failJob('q', 'j1', 'why');

    const body = JSON.parse(mocks.fetch.mock.calls[0]?.[1]?.body as string);
    expect(body.payload.db).toBe(7);
  });

  it('validates pull job ids for string, whitespace, finite and non-finite values', async () => {
    const { pullJob } = await load();
    mocks.env = { REDIS_RPC_URL: 'https://rpc.example' };

    mocks.fetch.mockResolvedValueOnce(response({ ok: true, result: { id: '  ', payload: 1 } }));
    await expect(pullJob('q', 1)).rejects.toThrow(/without an id/);

    mocks.fetch.mockResolvedValueOnce(response({ ok: true, result: { id: Number.NaN, payload: 1 } }));
    await expect(pullJob('q', 1)).rejects.toThrow(/without an id/);

    mocks.fetch.mockResolvedValueOnce(
      response({ ok: true, result: { id: 42, name: '  ', data: 2, attempts: 'nope' } })
    );
    await expect(pullJob('q', 1)).resolves.toEqual({
      id: '42',
      name: 'default',
      payload: 2,
      attempts: 0,
    });
  });

  it('handles null, primitive and array pull results', async () => {
    const { pullJob } = await load();
    mocks.env = { REDIS_RPC_URL: 'https://rpc.example' };

    mocks.fetch.mockResolvedValueOnce(response({ ok: true, result: null }));
    await expect(pullJob('q', 1)).resolves.toBeUndefined();

    mocks.fetch.mockResolvedValueOnce(response({ ok: true, result: 'not-an-object' }));
    await expect(pullJob('q', 1)).rejects.toThrow(/invalid job payload/);

    mocks.fetch.mockResolvedValueOnce(response({ ok: true, result: [] }));
    await expect(pullJob('q', 1)).rejects.toThrow(/invalid job payload/);
  });

  it('throws when a pulled job has neither payload nor data', async () => {
    mocks.env = { REDIS_RPC_URL: 'https://rpc.example' };
    mocks.fetch.mockResolvedValue(response({ ok: true, result: { id: 'j1' } }));

    const { pullJob } = await load();
    await expect(pullJob('q', 1)).rejects.toThrow(/without payload\/data/);
  });

  it('rejects a zedgi queue without a url/key and leaves out optional options', async () => {
    mocks.env = { QUEUE_CONNECTION: 'queue-zedgi' };
    const { pullJob } = await load();
    await expect(pullJob('q', 1)).rejects.toThrow(/requires ZEDGI_URL and ZEDGI_KEY/);

    mocks.env = {
      QUEUE_CONNECTION: 'queue-zedgi',
      ZEDGI_URL: 'https://zedgi.example',
      ZEDGI_KEY: 'key',
    };
    mocks.zedgiCall.mockResolvedValueOnce({ id: 'j1', payload: 1 });
    const second = await load();
    await second.ackJob('q', 'j1');
    expect(mocks.createZedgiClient).toHaveBeenCalledWith(
      expect.not.objectContaining({ signingSecret: expect.anything() })
    );
  });

  it('adds signing secret and public key options when configured', async () => {
    mocks.env = {
      QUEUE_CONNECTION: 'queue-zedgi',
      ZEDGI_URL: 'https://zedgi.example',
      ZEDGI_KEY: 'key',
      ZEDGI_SIGNING_SECRET: ' secret ',
      ZEDGI_PUBLIC_KEY: 'pk',
      ZEDGI_ACCOUNT_ID: 'acct',
      ZEDGI_KEY_VERSION: '7',
    };
    mocks.zedgiCall.mockResolvedValueOnce({ id: 'j1', payload: 1 });

    const { pullJob } = await load();
    await pullJob('q', 1);

    expect(mocks.createZedgiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        signingSecret: 'secret',
        publicKey: 'pk',
        accountId: 'acct',
        keyVersion: 7,
      })
    );
  });

  it('omits public key options when any credential part is missing', async () => {
    mocks.env = {
      QUEUE_CONNECTION: 'queue-zedgi',
      ZEDGI_URL: 'https://zedgi.example',
      ZEDGI_KEY: 'key',
      ZEDGI_PUBLIC_KEY: 'pk',
    };
    mocks.zedgiCall.mockResolvedValueOnce({ id: 'j1', payload: 1 });
    const first = await load();
    await first.pullJob('q', 1);
    expect(mocks.createZedgiClient).toHaveBeenCalledWith(
      expect.not.objectContaining({ publicKey: expect.anything() })
    );

    mocks.env['ZEDGI_ACCOUNT_ID'] = 'acct';
    mocks.zedgiCall.mockResolvedValueOnce({ id: 'j1', payload: 1 });
    const second = await load();
    await second.pullJob('q', 1);
    expect(mocks.createZedgiClient).toHaveBeenCalledWith(
      expect.not.objectContaining({ publicKey: expect.anything() })
    );
  });

  it('parses zedgi queue headers as objects, fallback text, primitives and arrays', async () => {
    const readCredentials = async (headerEnv: Record<string, string | number>) => {
      mocks.env = {
        QUEUE_CONNECTION: 'queue-zedgi',
        ZEDGI_URL: 'https://zedgi.example',
        ZEDGI_KEY: 'key',
        ZEDGI_QUEUE_PROFILE: 'prof',
        ...headerEnv,
      };
      mocks.zedgiCall.mockResolvedValueOnce({ id: 'j1', payload: 1 });
      const { pullJob } = await load();
      await pullJob('q', 1);
      const calls = mocks.createZedgiClient.mock.calls;
      return calls[calls.length - 1]?.[0] as {
        credentials: { redis: Record<string, { header?: unknown }> };
      };
    };

    expect((await readCredentials({ ZEDGI_QUEUE_HEADER: '{"tenant":"a"}' })).credentials.redis['prof']?.header).toEqual({ tenant: 'a' });
    expect((await readCredentials({ ZEDGI_QUEUE_HEADER: '{not json' })).credentials.redis['prof']?.header).toEqual({ value: '{not json' });
    expect((await readCredentials({ ZEDGI_REDIS_HEADER: '{"tenant":"b"}' })).credentials.redis['prof']?.header).toEqual({ tenant: 'b' });
    expect((await readCredentials({ ZEDGI_QUEUE_HEADER: '"just-a-string"' })).credentials.redis['prof']?.header).toBeUndefined();
    expect((await readCredentials({ ZEDGI_QUEUE_HEADER: '[1,2]' })).credentials.redis['prof']?.header).toBeUndefined();
    expect((await readCredentials({ ZEDGI_QUEUE_HEADER: 'null' })).credentials.redis['prof']?.header).toBeUndefined();
  });

  it('sends the rpc secret header and surfaces both error message shapes', async () => {
    mocks.env = { REDIS_RPC_URL: 'https://rpc.example', REDIS_RPC_SECRET: 'shared' };
    mocks.fetch.mockResolvedValueOnce(response({ ok: false, error: { message: 'remote boom' } }, false, 500));

    const { pullJob } = await load();
    await expect(pullJob('q', 1)).rejects.toThrow(/remote boom/);
    expect(mocks.fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-redis-rpc-secret': 'shared',
    });

    mocks.fetch.mockResolvedValueOnce(response({ ok: false }, false, 503));
    await expect(pullJob('q', 1)).rejects.toThrow(/Redis RPC queue.dequeue failed \(503\)/);

    mocks.fetch.mockResolvedValueOnce(response({ ok: false }, true, 200));
    await expect(pullJob('q', 1)).rejects.toThrow(/Redis RPC queue.dequeue failed \(200\)/);
  });

  it('covers redis-rpc ack/fail and the fail warning path', async () => {
    mocks.env = { REDIS_RPC_URL: 'https://rpc.example' };
    mocks.fetch.mockResolvedValue(response({ ok: true, result: null }));

    const { ackJob, failJob } = await load();
    await ackJob('q', 'j1', 42);
    await failJob('q', 'j1', 'reason');

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.fetch.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      service: 'queue',
      method: 'fail',
      payload: { queueName: 'q', jobId: 'j1', reason: 'reason' },
    });

    mocks.fetch.mockRejectedValueOnce(new Error('transport down'));
    await expect(failJob('q', 'j1', 'reason')).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith(
      '[worker-runtime] failJob RPC failed',
      expect.objectContaining({ queueName: 'q', jobId: 'j1' })
    );
  });

  it('maps zedgi bullmq errors for null, primitive, generic and status-code shapes', async () => {
    mocks.env = {
      QUEUE_CONNECTION: 'queue-zedgi',
      ZEDGI_URL: 'https://zedgi.example',
      ZEDGI_KEY: 'key',
    };

    const rejectWith = async (error: unknown, pattern: RegExp) => {
      mocks.zedgiCall.mockRejectedValueOnce(error);
      const { ackJob } = await load();
      await expect(ackJob('q', 'j1')).rejects.toThrow(pattern);
    };

    await rejectWith(null, /Zedgi queue consumer hook bull:ack/);
    await rejectWith('string failure', /Zedgi queue consumer hook bull:ack/);
    await rejectWith({ code: 123, statusCode: '404' }, /Zedgi queue consumer hook bull:ack/);
    await rejectWith(
      Object.assign(new Error('missing'), { statusCode: 404 }),
      /does not expose required queue consumer hook bull:ack/
    );

    mocks.zedgiCall.mockRejectedValueOnce({ code: 'ZEDGI_HOOK_NOT_FOUND' });
    const { failJob } = await load();
    await expect(failJob('q', 'j1', 'why')).rejects.toThrow(/does not expose required queue consumer hook bull:fail/);
  });

  it('lists redis-rpc workers and falls back for non-array results', async () => {
    mocks.env = { REDIS_RPC_URL: 'https://rpc.example' };
    mocks.fetch.mockResolvedValueOnce(
      response({ ok: true, result: [{ workerName: 'w1', queueName: 'q' }] })
    );
    mocks.fetch.mockResolvedValueOnce(response({ ok: true, result: 'not-an-array' }));

    const { listWorkers } = await load();
    await expect(listWorkers()).resolves.toEqual([{ workerName: 'w1', queueName: 'q' }]);
    await expect(listWorkers()).resolves.toEqual([]);
  });
});
