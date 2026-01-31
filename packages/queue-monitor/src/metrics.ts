import { RedisKeys } from '@zintrust/core';
import { type Job } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection';

export type JobStatus = 'completed' | 'failed';

export type JobSummary = {
  id: string | undefined;
  name: string;
  data: unknown;
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

  await redis.hincrby(dateKey, status, 1);
  await redis.expire(dateKey, 86400);

  const jobData: JobSummary = {
    id: job.id,
    name: job.name,
    data: job.data,
    attempts: job.attemptsMade,
    failedReason: job.failedReason || error?.message,
    timestamp: Date.now(),
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };

  const listKey = getKey('recent', queue);
  await redis.lpush(listKey, JSON.stringify(jobData));
  await redis.ltrim(listKey, 0, 99);

  if (status === 'failed') {
    const failedKey = getKey('failed', queue);
    await redis.lpush(failedKey, JSON.stringify(jobData));
    await redis.ltrim(failedKey, 0, 99);
  }
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
    .map((result, i) => {
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
  const redis = createRedisConnection(config);

  return Object.freeze({
    recordJob: (queue, status, job, error) => recordJobImpl(redis, queue, status, job, error),

    getStats: (queue, minutes = 60) => getStatsImpl(redis, queue, minutes),

    getRecentJobs: async (queue: string): Promise<JobSummary[]> => {
      const list = await redis.lrange(getKey('recent', queue), 0, -1);
      return list.map((item) => JSON.parse(item) as JobSummary);
    },

    getFailedJobs: async (queue: string): Promise<JobSummary[]> => {
      const list = await redis.lrange(getKey('failed', queue), 0, -1);
      return list.map((item) => JSON.parse(item) as JobSummary);
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
