import { type Job } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection';

export type JobStatus = 'completed' | 'failed';

export type JobSummary = {
  id: string | undefined;
  name: string;
  data: unknown;
  attempts: number;
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
};

const getKey = (prefix: string, type: string, ...parts: string[]): string => {
  return `${prefix}:${type}:${parts.join(':')}`;
};

const recordJobImpl = async (
  redis: ReturnType<typeof createRedisConnection>,
  prefix: string,
  queue: string,
  status: JobStatus,
  job: Job,
  error?: Error
): Promise<void> => {
  const minute = Math.floor(Date.now() / 60000);
  const dateKey = getKey(prefix, 'stats', queue, minute.toString());

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

  const listKey = getKey(prefix, 'recent', queue);
  await redis.lpush(listKey, JSON.stringify(jobData));
  await redis.ltrim(listKey, 0, 99);

  if (status === 'failed') {
    const failedKey = getKey(prefix, 'failed', queue);
    await redis.lpush(failedKey, JSON.stringify(jobData));
    await redis.ltrim(failedKey, 0, 99);
  }
};

const getStatsImpl = async (
  redis: ReturnType<typeof createRedisConnection>,
  prefix: string,
  queue: string,
  minutes: number
): Promise<Array<{ time: string; completed: number; failed: number }>> => {
  const currentMinute = Math.floor(Date.now() / 60000);
  const keys = [];
  const timestamps: number[] = [];

  for (let i = 0; i < minutes; i++) {
    const m = currentMinute - i;
    timestamps.push(m);
    keys.push(getKey(prefix, 'stats', queue, m.toString()));
  }

  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  keys.forEach((k) => pipeline.hgetall(k));
  const results = await pipeline.exec();

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return results!
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
        completed: Number.parseInt(data.completed || '0', 10),
        failed: Number.parseInt(data.failed || '0', 10),
      };
    })
    .reverse();
};

export const createMetrics = (config: RedisConfig): Metrics => {
  const redis = createRedisConnection(config);
  const prefix = 'monitor';

  return Object.freeze({
    recordJob: (queue, status, job, error) =>
      recordJobImpl(redis, prefix, queue, status, job, error),

    getStats: (queue, minutes = 60) => getStatsImpl(redis, prefix, queue, minutes),

    getRecentJobs: async (queue: string): Promise<JobSummary[]> => {
      const list = await redis.lrange(getKey(prefix, 'recent', queue), 0, -1);
      return list.map((item) => JSON.parse(item) as JobSummary);
    },

    getFailedJobs: async (queue: string): Promise<JobSummary[]> => {
      const list = await redis.lrange(getKey(prefix, 'failed', queue), 0, -1);
      return list.map((item) => JSON.parse(item) as JobSummary);
    },
  });
};
