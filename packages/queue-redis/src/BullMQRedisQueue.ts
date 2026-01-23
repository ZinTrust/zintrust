import type { QueueMessage } from '@zintrust/core';
import {
  createBaseDrivers,
  createBullMQKey,
  Env,
  ErrorFactory,
  generateUuid,
  Logger,
} from '@zintrust/core';
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

    // Memory Leak Protection: Limit cached queues
    if (queues.size >= 50) {
      // Find queue with no activity or just remove oldest?
      // Since we can't easily track activity, we remove the first key (oldest)
      // and close it to release Redis connections.
      const oldestKey = queues.keys().next().value;
      if (oldestKey) {
        const oldQueue = queues.get(oldestKey);
        oldQueue?.close().catch((err) => Logger.error('BullMQ: Failed to close old queue', err));
        queues.delete(oldestKey);
        Logger.debug(`BullMQ: Cleaned up cached queue ${oldestKey} to free resources`);
      }
    }

    // Customizable BullMQ settings from environment
    const removeOnComplete = Env.getInt('BULLMQ_REMOVE_ON_COMPLETE', 100);
    const removeOnFail = Env.getInt('BULLMQ_REMOVE_ON_FAIL', 50);
    const attempts = Env.getInt('BULLMQ_DEFAULT_ATTEMPTS', 3);
    const backoffDelay = Env.getInt('BULLMQ_BACKOFF_DELAY', 2000);
    const backoffType = Env.get('BULLMQ_BACKOFF_TYPE', 'exponential');

    const queue = new Queue(createBullMQKey(queueName), {
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

        // Implements Visibility Timeout Pattern:
        // Move to delayed state (30s) to "lock" it from other consumers without losing data on crash.
        // If ack() is not called within 30s, the job reappears in waiting.
        // We use a fixed token 'pull-worker' as we don't have a specific worker ID in this context.
        await job.moveToDelayed(Date.now() + 30000, 'pull-worker');

        const message: QueueMessage<T> = {
          id: String(job.id),
          payload: job.data as T,
          attempts: job.attemptsMade || 0,
        };

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

    async ack(queue: string, id: string): Promise<void> {
      try {
        const q = getQueue(queue);
        const job = await q.getJob(id);

        if (job) {
          // Remove the job entirely upon success
          await job.remove();
          Logger.debug(`BullMQ: Job ${id} acked and removed from ${queue}`);
        } else {
          Logger.warn(`BullMQ: ACK failed - job ${id} not found in ${queue}`);
        }
      } catch (error) {
        Logger.error(`BullMQ: Failed to ack job ${id}`, error as Error);
      }
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
