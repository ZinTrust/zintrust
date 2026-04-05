import { isNonEmptyString, isObject, Logger, queueConfig } from '@zintrust/core';

type QueueMonitorStatus = 'completed' | 'failed';

type QueueMonitorJobLike = {
  id?: string;
  name?: string;
  data?: unknown;
  attemptsMade?: number;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
};

type QueueMonitorMetrics = {
  recordJob: (
    queueName: string,
    status: QueueMonitorStatus,
    job: QueueMonitorJobLike,
    error?: Error
  ) => Promise<void>;
};

type QueueMonitorModule = {
  createMetrics?: (config: {
    host: string;
    port: number;
    password?: string;
    db: number;
  }) => QueueMonitorMetrics;
};

let queueMonitorMetricsPromise: Promise<QueueMonitorMetrics | null> | null = null;

const toFiniteInteger = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }

  return fallback;
};

const resolveQueueMonitorRedisConfig = (): {
  host: string;
  port: number;
  password?: string;
  db: number;
} | null => {
  const redisConfig = queueConfig?.drivers?.redis;

  if (!isObject(redisConfig) || redisConfig['driver'] !== 'redis') {
    return null;
  }

  const host = isNonEmptyString(redisConfig['host']) ? redisConfig['host'].trim() : '127.0.0.1';
  const port = toFiniteInteger(redisConfig['port'], 6379);
  const db = toFiniteInteger(redisConfig['database'], 0);
  const password = isNonEmptyString(redisConfig['password']) ? redisConfig['password'] : undefined;

  return { host, port, password, db };
};

const loadQueueMonitorMetrics = async (): Promise<QueueMonitorMetrics | null> => {
  const redisConfig = resolveQueueMonitorRedisConfig();
  if (redisConfig === null) {
    return null;
  }

  try {
    const module = (await import('@zintrust/queue-monitor')) as QueueMonitorModule;
    if (typeof module.createMetrics !== 'function') {
      return null;
    }

    return module.createMetrics(redisConfig);
  } catch (error) {
    Logger.debug('Queue monitor metrics are unavailable for worker history recording', error);
    return null;
  }
};

const getQueueMonitorMetrics = async (): Promise<QueueMonitorMetrics | null> => {
  queueMonitorMetricsPromise ??= loadQueueMonitorMetrics();
  return queueMonitorMetricsPromise;
};

export const recordQueueMonitorJob = async (input: {
  queueName: string;
  status: QueueMonitorStatus;
  job: QueueMonitorJobLike;
  error?: Error;
}): Promise<void> => {
  const metrics = await getQueueMonitorMetrics();
  if (metrics === null) {
    return;
  }

  try {
    await metrics.recordJob(input.queueName, input.status, input.job, input.error);
  } catch (error) {
    Logger.debug('Queue monitor history write failed', {
      queueName: input.queueName,
      status: input.status,
      error,
    });
  }
};
