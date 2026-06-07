import { describe, expect, it, vi } from 'vitest';

describe('worker-runtime/ping environment coverage', () => {
  it('should handle when WORKER_PING_URL is empty and WORKER_ENABLED is false', async () => {
    // Set environment variables before importing
    process.env.WORKER_PING_URL = '';
    process.env.WORKER_ENABLED = 'false';
    process.env.REDIS_RPC_URL = 'redis://localhost:6379'; // Configure Redis RPC to pass first check

    const { triggerWorkerPing } = await import('@/worker-runtime/ping');
    await expect(triggerWorkerPing([], [])).resolves.not.toThrow();

    // Cleanup
    delete process.env.WORKER_PING_URL;
    delete process.env.WORKER_ENABLED;
    delete process.env.REDIS_RPC_URL;
  });

  it('should handle when Redis RPC is not configured', async () => {
    // Ensure Redis RPC is not configured
    delete process.env.REDIS_RPC_URL;
    delete process.env.REDIS_RPC_PASSWORD;
    delete process.env.REDIS_RPC_USERNAME;

    const { triggerWorkerPing } = await import('@/worker-runtime/ping');
    await expect(triggerWorkerPing([], [])).resolves.not.toThrow();
  });
});
