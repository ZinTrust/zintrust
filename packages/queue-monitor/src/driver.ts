import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { Logger } from '@zintrust/core/logger';
import { getBullMQSafeQueueName } from '@zintrust/core/redis';
import type { ConnectionOptions, Job, JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection.js';

export type JobPayload<T = unknown> = T;

export type JobCounts = Record<string, number>;

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
  const queues = new Map<string, Queue>();
  const requireDirectForScripts =
    Env.getBool('REDIS_REQUIRE_DIRECT_FOR_SCRIPTS', true) && Env.getBool('USE_REDIS_PROXY', false);
  let redis: unknown;
  // TODO remove when proxy convert to rpc
  if (requireDirectForScripts) {
    redis = {
      host: config.host,
      port: config.port,
      db: config.db,
      password: config.password,
    };
  } else {
    redis = createRedisConnection(config, 3, {
      subsystem: 'queue-monitor',
    });
  }
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
    Logger.info('[queue-monitor] getJobCountsMany start', {
      requestedCount: queueNames.length,
      uniqueCount: uniqueQueueNames.length,
    });
    const startedAt = Date.now();
    if (uniqueQueueNames.length === 0) {
      Logger.info('[queue-monitor] getJobCountsMany complete', {
        durationMs: Date.now() - startedAt,
        requestedCount: queueNames.length,
        uniqueCount: uniqueQueueNames.length,
        pipelineCount: 0,
      });
      return [];
    }

    const stats = await Promise.all(
      uniqueQueueNames.map(async (name) => {
        const counts = await getJobCounts(name);
        return { name, counts };
      })
    );

    Logger.info('[queue-monitor] getJobCountsMany complete', {
      durationMs: Date.now() - startedAt,
      requestedCount: queueNames.length,
      uniqueCount: uniqueQueueNames.length,
      pipelineCount: uniqueQueueNames.length,
    });
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
