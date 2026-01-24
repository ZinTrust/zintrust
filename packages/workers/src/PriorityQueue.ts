/**
 * Priority Queue Manager
 * BullMQ priority levels with datacenter affinity
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger, type RedisConfig } from '@zintrust/core';
import { BullMQRedisQueue } from '@zintrust/queue-redis';
import type { Queue } from 'bullmq';

export type PriorityLevel = 'critical' | 'high' | 'normal' | 'low';

export type JobPriority = {
  level: PriorityLevel;
  value: number;
};

export type DatacenterAffinity = {
  preferred: string[];
  fallback: string[];
};

export type PriorityJobOptions = {
  priority: PriorityLevel;
  datacenter?: DatacenterAffinity;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
};

export type QueueInfo = {
  name: string;
  isPaused: boolean;
  jobCounts: {
    active: number;
    waiting: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
};

// Priority mappings
const PRIORITY_VALUES: Record<PriorityLevel, number> = {
  critical: 10,
  high: 5,
  normal: 1,
  low: 0,
};

/**
 * Helper: Get or create queue via shared driver
 */
const getQueue = (queueName: string): Queue => {
  return BullMQRedisQueue.getQueue(queueName);
};

/**
 * Helper: Build job options with priority
 */
const buildJobOptions = (options: PriorityJobOptions): Record<string, unknown> => {
  const jobOptions: Record<string, unknown> = {
    priority: PRIORITY_VALUES[options.priority],
  };

  if (options.delay !== undefined) {
    jobOptions['delay'] = options.delay;
  }

  if (options.attempts !== undefined) {
    jobOptions['attempts'] = options.attempts;
  }

  if (options.backoff) {
    jobOptions['backoff'] = options.backoff;
  }

  if (options.removeOnComplete !== undefined) {
    jobOptions['removeOnComplete'] = options.removeOnComplete;
  }

  if (options.removeOnFail !== undefined) {
    jobOptions['removeOnFail'] = options.removeOnFail;
  }

  // Store datacenter affinity in job data (workers can read this)
  if (options.datacenter) {
    jobOptions['datacenter'] = options.datacenter;
  }

  return jobOptions;
};

/**
 * Helper: Match datacenter affinity
 */
const matchesDatacenterAffinity = (
  jobDatacenter: DatacenterAffinity | undefined,
  workerRegion: string
): boolean => {
  if (!jobDatacenter) {
    return true; // No affinity, can be processed anywhere
  }

  // Check preferred datacenters first
  if (jobDatacenter.preferred.includes(workerRegion)) {
    return true;
  }

  // Check fallback datacenters
  if (jobDatacenter.fallback.includes(workerRegion)) {
    return true;
  }

  return false;
};

/**
 * Priority Queue Manager - Sealed namespace
 */
export const PriorityQueue = Object.freeze({
  /**
   * Initialize with Redis configuration
   */
  initialize(_config: RedisConfig): void {
    Logger.debug('PriorityQueue.initialize() called - auto-initialized via BullMQRedisQueue');
  },

  /**
   * Add a job to the queue with priority
   */
  async addJob<T = unknown>(
    queueName: string,
    jobName: string,
    data: T,
    options: PriorityJobOptions
  ): Promise<string> {
    const queue = getQueue(queueName);
    const jobOptions = buildJobOptions(options);

    try {
      const job = await queue.add(jobName, data, jobOptions);

      Logger.debug(`Added job "${jobName}" to queue "${queueName}"`, {
        jobId: job.id,
        priority: options.priority,
        datacenter: options.datacenter,
      });

      if (job.id === undefined) {
        throw ErrorFactory.createWorkerError(
          `Failed to add job "${jobName}" to queue "${queueName}": missing job id`
        );
      }

      return job.id;
    } catch (error) {
      Logger.error(`Failed to add job "${jobName}" to queue "${queueName}"`, error);
      throw error;
    }
  },

  /**
   * Add multiple jobs in bulk
   */
  async addBulk<T = unknown>(
    queueName: string,
    jobs: Array<{
      name: string;
      data: T;
      options: PriorityJobOptions;
    }>
  ): Promise<string[]> {
    const queue = getQueue(queueName);

    try {
      const bulkJobs = jobs.map((job) => ({
        name: job.name,
        data: job.data,
        opts: buildJobOptions(job.options),
      }));

      const addedJobs = await queue.addBulk(bulkJobs);

      Logger.info(`Added ${addedJobs.length} jobs to queue "${queueName}"`);

      return addedJobs.map((job) => {
        if (job.id === undefined) {
          throw ErrorFactory.createWorkerError(
            `Failed to add job to queue "${queueName}": missing job id`
          );
        }
        return job.id;
      });
    } catch (error) {
      Logger.error(`Failed to add bulk jobs to queue "${queueName}"`, error);
      throw error;
    }
  },

  /**
   * Get job by ID
   */
  async getJob(queueName: string, jobId: string) {
    const queue = getQueue(queueName);
    return queue.getJob(jobId);
  },

  /**
   * Remove a job
   */
  async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (job) {
      await job.remove();
      Logger.debug(`Removed job ${jobId} from queue "${queueName}"`);
    }
  },

  /**
   * Pause a queue
   */
  async pause(queueName: string): Promise<void> {
    const queue = getQueue(queueName);
    await queue.pause();
    Logger.info(`Paused queue "${queueName}"`);
  },

  /**
   * Resume a queue
   */
  async resume(queueName: string): Promise<void> {
    const queue = getQueue(queueName);
    await queue.resume();
    Logger.info(`Resumed queue "${queueName}"`);
  },

  /**
   * Get queue information
   */
  async getQueueInfo(queueName: string): Promise<QueueInfo> {
    const queue = getQueue(queueName);
    const isPaused = await queue.isPaused();
    const jobCounts = await queue.getJobCounts();

    return {
      name: queueName,
      isPaused,
      jobCounts: {
        active: jobCounts['active'] || 0,
        waiting: jobCounts['waiting'] || 0,
        completed: jobCounts['completed'] || 0,
        failed: jobCounts['failed'] || 0,
        delayed: jobCounts['delayed'] || 0,
        paused: jobCounts['paused'] || 0,
      },
    };
  },

  /**
   * Get all queue names
   */
  getQueueNames(): string[] {
    return BullMQRedisQueue.getQueueNames();
  },

  /**
   * Drain queue (remove all jobs)
   */
  async drain(queueName: string, delayed = false): Promise<void> {
    const queue = getQueue(queueName);
    await queue.drain(delayed);
    Logger.info(`Drained queue "${queueName}"`, { delayed });
  },

  /**
   * Clean old jobs from queue
   */
  async clean(
    queueName: string,
    grace: number,
    limit: number,
    type: 'completed' | 'failed' | 'delayed' | 'wait' | 'active' | 'paused' = 'completed'
  ): Promise<string[]> {
    const queue = getQueue(queueName);
    const jobs = await queue.clean(grace, limit, type);

    Logger.info(`Cleaned ${jobs.length} ${type} jobs from queue "${queueName}"`);

    return jobs;
  },

  /**
   * Obliterate queue (remove all data including queue itself)
   */
  async obliterate(queueName: string, force = false): Promise<void> {
    const queue = getQueue(queueName);
    await queue.obliterate({ force });
    await BullMQRedisQueue.closeQueue(queueName);

    Logger.warn(`Obliterated queue "${queueName}"`);
  },

  /**
   * Get priority value for level
   */
  getPriorityValue(level: PriorityLevel): number {
    return PRIORITY_VALUES[level];
  },

  /**
   * Check if job matches datacenter affinity
   */
  matchesDatacenter(jobDatacenter: DatacenterAffinity | undefined, workerRegion: string): boolean {
    return matchesDatacenterAffinity(jobDatacenter, workerRegion);
  },

  /**
   * Get queue instance (internal use)
   */
  getQueueInstance(queueName: string): Queue {
    return getQueue(queueName);
  },

  /**
   * Close a queue
   */
  async closeQueue(queueName: string): Promise<void> {
    await BullMQRedisQueue.closeQueue(queueName);
    Logger.info(`Closed queue "${queueName}"`);
  },

  /**
   * Shutdown and close all queues
   */
  async shutdown(): Promise<void> {
    Logger.info('PriorityQueue shutting down via BullMQRedisQueue...');
    await BullMQRedisQueue.shutdown();
    Logger.info('PriorityQueue shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown
