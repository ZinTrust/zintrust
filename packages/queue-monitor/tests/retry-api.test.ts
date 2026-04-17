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

vi.mock('@zintrust/core', () => ({
  Env: { get: vi.fn((_key: string, fallback?: string) => fallback ?? '') },
  isArray: Array.isArray,
  isNonEmptyString: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
  Logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  queueConfig: {
    monitor: {},
    drivers: {
      redis: { host: 'localhost', port: 6379, password: '', database: 0 },
    },
  },
  resolveLockPrefix: vi.fn(() => 'zintrust'),
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
    statusCode: result.statusCode,
    payload: result.payload,
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
  const route = testState.routerPost.mock.calls.find((call) => String(call[1]).includes('/api/retry/'));
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
      getQueues: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    };
  });

  it('returns 404 when retry is attempted from stale history and the live job is missing', async () => {
    testState.currentDriver.retryJob = vi.fn(async () => ({
      ok: false as const,
      status: 'missing' as const,
    }));

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({} as never);
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

  it('returns 409 when the job exists but BullMQ refuses retry in its current state', async () => {
    testState.currentDriver.retryJob = vi.fn(async () => ({
      ok: false as const,
      status: 'not_retryable' as const,
      reason: 'Job is not in a failed state',
    }));

    const monitor = QueueMonitor.create({ redis: { host: 'localhost', port: 6379 } });
    monitor.registerRoutes({} as never);
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
    monitor.registerRoutes({} as never);
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
});
