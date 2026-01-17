/* eslint-disable no-await-in-loop */
/**
 * Test Controller
 * Utility endpoints to create test jobs in Redis for Queue Monitor demo.
 */

import { isWorkerRunning, startTestWorker, stopTestWorker } from '@app/Workers/TestWorker';
import { Logger } from '@config/logger';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { getValidatedBody } from '@http/ValidationHelper';
import queueConfig from 'config/queue';
import { createBullMQDriver } from 'packages/queue-monitor/src/driver';

/**
 * Helper: Create BullMQ driver with Redis config
 */
const createDriver = (): ReturnType<typeof createBullMQDriver> =>
  createBullMQDriver({
    host: queueConfig.drivers.redis.host,
    port: queueConfig.drivers.redis.port,
    password: queueConfig.drivers.redis.password ?? '',
  });

/**
 * Helper: Enqueue a single job
 */
const enqueueJob = async (
  driver: ReturnType<typeof createBullMQDriver>,
  queueName: string,
  index: number,
  type: string,
  delayMs: number
): Promise<string> => {
  const payload = {
    test: true,
    createdAt: Date.now(),
    index,
    type,
    message: `Test job ${index} for queue ${queueName} (${type})`,
    shouldFail: type === 'failed',
  } as const;

  const options: Record<string, unknown> = {
    removeOnComplete: true,
    attempts: type === 'failed' ? 1 : 3,
  };

  if (type === 'delayed') {
    options['delay'] = delayMs;
  }

  const id = await driver.enqueue(queueName, payload as Record<string, unknown>, options);
  return String(id);
};

async function enqueue(req: IRequest, res: IResponse): Promise<void> {
  const body =
    getValidatedBody<Record<string, unknown>>(req) ??
    (req.getBody?.() as Record<string, unknown> | undefined) ??
    (req.body as Record<string, unknown> | undefined) ??
    {};
  const queueName = (body['queue'] as string) || 'default';
  const count = Number(body['count'] ?? 1) || 1;
  const type = (body['type'] as string) || 'waiting';
  const delayMs = Number(body['delay'] ?? 5000) || 5000;

  try {
    const driver = createDriver();
    const ids: string[] = [];

    for (let i = 0; i < count; i += 1) {
      const id = await enqueueJob(driver, queueName, i, type, delayMs);
      ids.push(id);
    }

    await driver.close();

    res.json({ ok: true, queue: queueName, count, type, ids });
  } catch (error) {
    Logger.error('TestController.enqueue failed', error);
    res.setStatus(500).json({ error: 'Enqueue failed' });
  }
}

async function populateAll(req: IRequest, res: IResponse): Promise<void> {
  const body =
    getValidatedBody<Record<string, unknown>>(req) ??
    (req.getBody?.() as Record<string, unknown> | undefined) ??
    (req.body as Record<string, unknown> | undefined) ??
    {};
  const queueName = (body['queue'] as string) || 'demo';

  try {
    const driver = createBullMQDriver({
      host: queueConfig.drivers.redis.host,
      port: queueConfig.drivers.redis.port,
      password: queueConfig.drivers.redis.password ?? '',
    });
    const results: Record<string, string[]> = {};

    // Create 5 waiting jobs
    results['waiting'] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = await driver.enqueue(queueName, {
        type: 'waiting',
        index: i,
        message: `Waiting job ${i}`,
      });
      results['waiting'].push(String(id));
    }

    // Create 3 delayed jobs (5 seconds)
    results['delayed'] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await driver.enqueue(
        queueName,
        {
          type: 'delayed',
          index: i,
          message: `Delayed job ${i}`,
        },
        { delay: 5000 }
      );
      results['delayed'].push(String(id));
    }

    // Create 2 failed jobs (these will fail when processed)
    results['failed'] = [];
    for (let i = 0; i < 2; i += 1) {
      const id = await driver.enqueue(
        queueName,
        {
          type: 'failed',
          shouldFail: true,
          index: i,
          message: `Job that will fail ${i}`,
        },
        { attempts: 1 }
      );
      results['failed'].push(String(id));
    }

    await driver.close();

    res.json({
      ok: true,
      queue: queueName,
      message: 'Created 5 waiting, 3 delayed (5s), and 2 jobs that will fail when processed',
      results,
    });
  } catch (error) {
    Logger.error('TestController.populateAll failed', error);
    res.setStatus(500).json({ error: 'Populate all failed' });
  }
}

async function workerStart(req: IRequest, res: IResponse): Promise<void> {
  const body =
    getValidatedBody<Record<string, unknown>>(req) ??
    (req.getBody?.() as Record<string, unknown> | undefined) ??
    (req.body as Record<string, unknown> | undefined) ??
    {};
  const queueName = (body['queue'] as string) || 'demo';

  try {
    if (isWorkerRunning()) {
      res.json({ ok: false, message: 'Worker already running' });
      return;
    }

    await startTestWorker(queueName);
    res.json({
      ok: true,
      message: `Worker started for queue: ${queueName}`,
      info: 'Jobs will be processed with 1-3 second delay. Jobs with shouldFail=true will fail.',
    });
  } catch (error) {
    Logger.error('TestController.workerStart failed', error);
    res.setStatus(500).json({ error: 'Failed to start worker' });
  }
}

async function workerStop(_req: IRequest, res: IResponse): Promise<void> {
  try {
    if (!isWorkerRunning()) {
      res.json({ ok: false, message: 'No worker running' });
      return;
    }

    await stopTestWorker();
    res.json({ ok: true, message: 'Worker stopped' });
  } catch (error) {
    Logger.error('TestController.workerStop failed', error);
    res.setStatus(500).json({ error: 'Failed to stop worker' });
  }
}

async function workerStatus(_req: IRequest, res: IResponse): Promise<void> {
  const running = isWorkerRunning();
  res.json({
    ok: true,
    running,
    message: running ? 'Worker is running' : 'Worker is not running',
  });
}

export const TestController = Object.freeze({
  create() {
    return { enqueue, populateAll, workerStart, workerStop, workerStatus };
  },
});

export default TestController;
