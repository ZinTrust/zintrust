import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  let id = 0;
  return {
    otelEnabled: true,
    envGetBool: vi.fn((key: string, fallback?: boolean) => {
      if (key === 'QUEUE_TRACING_ENABLED') return false;
      if (key === 'QUEUE_TRACING_EXPORT_OTEL') return true;
      return fallback ?? false;
    }),
    envGetFloat: vi.fn(() => 1),
    envGetInt: vi.fn((_k: string, fallback?: number) => fallback ?? 0),
    warn: vi.fn(),
    debug: vi.fn(),
    recordQueueOperationSpan: vi.fn(),
    generateUuid: vi.fn(() => {
      id += 1;
      return `id-${id}`;
    }),
  };
});

vi.mock('@config/env', () => ({
  Env: {
    getBool: (...args: any[]) => mocked.envGetBool(...args),
    getFloat: (...args: any[]) => mocked.envGetFloat(...args),
    getInt: (...args: any[]) => mocked.envGetInt(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    warn: (...args: any[]) => mocked.warn(...args),
    debug: (...args: any[]) => mocked.debug(...args),
  },
}));

vi.mock('@/observability/OpenTelemetry', () => ({
  OpenTelemetry: {
    get recordQueueOperationSpan() {
      if (mocked.otelEnabled === false) return undefined;
      return (...args: any[]) => mocked.recordQueueOperationSpan(...args);
    },
  },
}));

vi.mock('@common/utility', () => ({
  generateUuid: (...args: any[]) => mocked.generateUuid(...args),
}));

import { QueueTracing } from '@queue/QueueTracing';

describe('QueueTracing (branches)', () => {
  beforeEach(() => {
    QueueTracing.reset();
    vi.clearAllMocks();
    mocked.otelEnabled = true;
  });

  it('bypasses tracing when disabled', async () => {
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'QUEUE_TRACING_ENABLED') return false;
      return fallback ?? false;
    });

    const out = await QueueTracing.traceOperation({
      queueName: 'q',
      operation: 'enqueue',
      execute: async () => 123,
    });

    expect(out).toBe(123);
    expect(QueueTracing.snapshot()).toEqual([]);
  });

  it('records ok + error events, flushes exporters, and warns on exporter failure', async () => {
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'QUEUE_TRACING_ENABLED') return true;
      if (key === 'QUEUE_TRACING_EXPORT_OTEL') return true;
      return fallback ?? false;
    });
    mocked.envGetFloat.mockReturnValueOnce(Number.NaN); // normalizeSampleRate -> 1
    mocked.envGetInt.mockImplementation((key: string, fallback?: number) => {
      if (key === 'QUEUE_TRACING_EXPORT_BATCH_SIZE') return 50;
      if (key === 'QUEUE_TRACING_MAX_EVENTS') return 5000;
      if (key === 'QUEUE_TRACING_RETENTION_MS') return 86400000;
      return fallback ?? 0;
    });

    const exporter = vi.fn(async () => {
      throw new Error('exporter down');
    });
    QueueTracing.registerExporter(exporter);

    await QueueTracing.traceOperation({
      queueName: 'q1',
      operation: 'enqueue',
      attributes: { a: 1 },
      execute: async () => 'ok',
    });

    await expect(
      QueueTracing.traceOperation({
        queueName: 'q1',
        operation: 'dequeue',
        execute: async () => {
          throw new Error('boom');
        },
      })
    ).rejects.toThrow('boom');

    const flushed = await QueueTracing.flush();
    expect(flushed).toBe(2);

    expect(exporter).toHaveBeenCalledTimes(1);
    expect(mocked.warn).toHaveBeenCalledWith(
      'Queue trace exporter failed',
      expect.objectContaining({ error: expect.stringContaining('exporter down') })
    );

    expect(mocked.recordQueueOperationSpan).toHaveBeenCalled();
    const events = QueueTracing.snapshot(10);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.status)).toEqual(['ok', 'error']);
  });

  it('does not sample when sample rate is 0', async () => {
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'QUEUE_TRACING_ENABLED') return true;
      return fallback ?? false;
    });
    mocked.envGetFloat.mockReturnValueOnce(0);

    await QueueTracing.traceOperation({
      queueName: 'q',
      operation: 'length',
      execute: async () => 1,
    });

    expect(QueueTracing.snapshot()).toEqual([]);
  });

  it('samples probabilistically when sample rate is between 0 and 1', async () => {
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'QUEUE_TRACING_ENABLED') return true;
      return fallback ?? false;
    });
    mocked.envGetFloat.mockReturnValue(0.5);
    mocked.envGetInt.mockImplementation((key: string, fallback?: number) => {
      if (key === 'QUEUE_TRACING_EXPORT_BATCH_SIZE') return 50;
      if (key === 'QUEUE_TRACING_MAX_EVENTS') return 5000;
      if (key === 'QUEUE_TRACING_RETENTION_MS') return 86400000;
      return fallback ?? 0;
    });

    const rand = vi.spyOn(Math, 'random');
    rand.mockReturnValueOnce(0.4);
    await QueueTracing.traceOperation({
      queueName: 'q',
      operation: 'ack',
      execute: async () => 'a',
    });
    expect(QueueTracing.snapshot()).toHaveLength(1);

    QueueTracing.reset();
    rand.mockReturnValueOnce(0.6);
    await QueueTracing.traceOperation({
      queueName: 'q',
      operation: 'ack',
      execute: async () => 'b',
    });
    expect(QueueTracing.snapshot()).toHaveLength(0);
  });

  it('skips OpenTelemetry export when disabled or when span handler is missing', async () => {
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'QUEUE_TRACING_ENABLED') return true;
      if (key === 'QUEUE_TRACING_EXPORT_OTEL') return false;
      return fallback ?? false;
    });
    mocked.envGetFloat.mockReturnValue(1);
    mocked.envGetInt.mockImplementation((key: string, fallback?: number) => {
      if (key === 'QUEUE_TRACING_EXPORT_BATCH_SIZE') return 50;
      if (key === 'QUEUE_TRACING_MAX_EVENTS') return 5000;
      if (key === 'QUEUE_TRACING_RETENTION_MS') return 86400000;
      return fallback ?? 0;
    });

    await QueueTracing.traceOperation({
      queueName: 'q',
      operation: 'drain',
      execute: async () => undefined,
    });
    await QueueTracing.flush();
    expect(mocked.recordQueueOperationSpan).not.toHaveBeenCalled();

    QueueTracing.reset();
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'QUEUE_TRACING_ENABLED') return true;
      if (key === 'QUEUE_TRACING_EXPORT_OTEL') return true;
      return fallback ?? false;
    });
    mocked.otelEnabled = false;
    await QueueTracing.traceOperation({
      queueName: 'q',
      operation: 'drain',
      execute: async () => undefined,
    });
    await QueueTracing.flush();
    expect(mocked.recordQueueOperationSpan).not.toHaveBeenCalled();
  });

  it('prunes stored events by retention window', async () => {
    vi.useFakeTimers();
    try {
      mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
        if (key === 'QUEUE_TRACING_ENABLED') return true;
        return fallback ?? false;
      });
      mocked.envGetFloat.mockReturnValue(1);
      mocked.envGetInt.mockImplementation((key: string, fallback?: number) => {
        if (key === 'QUEUE_TRACING_RETENTION_MS') return 1000;
        if (key === 'QUEUE_TRACING_MAX_EVENTS') return 5000;
        if (key === 'QUEUE_TRACING_EXPORT_BATCH_SIZE') return 50;
        return fallback ?? 0;
      });

      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      await QueueTracing.traceOperation({
        queueName: 'q',
        operation: 'enqueue',
        execute: async () => 1,
      });
      expect(QueueTracing.snapshot()).toHaveLength(1);

      vi.setSystemTime(new Date('2020-01-01T00:00:05Z'));
      expect(QueueTracing.snapshot()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes non-Error throws and slices snapshots when over limit', async () => {
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'QUEUE_TRACING_ENABLED') return true;
      return fallback ?? false;
    });
    mocked.envGetFloat.mockReturnValue(1);
    mocked.envGetInt.mockImplementation((key: string, fallback?: number) => {
      if (key === 'QUEUE_TRACING_EXPORT_BATCH_SIZE') return 50;
      if (key === 'QUEUE_TRACING_MAX_EVENTS') return 5000;
      if (key === 'QUEUE_TRACING_RETENTION_MS') return 86400000;
      return fallback ?? 0;
    });

    await QueueTracing.traceOperation({
      queueName: 'q',
      operation: 'enqueue',
      execute: async () => 1,
    });

    await expect(
      QueueTracing.traceOperation({
        queueName: 'q',
        operation: 'dequeue',
        execute: async () => {
          // eslint-disable-next-line no-throw-literal
          throw 'boom';
        },
      })
    ).rejects.toBe('boom');

    const sliced = QueueTracing.snapshot(1);
    expect(sliced).toHaveLength(1);
    expect(sliced[0]?.status).toBe('error');
    expect(sliced[0]?.error).toBe('boom');
  });
});
