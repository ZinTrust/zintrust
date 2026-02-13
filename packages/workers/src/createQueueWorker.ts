import type { BullMQPayload, QueueMessage } from '@zintrust/core';
import * as Core from '@zintrust/core';
import { Env, Logger, Queue } from '@zintrust/core';

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;

const getJobStateTracker = (): unknown => {
  try {
    return (Core as Record<string, unknown>)['JobStateTracker'];
  } catch {
    return undefined;
  }
};

const getJobHeartbeatStore = (): unknown => {
  try {
    return (Core as Record<string, unknown>)['JobHeartbeatStore'];
  } catch {
    return undefined;
  }
};

const getTimeoutManager = (): unknown => {
  try {
    return (Core as Record<string, unknown>)['TimeoutManager'];
  } catch {
    return undefined;
  }
};

const getEnvInt = (key: string, fallback: number): number => {
  const getter = (Env as { getInt?: (name: string, defaultValue: number) => number }).getInt;
  if (typeof getter === 'function') {
    return getter(key, fallback);
  }

  const raw = (Env as Record<string, unknown>)[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw);
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return fallback;
};

const resolveQueueJobTimeoutMs = (): number => {
  const timeoutManager = getTimeoutManager();
  const tm = (timeoutManager ?? {}) as { getQueueJobTimeoutMs?: () => number };
  if (typeof tm.getQueueJobTimeoutMs === 'function') {
    return tm.getQueueJobTimeoutMs();
  }
  return Math.max(1000, getEnvInt('QUEUE_JOB_TIMEOUT', 60) * 1000);
};

const runWithTimeout = async <T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> => {
  const timeoutManager = getTimeoutManager();
  const tm = (timeoutManager ?? {}) as {
    withTimeout?: <R>(
      op: () => Promise<R>,
      t: number,
      name: string,
      timeoutHandler?: () => Promise<R>
    ) => Promise<R>;
  };
  if (typeof tm.withTimeout === 'function') {
    return tm.withTimeout(operation, timeoutMs, operationName);
  }
  return operation();
};

const isTimeoutError = (error: unknown): boolean => {
  const timeoutManager = getTimeoutManager();
  const tm = (timeoutManager ?? {}) as { isTimeoutError?: (value: unknown) => boolean };
  if (typeof tm.isTimeoutError === 'function') {
    return tm.isTimeoutError(error);
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('timed out');
  }
  return false;
};

const normalizeAttempts = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
};

const getAttemptsFromMessage = <TPayload>(message: QueueMessage<TPayload>): number => {
  const payloadAttempts =
    typeof message.payload === 'object' && message.payload !== null
      ? normalizeAttempts((message.payload as Record<string, unknown>)['attempts'])
      : 0;
  const messageAttempts = normalizeAttempts(
    (message as QueueMessage<TPayload> & { attempts?: number }).attempts
  );
  return Math.max(payloadAttempts, messageAttempts);
};

const getRetryDelayMs = (nextAttempts: number): number => {
  const exponentialDelay = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** Math.max(0, nextAttempts - 1),
    RETRY_MAX_DELAY_MS
  );
  const jitterMs = Math.floor(Math.random() * 250);
  return exponentialDelay + jitterMs;
};

type QueueWorker = {
  processOne: (queueName?: string, driverName?: string) => Promise<boolean>;
  processAll: (queueName?: string, driverName?: string) => Promise<number>;
  runOnce: (opts?: {
    queueName?: string;
    driverName?: string;
    maxItems?: number;
    maxDurationMs?: number;
  }) => Promise<number>;
  startWorker: (opts?: {
    queueName?: string;
    driverName?: string;
    signal?: AbortSignal;
    maxDurationMs?: number;
  }) => Promise<number>;
};

export type CreateQueueWorkerOptions<TPayload> = {
  kindLabel: string;
  defaultQueueName: string;
  maxAttempts: number;
  getLogFields: (payload: TPayload) => Record<string, unknown>;
  handle: (payload: TPayload) => Promise<void>;
};

const buildBaseLogFields = <TPayload>(
  message: QueueMessage<TPayload>,
  getLogFields: (payload: TPayload) => Record<string, unknown>
): Record<string, unknown> => {
  return {
    messageId: message.id,
    ...getLogFields(message.payload),
  };
};

type TrackerApi = {
  started?: (input: {
    queueName: string;
    jobId: string;
    attempts: number;
    timeoutMs?: number;
    workerName?: string;
    workerInstanceId?: string;
  }) => Promise<void>;
  heartbeat?: (input: {
    queueName: string;
    jobId: string;
    workerInstanceId?: string;
  }) => Promise<void>;
  completed?: (input: {
    queueName: string;
    jobId: string;
    processingTimeMs?: number;
  }) => Promise<void>;
  timedOut?: (input: {
    queueName: string;
    jobId: string;
    reason?: string;
    error?: unknown;
  }) => Promise<void>;
  failed?: (input: {
    queueName: string;
    jobId: string;
    attempts?: number;
    isFinal?: boolean;
    retryAt?: string;
    error?: unknown;
  }) => Promise<void>;
};

type HeartbeatStoreApi = {
  heartbeat?: (input: {
    queueName: string;
    jobId: string;
    workerInstanceId?: string;
    intervalMs?: number;
  }) => Promise<void>;
  remove?: (queueName: string, jobId: string) => Promise<void>;
};

const getWorkerInstanceId = (): string | undefined => {
  return typeof (Env as Record<string, unknown>)['WORKER_INSTANCE_ID'] === 'string'
    ? String((Env as Record<string, unknown>)['WORKER_INSTANCE_ID'])
    : undefined;
};

const getTrackerApi = (): TrackerApi => {
  return ((getJobStateTracker() ?? {}) as TrackerApi) ?? {};
};

const getHeartbeatStoreApi = (): HeartbeatStoreApi => {
  return ((getJobHeartbeatStore() ?? {}) as HeartbeatStoreApi) ?? {};
};

const removeHeartbeatIfSupported = async (queueName: string, jobId: string): Promise<void> => {
  const heartbeatStore = getHeartbeatStoreApi();
  if (typeof heartbeatStore.remove === 'function') {
    await heartbeatStore.remove(queueName, jobId);
  }
};

const scheduleHeartbeatLoop = (
  trackerApi: TrackerApi,
  queueName: string,
  jobId: string,
  workerInstanceId: string | undefined,
  heartbeatIntervalMs: number
): ReturnType<typeof setInterval> => {
  return setInterval(() => {
    if (typeof trackerApi.heartbeat === 'function') {
      void trackerApi.heartbeat({
        queueName,
        jobId,
        workerInstanceId,
      });
    }

    const heartbeatStore = getHeartbeatStoreApi();
    if (typeof heartbeatStore.heartbeat === 'function') {
      void heartbeatStore.heartbeat({
        queueName,
        jobId,
        workerInstanceId,
        intervalMs: heartbeatIntervalMs,
      });
    }
  }, heartbeatIntervalMs);
};

const checkAndRequeueIfNotDue = async <TPayload>(
  options: CreateQueueWorkerOptions<TPayload>,
  queueName: string,
  driverName: string | undefined,
  message: QueueMessage<TPayload>,
  baseLogFields: Record<string, unknown>
): Promise<boolean> => {
  const payload = message.payload as Record<string, unknown> & { timestamp?: number };
  const rawTimestamp = 'timestamp' in payload ? payload['timestamp'] : 0;
  const timestamp = typeof rawTimestamp === 'number' ? rawTimestamp : 0;

  if (timestamp <= Date.now()) return false;

  Logger.info(`${options.kindLabel} not due yet, re-queueing`, {
    ...baseLogFields,
    dueAt: new Date(timestamp).toISOString(),
  });
  await Queue.enqueue(queueName, message.payload as BullMQPayload, driverName);
  await Queue.ack(queueName, message.id, driverName);
  return true;
};

const onProcessSuccess = async <TPayload>(input: {
  options: CreateQueueWorkerOptions<TPayload>;
  trackerApi: TrackerApi;
  queueName: string;
  driverName?: string;
  message: QueueMessage<TPayload>;
  startedAtMs: number;
  baseLogFields: Record<string, unknown>;
}): Promise<boolean> => {
  await Queue.ack(input.queueName, input.message.id, input.driverName);

  if (typeof input.trackerApi.completed === 'function') {
    await input.trackerApi.completed({
      queueName: input.queueName,
      jobId: input.message.id,
      processingTimeMs: Date.now() - input.startedAtMs,
    });
  }

  await removeHeartbeatIfSupported(input.queueName, input.message.id);
  Logger.info(`${input.options.kindLabel} processed successfully`, input.baseLogFields);
  return true;
};

const onProcessFailure = async <TPayload>(input: {
  options: CreateQueueWorkerOptions<TPayload>;
  trackerApi: TrackerApi;
  queueName: string;
  driverName?: string;
  message: QueueMessage<TPayload>;
  baseLogFields: Record<string, unknown>;
  error: unknown;
}): Promise<boolean> => {
  const attempts = getAttemptsFromMessage(input.message);
  const nextAttempts = attempts + 1;
  const isFinal = nextAttempts >= input.options.maxAttempts;
  let retryAt: string | undefined;

  Logger.error(`Failed to process ${input.options.kindLabel}`, {
    ...input.baseLogFields,
    error: input.error,
    attempts: nextAttempts,
  });

  if (isTimeoutError(input.error) && typeof input.trackerApi.timedOut === 'function') {
    await input.trackerApi.timedOut({
      queueName: input.queueName,
      jobId: input.message.id,
      reason: `Worker processing exceeded timeout for ${input.options.kindLabel}`,
      error: input.error,
    });
  }

  if (nextAttempts < input.options.maxAttempts) {
    const retryDelayMs = getRetryDelayMs(nextAttempts);
    retryAt = new Date(Date.now() + retryDelayMs).toISOString();
    const currentPayload =
      typeof input.message.payload === 'object' && input.message.payload !== null
        ? (input.message.payload as Record<string, unknown>)
        : ({ payload: input.message.payload } as Record<string, unknown>);

    const payloadForRetry: BullMQPayload = {
      ...currentPayload,
      attempts: nextAttempts,
      timestamp: Date.now() + retryDelayMs,
    };

    await Queue.enqueue(input.queueName, payloadForRetry, input.driverName);
    Logger.info(`${input.options.kindLabel} re-queued for retry`, {
      ...input.baseLogFields,
      attempts: nextAttempts,
      retryDelayMs,
    });
  }

  await Queue.ack(input.queueName, input.message.id, input.driverName);
  await removeHeartbeatIfSupported(input.queueName, input.message.id);

  if (typeof input.trackerApi.failed === 'function') {
    await input.trackerApi.failed({
      queueName: input.queueName,
      jobId: input.message.id,
      attempts: nextAttempts,
      isFinal,
      retryAt,
      error: input.error,
    });
  }

  return true;
};

const startTrackingAndHeartbeat = async <TPayload>(input: {
  options: CreateQueueWorkerOptions<TPayload>;
  trackerApi: TrackerApi;
  queueName: string;
  message: QueueMessage<TPayload>;
}): Promise<{ startedAtMs: number; heartbeatTimer?: ReturnType<typeof setInterval> }> => {
  const startedAtMs = Date.now();
  const timeoutMs = resolveQueueJobTimeoutMs();
  const heartbeatIntervalMs = Math.max(1000, getEnvInt('JOB_HEARTBEAT_INTERVAL_MS', 10000));
  const attempts = getAttemptsFromMessage(input.message);
  const workerInstanceId = getWorkerInstanceId();

  if (typeof input.trackerApi.started === 'function') {
    await input.trackerApi.started({
      queueName: input.queueName,
      jobId: input.message.id,
      attempts: attempts + 1,
      timeoutMs,
      workerName: input.options.kindLabel,
      workerInstanceId,
    });
  }

  const heartbeatStore = getHeartbeatStoreApi();
  if (typeof heartbeatStore.heartbeat === 'function') {
    await heartbeatStore.heartbeat({
      queueName: input.queueName,
      jobId: input.message.id,
      workerInstanceId,
      intervalMs: heartbeatIntervalMs,
    });
  }

  const heartbeatTimer = scheduleHeartbeatLoop(
    input.trackerApi,
    input.queueName,
    input.message.id,
    workerInstanceId,
    heartbeatIntervalMs
  );

  return { startedAtMs, heartbeatTimer };
};

const processQueueMessage = async <TPayload>(
  options: CreateQueueWorkerOptions<TPayload>,
  queueName: string,
  driverName?: string
): Promise<boolean> => {
  const message = await Queue.dequeue<TPayload>(queueName, driverName);
  if (!message) return false;

  const baseLogFields = buildBaseLogFields(message, options.getLogFields);

  const isRequeued = await checkAndRequeueIfNotDue(
    options,
    queueName,
    driverName,
    message,
    baseLogFields
  );
  if (isRequeued) return false;

  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  const trackerApi = getTrackerApi();
  const timeoutMs = resolveQueueJobTimeoutMs();
  let startedAtMs = Date.now();

  try {
    const tracking = await startTrackingAndHeartbeat({
      options,
      trackerApi,
      queueName,
      message,
    });
    startedAtMs = tracking.startedAtMs;
    heartbeatTimer = tracking.heartbeatTimer;

    Logger.info(`Processing queued ${options.kindLabel}`, baseLogFields);
    await runWithTimeout(
      async () => {
        await options.handle(message.payload);
      },
      timeoutMs,
      `${options.kindLabel}:${queueName}:${message.id}`
    );

    return onProcessSuccess({
      options,
      trackerApi,
      queueName,
      driverName,
      message,
      startedAtMs,
      baseLogFields,
    });
  } catch (error) {
    return onProcessFailure({
      options,
      trackerApi,
      queueName,
      driverName,
      message,
      baseLogFields,
      error,
    });
  } finally {
    if (heartbeatTimer !== undefined) {
      clearInterval(heartbeatTimer);
    }
  }
};

const createProcessOne = <TPayload>(
  options: CreateQueueWorkerOptions<TPayload>
): ((queueName?: string, driverName?: string) => Promise<boolean>) => {
  return async (queueName = options.defaultQueueName, driverName?: string): Promise<boolean> => {
    return processQueueMessage(options, queueName, driverName);
  };
};

const createProcessAll = (
  defaultQueueName: string,
  processOne: (queueName?: string, driverName?: string) => Promise<boolean>
): ((queueName?: string, driverName?: string) => Promise<number>) => {
  return async (queueName = defaultQueueName, driverName?: string): Promise<number> => {
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      // eslint-disable-next-line no-await-in-loop
      hasMore = await processOne(queueName, driverName);
      if (hasMore) processed++;
    }

    return processed;
  };
};

const createRunOnce = (
  defaultQueueName: string,
  processOne: (queueName?: string, driverName?: string) => Promise<boolean>
): ((opts?: {
  queueName?: string;
  driverName?: string;
  maxItems?: number;
  maxDurationMs?: number;
  concurrency?: number;
}) => Promise<number>) => {
  return async (opts = {}): Promise<number> => {
    const {
      queueName = defaultQueueName,
      driverName,
      maxItems,
      maxDurationMs = 30000,
      concurrency = 1,
    } = opts;
    const startTime = Date.now();
    let totalProcessed = 0;

    // Helper for single worker loop
    const runWorker = async (): Promise<number> => {
      let workerProcessed = 0;
      while (true) {
        if (maxDurationMs > 0 && Date.now() - startTime > maxDurationMs) {
          break;
        }
        if (maxItems !== undefined && totalProcessed >= maxItems) {
          break;
        }

        // eslint-disable-next-line no-await-in-loop
        const didProcess = await processOne(queueName, driverName);
        if (!didProcess) break;

        workerProcessed++;
        totalProcessed++; // Shared counter (approximation in parallel)
      }
      return workerProcessed;
    };

    // Run workers in parallel
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }).map(() => runWorker()));

    return totalProcessed;
  };
};

const createStartWorker = (
  kindLabel: string,
  defaultQueueName: string,
  processOne: (queueName?: string, driverName?: string) => Promise<boolean>
): ((opts?: {
  queueName?: string;
  driverName?: string;
  signal?: AbortSignal;
  maxDurationMs?: number;
  concurrency?: number;
}) => Promise<number>) => {
  return async (opts = {}): Promise<number> => {
    const {
      queueName = defaultQueueName,
      driverName,
      signal,
      maxDurationMs = 300000,
      concurrency = 1,
    } = opts;

    Logger.info(`Starting ${kindLabel} worker (drain-until-empty)`, { queueName, concurrency });

    const startTime = Date.now();
    let totalProcessed = 0;

    const runWorker = async (): Promise<void> => {
      while (signal?.aborted !== true) {
        if (maxDurationMs > 0 && Date.now() - startTime > maxDurationMs) {
          Logger.warn(`${kindLabel} worker timeout reached`, { queueName, totalProcessed });
          break;
        }

        // eslint-disable-next-line no-await-in-loop
        const didProcess = await processOne(queueName, driverName);
        if (!didProcess) break;
        totalProcessed++;
      }
    };

    // Run workers in parallel
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }).map(() => runWorker()));

    Logger.info(`${kindLabel} worker finished (queue drained)`, { queueName, totalProcessed });
    return totalProcessed;
  };
};

export function createQueueWorker<TPayload>(
  options: CreateQueueWorkerOptions<TPayload>
): QueueWorker {
  const processOne = createProcessOne(options);
  const processAll = createProcessAll(options.defaultQueueName, processOne);
  const runOnce = createRunOnce(options.defaultQueueName, processOne);
  const startWorker = createStartWorker(options.kindLabel, options.defaultQueueName, processOne);

  return Object.freeze({ processOne, processAll, runOnce, startWorker });
}
