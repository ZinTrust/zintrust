import { Queue, type Job, type JobsOptions } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection';

export type JobPayload<T = unknown> = T;

export type JobCounts = Record<string, number>;

export type QueueDriver = {
  enqueue<T>(name: string, payload: T, options?: JobsOptions): Promise<string>;
  getJob(queueName: string, jobId: string): Promise<Job | undefined>;
  getJobCounts(queueName: string): Promise<JobCounts>;
  getQueues(): Promise<string[]>;
  close(): Promise<void>;
};

export const createBullMQDriver = (config: RedisConfig): QueueDriver => {
  const queues = new Map<string, Queue>();

  const getQueue = (name: string): Queue => {
    if (!queues.has(name)) {
      const connection = createRedisConnection(config);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const queue = new Queue(name, { connection: connection as any });
      queues.set(name, queue);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return queues.get(name)!;
  };

  const enqueue = async <T>(name: string, payload: T, options?: JobsOptions): Promise<string> => {
    const queue = getQueue(name);
    const job = await queue.add('default', payload, {
      removeOnComplete: true,
      removeOnFail: false,
      ...options,
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return job.id!;
  };

  const getJob = async (queueName: string, jobId: string): Promise<Job | undefined> => {
    const queue = getQueue(queueName);
    return (await queue.getJob(jobId)) || undefined;
  };

  const getJobCounts = async (queueName: string): Promise<JobCounts> => {
    const queue = getQueue(queueName);
    return queue.getJobCounts();
  };

  const getQueues = async (): Promise<string[]> => {
    return Array.from(queues.keys());
  };

  const close = async (): Promise<void> => {
    const closes = Array.from(queues.values()).map((q) => q.close());
    await Promise.all(closes);
  };

  return Object.freeze({
    enqueue,
    getJob,
    getJobCounts,
    getQueues,
    close,
  });
};
