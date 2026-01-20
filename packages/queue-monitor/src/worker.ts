import { Worker, type Job, type Processor } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection';
import type { Metrics } from './metrics';

export type QueueWorker = {
  close: () => Promise<void>;
};

export const createWorker = (
  queueName: string,
  processor: Processor,
  redisConfig: RedisConfig,
  metrics: Metrics
): QueueWorker => {
  const connection = createRedisConnection(redisConfig);

  const worker = new Worker(queueName, processor, {
    connection: connection as unknown as RedisConfig,
  });

  worker.on('completed', async (job: Job) => {
    await metrics.recordJob(queueName, 'completed', job);
  });

  worker.on('failed', async (job: Job | undefined, err: Error) => {
    if (job) {
      await metrics.recordJob(queueName, 'failed', job, err);
    }
  });

  const close = async (): Promise<void> => {
    await worker.close();
  };

  return Object.freeze({
    close,
  });
};
