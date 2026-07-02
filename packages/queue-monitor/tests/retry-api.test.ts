/* eslint-disable max-nested-callbacks */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const routerGet = vi.fn();
  const routerPost = vi.fn();

  return {
    routerGet,
    routerPost,
    currentDriver: {
      enqueue: vi.fn(async () => '1'),
      getJob: vi.fn(async () => undefined),
      getJobCounts: vi.fn(async () => ({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      })),
      getRecentJobs: vi.fn(async () => []),
      retryJob: vi.fn(async () => ({ ok: true as const, status: 'retried' as const })),
      recoverActiveJob: vi.fn(async () => ({ ok: true as const, status: 'failed' as const })),
      getQueues: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    },
    metrics: {
      recordJob: vi.fn(async () => undefined),
      getStats: vi.fn(async () => []),
      getRecentJobs: vi.fn(async () => []),
      getFailedJobs: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    },
  };
});

vi.mock('@zintrust/core/config', () => ({
  Env: {
    get: vi.fn((_key: string, fallback?: string) => fallback ?? ''),
    getInt: vi.fn((_key: string, fallback = 0) => fallback),
    getBool: vi.fn((_key: string, fallback = false) => fallback),
  },
  queueConfig: {
    monitor: { basePath: '/api', middleware: [] },
    drivers: {
      redis: { host: 'localhost', port: 6379, password: '', database: 0 },
    },
  },
}));

vi.mock('@zintrust/core/utils', () => ({
  isArray: Array.isArray,
  isNonEmptyString: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
}));

vi.mock('@zintrust/core/logger', () => ({
  Logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('@zintrust/core/workers', () => ({
  ShutdownTrace: {
    log: vi.fn(),
    logHandles: vi.fn(),
    logBullMQWorker: vi.fn(),
  },
}));

vi.mock('@zintrust/core/queue', () => ({
  resolveLockPrefix: vi.fn(() => 'zintrust'),
}));

vi.mock('@core-routes/Router', () => ({
  Router: {
    get: testState.routerGet,
    post: testState.routerPost,
  },
}));

vi.mock('../src/driver', () => ({
  createBullMQDriver: vi.fn(() => testState.currentDriver),
}));

vi.mock('../src/metrics', () => ({
  createMetrics: vi.fn(() => testState.metrics),
}));

vi.mock('../src/connection', () => ({
  createRedisConnection: vi.fn(() => ({
    scan: vi.fn(async () => ['0', []]),
    mget: vi.fn(async () => []),
    pipeline: vi.fn(() => ({ exec: vi.fn(async () => []) })),
    quit: vi.fn(async () => undefined),
    disconnect: vi.fn(),
  })),
}));

import { QueueMonitor } from '../src/index';

type JsonResponse = {
  statusCode: number;
  payload: unknown;
  res: {
    status: (code: number) => { json: (data: unknown) => void };
    json: (data: unknown) => void;
  };
};

function createJsonResponse(): JsonResponse {
  const result = { statusCode: 200, payload: undefined as unknown };

  return {
    res: {
      status(code: number) {
        result.statusCode = code;
        return {
          json(data: unknown) {
            result.payload = data;
          },
        };
      },
      json(data: unknown) {
        result.payload = data;
      },
    },
    get statusCode() {
      return result.statusCode;
    },
    get payload() {
      return result.payload;
    },
  };
}

function getRetryHandler() {
  const route = testState.routerPost.mock.calls.find((call) =>
    String(call[1]).includes('/api/retry/')
  );
  return route?.[2] as ((req: unknown, res: unknown) => Promise<void>) | undefined;
}

function getRecoverActiveHandler() {
  const route = testState.routerPost.mock.calls.find((call) =>
    String(call[1]).includes('/api/recover-active/')
  );
  return route?.[2] as ((req: unknown, res: unknown) => Promise<void>) | undefined;
}

describe('queue-monitor retry API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.currentDriver = {
      enqueue: vi.fn(async () => '1'),
      getJob: vi.fn(async () => undefined),
      getJobCounts: vi.fn(async () => ({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      })),
      getRecentJobs: vi.fn(async () => []),
      retryJob: vi.fn(async () => ({ ok: true as const, status: 'retried' as const })),
      recoverActiveJob: vi.fn(async () => ({ ok: true as const, status: 'failed' as const })),
      getQueues: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    };
  });

  it('returns 404 when retry is attempted from stale history and the live job is missing', async () => {
    testState.metrics.getRecentJobs = vi.fn(async () => []);
    testState.metrics.getFailedJobs = vi.fn(async () => []);
    testState.currentDriver.retryJob = vi.fn(async () => ({
      ok: false as const,
      status: 'missing' as const,
    })) as never;

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({ basePath: '/api', middleware: [] } as never);
    const handler = getRetryHandler();
    expect(handler).toBeTypeOf('function');

    const response = createJsonResponse();
    await handler?.(
      { getParam: (name: string) => (name === 'queue' ? 'emails' : 'job-1') },
      response.res
    );

    expect(response.statusCode).toBe(404);
    expect(response.payload).toEqual({ error: 'Job job-1 no longer exists', status: 'missing' });
  });

  it('requeues from a retained failed snapshot when the live job record is gone', async () => {
    testState.metrics.getRecentJobs = vi.fn(async () => []);
    testState.metrics.getFailedJobs = vi.fn(async () => [
      {
        id: 'job-9',
        name: 'email-job',
        queue: 'emails',
        data: { userId: 'u-9' },
        opts: { attempts: 5 },
        attempts: 1,
        status: 'failed',
        failedReason: 'boom',
        timestamp: 123,
      },
    ]);
    testState.currentDriver.retryJob = vi.fn(async () => ({
      ok: true as const,
      status: 'requeued_from_snapshot' as const,
      newJobId: 'job-9b',
    }));

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({ basePath: '/api', middleware: [] } as never);
    const handler = getRetryHandler();
    expect(handler).toBeTypeOf('function');

    const response = createJsonResponse();
    await handler?.(
      { getParam: (name: string) => (name === 'queue' ? 'emails' : 'job-9') },
      response.res
    );

    expect(testState.currentDriver.retryJob).toHaveBeenCalledWith('emails', 'job-9', {
      name: 'email-job',
      data: { userId: 'u-9' },
      opts: { attempts: 5 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      ok: true,
      status: 'requeued_from_snapshot',
      message: 'Job job-9 re-queued from monitor snapshot',
      newJobId: 'job-9b',
    });
  });

  it('returns 409 when the job exists but BullMQ refuses retry in its current state', async () => {
    testState.currentDriver.retryJob = vi.fn(async () => ({
      ok: false as const,
      status: 'not_retryable' as const,
      reason: 'Job is not in a failed state',
    }));

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({ basePath: '/api', middleware: [] } as never);
    const handler = getRetryHandler();
    expect(handler).toBeTypeOf('function');

    const response = createJsonResponse();
    await handler?.(
      { getParam: (name: string) => (name === 'queue' ? 'emails' : 'job-2') },
      response.res
    );

    expect(response.statusCode).toBe(409);
    expect(response.payload).toEqual({
      error: 'Job is not in a failed state',
      status: 'not_retryable',
    });
  });

  it('returns 200 when the job is successfully re-queued', async () => {
    testState.currentDriver.retryJob = vi.fn(async () => ({
      ok: true as const,
      status: 'retried' as const,
    }));

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({ basePath: '/api', middleware: [] } as never);
    const handler = getRetryHandler();
    expect(handler).toBeTypeOf('function');

    const response = createJsonResponse();
    await handler?.(
      { getParam: (name: string) => (name === 'queue' ? 'emails' : 'job-3') },
      response.res
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      ok: true,
      status: 'retried',
      message: 'Job job-3 queued for retry',
    });
  });

  it('returns 200 when an active job is recovered', async () => {
    testState.currentDriver.recoverActiveJob = vi.fn(async () => ({
      ok: true as const,
      status: 'failed' as const,
      state: 'failed',
    }));

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({ basePath: '/api', middleware: [] } as never);
    const handler = getRecoverActiveHandler();
    expect(handler).toBeTypeOf('function');

    const response = createJsonResponse();
    await handler?.(
      { getParam: (name: string) => (name === 'queue' ? 'emails' : 'job-active') },
      response.res
    );

    expect(testState.currentDriver.recoverActiveJob).toHaveBeenCalledWith('emails', 'job-active');
    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({ ok: true, status: 'failed', state: 'failed' });
  });

  it('returns 404 when active recovery targets a missing job', async () => {
    testState.currentDriver.recoverActiveJob = vi.fn(async () => ({
      ok: false as const,
      status: 'missing' as const,
    }));

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({ basePath: '/api', middleware: [] } as never);
    const handler = getRecoverActiveHandler();
    expect(handler).toBeTypeOf('function');

    const response = createJsonResponse();
    await handler?.(
      { getParam: (name: string) => (name === 'queue' ? 'emails' : 'job-missing') },
      response.res
    );

    expect(response.statusCode).toBe(404);
    expect(response.payload).toEqual({
      error: 'Job job-missing no longer exists',
      status: 'missing',
    });
  });

  it('returns 409 when active recovery targets a non-active job', async () => {
    testState.currentDriver.recoverActiveJob = vi.fn(async () => ({
      ok: false as const,
      status: 'not_active' as const,
      reason: 'Job is failed, not active',
    }));

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({ basePath: '/api', middleware: [] } as never);
    const handler = getRecoverActiveHandler();
    expect(handler).toBeTypeOf('function');

    const response = createJsonResponse();
    await handler?.(
      { getParam: (name: string) => (name === 'queue' ? 'emails' : 'job-failed') },
      response.res
    );

    expect(response.statusCode).toBe(409);
    expect(response.payload).toEqual({
      error: 'Job is failed, not active',
      status: 'not_active',
    });
  });
});
