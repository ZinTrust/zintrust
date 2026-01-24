/**
 * Multi-Queue Worker Support
 * Enable workers to process multiple queues with different priorities
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger } from '@zintrust/core';
import { Worker, type Job, type WorkerOptions } from 'bullmq';
import { PriorityQueue } from './PriorityQueue';

export type QueueConfig = {
  name: string;
  concurrency: number;
  priority: number; // Higher number = higher priority
  enabled: boolean;
  rateLimit?: {
    max: number; // Max jobs per duration
    duration: number; // Duration in milliseconds
  };
};

export type MultiQueueWorkerConfig = {
  workerName: string;
  queues: QueueConfig[];
  processor: (job: Job) => Promise<unknown>;
  sharedConcurrency?: number; // Total concurrency across all queues
  defaultConcurrency?: number; // Default per-queue if not specified
};

export type QueueStats = {
  queueName: string;
  processed: number;
  failed: number;
  active: number;
  waiting: number;
  enabled: boolean;
  lastProcessedAt?: Date;
};

// Internal state
const multiQueueWorkers = new Map<
  string,
  {
    config: MultiQueueWorkerConfig;
    workers: Map<string, Worker>;
    stats: Map<string, QueueStats>;
  }
>();

/**
 * Helper: Create worker for a queue
 */
const createQueueWorker = (
  workerName: string,
  queueConfig: QueueConfig,
  processor: MultiQueueWorkerConfig['processor']
): Worker => {
  const queue = PriorityQueue.getQueueInstance(queueConfig.name);
  const connection = queue.opts.connection;

  const workerOptions: WorkerOptions = {
    connection,
    concurrency: queueConfig.concurrency,
    limiter: queueConfig.rateLimit,
    autorun: queueConfig.enabled,
    prefix: queue.opts.prefix,
  };

  const worker = new Worker(
    queueConfig.name,
    async (job: Job) => {
      Logger.debug(`Processing job from queue: ${queueConfig.name}`, {
        jobId: job.id,
        workerName,
      });

      return processor(job);
    },
    workerOptions
  );

  // Set up event listeners
  worker.on('completed', (job: Job) => {
    const stats = multiQueueWorkers.get(workerName)?.stats.get(queueConfig.name);
    if (stats) {
      stats.processed++;
      stats.lastProcessedAt = new Date();
    }

    Logger.debug(`Job completed from queue: ${queueConfig.name}`, {
      jobId: job.id,
      workerName,
    });
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    const stats = multiQueueWorkers.get(workerName)?.stats.get(queueConfig.name);
    if (stats) {
      stats.failed++;
    }

    Logger.error(`Job failed from queue: ${queueConfig.name}`, error, 'workers');
    Logger.debug('Queue job failure details', {
      jobId: job?.id,
      workerName,
      queueName: queueConfig.name,
    });
  });

  worker.on('active', (_job: Job) => {
    const stats = multiQueueWorkers.get(workerName)?.stats.get(queueConfig.name);
    if (stats) {
      stats.active++;
    }
  });

  return worker;
};

/**
 * Helper: Initialize stats for queue
 */
const initializeQueueStats = (queueName: string, enabled: boolean): QueueStats => {
  return {
    queueName,
    processed: 0,
    failed: 0,
    active: 0,
    waiting: 0,
    enabled,
  };
};

/**
 * Multi-Queue Worker Manager - Sealed namespace
 */
export const MultiQueueWorker = Object.freeze({
  /**
   * Create multi-queue worker
   */
  create(config: MultiQueueWorkerConfig): void {
    if (multiQueueWorkers.has(config.workerName)) {
      throw ErrorFactory.createWorkerError(
        `Multi-queue worker "${config.workerName}" already exists`
      );
    }

    const workers = new Map<string, Worker>();
    const stats = new Map<string, QueueStats>();

    // Sort queues by priority (higher first)
    const sortedQueues = [...config.queues].sort((a, b) => b.priority - a.priority);

    // Create workers for each queue
    for (const queueConfig of sortedQueues) {
      const worker = createQueueWorker(config.workerName, queueConfig, config.processor);
      workers.set(queueConfig.name, worker);
      stats.set(queueConfig.name, initializeQueueStats(queueConfig.name, queueConfig.enabled));
    }

    multiQueueWorkers.set(config.workerName, {
      config,
      workers,
      stats,
    });

    Logger.info(`Multi-queue worker created: ${config.workerName}`, {
      queues: sortedQueues.map((q) => q.name),
      totalConcurrency: sortedQueues.reduce((sum, q) => sum + q.concurrency, 0),
    });
  },

  /**
   * Start processing for a specific queue
   */
  async startQueue(workerName: string, queueName: string): Promise<void> {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    const worker = mqw.workers.get(queueName);

    if (!worker) {
      throw ErrorFactory.createNotFoundError(
        `Queue "${queueName}" not found in worker "${workerName}"`
      );
    }

    await worker.run();

    const stats = mqw.stats.get(queueName);
    if (stats) {
      stats.enabled = true;
    }

    Logger.info(`Queue started: ${queueName}`, { workerName });
  },

  /**
   * Stop processing for a specific queue
   */
  async stopQueue(workerName: string, queueName: string): Promise<void> {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    const worker = mqw.workers.get(queueName);

    if (!worker) {
      throw ErrorFactory.createNotFoundError(
        `Queue "${queueName}" not found in worker "${workerName}"`
      );
    }

    await worker.pause();

    const stats = mqw.stats.get(queueName);
    if (stats) {
      stats.enabled = false;
    }

    Logger.info(`Queue stopped: ${queueName}`, { workerName });
  },

  /**
   * Start all queues
   */
  async startAll(workerName: string): Promise<void> {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    const promises = Array.from(mqw.workers.keys()).map(async (queueName) =>
      MultiQueueWorker.startQueue(workerName, queueName)
    );

    await Promise.all(promises);

    Logger.info(`All queues started for worker: ${workerName}`);
  },

  /**
   * Stop all queues
   */
  async stopAll(workerName: string): Promise<void> {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    const promises = Array.from(mqw.workers.keys()).map(async (queueName) =>
      MultiQueueWorker.stopQueue(workerName, queueName)
    );

    await Promise.all(promises);

    Logger.info(`All queues stopped for worker: ${workerName}`);
  },

  /**
   * Update queue priority
   */
  updateQueuePriority(workerName: string, queueName: string, priority: number): void {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    const queueConfig = mqw.config.queues.find((q) => q.name === queueName);

    if (!queueConfig) {
      throw ErrorFactory.createNotFoundError(
        `Queue "${queueName}" not found in worker "${workerName}"`
      );
    }

    queueConfig.priority = priority;

    Logger.info(`Queue priority updated: ${queueName}`, { workerName, priority });
  },

  /**
   * Update queue concurrency
   */
  async updateQueueConcurrency(
    workerName: string,
    queueName: string,
    concurrency: number
  ): Promise<void> {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    const worker = mqw.workers.get(queueName);

    if (!worker) {
      throw ErrorFactory.createNotFoundError(
        `Queue "${queueName}" not found in worker "${workerName}"`
      );
    }

    const queueConfig = mqw.config.queues.find((q) => q.name === queueName);

    if (!queueConfig) {
      throw ErrorFactory.createNotFoundError(
        `Queue "${queueName}" not found in worker "${workerName}"`
      );
    }

    queueConfig.concurrency = concurrency;

    // Update worker concurrency (requires restart in BullMQ)
    await worker.close();

    const newWorker = createQueueWorker(workerName, queueConfig, mqw.config.processor);
    mqw.workers.set(queueName, newWorker);

    Logger.info(`Queue concurrency updated: ${queueName}`, { workerName, concurrency });
  },

  /**
   * Get stats for a queue
   */
  async getQueueStats(workerName: string, queueName: string): Promise<QueueStats> {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    const stats = mqw.stats.get(queueName);

    if (!stats) {
      throw ErrorFactory.createNotFoundError(
        `Stats for queue "${queueName}" not found in worker "${workerName}"`
      );
    }

    // Update waiting count from queue
    PriorityQueue.getQueueInstance(queueName);
    const queueInfo = await PriorityQueue.getQueueInfo(queueName);

    stats.waiting = queueInfo.jobCounts.waiting;

    return { ...stats };
  },

  /**
   * Get stats for all queues
   */
  async getAllStats(workerName: string): Promise<ReadonlyArray<QueueStats>> {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    const allStats = await Promise.all(
      Array.from(mqw.workers.keys()).map(async (queueName) =>
        MultiQueueWorker.getQueueStats(workerName, queueName)
      )
    );

    return allStats;
  },

  /**
   * Get configuration
   */
  getConfig(workerName: string): MultiQueueWorkerConfig | null {
    const mqw = multiQueueWorkers.get(workerName);
    return mqw ? { ...mqw.config } : null;
  },

  /**
   * List all multi-queue workers
   */
  list(): string[] {
    return Array.from(multiQueueWorkers.keys());
  },

  /**
   * Remove multi-queue worker
   */
  async remove(workerName: string): Promise<void> {
    const mqw = multiQueueWorkers.get(workerName);

    if (!mqw) {
      throw ErrorFactory.createNotFoundError(`Multi-queue worker "${workerName}" not found`);
    }

    // Close all workers
    const closePromises = Array.from(mqw.workers.values()).map(async (worker) => worker.close());

    await Promise.all(closePromises);

    multiQueueWorkers.delete(workerName);

    Logger.info(`Multi-queue worker removed: ${workerName}`);
  },

  /**
   * Shutdown all multi-queue workers
   */
  async shutdown(): Promise<void> {
    Logger.info('MultiQueueWorker shutting down...');

    const shutdownPromises = Array.from(multiQueueWorkers.values()).map(async (mqw) => {
      const closePromises = Array.from(mqw.workers.values()).map(async (worker) => worker.close());
      await Promise.all(closePromises);
    });

    await Promise.all(shutdownPromises);

    multiQueueWorkers.clear();

    Logger.info('MultiQueueWorker shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown
