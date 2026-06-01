import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { Logger } from '@zintrust/core/logger';
import { getBullMQSafeQueueName } from '@zintrust/core/redis';
import type { ConnectionOptions, Job, JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection.js';

export type JobPayload<T = unknown> = T;

export type JobCounts = Record<string, number>;

/**
 * Standard BullMQ job-count buckets, all zero. Used when the backing store is
 * unavailable so a queue is still listed (with empty counts) instead of being
 * dropped from the snapshot entirely.
 */
export const emptyCounts = (): JobCounts => ({
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
});

/**
 * Map a list of known queue names to entries with empty counts. Keeps the
 * dashboard showing the configured queues during transient backend outages.
 */
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

export type QueueDriver = {
  enqueue<T>(name: string, payload: T, options?: JobsOptions): Promise<string>;
  getJob(queueName: string, jobId: string): Promise<Job | undefined>;
  getJobCounts(queueName: string): Promise<JobCounts>;
  getJobCountsMany(
    queueNames: string[]
  ): Promise<Array<{ name: string; counts: Record<string, number> }>>;
  getRecentJobs(queueName: string, limit?: number): Promise<Job[]>;
  retryJob(queueName: string, jobId: string, snapshot?: RetrySnapshot): Promise<RetryJobResult>;
  getQueues(): Promise<string[]>;
  close(): Promise<void>;
};

type RedisRpcClient = {
  queue: <T = unknown>(method: string, payload?: Record<string, unknown>) => Promise<T>;
  monitor: <T = unknown>(method: string, payload?: Record<string, unknown>) => Promise<T>;
};

const shouldUseRedisRpcMonitorDriver = (): boolean =>
  Env.USE_REDIS_PROXY === true && Env.get('REDIS_RPC_URL', '').trim() !== '';

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

const createRedisRpcDriver = (): QueueDriver => {
  const enqueue = async <T>(name: string, payload: T, options?: JobsOptions): Promise<string> => {
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

  return Object.freeze({
    enqueue,
    async getJob(queueName: string, jobId: string): Promise<Job | undefined> {
      const client = await createRpcClient();
      try {
        return (await client.queue('getJob', { target: queueName, args: [jobId] })) as
          | Job
          | undefined;
      } catch (error) {
        Logger.warn('[queue-monitor] Redis RPC job lookup failed; returning no job', error);
        return undefined;
      }
    },
    async getJobCounts(queueName: string): Promise<JobCounts> {
      const client = await createRpcClient();
      try {
        return client.queue('getJobCounts', { target: queueName });
      } catch (error) {
        Logger.warn('[queue-monitor] Redis RPC job counts failed; returning empty counts', error);
        return {};
      }
    },
    async getJobCountsMany(
      queueNames: string[]
    ): Promise<Array<{ name: string; counts: Record<string, number> }>> {
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
    },
    async getRecentJobs(queueName: string, limit = 100): Promise<Job[]> {
      const client = await createRpcClient();
      try {
        return (await client.monitor('getRecentJobsForQueue', {
          args: [queueName, limit],
        })) as Job[];
      } catch (error) {
        Logger.warn('[queue-monitor] Redis RPC recent jobs failed; returning no jobs', error);
        return [];
      }
    },
    async retryJob(queueName: string, jobId: string): Promise<RetryJobResult> {
      const client = await createRpcClient();
      return client.queue('retryJob', { target: queueName, args: [jobId] });
    },
    async getQueues(): Promise<string[]> {
      const client = await createRpcClient();
      try {
        const snapshot = await client.monitor<{ queues?: Array<{ name: string }> }>('getSnapshot');
        return (snapshot.queues ?? []).map((queue) => queue.name);
      } catch (error) {
        Logger.warn('[queue-monitor] Redis RPC queue discovery failed; returning no queues', error);
        return [];
      }
    },
    async close(): Promise<void> {
      await Promise.resolve();
    },
  });
};

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

// eslint-disable-next-line max-lines-per-function
export const createBullMQDriver = (config: RedisConfig): QueueDriver => {
  if (shouldUseRedisRpcMonitorDriver()) return createRedisRpcDriver();

  const queues = new Map<string, Queue>();
  const redis = createRedisConnection(config, 3, {
    subsystem: 'queue-monitor',
  });
  const getQueue = (name: string): Queue => {
    if (!queues.has(name)) {
      const prefix = getBullMQSafeQueueName();
      const queue = new Queue(name, { prefix, connection: redis as ConnectionOptions });
      queues.set(name, queue);
    }
    const queue = queues.get(name);
    if (!queue) {
      throw ErrorFactory.createTryCatchError(`Queue initialization failed for ${name}`);
    }
    return queue;
  };

  const enqueue = async <T>(name: string, payload: T, options?: JobsOptions): Promise<string> => {
    const queue = getQueue(name);
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

  const getJob = async (queueName: string, jobId: string): Promise<Job | undefined> => {
    const queue = getQueue(queueName);
    return (await queue.getJob(jobId)) || undefined;
  };

  const getJobCounts = async (queueName: string): Promise<JobCounts> => {
    const queue = getQueue(queueName);
    return queue.getJobCounts();
  };

  const getJobCountsMany = async (
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

  const requeueFromSnapshot = async (
    queue: Queue,
    snapshot: RetrySnapshot
  ): Promise<RetryJobResult> => {
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

  const getRecentJobs = async (queueName: string, limit = 100): Promise<Job[]> => {
    const queue = getQueue(queueName);
    const jobs = await queue.getJobs(
      ['completed', 'failed', 'active', 'waiting', 'delayed', 'paused'],
      0,
      Math.max(0, limit - 1),
      true
    );

    // Fetch state for each job to ensure accurate status detection
    await enrichJobsWithState(jobs);

    return jobs;
  };

  const retryJob = async (
    queueName: string,
    jobId: string,
    snapshot?: RetrySnapshot
  ): Promise<RetryJobResult> => {
    const queue = getQueue(queueName);
    const job = await getJob(queueName, jobId);
    if (!job) {
      if (snapshot) return requeueFromSnapshot(queue, snapshot);

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

  const getQueues = async (): Promise<string[]> => {
    return discoverQueuesFromRedis(redis, queues);
  };

  const close = async (): Promise<void> => {
    const closes = Array.from(queues.values()).map((q) => q.close());
    await Promise.all(closes);
  };

  return Object.freeze({
    enqueue,
    getJob,
    getJobCounts,
    getJobCountsMany,
    getRecentJobs,
    retryJob,
    getQueues,
    close,
  });
};
