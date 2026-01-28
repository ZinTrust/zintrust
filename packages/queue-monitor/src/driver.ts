import { ErrorFactory, getBullMQSafeQueueName } from '@zintrust/core';
import type { ConnectionOptions, Job, JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection';

export type JobPayload<T = unknown> = T;

export type JobCounts = Record<string, number>;

export type QueueDriver = {
  enqueue<T>(name: string, payload: T, options?: JobsOptions): Promise<string>;
  getJob(queueName: string, jobId: string): Promise<Job | undefined>;
  getJobCounts(queueName: string): Promise<JobCounts>;
  getRecentJobs(queueName: string, limit?: number): Promise<Job[]>;
  retryJob(queueName: string, jobId: string): Promise<boolean>;
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
  redis: ReturnType<typeof createRedisConnection>,
  inMemoryQueues: Map<string, Queue>
): Promise<string[]> {
  const found = new Set<string>(Array.from(inMemoryQueues.keys()));
  try {
    let cursor = '0';
    let shouldContinue = true;
    const prefix = getBullMQSafeQueueName();
    const scanAsync = (cur: string): Promise<[string, string[]]> =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (redis as any).scan(cur, 'MATCH', prefix + ':*', 'COUNT', '100');

    while (shouldContinue) {
      // eslint-disable-next-line no-await-in-loop
      const result = await scanAsync(cursor);
      cursor = result[0];
      const keys = result[1] ?? [];
      keys.forEach((k) => {
        const parts = k.split(':');
        if (parts.length >= 2 && parts[0] === 'bull') {
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

export const createBullMQDriver = (config: RedisConfig): QueueDriver => {
  const queues = new Map<string, Queue>();
  const redis = createRedisConnection(config);
  const getQueue = (name: string): Queue => {
    if (!queues.has(name)) {
      const prefix = getBullMQSafeQueueName();
      const connection = createRedisConnection(config);
      const queue = new Queue(name, { prefix, connection: connection as ConnectionOptions });
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

  const retryJob = async (queueName: string, jobId: string): Promise<boolean> => {
    const job = await getJob(queueName, jobId);
    if (!job) return false;

    try {
      await job.retry();
      return true;
    } catch {
      return false;
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
    getRecentJobs,
    retryJob,
    getQueues,
    close,
  });
};
