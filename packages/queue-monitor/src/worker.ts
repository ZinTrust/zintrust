import { getBullMQSafeQueueName } from '@zintrust/core/redis';
import type { Job, Processor } from 'bullmq';
import { createRedisConnection, type RedisConfig } from './connection.js';
import type { Metrics } from './metrics.js';

export type QueueWorker = {
  close: () => Promise<void>;
};

export const createWorker = async (
  queueName: string,
  processor: Processor,
  redisConfig: RedisConfig,
  metrics: Metrics
): Promise<QueueWorker> => {
  const connection = createRedisConnection(redisConfig, 3, { subsystem: 'queue-monitor-worker' });
  const prefix = getBullMQSafeQueueName();

  // Variable specifier so bundlers do not inline bullmq into the Workers bundle.
  const bullmqPkg = 'bullmq';
  const { Worker } = await import(bullmqPkg);

  const worker = new Worker(queueName, processor, {
    connection: connection as unknown as RedisConfig,
    prefix,
  });

  const onCompleted = async (job: Job): Promise<void> => {
    await metrics.recordJob(queueName, 'completed', job);
  };

  const onFailed = async (job: Job | undefined, err: Error): Promise<void> => {
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
