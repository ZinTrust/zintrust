import { OpenTelemetry } from '@/observability/OpenTelemetry';
import { generateUuid } from '@common/utility';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

export type QueueTraceOperation = 'enqueue' | 'dequeue' | 'ack' | 'length' | 'drain';

export type QueueTraceStatus = 'ok' | 'error';

export type QueueTraceEvent = {
  traceId: string;
  spanId: string;
  queueName: string;
  operation: QueueTraceOperation;
  status: QueueTraceStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  error?: string;
  attributes?: Record<string, unknown>;
};

export type QueueTraceExporter = (events: ReadonlyArray<QueueTraceEvent>) => void | Promise<void>;

const storedEvents: QueueTraceEvent[] = [];
const pendingEvents: QueueTraceEvent[] = [];
const exporters = new Set<QueueTraceExporter>();

const normalizeSampleRate = (): number => {
  const value = Env.getFloat('QUEUE_TRACING_SAMPLE_RATE', 1);
  if (Number.isFinite(value) === false) return 1;
  return Math.max(0, Math.min(1, value));
};

const isEnabled = (): boolean => Env.getBool('QUEUE_TRACING_ENABLED', false);

const shouldSample = (): boolean => {
  const rate = normalizeSampleRate();
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Math.random() <= rate;
};

const maxEvents = (): number => Math.max(1, Env.getInt('QUEUE_TRACING_MAX_EVENTS', 5000));

const retentionMs = (): number =>
  Math.max(1000, Env.getInt('QUEUE_TRACING_RETENTION_MS', 86400000));

const exportBatchSize = (): number =>
  Math.max(1, Env.getInt('QUEUE_TRACING_EXPORT_BATCH_SIZE', 20));

const shouldExportToOtel = (): boolean => Env.getBool('QUEUE_TRACING_EXPORT_OTEL', true);

const pruneStored = (): void => {
  const cutoff = Date.now() - retentionMs();
  const filtered = storedEvents.filter((event) => {
    const ended = new Date(event.endedAt).getTime();
    if (Number.isNaN(ended)) return false;
    return ended >= cutoff;
  });

  storedEvents.splice(0, storedEvents.length, ...filtered);

  const keep = maxEvents();
  if (storedEvents.length > keep) {
    storedEvents.splice(0, storedEvents.length - keep);
  }
};

const finalize = (event: QueueTraceEvent): void => {
  storedEvents.push(event);
  pendingEvents.push(event);
  pruneStored();
};

const normalizeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const tryExportToOpenTelemetry = (batch: ReadonlyArray<QueueTraceEvent>): void => {
  if (shouldExportToOtel() === false) return;

  const recordQueueSpan = OpenTelemetry.recordQueueOperationSpan as
    | ((input: {
        queueName: string;
        operation: 'enqueue' | 'dequeue' | 'ack' | 'length' | 'drain';
        durationMs: number;
        status: 'ok' | 'error';
      }) => void)
    | undefined;
  if (recordQueueSpan === undefined) return;

  batch.forEach((event) => {
    recordQueueSpan({
      queueName: event.queueName,
      operation: event.operation,
      durationMs: event.durationMs,
      status: event.status,
    });
  });
};

export const QueueTracing = Object.freeze({
  isEnabled,

  registerExporter(exporter: QueueTraceExporter): void {
    exporters.add(exporter);
  },

  unregisterExporter(exporter: QueueTraceExporter): void {
    exporters.delete(exporter);
  },

  async flush(): Promise<number> {
    if (pendingEvents.length === 0) return 0;

    const batch = pendingEvents.splice(0, pendingEvents.length);
    tryExportToOpenTelemetry(batch);

    if (exporters.size > 0) {
      const settled = await Promise.allSettled(
        Array.from(exporters).map(async (exporter) => exporter(batch))
      );

      settled.forEach((result) => {
        if (result.status === 'rejected') {
          Logger.warn('Queue trace exporter failed', {
            error: String(result.reason),
          });
        }
      });
    }

    return batch.length;
  },

  snapshot(limit = 100): QueueTraceEvent[] {
    const safeLimit = Math.max(1, Math.floor(limit));
    pruneStored();
    if (storedEvents.length <= safeLimit) return [...storedEvents];
    return storedEvents.slice(storedEvents.length - safeLimit);
  },

  prune(): void {
    pruneStored();
  },

  reset(): void {
    storedEvents.splice(0, storedEvents.length);
    pendingEvents.splice(0, pendingEvents.length);
    exporters.clear();
  },

  async traceOperation<T>(input: {
    queueName: string;
    operation: QueueTraceOperation;
    attributes?: Record<string, unknown>;
    execute: () => Promise<T>;
  }): Promise<T> {
    if (isEnabled() === false || shouldSample() === false) {
      return input.execute();
    }

    const startedAtMs = Date.now();
    const traceId = generateUuid();
    const spanId = generateUuid();

    try {
      const result = await input.execute();
      finalize({
        traceId,
        spanId,
        queueName: input.queueName,
        operation: input.operation,
        status: 'ok',
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAtMs),
        attributes: input.attributes,
      });

      if (pendingEvents.length >= exportBatchSize()) {
        void this.flush();
      }

      return result;
    } catch (error) {
      finalize({
        traceId,
        spanId,
        queueName: input.queueName,
        operation: input.operation,
        status: 'error',
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAtMs),
        error: normalizeError(error),
        attributes: input.attributes,
      });

      if (pendingEvents.length >= exportBatchSize()) {
        void this.flush();
      }

      throw error;
    }
  },
});

export default QueueTracing;
