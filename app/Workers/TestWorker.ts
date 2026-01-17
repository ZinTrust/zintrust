/**
 * Test Worker
 * Processes jobs from queues to demonstrate different job states
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import queueConfig from 'config/queue';
import { createQueueWorker, type QueueWorker } from 'packages/queue-monitor/src/';
import { createMetrics } from 'packages/queue-monitor/src/metrics';

let worker: QueueWorker | null = null;

export async function startTestWorker(queueName: string): Promise<void> {
  if (worker) {
    Logger.info('Test worker already running');
    return;
  }

  const metrics = createMetrics({
    host: queueConfig.drivers.redis.host,
    port: queueConfig.drivers.redis.port,
    password: queueConfig.drivers.redis.password ?? '',
  });

  worker = createQueueWorker(
    queueName,
    async (job) => {
      Logger.info(`Processing job ${job.id ?? 'unknown'} from queue ${queueName}`);

      // Simulate processing time (1-3 seconds)
      const processingTime = 1000 + Math.random() * 2000; //NOSONAR
      let _timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve) => {
          // eslint-disable-next-line no-restricted-syntax
          _timer = setTimeout(resolve, processingTime);
        });
      } finally {
        if (_timer) {
          clearTimeout(_timer);
        }
      }

      // Check if job should fail
      const data = job.data as { shouldFail?: boolean; message?: string } | undefined;
      if (data?.shouldFail === true) {
        Logger.error(`Job ${job.id ?? 'unknown'} is configured to fail`);
        throw ErrorFactory.createValidationError(
          `Job intentionally failed: ${data.message ?? 'Test failure'}`
        );
      }

      Logger.info(`Job ${job.id ?? 'unknown'} completed successfully`);
      return { success: true, processedAt: new Date().toISOString() };
    },
    {
      host: queueConfig.drivers.redis.host,
      port: queueConfig.drivers.redis.port,
      password: queueConfig.drivers.redis.password ?? '',
    },
    metrics
  );

  Logger.info(`Test worker started for queue: ${queueName}`);
}

export async function stopTestWorker(): Promise<void> {
  if (!worker) {
    Logger.info('No test worker running');
    return;
  }

  await worker.close();
  worker = null;
  Logger.info('Test worker stopped');
}

export function isWorkerRunning(): boolean {
  return worker !== null;
}
