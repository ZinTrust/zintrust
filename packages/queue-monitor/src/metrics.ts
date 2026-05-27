import { RedisKeys } from '@zintrust/core/queue';
import { type Job, type JobsOptions } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection';

export type JobStatus = 'completed' | 'failed';

export type JobSummary = {
  id: string | undefined;
  name: string;
  queue?: string;
  data: unknown;
  opts?: JobsOptions;
  attempts: number;
  status?: string;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
};

export type Metrics = {
  recordJob(queue: string, status: JobStatus, job: Job, error?: Error): Promise<void>;
  getStats(
    queue: string,
    minutes?: number
  ): Promise<Array<{ time: string; completed: number; failed: number }>>;
  getRecentJobs(queue: string): Promise<JobSummary[]>;
  getFailedJobs(queue: string): Promise<JobSummary[]>;
  close: () => Promise<void>;
};

/**
 * Creates a queue monitoring key using singleton RedisKeys
 * @param type - Type of monitoring key (stats, recent, failed)
 * @param parts - Additional key parts
 * @returns Prefixed Redis key for queue monitoring
 */
const getKey = (type: string, ...parts: string[]): string => {
  const suffix = parts.length > 0 ? `:${parts.join(':')}` : '';
  return `${RedisKeys.queuePrefix}monitor:${type}${suffix}`;
};

const recordJobImpl = async (
  redis: ReturnType<typeof createRedisConnection>,
  queue: string,
  status: JobStatus,
  job: Job,
  error?: Error
): Promise<void> => {
  const minute = Math.floor(Date.now() / 60000);
  const dateKey = getKey('stats', queue, minute.toString());

  const jobData: JobSummary = {
    id: job.id,
    name: job.name,
    data: job.data,
    opts: job.opts,
    attempts: job.attemptsMade,
    failedReason: job.failedReason || error?.message,
    timestamp: Date.now(),
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };

  const pipeline = redis.pipeline();
  pipeline.hincrby(dateKey, status, 1);
  pipeline.expire(dateKey, 86400);

  const listKey = getKey('recent', queue);
  pipeline.lpush(listKey, JSON.stringify(jobData));
  pipeline.ltrim(listKey, 0, 99);

  if (status === 'failed') {
    const failedKey = getKey('failed', queue);
    pipeline.lpush(failedKey, JSON.stringify(jobData));
    pipeline.ltrim(failedKey, 0, 99);
  }

  await pipeline.exec();
};

const getStatsImpl = async (
  redis: ReturnType<typeof createRedisConnection>,
  queue: string,
  minutes: number
): Promise<Array<{ time: string; completed: number; failed: number }>> => {
  const currentMinute = Math.floor(Date.now() / 60000);
  const keys = [];
  const timestamps: number[] = [];

  for (let i = 0; i < minutes; i++) {
    const m = currentMinute - i;
    timestamps.push(m);
    keys.push(getKey('stats', queue, m.toString()));
  }

  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  keys.forEach((k) => pipeline.hgetall(k));
  const results = await pipeline.exec();

  if (!results) return [];

  return results
    .map((result: unknown, i: number) => {
      const [err, data] = result as [Error | null, Record<string, string>];
      if (err || !data)
        return {
          time: new Date(timestamps[i] * 60000).toISOString(),
          completed: 0,
          failed: 0,
        };
      return {
        time: new Date(timestamps[i] * 60000).toISOString(),
        completed: Number.parseInt(data['completed'] || '0', 10),
        failed: Number.parseInt(data['failed'] || '0', 10),
      };
    })
    .reverse();
};

export const createMetrics = (config: RedisConfig): Metrics => {
  const redis = createRedisConnection(config, 3, { subsystem: 'queue-monitor-metrics' });

  return Object.freeze({
    recordJob: (queue, status, job, error) => recordJobImpl(redis, queue, status, job, error),

    getStats: (queue, minutes = 60) => getStatsImpl(redis, queue, minutes),

    getRecentJobs: async (queue: string): Promise<JobSummary[]> => {
      const list = await redis.lrange(getKey('recent', queue), 0, -1);
      return list.map((item: string) => JSON.parse(item) as JobSummary);
    },

    getFailedJobs: async (queue: string): Promise<JobSummary[]> => {
      const list = await redis.lrange(getKey('failed', queue), 0, -1);
      return list.map((item: string) => JSON.parse(item) as JobSummary);
    },

    close: async (): Promise<void> => {
      if (typeof redis.quit === 'function') {
        await redis.quit();
      } else if (typeof redis.disconnect === 'function') {
        redis.disconnect();
      }
    },
  });
};
