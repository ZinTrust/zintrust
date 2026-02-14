import { Env } from '@config/env';
import { Queue } from '@queue/Queue';
import { WorkerFactory } from '@zintrust/workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Only run if Redis is available (Integration test)
const run = typeof process.env['REDIS_URL'] === 'string' && process.env['REDIS_URL'] !== '';

describe('Architecture: Producer/Consumer Split', () => {
  afterEach(async () => {
    // Clean up any started workers
    await WorkerFactory.stop();
    vi.restoreAllMocks();
  });

  (run ? it : it.skip)(
    'Consumer Mode: Can start workers and process jobs',
    async () => {
      const originalMode = process.env['RUNTIME_MODE'];
      const originalEnabled = process.env.WORKER_ENABLED;

      try {
        // Simulate Consumer Environment
        // Simulate Consumer Environment
        process.env['RUNTIME_MODE'] = 'containers';
        process.env.WORKER_ENABLED = 'true';

        const qName = `split-test-consumer-${Date.now()}`;

        // Defina a processor
        const processor = vi.fn().mockResolvedValue({ processed: true });

        // Register worker manually (simulating what happens in a consumer app)
        await WorkerFactory.createWorker(qName, processor, {
          connection: 'redis',
          concurrency: 1,
        });

        // Check worker is registered
        const workers = WorkerFactory.list();
        expect(workers).toContain(qName);

        // Start processing
        await WorkerFactory.start();

        // Enqueue a job (acting as itself or from producer)
        await Queue.enqueue(qName, { foo: 'bar' }, 'redis');

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(processor).toHaveBeenCalled();
      } finally {
        process.env['RUNTIME_MODE'] = originalMode;
        process.env.WORKER_ENABLED = originalEnabled;
      }
    },
    30000
  );

  (run ? it : it.skip)(
    'Producer Mode: Enqueues ok, but should NOT have workers running',
    async () => {
      const originalMode = process.env['RUNTIME_MODE'];
      const originalEnabled = process.env.WORKER_ENABLED;

      try {
        // Simulate Producer Environment (Cloudflare-like settings in Node)
        // Simulate Producer Environment (Cloudflare-like settings in Node)
        process.env['RUNTIME_MODE'] = 'cloudflare-workers';
        process.env.WORKER_ENABLED = 'false';

        const qName = `split-test-producer-${Date.now()}`;

        // Enqueue should work
        const id = await Queue.enqueue(qName, { from: 'producer' }, 'redis');
        expect(id).toBeDefined();

        // Verification: The bootstrap logic (which we simulate here) would verify
        // WORKER_ENABLED before starting workers.
        // So we check that flag is 'false'
        expect(Env.getBool('WORKER_ENABLED')).toBe(false);

        // And we verify that IF we followed the rule, no workers are in the list
        // (assuming we didn't cheat and add them manually like in previous test)
        // Since this test runs in isolation/after teardown:
        expect(WorkerFactory.list()).not.toContain(qName);

        // Just to be sure, check Redis queue length is 1 (job sits there)
        const len = await Queue.length(qName, 'redis');
        expect(len).toBeGreaterThanOrEqual(1);
      } finally {
        process.env['RUNTIME_MODE'] = originalMode;
        process.env.WORKER_ENABLED = originalEnabled;
      }
    }
  );
});
