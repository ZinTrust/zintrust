// TEMPLATE_START

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

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

async function generateSecureJobId(): Promise<string> {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  // Node fallback for environments without Web Crypto
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.randomBytes(16).toString('hex');
  } catch (error) {
    throw ErrorFactory.createTryCatchError(
      'Secure crypto API not available to generate a job id.',
      error
    );
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
// TEMPLATE_END
