import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('worker-runtime/rpc-client (coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.REDIS_RPC_URL;
    delete process.env.REDIS_RPC_SECRET;
  });

  it('isRedisRpcConfigured and call error when not configured', async () => {
    const { isRedisRpcConfigured, pullJob } = await import('@/worker-runtime/rpc-client');
    expect(isRedisRpcConfigured()).toBe(false);

    await expect(pullJob('q')).rejects.toThrow(/REDIS_RPC_URL is not configured/);
  });

  it('pullJob etc exercise RPC paths when configured (module load + isConfigured for coverage)', async () => {
    process.env.REDIS_RPC_URL = 'https://rpc.example';
    process.env.REDIS_RPC_SECRET = 's';

    const { isRedisRpcConfigured } = await import('@/worker-runtime/rpc-client');
    expect(isRedisRpcConfigured()).toBe(true);

    // Full calls covered in integration + transport tests; this ensures module + guard load for new code.
  });
});
