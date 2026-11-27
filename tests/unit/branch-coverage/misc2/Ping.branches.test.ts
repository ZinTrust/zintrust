import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  const envValues: Record<string, string | boolean | undefined> = {};
  return {
    envValues,
    schedule: vi.fn(),
    ensureDraining: vi.fn(() => 'drain-task'),
    isDraining: vi.fn(() => false),
    isConfigured: vi.fn(() => true),
    warn: vi.fn(),
    fetch: vi.fn(),
  };
});

vi.mock('@config/env', () => ({
  Env: {
    get: (key: string, fallback = '') => mocked.envValues[key] ?? fallback,
    getBool: (key: string, fallback = false) => {
      const value = mocked.envValues[key];
      if (value === undefined) return fallback;
      return value === true || String(value).toLowerCase() === 'true';
    },
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { warn: (...args: unknown[]) => mocked.warn(...args) },
}));

vi.mock('@runtime/BackgroundTaskScheduler', () => ({
  BackgroundTaskScheduler: { schedule: (...args: unknown[]) => mocked.schedule(...args) },
}));

vi.mock('@worker-runtime/drain', () => ({
  ensureDraining: (...args: unknown[]) => (mocked.ensureDraining as (...a: any[]) => any)(...args),
  isDraining: () => mocked.isDraining(),
}));

vi.mock('@worker-runtime/rpc-client', () => ({
  isWorkerQueueRuntimeConfigured: () => mocked.isConfigured(),
}));

describe('worker-runtime/ping remaining branches', () => {
  beforeEach(() => {
    for (const key of Object.keys(mocked.envValues)) Reflect.deleteProperty(mocked.envValues, key);
    mocked.ensureDraining.mockClear();
    mocked.isDraining.mockReturnValue(false);
    mocked.isConfigured.mockReturnValue(true);
    mocked.warn.mockClear();
    mocked.schedule.mockClear();
    mocked.fetch.mockReset();
    vi.stubGlobal('fetch', mocked.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('triggerWorkerPing', () => {
    it('is a no-op when the worker queue runtime is not configured', async () => {
      mocked.isConfigured.mockReturnValue(false);
      const { triggerWorkerPing } = await import('@/worker-runtime/ping');
      await triggerWorkerPing([], []);
      expect(mocked.schedule).not.toHaveBeenCalled();
      expect(mocked.fetch).not.toHaveBeenCalled();
    });

    it('only wakes the local drain loop when this instance is the worker', async () => {
      const { triggerWorkerPing } = await import('@/worker-runtime/ping');

      mocked.envValues['WORKER_PING_URL'] = '   ';
      mocked.envValues['WORKER_ENABLED'] = 'false';
      await triggerWorkerPing([], []);
      expect(mocked.schedule).not.toHaveBeenCalled();

      mocked.envValues['WORKER_ENABLED'] = 'true';
      await triggerWorkerPing([{ queue: 'q' } as never], [{ name: 'm' } as never]);
      expect(mocked.ensureDraining).toHaveBeenCalled();
      expect(mocked.schedule).toHaveBeenCalledWith('drain-task');
    });

    it('POSTs a secret header only when a ping secret is configured', async () => {
      const { triggerWorkerPing } = await import('@/worker-runtime/ping');
      mocked.envValues['WORKER_PING_URL'] = 'https://worker.example/ping';
      mocked.envValues['WORKER_PING_SECRET'] = ' top-secret ';
      mocked.envValues['WAIT_FOR_PING'] = 'true';
      mocked.fetch.mockResolvedValue({ ok: true });

      await triggerWorkerPing([], []);

      expect(mocked.fetch).toHaveBeenCalledWith(
        'https://worker.example/ping',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-worker-ping-secret': 'top-secret',
          },
        })
      );
      expect(mocked.schedule).not.toHaveBeenCalled();
    });

    it('swallows remote ping failures while awaiting the ack', async () => {
      const { triggerWorkerPing } = await import('@/worker-runtime/ping');
      mocked.envValues['WORKER_PING_URL'] = 'https://worker.example/ping';
      mocked.envValues['WAIT_FOR_PING'] = 'true';
      mocked.fetch.mockRejectedValue(new Error('offline'));

      await expect(triggerWorkerPing([], [])).resolves.toBeUndefined();
      expect(mocked.warn).toHaveBeenCalledWith(
        '[worker-runtime] worker ping failed',
        expect.any(Error)
      );
    });

    it('schedules the fire-and-forget ack and omits an empty secret header', async () => {
      const { triggerWorkerPing } = await import('@/worker-runtime/ping');
      mocked.envValues['WORKER_PING_URL'] = 'https://worker.example/ping';
      mocked.envValues['WAIT_FOR_PING'] = 'false';
      let resolveFetch: (() => void) | undefined;
      mocked.fetch.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveFetch = resolve;
        })
      );

      await triggerWorkerPing([], []);

      const headers = mocked.fetch.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers).not.toHaveProperty('x-worker-ping-secret');
      expect(mocked.schedule).toHaveBeenCalledTimes(1);
      expect(typeof mocked.schedule.mock.calls[0]?.[0]).toBe('object');
      resolveFetch?.();
    });
  });

  describe('handlePing', () => {
    const makeRes = () => {
      const res = {
        status: 200,
        body: undefined as unknown,
        json(body: unknown) {
          this.body = body;
          return this;
        },
        setStatus(status: number) {
          this.status = status;
          return this;
        },
      };
      return res;
    };

    it('rejects a mismatched secret from a string or array header', async () => {
      const { handlePing } = await import('@/worker-runtime/ping');
      mocked.envValues['WORKER_PING_SECRET'] = 'expected';

      const first = makeRes();
      handlePing({ getHeader: () => 'wrong' }, first, [], []);
      expect(first.status).toBe(401);
      expect(first.body).toEqual({ ok: false, error: 'Invalid worker ping secret' });

      const second = makeRes();
      handlePing({ getHeader: () => ['wrong', 'expected'] }, second, [], []);
      expect(second.status).toBe(401);
      expect(mocked.schedule).not.toHaveBeenCalled();
    });

    it('accepts a matching array header and skips the check when no secret is configured', async () => {
      const { handlePing } = await import('@/worker-runtime/ping');
      mocked.envValues['WORKER_PING_SECRET'] = 'expected';
      mocked.envValues['WORKER_ENABLED'] = 'true';

      const first = makeRes();
      handlePing({ getHeader: () => ['expected', 'other'] }, first, [], []);
      expect(first.body).toEqual({ ok: true, status: 'awake', alreadyDraining: false });
      expect(mocked.schedule).toHaveBeenCalledWith('drain-task');

      mocked.envValues['WORKER_PING_SECRET'] = '';
      const second = makeRes();
      handlePing({ getHeader: () => undefined }, second, [], []);
      expect(second.body).toEqual({ ok: true, status: 'awake', alreadyDraining: false });
    });

    it('reports disabled when the worker is off or the queue runtime is unconfigured', async () => {
      const { handlePing } = await import('@/worker-runtime/ping');
      mocked.envValues['WORKER_PING_SECRET'] = '';

      const disabledWorker = makeRes();
      mocked.envValues['WORKER_ENABLED'] = 'false';
      handlePing({}, disabledWorker, [], []);
      expect(disabledWorker.body).toEqual({ ok: true, status: 'disabled' });

      const disabledQueue = makeRes();
      mocked.envValues['WORKER_ENABLED'] = 'true';
      mocked.isConfigured.mockReturnValue(false);
      handlePing({}, disabledQueue, [], []);
      expect(disabledQueue.body).toEqual({ ok: true, status: 'disabled' });
      expect(mocked.schedule).not.toHaveBeenCalled();
    });

    it('reports the pre-existing drain state when waking the worker', async () => {
      const { handlePing } = await import('@/worker-runtime/ping');
      mocked.envValues['WORKER_ENABLED'] = 'true';
      mocked.isDraining.mockReturnValue(true);
      const res = makeRes();

      handlePing({}, res, [], []);
      expect(res.body).toEqual({ ok: true, status: 'awake', alreadyDraining: true });
    });
  });
});
