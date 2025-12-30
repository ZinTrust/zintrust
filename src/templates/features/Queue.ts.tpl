// TEMPLATE_START

import { generateSecureJobId } from '@common/uuid';
import { Logger } from '@config/logger';

export interface QueueJob {
  id: string;
  data: unknown;
  timestamp: number;
}

/**
 * Simple In-Memory Queue
 * For production, replace with Redis or similar.
 */
export const Queue = Object.freeze({
  jobs: [] as QueueJob[],

  /**
   * Add a job to the queue
   */
  async add<T>(data: T): Promise<string> {
    const id = await generateSecureJobId();
    const job: QueueJob = {
      id,
      data,
      timestamp: Date.now(),
    };

    // In a real implementation, this would push to Redis/SQS
    Queue.jobs.push(job);
    Logger.info(`[Queue] Job added: ${id}`);
    return id;
  },

  /**
   * Process jobs (Placeholder)
   */
  async process(handler: (job: QueueJob) => Promise<void>): Promise<void> {
    Logger.info('[Queue] Processing jobs...');
    const jobsToProcess = [...Queue.jobs];
    Queue.jobs.length = 0;
    await Promise.all(jobsToProcess.map(async (job) => handler(job)));
  },
});

// TEMPLATE_END