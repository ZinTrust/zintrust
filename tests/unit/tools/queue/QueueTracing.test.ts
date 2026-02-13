import { Env } from '@/config/env';
import { QueueTracing } from '@/tools/queue/QueueTracing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clearTracingEnv = (): void => {
  Env.unset('QUEUE_TRACING_ENABLED');
  Env.unset('QUEUE_TRACING_SAMPLE_RATE');
  Env.unset('QUEUE_TRACING_MAX_EVENTS');
  Env.unset('QUEUE_TRACING_RETENTION_MS');
  Env.unset('QUEUE_TRACING_EXPORT_BATCH_SIZE');
  Env.unset('QUEUE_TRACING_EXPORT_OTEL');
};

describe('QueueTracing', () => {
  beforeEach(() => {
    clearTracingEnv();
    QueueTracing.reset();
    vi.restoreAllMocks();
  });

  it('records and exports traced operations via registered exporter', async () => {
    Env.set('QUEUE_TRACING_ENABLED', 'true');
    Env.set('QUEUE_TRACING_SAMPLE_RATE', '1');
    Env.set('QUEUE_TRACING_EXPORT_BATCH_SIZE', '1');

    const exportedBatches: Array<ReadonlyArray<{ operation: string; queueName: string }>> = [];
    QueueTracing.registerExporter(async (events) => {
      const mapped: Array<{ operation: string; queueName: string }> = [];
      for (const event of events) {
        mapped.push({ operation: event.operation, queueName: event.queueName });
      }
      exportedBatches.push(mapped);
    });

    const result = await QueueTracing.traceOperation({
      queueName: 'emails',
      operation: 'enqueue',
      execute: async () => 'ok',
    });

    expect(result).toBe('ok');

    // flush can still be called safely after auto-flush
    await QueueTracing.flush();

    expect(exportedBatches.length).toBeGreaterThan(0);
    expect(exportedBatches[0][0]?.operation).toBe('enqueue');
    expect(exportedBatches[0][0]?.queueName).toBe('emails');
  });

  it('prunes old events based on retention window', async () => {
    Env.set('QUEUE_TRACING_ENABLED', 'true');
    Env.set('QUEUE_TRACING_RETENTION_MS', '1');

    const baseNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(baseNow);

    await QueueTracing.traceOperation({
      queueName: 'emails',
      operation: 'length',
      execute: async () => 10,
    });

    nowSpy.mockReturnValue(baseNow + 2000);

    QueueTracing.prune();

    const snapshot = QueueTracing.snapshot(50);
    expect(snapshot.length).toBe(0);
  });

  it('captures failed operations with error status', async () => {
    Env.set('QUEUE_TRACING_ENABLED', 'true');

    await expect(
      QueueTracing.traceOperation({
        queueName: 'emails',
        operation: 'dequeue',
        execute: async () => {
          throw new Error('boom');
        },
      })
    ).rejects.toThrow('boom');

    const snapshot = QueueTracing.snapshot(50);
    expect(snapshot.length).toBe(1);
    expect(snapshot[0]?.status).toBe('error');
    expect(snapshot[0]?.error).toContain('boom');
  });
});
