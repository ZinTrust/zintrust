import { afterEach, describe, expect, it } from 'vitest';

import { WorkerFactory } from '../../src/WorkerFactory';

const persistence = Object.freeze({ driver: 'memory' as const });

describe('WorkerFactory.startFromPersisted', () => {
  afterEach(async () => {
    await WorkerFactory.shutdown();
    await WorkerFactory.resetPersistence();
  });

  it('purges stale persisted workers using structured error details', async () => {
    const name = 'stale-persisted-worker';

    await WorkerFactory.register({
      name,
      queueName: 'stale-persisted-queue',
      processor: async () => undefined,
      processorSpec: 'app/Workers/MissingWorker.js',
      autoStart: false,
      infrastructure: {
        persistence,
      },
      options: {
        concurrency: 1,
      },
    });

    await expect(WorkerFactory.startFromPersisted(name, persistence)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      details: expect.objectContaining({
        kind: 'stale_persisted_worker_purged',
        workerName: name,
        processorSpec: 'app/Workers/MissingWorker.js',
      }),
    });

    await expect(WorkerFactory.getPersisted(name, persistence)).resolves.toBeNull();
  });
});
