// TEMPLATE_START

import { generateSecureJobId } from '@zintrust/core';
import { Logger } from '@zintrust/core';

export interface QueueJob {
  id: string;
  data: unknown;
  timestamp: number;
}

/**
 * Queue Feature Template
 *
 * This template shows both in-memory and BullMQ Redis options.
 * Choose the appropriate implementation based on your needs:
 *
 * 1. In-Memory Queue: For testing and development only
 * 2. BullMQ Redis Queue: For production with enterprise features
 */

// Option 1: Simple In-Memory Queue (Development/Testing Only)
export const InMemoryQueue = Object.freeze({
  jobs: [] as QueueJob[],

  /**
   * Add a job to the queue
   */
  add<T>(data: T): string {
    const id = generateSecureJobId();
    const job: QueueJob = {
      id,
      data,
      timestamp: Date.now(),
    };

    InMemoryQueue.jobs.push(job);
    Logger.info(`[InMemoryQueue] Job added: ${id}`);
    return id;
  },

  /**
   * Process jobs
   */
  async process(handler: (job: QueueJob) => Promise<void>): Promise<void> {
    Logger.info('[InMemoryQueue] Processing jobs...');
    const jobsToProcess = [...InMemoryQueue.jobs];
    InMemoryQueue.jobs.length = 0;
    await Promise.all(jobsToProcess.map(async (job) => handler(job)));
  },
});

// Option 2: BullMQ Redis Queue (Production Recommended)
// To use this, set QUEUE_DRIVER=redis in your environment
// Configure BullMQ settings with BULLMQ_* environment variables:
// - BULLMQ_REMOVE_ON_COMPLETE (default: 100)
// - BULLMQ_REMOVE_ON_FAIL (default: 50)
// - BULLMQ_DEFAULT_ATTEMPTS (default: 3)
// - BULLMQ_BACKOFF_DELAY (default: 2000)
// - BULLMQ_BACKOFF_TYPE (default: 'exponential')

export const RedisQueue = Object.freeze({
  /**
   * Add a job to the queue using BullMQ Redis
   * This provides enterprise features: auto-scaling, circuit breaker, DLQ, monitoring
   */
  async add<T>(data: T): Promise<string> {
    // Import dynamically to avoid circular dependencies
    const { Queue } = await import('@zintrust/core');

    const id = generateSecureJobId();
    const job: QueueJob = {
      id,
      data,
      timestamp: Date.now(),
    };

    // Uses BullMQ when QUEUE_DRIVER=redis
    const jobId = await Queue.enqueue('default', job);
    Logger.info(`[RedisQueue] Job added via BullMQ: ${jobId}`);
    return jobId;
  },

  /**
   * Note: For BullMQ, use proper workers instead of manual processing
   * See documentation for setting up BullMQ workers
   */
  async process(_handler: (job: QueueJob) => Promise<void>): Promise<void> {
    Logger.warn('[RedisQueue] Manual processing not recommended for BullMQ. Use proper workers instead.');
  },
});

// Default export - choose based on environment
export const Queue = (() => {
  const driver = process.env.QUEUE_DRIVER;

  switch (driver) {
    case 'redis':
      return RedisQueue; // BullMQ Redis with enterprise features
    case 'sqs':
    case 'rabbitmq':
    case 'database':
      // For production drivers, use the main Queue API from @tools/queue/Queue
      // This template only provides in-memory and Redis implementations
      Logger.warn(`Queue driver '${driver}' not implemented in this template. Falling back to in-memory.`);
      return InMemoryQueue; // Fall back to in-memory for unsupported drivers
    case 'sync':
    case 'inmemory':
    default:
      return InMemoryQueue; // Simple in-memory for development
  }
})();

// TEMPLATE_END
