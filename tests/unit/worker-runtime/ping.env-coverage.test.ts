import { describe, expect, it } from 'vitest';

describe('worker-runtime/ping environment coverage', () => {
  it('should handle when WORKER_PING_URL is empty and WORKER_ENABLED is false', async () => {
    // Set environment variables before importing
    process.env['WORKER_PING_URL'] = '';
    process.env['WORKER_ENABLED'] = 'false';
    process.env['REDIS_RPC_URL'] = 'redis://localhost:6379'; // Configure Redis RPC to pass first check

    const { triggerWorkerPing } = await import('@/worker-runtime/ping');
    await expect(triggerWorkerPing([], [])).resolves.not.toThrow();

    // Cleanup
    delete process.env['WORKER_PING_URL'];
    delete process.env['WORKER_ENABLED'];
    delete process.env['REDIS_RPC_URL'];
  });

  it('should handle when Redis RPC is not configured', async () => {
    // Ensure Redis RPC is not configured
    delete process.env['REDIS_RPC_URL'];
    delete process.env['REDIS_RPC_PASSWORD'];
    delete process.env['REDIS_RPC_USERNAME'];

    const { triggerWorkerPing } = await import('@/worker-runtime/ping');
    await expect(triggerWorkerPing([], [])).resolves.not.toThrow();
  });
});

describe('worker-runtime/install-enqueue-hook (coverage)', () => {
  it('installs the global enqueue hook that wires worker defs + modules to ping', async () => {
    // dynamic to avoid cross pollution with other worker-runtime tests
    const { installQueueEnqueuePingHook: install } = await import(
      '@/worker-runtime/install-enqueue-hook'
    );

    const fakeDefs: any[] = [{ queue: 'q1' }];
    const fakeModules: any[] = [{ name: 'm1' }];

    // Before: not present or undefined
    delete (globalThis as any).__zintrustQueueEnqueueHook;

    install(fakeDefs, fakeModules);

    const hook = (globalThis as any).__zintrustQueueEnqueueHook;
    expect(typeof hook).toBe('function');

    // Invoking the installed hook should be safe (it delegates to trigger which has its own guards)
    await expect(hook('q1', 'job-123', 'redis')).resolves.not.toThrow();

    // cleanup
    delete (globalThis as any).__zintrustQueueEnqueueHook;
  });
});
