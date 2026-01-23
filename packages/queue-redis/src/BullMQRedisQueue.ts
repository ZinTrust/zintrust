import type { QueueMessage } from '@zintrust/core';
import { createBaseDrivers, Env, ErrorFactory, generateUuid, Logger } from '@zintrust/core';
import { Queue, type JobsOptions } from 'bullmq';

interface IQueueDriver {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
}

/**
 * BullMQ Redis Queue Driver
 *
 * Implements the same interface as the basic Redis driver but uses BullMQ internally.
 * This provides enterprise features while maintaining full API compatibility.
 */
export const BullMQRedisQueue = ((): IQueueDriver => {
  const queues = new Map<string, Queue>();

  const getRedisConfig = (): { host: string; port: number; password?: string; db: number } => {
    const redisConfig = createBaseDrivers().redis;
    return {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.database,
    };
  };

  const getQueue = (queueName: string): Queue => {
    if (queues.has(queueName)) {
      const existingQueue = queues.get(queueName);
      if (existingQueue) return existingQueue;
    }

    const config = getRedisConfig();

    // Customizable BullMQ settings from environment
    const removeOnComplete = Env.getInt('BULLMQ_REMOVE_ON_COMPLETE', 100);
    const removeOnFail = Env.getInt('BULLMQ_REMOVE_ON_FAIL', 50);
    const attempts = Env.getInt('BULLMQ_DEFAULT_ATTEMPTS', 3);
    const backoffDelay = Env.getInt('BULLMQ_BACKOFF_DELAY', 2000);
    const backoffType = Env.get('BULLMQ_BACKOFF_TYPE', 'exponential');

    const queue = new Queue(queueName, {
      connection: config,
      defaultJobOptions: {
        removeOnComplete,
        removeOnFail,
        attempts,
        backoff: {
          type: backoffType as 'exponential' | 'fixed' | 'custom',
          delay: backoffDelay,
        },
      },
    });

    queues.set(queueName, queue);
    return queue;
  };

  return {
    async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
      try {
        const q = getQueue(queue);
        const id = generateUuid();

        const jobOptions: JobsOptions = {
          jobId: id,
        };

        const job = await q.add(`${queue}-job`, payload, jobOptions);
        Logger.debug(`BullMQ: Job enqueued to ${queue}`, { jobId: job.id, queue });

        return String(job.id);
      } catch (error) {
        Logger.error('BullMQ: Failed to enqueue job', error as Error);
        throw ErrorFactory.createTryCatchError('Failed to enqueue job via BullMQ', error as Error);
      }
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      try {
        const q = getQueue(queue);

        const jobs = await q.getJobs(['waiting'], 0, 1);
        if (jobs.length === 0) return undefined;

        const job = jobs[0];

        const message: QueueMessage<T> = {
          id: String(job.id),
          payload: job.data as T,
          attempts: job.attemptsMade || 0,
        };

        await job.remove();

        Logger.debug(`BullMQ: Job dequeued from ${queue}`, {
          jobId: job.id,
          payload: message.payload,
        });
        return message;
      } catch (error) {
        Logger.error('BullMQ: Failed to dequeue job', error as Error);
        throw ErrorFactory.createTryCatchError('Failed to dequeue job via BullMQ', error as Error);
      }
    },

    async ack(_queue: string, _id: string): Promise<void> {
      Logger.debug(`BullMQ: ACK called for job ${_id} in queue ${_queue} (handled automatically)`);
    },

    async length(queue: string): Promise<number> {
      try {
        const q = getQueue(queue);
        const counts = await q.getJobCounts();

        return counts.waiting || 0;
      } catch (error) {
        Logger.error('BullMQ: Failed to get queue length', error as Error);
        throw ErrorFactory.createTryCatchError(
          'Failed to get queue length via BullMQ',
          error as Error
        );
      }
    },

    async drain(queue: string): Promise<void> {
      try {
        const q = getQueue(queue);
        await q.drain();
        Logger.debug(`BullMQ: Queue ${queue} drained`);
      } catch (error) {
        Logger.error('BullMQ: Failed to drain queue', error as Error);
        throw ErrorFactory.createTryCatchError('Failed to drain queue via BullMQ', error as Error);
      }
    },
  } as const;
})();

export default BullMQRedisQueue;
