import { getBullMQSafeQueueName } from '@zintrust/core';
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
  const prefix = getBullMQSafeQueueName();

  const worker = new Worker(queueName, processor, {
    connection: connection as unknown as RedisConfig,
    prefix,
  });

  const onCompleted = async (job: Job) => {
    await metrics.recordJob(queueName, 'completed', job);
  };

  const onFailed = async (job: Job | undefined, err: Error) => {
    if (job) {
      await metrics.recordJob(queueName, 'failed', job, err);
    }
  };

  worker.on('completed', onCompleted);
  worker.on('failed', onFailed);

  const close = async (): Promise<void> => {
    worker.off('completed', onCompleted);
    worker.off('failed', onFailed);
    await worker.close();
    if (typeof connection.quit === 'function') {
      await connection.quit();
    } else if (typeof connection.disconnect === 'function') {
      connection.disconnect();
    }
  };

  return Object.freeze({
    close,
  });
};
