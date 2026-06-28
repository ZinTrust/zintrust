import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { Logger } from '@zintrust/core/logger';
import { getBullMQSafeQueueName } from '@zintrust/core/redis';
import type { ConnectionOptions, Job, JobsOptions, Queue } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection.js';

let QueueCtor: typeof Queue | undefined;

const ensureBullmqLoaded = async (): Promise<typeof Queue> => {
  if (QueueCtor !== undefined) return QueueCtor;
  const bullmqPkg = 'bullmq';
  const loaded = (await import(bullmqPkg)).Queue;
  QueueCtor = loaded;
  return loaded;
};

export type JobPayload<T = unknown> = T;

export type JobCounts = Record<string, number>;

export const emptyCounts = (): JobCounts => ({
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
});

export const emptyQueueStats = (
  queueNames: ReadonlyArray<string>
): Array<{ name: string; counts: JobCounts }> =>
  queueNames.map((name) => ({ name, counts: emptyCounts() }));

export type RetrySnapshot = {
  name?: string;
  data: unknown;
  opts?: JobsOptions;
};

export type RetryJobResult =
  | { ok: true; status: 'retried' }
  | { ok: true; status: 'requeued_from_snapshot'; newJobId?: string }
  | { ok: false; status: 'missing' }
  | { ok: false; status: 'not_retryable'; reason?: string };

export type RecoverActiveJobResult =
  | {
      ok: true;
      status: 'failed' | 'removed' | 'removed_after_delayed_retry' | 'moved';
      state?: string;
    }
  | { ok: false; status: 'missing' | 'not_active' | 'not_recoverable'; reason?: string };

export type QueueDriver = {
  enqueue<T>(name: string, payload: T, options?: JobsOptions): Promise<string>;
  getJob(queueName: string, jobId: string): Promise<Job | undefined>;
  getJobCounts(queueName: string): Promise<JobCounts>;
  getJobCountsMany(
    queueNames: string[]
  ): Promise<Array<{ name: string; counts: Record<string, number> }>>;
  getRecentJobs(queueName: string, limit?: number): Promise<Job[]>;
  retryJob(queueName: string, jobId: string, snapshot?: RetrySnapshot): Promise<RetryJobResult>;
  recoverActiveJob(queueName: string, jobId: string): Promise<RecoverActiveJobResult>;
  getQueues(): Promise<string[]>;
  close(): Promise<void>;
};

type RedisRpcClient = {
  queue: <T = unknown>(method: string, payload?: Record<string, unknown>) => Promise<T>;
  monitor: <T = unknown>(method: string, payload?: Record<string, unknown>) => Promise<T>;
};

// Zedgi monitor driver registry
let registeredZedgiMonitorDriverFactory: ((config: unknown) => QueueDriver) | undefined;

export const registerZedgiMonitorDriver = (
  factory: typeof registeredZedgiMonitorDriverFactory
): void => {
  registeredZedgiMonitorDriverFactory = typeof factory === 'function' ? factory : undefined;
};

const shouldUseRedisRpcMonitorDriver = (): boolean =>
  Env.USE_REDIS_PROXY === true && Env.get('REDIS_RPC_URL', '').trim() !== '';

const resolveActiveQueueConnection = (): string =>
  Env.get('QUEUE_CONNECTION', Env.get('QUEUE_DRIVER', '')).trim().toLowerCase();

const shouldUseZedgiMonitorDriver = (): boolean =>
  registeredZedgiMonitorDriverFactory !== undefined &&
  Env.getBool('USE_ZEDGI', false) &&
  resolveActiveQueueConnection() === 'queue-zedgi';

const resolveRpcBaseUrl = (): string => {
  const configured = Env.get('REDIS_RPC_URL', '').trim();
  if (configured.length > 0) return configured;
  const host = Env.get('REDIS_RPC_HOST', '127.0.0.1').trim() || '127.0.0.1';
  const port = Env.getInt('REDIS_RPC_PORT', 8794);
  return `http://${host}:${port}`;
};

const createRequestId = (): string => {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeRpcBaseUrl = (): URL => {
  try {
    return new URL(resolveRpcBaseUrl());
  } catch (error) {
    throw ErrorFactory.createConfigError('REDIS_RPC_URL must be a valid URL', error);
  }
};

const callRedisRpc = async <T = unknown>(
  service: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> => {
  const endpoint = new URL('/rpc', normalizeRpcBaseUrl());
  const secret = Env.get('REDIS_RPC_SECRET', Env.get('REDIS_PROXY_SECRET', Env.APP_KEY));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret.trim() === '' ? {} : { 'x-redis-rpc-secret': secret }),
    },
    body: JSON.stringify({ requestId: createRequestId(), service, method, payload }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    error?: { message?: string };
  };
  if (!response.ok || body.ok !== true) {
    throw ErrorFactory.createTryCatchError(
      body.error?.message ?? `Redis RPC request failed with status ${response.status}`
    );
  }
  return body.result as T;
};

const createRpcClient = async (): Promise<RedisRpcClient> =>
  Object.freeze({
    queue: <T = unknown>(method: string, payload: Record<string, unknown> = {}) =>
      callRedisRpc<T>('queue', method, payload),
    monitor: <T = unknown>(method: string, payload: Record<string, unknown> = {}) =>
      callRedisRpc<T>('queue-monitor', method, payload),
  });

const createRedisRpcEnqueue = async <T>(
  name: string,
  payload: T,
  options?: JobsOptions
): Promise<string> => {
  const client = await createRpcClient();
  const result = await client.queue<{ id?: string | number }>('add', {
    target: name,
    args: ['default', payload, options ?? {}],
  });

  if (result.id === undefined || result.id === null) {
    throw ErrorFactory.createTryCatchError(`Queue job id missing for ${name}`);
  }

  return String(result.id);
};

const createRedisRpcGetJob = async (queueName: string, jobId: string): Promise<Job | undefined> => {
  const client = await createRpcClient();
  try {
    return await client.queue('getJob', { target: queueName, args: [jobId] });
  } catch (error) {
    Logger.warn('[queue-monitor] Redis RPC job lookup failed; returning no job', error);
    return undefined;
  }
};

const createRedisRpcGetJobCounts = async (queueName: string): Promise<JobCounts> => {
  try {
    const client = await createRpcClient();
    return client.queue('getJobCounts', { target: queueName });
  } catch (error) {
    Logger.warn('[queue-monitor] Redis RPC job counts failed; returning empty counts', error);
    return {};
  }
};

const createRedisRpcGetJobCountsMany = async (
  queueNames: string[]
): Promise<Array<{ name: string; counts: Record<string, number> }>> => {
  const client = await createRpcClient();
  try {
    const snapshot = await client.monitor<{
      queues?: Array<{ name: string; counts: JobCounts }>;
    }>('getSnapshot', { args: [queueNames] });
    return snapshot.queues ?? emptyQueueStats(queueNames);
  } catch (error) {
    Logger.warn(
      '[queue-monitor] Redis RPC batch counts failed; returning known queues with empty counts',
      error
    );
    return emptyQueueStats(queueNames);
  }
};

const createRedisRpcRecentJobs = async (queueName: string, limit = 100): Promise<Job[]> => {
  const client = await createRpcClient();
  try {
    return await client.monitor('getRecentJobsForQueue', {
      args: [queueName, limit],
    });
  } catch (error) {
    Logger.warn('[queue-monitor] Redis RPC recent jobs failed; returning no jobs', error);
    return [];
  }
};

const createRedisRpcRetryJob = async (
  queueName: string,
  jobId: string
): Promise<RetryJobResult> => {
  const client = await createRpcClient();
  return client.queue('retryJob', { target: queueName, args: [jobId] });
};

type RedisRpcJobSnapshot = {
  id?: string | number;
  state?: string;
};

const redisRpcRecoverActiveLockMs = (): number =>
  Math.max(1, Env.getInt('QUEUE_MONITOR_RECOVER_ACTIVE_LOCK_MS', 30_000));

const redisRpcBullMqPrefix = (): string =>
  Env.get('REDIS_RPC_BULLMQ_PREFIX', Env.get('BULLMQ_PREFIX', 'bull')).replace(/:+$/u, '');

const inspectRecoveredRedisRpcJob = async (
  client: RedisRpcClient,
  queueName: string,
  jobId: string
): Promise<RecoverActiveJobResult> => {
  const job = await client.queue<RedisRpcJobSnapshot | null>('getJob', {
    target: queueName,
    args: [jobId],
  });
  if (!job) return { ok: true, status: 'removed' };
  if (job.state === 'failed') return { ok: true, status: 'failed', state: job.state };
  if (job.state === 'delayed') {
    await client.queue('removeJob', { target: queueName, args: [jobId] });
    return { ok: true, status: 'removed_after_delayed_retry', state: job.state };
  }
  if (job.state && job.state !== 'active') {
    return { ok: true, status: 'moved', state: job.state };
  }
  return {
    ok: false,
    status: 'not_recoverable',
    reason: `Job is ${job.state ?? 'unknown'} after recovery attempt`,
  };
};

const createRedisRpcRecoverActiveJob = async (
  queueName: string,
  jobId: string
): Promise<RecoverActiveJobResult> => {
  const client = await createRpcClient();
  const existingJob = await client.queue<RedisRpcJobSnapshot | null>('getJob', {
    target: queueName,
    args: [jobId],
  });

  if (!existingJob) return { ok: false, status: 'missing' };
  if (existingJob.state !== 'active') {
    return {
      ok: false,
      status: 'not_active',
      reason: `Job is ${existingJob.state ?? 'unknown'}, not active`,
    };
  }

  const visibilityTimeoutMs = redisRpcRecoverActiveLockMs();
  try {
    await client.queue('fail', {
      target: queueName,
      args: [jobId, 'manual queue-monitor stale active recovery'],
      force: true,
      discard: true,
      visibilityTimeoutMs,
    });
  } catch {
    const prefix = redisRpcBullMqPrefix();
    await callRedisRpc('redis', 'call', {
      args: [
        'set',
        `${prefix}:${queueName}:${jobId}:lock`,
        'pull-worker',
        'PX',
        String(visibilityTimeoutMs),
      ],
    });
    await client.queue('fail', {
      target: queueName,
      args: [jobId, 'manual queue-monitor stale active recovery'],
    });
  }

  return inspectRecoveredRedisRpcJob(client, queueName, jobId);
};

const createRedisRpcGetQueues = async (): Promise<string[]> => {
  const client = await createRpcClient();
  try {
    const snapshot = await client.monitor<{ queues?: Array<{ name: string }> }>('getSnapshot');
    return (snapshot.queues ?? []).map((queue) => queue.name);
  } catch (error) {
    Logger.warn('[queue-monitor] Redis RPC queue discovery failed; returning no queues', error);
    return [];
  }
};

const createRedisRpcClose = async (): Promise<void> => {
  await Promise.resolve();
};

const createRedisRpcDriver = (): QueueDriver =>
  Object.freeze({
    enqueue: createRedisRpcEnqueue,
    getJob: createRedisRpcGetJob,
    getJobCounts: createRedisRpcGetJobCounts,
    getJobCountsMany: createRedisRpcGetJobCountsMany,
    getRecentJobs: createRedisRpcRecentJobs,
    retryJob: createRedisRpcRetryJob,
    recoverActiveJob: createRedisRpcRecoverActiveJob,
    getQueues: createRedisRpcGetQueues,
    close: createRedisRpcClose,
  });

async function enrichJobsWithState(jobs: Job[]): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (job as any)._state = await job.getState();
      } catch {
        // Ignore errors fetching state
      }
    })
  );
}

async function discoverQueuesFromRedis(
  redis: unknown,
  inMemoryQueues: Map<string, Queue>
): Promise<string[]> {
  const found = new Set<string>(Array.from(inMemoryQueues.keys()));
  try {
    let cursor = '0';
    let shouldContinue = true;
    const prefix = getBullMQSafeQueueName();
    const scanAsync = (cur: string): Promise<[string, string[]]> =>
      (redis as { scan: (cur: string, ...args: string[]) => Promise<[string, string[]]> }).scan(
        cur,
        'MATCH',
        prefix + ':*',
        'COUNT',
        '100'
      );

    while (shouldContinue) {
      // Redis scan must be sequential as it depends on the cursor from previous result
      // eslint-disable-next-line no-await-in-loop
      const result = await scanAsync(cursor);
      cursor = result[0];
      const keys = result[1] ?? [];
      keys.forEach((k) => {
        const parts = k.split(':');
        if (parts.length >= 2 && k.startsWith(prefix + ':')) {
          const name = parts[1];
          if (name) found.add(name);
        }
      });
      shouldContinue = cursor !== '0';
    }
  } catch {
    // ignore discovery errors
  }
  return Array.from(found.values());
}

const createBullMQQueueGetter = (
  queues: Map<string, Queue>,
  redis: unknown
): ((name: string) => Promise<Queue>) => {
  return async (name: string): Promise<Queue> => {
    if (!queues.has(name)) {
      const QueueConstructor = await ensureBullmqLoaded();
      const prefix = getBullMQSafeQueueName();
      const queue = new QueueConstructor(name, { prefix, connection: redis as ConnectionOptions });
      queues.set(name, queue);
    }

    const queue = queues.get(name);
    if (!queue) {
      throw ErrorFactory.createTryCatchError(`Queue initialization failed for ${name}`);
    }

    return queue;
  };
};

const createBullMQEnqueue =
  (getQueue: (name: string) => Promise<Queue>) =>
  async <T>(name: string, payload: T, options?: JobsOptions): Promise<string> => {
    const queue = await getQueue(name);
    const job = await queue.add('default', payload, {
      removeOnComplete: true,
      removeOnFail: false,
      ...options,
    });

    if (job.id === undefined || job.id === null) {
      throw ErrorFactory.createTryCatchError(`Queue job id missing for ${name}`);
    }

    return String(job.id);
  };

const createBullMQGetJob =
  (getQueue: (name: string) => Promise<Queue>) =>
  async (queueName: string, jobId: string): Promise<Job | undefined> => {
    const queue = await getQueue(queueName);
    return (await queue.getJob(jobId)) || undefined;
  };

const createBullMQGetJobCounts =
  (getQueue: (name: string) => Promise<Queue>) =>
  async (queueName: string): Promise<JobCounts> => {
    const queue = await getQueue(queueName);
    return queue.getJobCounts();
  };

const createBullMQGetJobCountsMany =
  (getJobCounts: (queueName: string) => Promise<JobCounts>) =>
  async (
    queueNames: string[]
  ): Promise<Array<{ name: string; counts: Record<string, number> }>> => {
    const uniqueQueueNames = Array.from(
      new Set(
        queueNames.filter(
          (queueName) => typeof queueName === 'string' && queueName.trim().length > 0
        )
      )
    );
    const QUEUE_MONITOR_LOGGING_ENABLED = Env.getBool('QUEUE_MONITOR_LOGGING_ENABLED', false);
    if (QUEUE_MONITOR_LOGGING_ENABLED) {
      Logger.info('[queue-monitor] getJobCountsMany start', {
        requestedCount: queueNames.length,
        uniqueCount: uniqueQueueNames.length,
      });
    }

    const startedAt = Date.now();
    if (uniqueQueueNames.length === 0) {
      if (QUEUE_MONITOR_LOGGING_ENABLED) {
        Logger.info('[queue-monitor] getJobCountsMany complete', {
          durationMs: Date.now() - startedAt,
          requestedCount: queueNames.length,
          uniqueCount: uniqueQueueNames.length,
          pipelineCount: 0,
        });
      }
      return [];
    }

    const stats = await Promise.all(
      uniqueQueueNames.map(async (name) => {
        const counts = await getJobCounts(name);
        return { name, counts };
      })
    );

    if (QUEUE_MONITOR_LOGGING_ENABLED) {
      Logger.info('[queue-monitor] getJobCountsMany complete', {
        durationMs: Date.now() - startedAt,
        requestedCount: queueNames.length,
        uniqueCount: uniqueQueueNames.length,
        pipelineCount: uniqueQueueNames.length,
      });
    }

    return stats;
  };

const createBullMQRequeueFromSnapshot =
  (queue: Queue) =>
  async (snapshot: RetrySnapshot): Promise<RetryJobResult> => {
    try {
      const requeued = await queue.add(snapshot.name ?? 'default', snapshot.data, snapshot.opts);
      return {
        ok: true,
        status: 'requeued_from_snapshot',
        newJobId:
          requeued.id === undefined || requeued.id === null ? undefined : String(requeued.id),
      };
    } catch (error) {
      return {
        ok: false,
        status: 'not_retryable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

const createBullMQRetryJob =
  (
    getQueue: (name: string) => Promise<Queue>,
    getJob: (q: string, id: string) => Promise<Job | undefined>
  ) =>
  async (queueName: string, jobId: string, snapshot?: RetrySnapshot): Promise<RetryJobResult> => {
    const queue = await getQueue(queueName);
    const job = await getJob(queueName, jobId);
    if (!job) {
      if (snapshot) return createBullMQRequeueFromSnapshot(queue)(snapshot);
      return { ok: false, status: 'missing' };
    }

    try {
      await job.retry();
      return { ok: true, status: 'retried' };
    } catch (error) {
      return {
        ok: false,
        status: 'not_retryable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

const createBullMQRecoverActiveJob =
  (
    getQueue: (name: string) => Promise<Queue>,
    getJob: (q: string, id: string) => Promise<Job | undefined>
  ) =>
  async (queueName: string, jobId: string): Promise<RecoverActiveJobResult> => {
    const queue = await getQueue(queueName);
    const job = await getJob(queueName, jobId);
    if (!job) return { ok: false, status: 'missing' };

    const state = await job.getState().catch(() => undefined);
    if (state !== 'active') {
      return {
        ok: false,
        status: 'not_active',
        reason: `Job is ${state ?? 'unknown'}, not active`,
      };
    }

    try {
      job.discard();
      const queueWithClient = queue as unknown as {
        client: Promise<{ set: (...args: string[]) => Promise<unknown> }>;
      };
      const client = await queueWithClient.client;
      await client.set(
        queue.toKey(jobId) + ':lock',
        'pull-worker',
        'PX',
        String(Math.max(1, Env.getInt('QUEUE_MONITOR_RECOVER_ACTIVE_LOCK_MS', 30_000)))
      );
      await job.moveToFailed(
        new Error('manual queue-monitor stale active recovery'),
        'pull-worker',
        false
      );
      return { ok: true, status: 'failed' };
    } catch (error) {
      return {
        ok: false,
        status: 'not_recoverable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

const createBullMQGetRecentJobs =
  (getQueue: (name: string) => Promise<Queue>) =>
  async (queueName: string, limit = 100): Promise<Job[]> => {
    const queue = await getQueue(queueName);
    const jobs = await queue.getJobs(
      ['completed', 'failed', 'active', 'waiting', 'delayed', 'paused'],
      0,
      Math.max(0, limit - 1),
      true
    );

    await enrichJobsWithState(jobs);

    return jobs;
  };

const createBullMQGetQueues =
  (redis: unknown, queues: Map<string, Queue>) => async (): Promise<string[]> =>
    discoverQueuesFromRedis(redis, queues);

const createBullMQClose = (queues: Map<string, Queue>) => async (): Promise<void> => {
  const closes = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(closes);
};

export const createBullMQDriver = (config: RedisConfig): QueueDriver => {
  if (shouldUseZedgiMonitorDriver()) {
    if (registeredZedgiMonitorDriverFactory === undefined) {
      throw ErrorFactory.createConfigError('Zedgi monitor driver factory is not registered');
    }
    return registeredZedgiMonitorDriverFactory(config);
  }

  if (shouldUseRedisRpcMonitorDriver()) return createRedisRpcDriver();

  const queues = new Map<string, Queue>();
  const redis = createRedisConnection(config, 3, {
    subsystem: 'queue-monitor',
  });
  const getQueue = createBullMQQueueGetter(queues, redis);

  return Object.freeze({
    enqueue: createBullMQEnqueue(getQueue),
    getJob: createBullMQGetJob(getQueue),
    getJobCounts: createBullMQGetJobCounts(getQueue),
    getJobCountsMany: createBullMQGetJobCountsMany(createBullMQGetJobCounts(getQueue)),
    getRecentJobs: createBullMQGetRecentJobs(getQueue),
    retryJob: createBullMQRetryJob(getQueue, createBullMQGetJob(getQueue)),
    recoverActiveJob: createBullMQRecoverActiveJob(getQueue, createBullMQGetJob(getQueue)),
    getQueues: createBullMQGetQueues(redis, queues),
    close: createBullMQClose(queues),
  });
};
